import { randomBytes, randomUUID } from 'node:crypto';
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { isValidObjectId } from 'mongoose';
import multer from 'multer';
import { connectDB } from '../config/db.js';
import { getClientBaseUrl } from '../lib/clientUrl.js';
import { deletePhotoObject, getPhotoObjectUrl, putPhotoObject } from '../lib/s3.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { PendingPhoto } from '../models/PendingPhoto.js';
import { Photo, type IPhoto } from '../models/Photo.js';
import { UploadSession } from '../models/UploadSession.js';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const MAX_PHOTOS_PER_COUNTRY = 50;
const SESSION_TTL_MS = 60 * 60 * 1000;
// Guest relay photos linger a bit longer than the session so a slow desktop
// can still claim uploads made right before expiry.
const PENDING_PHOTO_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PENDING_PER_SESSION = 50;

function buildUploadUrl(token: string): string {
  return `${getClientBaseUrl()}/upload/${token}`;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES_PER_REQUEST,
  },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype in EXTENSION_BY_MIME) {
      callback(null, true);
      return;
    }

    callback(new Error('Only image files are allowed'));
  },
});

/** Wraps multer so its errors surface as JSON 400s instead of a 500. */
function uploadPhotos(req: Request, res: Response, next: NextFunction) {
  upload.array('photos', MAX_FILES_PER_REQUEST)(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Each photo must be 8MB or smaller'
          : error.code === 'LIMIT_FILE_COUNT' ||
              error.code === 'LIMIT_UNEXPECTED_FILE'
            ? `At most ${MAX_FILES_PER_REQUEST} photos per upload`
            : 'Invalid upload';
      res.status(400).json({ message });
      return;
    }

    res.status(400).json({
      message: error instanceof Error ? error.message : 'Invalid upload',
    });
  });
}

function serializePhoto(photo: IPhoto) {
  return {
    id: String(photo._id),
    countryId: photo.countryId,
    url: photo.url,
    contentType: photo.contentType,
    size: photo.size,
    createdAt: photo.createdAt,
  };
}

async function storePhotos(
  userId: string,
  countryId: string,
  files: Express.Multer.File[],
) {
  const existingCount = await Photo.countDocuments({ userId, countryId });

  if (existingCount + files.length > MAX_PHOTOS_PER_COUNTRY) {
    return {
      error: `A country can have at most ${MAX_PHOTOS_PER_COUNTRY} photos`,
      photos: null,
    } as const;
  }

  const created: IPhoto[] = [];

  for (const file of files) {
    const extension = EXTENSION_BY_MIME[file.mimetype];
    const key = `users/${userId}/countries/${countryId}/${randomUUID()}.${extension}`;

    await putPhotoObject(key, file.buffer, file.mimetype);

    const photo = await Photo.create({
      userId,
      countryId,
      s3Key: key,
      url: getPhotoObjectUrl(key),
      contentType: file.mimetype,
      size: file.size,
    });

    created.push(photo);
  }

  return { error: null, photos: created } as const;
}

const router = Router();

// --- QR upload sessions (token-based, no JWT) ---
// Registered before /:countryId so "session" is not parsed as a country id.

router.get('/session/:token', async (req: Request, res: Response) => {
  try {
    await connectDB();

    const session = await UploadSession.findOne({ token: req.params.token });

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      res.status(404).json({ message: 'Upload session not found or expired' });
      return;
    }

    res.json({
      countryId: session.countryId,
      countryName: session.countryName,
      expiresAt: session.expiresAt,
      uploadUrl: buildUploadUrl(session.token),
    });
  } catch (error) {
    console.error('Get upload session error:', error);
    res.status(500).json({ message: 'Failed to fetch upload session' });
  }
});

