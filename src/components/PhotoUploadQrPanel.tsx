import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { addGuestPhotos } from '../lib/guestPhotos';
import './PhotoUploadQrPanel.css';

interface PhotoUploadQrPanelProps {
  countryId: string;
  countryName: string;
  /** Called when new photos arrive via the phone session. */
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

/** Inline QR upload session (used on the blurred add-photos overlay). */
export function PhotoUploadQrPanel({
  countryId,
  countryName,
  onPhotosChanged,
}: PhotoUploadQrPanelProps) {
  const { token } = useAuth();
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const knownCountRef = useRef<number | null>(null);

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

  useEffect(() => {
    async function start() {
      await createSession();
    }

    void start();
  }, [createSession]);

  useEffect(() => {
    if (!session || !canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, session.uploadUrl, {
      width: 168,
      margin: 1,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff',
      },
    }).catch(() => {
      setError('Failed to render QR code');
    });
  }, [session]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let busy = false;

    async function sync() {
      if (busy || cancelled) return;

      busy = true;

      try {
        if (token) {
          const { photos } = await api.getCountryPhotos(token, countryId);
          const previous = knownCountRef.current;

          if (previous === null) {
            knownCountRef.current = photos.length;
          } else if (photos.length > previous) {
            knownCountRef.current = photos.length;
            onPhotosChanged();
          }
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
        // Transient poll errors — next interval retries.
      }

      busy = false;
    }

    const poll = window.setInterval(() => void sync(), REFRESH_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [session, token, countryId, onPhotosChanged]);

  const remainingMs = session ? session.expiresAt - now : 0;
  const expired = session !== null && remainingMs <= 0;

  return (
    <div className="photo-upload-qr-panel">
      <p className="photo-upload-qr-panel__label">Upload from phone</p>

      {error ? (
        <p className="photo-upload-qr-panel__error">{error}</p>
      ) : session ? (
        <>
          <div className="photo-upload-qr-panel__code">
            <canvas ref={canvasRef} aria-label="Upload QR code" />
            {expired && (
              <div className="photo-upload-qr-panel__expired">Expired</div>
            )}
          </div>
          <p className="photo-upload-qr-panel__timer">
            {expired
              ? 'Code expired'
              : `Expires in ${formatRemaining(remainingMs)}`}
          </p>
        </>
      ) : (
        <p className="photo-upload-qr-panel__hint">Generating code…</p>
      )}

      <button
        type="button"
        className="photo-upload-qr-panel__refresh"
        onClick={() => {
          setSession(null);
          setError(null);
          void createSession();
        }}
      >
        New code
      </button>
    </div>
  );
}
