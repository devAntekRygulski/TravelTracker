import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { withColorModeQuery } from '../lib/colorMode';
import { addGuestPhotos } from '../lib/guestPhotos';
import './PhotoUploadOverlay.css';

interface PhotoUploadOverlayProps {
  countryId: string;
  countryName: string;
  uploading: boolean;
  onUploadFiles: (files: File[]) => void;
  /** Called when photos may have changed (phone uploads arriving). */
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

/**
 * Blurred upload section covering the gallery: upload from computer, or
 * scan the QR code to upload from a phone.
 */
export function PhotoUploadOverlay({
  countryId,
  countryName,
  uploading,
  onUploadFiles,
  onPhotosChanged,
}: PhotoUploadOverlayProps) {
  const { token } = useAuth();
  const { colorMode } = useTheme();
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!session || !qrCanvasRef.current) return;

    QRCode.toCanvas(
      qrCanvasRef.current,
      withColorModeQuery(session.uploadUrl, colorMode),
      {
        width: 148,
        margin: 1,
        color: {
          dark: '#1a1a1a',
          light: '#ffffff',
        },
      },
    ).catch(() => {
      setError('Failed to render QR code');
    });
  }, [session, colorMode]);

  // Countdown tick.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(tick);
  }, []);

  // Poll for phone uploads. Logged in: refresh the cloud gallery.
  // Guest: claim relayed photos from the server into IndexedDB first.
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

  const remainingMs = session ? session.expiresAt - now : 0;
  const expired = session !== null && remainingMs <= 0;

  return (
    <div className="photo-upload-overlay">
      <input
        ref={fileInputRef}
        className="photo-upload-overlay__file-input"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          const files = event.target.files ? [...event.target.files] : [];

          onUploadFiles(files);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className="photo-upload-overlay__button"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? 'Uploading…' : 'Upload from computer'}
      </button>

      <p className="photo-upload-overlay__divider">
        or scan to upload from your phone
      </p>

      {error ? (
        <p className="photo-upload-overlay__error">{error}</p>
      ) : session ? (
        <>
          <div className="photo-upload-overlay__qr">
            <canvas ref={qrCanvasRef} aria-label="Upload QR code" />
            {expired && (
              <button
                type="button"
                className="photo-upload-overlay__expired"
                onClick={() => {
                  setSession(null);
                  void createSession();
                }}
              >
                Expired — new code
              </button>
            )}
          </div>
          {!expired && (
            <p className="photo-upload-overlay__timer">
              Code expires in {formatRemaining(remainingMs)}
            </p>
          )}
        </>
      ) : (
        <p className="photo-upload-overlay__timer">Generating code…</p>
      )}
    </div>
  );
}