// Guest recovery: list guest sessions that still have unclaimed photos.
// Includes recently expired sessions so the laptop can still claim uploads.
router.get('/guest-pending/:countryId', async (req: Request, res: Response) => {
  try {
    await connectDB();

    const countryId = String(req.params.countryId ?? '').trim();
    if (!countryId) {
      res.status(400).json({ message: 'countryId is required' });
      return;
    }

    const sessions = await UploadSession.find({
      countryId,
      isGuest: true,
    })
      .sort({ createdAt: -1 })
      .limit(20);

    const withPending: {
      token: string;
      expiresAt: Date;
      count: number;
    }[] = [];

    for (const session of sessions) {
      const count = await PendingPhoto.countDocuments({
        sessionToken: session.token,
      });

      if (count > 0) {
        withPending.push({
          token: session.token,
          expiresAt: session.expiresAt,
          count,
        });
      }
    }

    res.json({ sessions: withPending });
  } catch (error) {
    console.error('List guest pending sessions error:', error);
    res.status(500).json({ message: 'Failed to list pending guest uploads' });
  }
});

router.post(
  '/session/:token',
  uploadPhotos,
  async (req: Request, res: Response) => {
    try {
      await connectDB();

      const session = await UploadSession.findOne({ token: req.params.token });

      if (!session || session.expiresAt.getTime() <= Date.now()) {
        res.status(404).json({ message: 'Upload session not found or expired' });
        return;
      }

      const files = (req.files ?? []) as Express.Multer.File[];

      if (files.length === 0) {
        res.status(400).json({ message: 'No photos provided' });
        return;
      }

      if (session.isGuest) {
        // Guest relay: hold the photos temporarily until the desktop
        // browser claims them into IndexedDB.
        const pendingCount = await PendingPhoto.countDocuments({
          sessionToken: session.token,
        });

        if (pendingCount + files.length > MAX_PENDING_PER_SESSION) {
          res.status(400).json({
            message: `At most ${MAX_PENDING_PER_SESSION} photos per session`,
          });
          return;
        }

        const created = [];

        for (const file of files) {
          const pending = await PendingPhoto.create({
            sessionToken: session.token,
            data: file.buffer,
            contentType: file.mimetype,
            size: file.size,
            expiresAt: new Date(Date.now() + PENDING_PHOTO_TTL_MS),
          });

          created.push({
            id: String(pending._id),
            contentType: pending.contentType,
            size: pending.size,
          });
        }

        res.status(201).json({ photos: created });
        return;
      }

      const result = await storePhotos(
        String(session.userId),
        session.countryId,
        files,
      );

      if (result.error) {
        res.status(400).json({ message: result.error });
        return;
      }

      res.status(201).json({ photos: result.photos.map(serializePhoto) });
    } catch (error) {
      console.error('Session upload error:', error);
      res.status(500).json({ message: 'Failed to upload photos' });
    }
  },
);

// --- Guest relay: desktop pulls pending photos into browser storage ---

router.get(
  '/session/:token/pending',
  async (req: Request, res: Response) => {
    try {
      await connectDB();

      const session = await UploadSession.findOne({ token: req.params.token });
      const pending = await PendingPhoto.find({ sessionToken: req.params.token })
        .select('-data')
        .sort({ createdAt: 1 });

      // Guest claim can continue after the QR session timer expires, as long as
      // relay photos are still in MongoDB.
      if (!session && pending.length === 0) {
        res.status(404).json({ message: 'Upload session not found or expired' });
        return;
      }

      if (
        session &&
        !session.isGuest &&
        session.expiresAt.getTime() <= Date.now()
      ) {
        res.status(404).json({ message: 'Upload session not found or expired' });
        return;
      }

      res.json({
        photos: pending.map((photo) => ({
          id: String(photo._id),
          contentType: photo.contentType,
          size: photo.size,
        })),
      });
    } catch (error) {
      console.error('List pending photos error:', error);
      res.status(500).json({ message: 'Failed to fetch pending photos' });
    }
  },
);

