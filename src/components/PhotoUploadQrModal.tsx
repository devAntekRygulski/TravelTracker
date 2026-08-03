import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { addGuestPhotos } from '../lib/guestPhotos';
import { UploadQrLinkHelp } from './UploadQrLinkHelp';
import './PhotoUploadQrModal.css';

interface PhotoUploadQrModalProps {
  countryId: string;
  countryName: string;
  onClose: () => void;
  /** Called periodically so the gallery behind the modal stays fresh. */
  onPhotosChanged: () => void;
}

interface SessionState {
  token: string;
  uploadUrl: string;
  expiresAt: number;
}

const REFRESH_POLL_MS = 5000;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** QR code modal: scan with a phone to upload photos to this country. */
export function PhotoUploadQrModal({
  countryId,
  countryName,
  onClose,
  onPhotosChanged,
}: PhotoUploadQrModalProps) {
  const { token } = useAuth();
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const createSession = useCallback(async () => {
    try {
      const created = token
        ? await api.createUploadSession(token, countryId, countryName)
        : await api.createGuestUploadSession(countryId, countryName);

      setSession({
        token: created.token,
        uploadUrl: created.uploadUrl,
        expiresAt: new Date(created.expiresAt).getTime(),
      });
      setError(null);
    } catch (sessionError) {
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : 'Failed to create upload session',
      );
    }
  }, [token, countryId, countryName]);

  const regenerate = () => {
    setSession(null);
    setError(null);
    void createSession();
  };

  useEffect(() => {
    async function start() {
      await createSession();
    }

    void start();
  }, [createSession]);

  useEffect(() => {
    if (!session || !canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, session.uploadUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff',
      },
    }).catch(() => {
      setError('Failed to render QR code');
    });
  }, [session]);

  // Tick the countdown while the modal is open.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(tick);
  }, []);

  // Poll while the modal is open. Logged in: just refresh the cloud gallery.
  // Guest: claim relayed photos from the server into IndexedDB, then refresh.
  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let busy = false;

    async function sync() {
      if (busy || cancelled) return;

      busy = true;

      try {
        if (token) {
          onPhotosChanged();
        } else {
          const { photos } = await api.getPendingSessionPhotos(session!.token);

          for (const pending of photos) {
            if (cancelled) break;

            const blob = await api.downloadPendingSessionPhoto(
              session!.token,
              pending.id,
            );

            await addGuestPhotos(countryId, [blob]);
            await api.deletePendingSessionPhoto(session!.token, pending.id);
          }

          if (photos.length > 0 && !cancelled) {
            onPhotosChanged();
          }
        }
      } catch {
        // Polling errors are transient; the next interval retries.
      }

      busy = false;
    }

    const poll = window.setInterval(() => void sync(), REFRESH_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [session, token, countryId, onPhotosChanged]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const remainingMs = session ? session.expiresAt - now : 0;
  const expired = session !== null && remainingMs <= 0;

  return (
    <div className="photo-upload-qr" role="dialog" aria-modal="true">
      <div className="photo-upload-qr__backdrop" onClick={onClose} />
      <div className="photo-upload-qr__card">
        <h3 className="photo-upload-qr__heading">Upload from your phone</h3>
        <p className="photo-upload-qr__hint">
          Scan with your phone camera to add photos to {countryName}.
        </p>

        {error ? (
          <p className="photo-upload-qr__error">{error}</p>
        ) : session ? (
          <>
            <div className="photo-upload-qr__code">
              <canvas ref={canvasRef} aria-label="Upload QR code" />
              {expired && (
                <div className="photo-upload-qr__expired">Expired</div>
              )}
            </div>
            <p className="photo-upload-qr__timer">
              {expired
                ? 'This code has expired.'
                : `Expires in ${formatRemaining(remainingMs)}`}
            </p>
            <UploadQrLinkHelp uploadUrl={session.uploadUrl} />
          </>
        ) : (
          <p className="photo-upload-qr__hint">Generating code…</p>
        )}

        <div className="photo-upload-qr__actions">
          <button
            type="button"
            className="photo-upload-qr__button"
            onClick={regenerate}
          >
            New code
          </button>
          <button
            type="button"
            className="photo-upload-qr__button photo-upload-qr__button--primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
