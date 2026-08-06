/**
 * Google Photos Picker API: user selects photos, we download them as File[].
 */

import {
  GOOGLE_PHOTOS_PICKER_SCOPE,
  requestGoogleAccessToken,
} from './googleAuth';

const PICKER_API = 'https://photospicker.googleapis.com/v1';

interface PickingSession {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: {
    pollInterval?: string;
    timeoutIn?: string;
  };
}

interface PickedMediaItem {
  id: string;
  type?: string;
  mediaFile?: {
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
  };
}

function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;

  // Proto duration strings like "5s" or "1.5s".
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match) return fallbackMs;
  return Math.max(500, Number(match[1]) * 1000);
}

async function photosFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${PICKER_API}${path}`, {
    ...init,
    headers,
  });
}

async function createSession(accessToken: string): Promise<PickingSession> {
  const response = await photosFetch('/sessions', accessToken, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      text.includes('FAILED_PRECONDITION')
        ? 'This Google account does not have Google Photos set up.'
        : 'Failed to start Google Photos picker',
    );
  }

  return (await response.json()) as PickingSession;
}

async function getSession(
  sessionId: string,
  accessToken: string,
): Promise<PickingSession> {
  const response = await photosFetch(
    `/sessions/${encodeURIComponent(sessionId)}`,
    accessToken,
  );

  if (!response.ok) {
    throw new Error('Failed to check Google Photos picker status');
  }

  return (await response.json()) as PickingSession;
}

async function deleteSession(
  sessionId: string,
  accessToken: string,
): Promise<void> {
  try {
    await photosFetch(`/sessions/${encodeURIComponent(sessionId)}`, accessToken, {
      method: 'DELETE',
    });
  } catch {
    // Best-effort cleanup.
  }
}

async function listPickedMedia(
  sessionId: string,
  accessToken: string,
): Promise<PickedMediaItem[]> {
  const items: PickedMediaItem[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      sessionId,
      pageSize: '100',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await photosFetch(
      `/mediaItems?${params.toString()}`,
      accessToken,
    );

    if (!response.ok) {
      throw new Error('Failed to list selected Google Photos');
    }

    const data = (await response.json()) as {
      mediaItems?: PickedMediaItem[];
      nextPageToken?: string;
    };

    items.push(...(data.mediaItems ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

async function downloadPickedImage(
  item: PickedMediaItem,
  accessToken: string,
): Promise<File | null> {
  const mediaFile = item.mediaFile;
  if (!mediaFile?.baseUrl) {
    return null;
  }

  const mimeType = mediaFile.mimeType ?? '';
  if (mimeType.startsWith('video/')) {
    return null;
  }

  // `=d` requests the original image bytes.
  const url = `${mediaFile.baseUrl}=d`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download ${mediaFile.filename || 'photo'} from Google Photos`,
    );
  }

  const blob = await response.blob();
  const type = mimeType || blob.type || 'image/jpeg';
  const name = mediaFile.filename || `google-photo-${item.id}.jpg`;
  return new File([blob], name, { type });
}

function waitForPickerSelection(
  session: PickingSession,
  accessToken: string,
  popup: Window | null,
): Promise<boolean> {
  const pollIntervalMs = parseDurationMs(
    session.pollingConfig?.pollInterval,
    2000,
  );
  const timeoutMs = parseDurationMs(session.pollingConfig?.timeoutIn, 5 * 60_000);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          if (popup && popup.closed) {
            // Give a final status check in case Done closed the window.
            const latest = await getSession(session.id, accessToken);
            window.clearInterval(timer);
            resolve(Boolean(latest.mediaItemsSet));
            return;
          }

          if (Date.now() - startedAt > timeoutMs) {
            window.clearInterval(timer);
            reject(new Error('Google Photos picker timed out'));
            return;
          }

          const latest = await getSession(session.id, accessToken);
          if (latest.mediaItemsSet) {
            window.clearInterval(timer);
            resolve(true);
          }
        } catch (error) {
          window.clearInterval(timer);
          reject(error);
        }
      })();
    }, pollIntervalMs);
  });
}

/** Open Photos picker and return selected images as File objects. */
export async function pickImagesFromGooglePhotos(): Promise<File[]> {
  const accessToken = await requestGoogleAccessToken(GOOGLE_PHOTOS_PICKER_SCOPE);
  const session = await createSession(accessToken);

  const pickerUrl = session.pickerUri.endsWith('/autoclose')
    ? session.pickerUri
    : `${session.pickerUri.replace(/\/+$/, '')}/autoclose`;

  const popup = window.open(pickerUrl, 'google-photos-picker', 'popup=yes,width=1100,height=800');

  try {
    const completed = await waitForPickerSelection(session, accessToken, popup);
    if (!completed) {
      return [];
    }

    const mediaItems = await listPickedMedia(session.id, accessToken);
    const files: File[] = [];

    for (const item of mediaItems) {
      const file = await downloadPickedImage(item, accessToken);
      if (file) {
        files.push(file);
      }
    }

    return files;
  } finally {
    if (popup && !popup.closed) {
      popup.close();
    }
    await deleteSession(session.id, accessToken);
  }
}