router.get(
  '/session/:token/pending/:photoId',
  async (req: Request, res: Response) => {
    try {
      await connectDB();

      if (!isValidObjectId(req.params.photoId)) {
        res.status(404).json({ message: 'Photo not found' });
        return;
      }

      const pending = await PendingPhoto.findOne({
        _id: req.params.photoId,
        sessionToken: req.params.token,
      });

      if (!pending) {
        res.status(404).json({ message: 'Photo not found' });
        return;
      }

      const raw = pending.data as Buffer | { buffer?: ArrayBuffer };
      const buffer = Buffer.isBuffer(raw)
        ? raw
        : Buffer.from(
            (raw as { buffer?: ArrayBuffer }).buffer ?? (raw as ArrayBuffer),
          );

      res.status(200);
      res.setHeader('Content-Type', pending.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.end(buffer);
    } catch (error) {
      console.error('Download pending photo error:', error);
      res.status(500).json({ message: 'Failed to download pending photo' });
    }
  },
);

router.delete(
  '/session/:token/pending/:photoId',
  async (req: Request, res: Response) => {
    try {
      await connectDB();

      if (!isValidObjectId(req.params.photoId)) {
        res.status(404).json({ message: 'Photo not found' });
        return;
      }

      await PendingPhoto.deleteOne({
        _id: req.params.photoId,
        sessionToken: req.params.token,
      });

      res.json({ deleted: true });
    } catch (error) {
      console.error('Delete pending photo error:', error);
      res.status(500).json({ message: 'Failed to delete pending photo' });
    }
  },
);

// --- Guest QR session (no account; photos only relayed, never stored) ---
// Registered before /:countryId so "guest-session" is not read as a country.

router.post('/guest-session', async (req: Request, res: Response) => {
  try {
    await connectDB();

    const countryId =
      typeof req.body?.countryId === 'string' ? req.body.countryId.trim() : '';

    if (!countryId) {
      res.status(400).json({ message: 'countryId is required' });
      return;
    }

    const countryName =
      typeof req.body?.countryName === 'string' ? req.body.countryName : '';
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await UploadSession.create({
      token,
      isGuest: true,
      countryId,
      countryName,
      expiresAt,
    });

    res.status(201).json({
      token,
      expiresAt,
      uploadUrl: buildUploadUrl(token),
    });
  } catch (error) {
    console.error('Create guest upload session error:', error);
    res.status(500).json({ message: 'Failed to create upload session' });
  }
});

// --- Authenticated photo endpoints ---

router.get(
  '/:countryId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      await connectDB();

      const photos = await Photo.find({
        userId: req.user!._id,
        countryId: req.params.countryId,
      }).sort({ createdAt: 1 });

      res.json({ photos: photos.map(serializePhoto) });
    } catch (error) {
      console.error('List photos error:', error);
      res.status(500).json({ message: 'Failed to fetch photos' });
    }
  },
);

router.post(
  '/:countryId',
  requireAuth,
  uploadPhotos,
  async (req: AuthRequest, res: Response) => {
    try {
      await connectDB();

      const files = (req.files ?? []) as Express.Multer.File[];

      if (files.length === 0) {
        res.status(400).json({ message: 'No photos provided' });
        return;
      }

      const result = await storePhotos(
        String(req.user!._id),
        String(req.params.countryId),
        files,
      );

      if (result.error) {
        res.status(400).json({ message: result.error });
        return;
      }

      res.status(201).json({ photos: result.photos.map(serializePhoto) });
    } catch (error) {
      console.error('Upload photos error:', error);
      res.status(500).json({ message: 'Failed to upload photos' });
    }
  },
);

router.post(
  '/:countryId/upload-session',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      await connectDB();

      const token = randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      const countryName =
        typeof req.body?.countryName === 'string' ? req.body.countryName : '';

      await UploadSession.create({
        token,
        userId: req.user!._id,
        countryId: req.params.countryId,
        countryName,
        expiresAt,
      });

      res.status(201).json({
        token,
        expiresAt,
        uploadUrl: buildUploadUrl(token),
      });
    } catch (error) {
      console.error('Create upload session error:', error);
      res.status(500).json({ message: 'Failed to create upload session' });
    }
  },
);

router.delete(
  '/:photoId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      await connectDB();

      if (!isValidObjectId(req.params.photoId)) {
        res.status(404).json({ message: 'Photo not found' });
        return;
      }

      const photo = await Photo.findOne({
        _id: req.params.photoId,
        userId: req.user!._id,
      });

      if (!photo) {
        res.status(404).json({ message: 'Photo not found' });
        return;
      }

      await deletePhotoObject(photo.s3Key);
      await photo.deleteOne();

      res.json({ deleted: true });
    } catch (error) {
      console.error('Delete photo error:', error);
      res.status(500).json({ message: 'Failed to delete photo' });
    }
  },
);

export default router;
