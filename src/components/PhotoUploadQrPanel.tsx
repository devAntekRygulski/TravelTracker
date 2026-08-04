import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import {
  rememberGuestUploadSession,
  restoreGuestUploadSession,
} from '../lib/guestUploadSession';
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
  const { token, isGuest } = useAuth();
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const knownCountRef = useRef<number | null>(null);
  const useGuestSession = isGuest || !token;

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        if (useGuestSession) {
          const restored = await restoreGuestUploadSession(countryId);
          if (cancelled) return;
          if (restored) {
            setSession({
              token: restored.token,
              uploadUrl: restored.uploadUrl,
              expiresAt: new Date(restored.expiresAt).getTime(),
            });
            setError(null);
            return;
          }
        }

        if (cancelled) return;

        const created = useGuestSession
          ? await api.createGuestUploadSession(countryId, countryName)
          : await api.createUploadSession(token!, countryId, countryName);

        if (cancelled) return;

        const expiresAt = new Date(created.expiresAt).getTime();

        if (useGuestSession) {
          rememberGuestUploadSession(countryId, created.token, expiresAt);
        }

        setSession({
          token: created.token,
          uploadUrl: created.uploadUrl,
          expiresAt,
        });
        setError(null);
      } catch (sessionError) {
        if (cancelled) return;
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : 'Failed to create upload session',
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
    };
  }, [useGuestSession, token, countryId, countryName]);

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

  // Logged-in users: poll cloud gallery count while the QR is visible.
  useEffect(() => {
    if (!session || useGuestSession || !token) return;

    let cancelled = false;
    let busy = false;

    async function sync() {
      if (busy || cancelled) return;
      busy = true;

      try {
        const { photos } = await api.getCountryPhotos(token!, countryId);
        const previous = knownCountRef.current;

        if (previous === null) {
          knownCountRef.current = photos.length;
        } else if (photos.length > previous) {
          knownCountRef.current = photos.length;
          onPhotosChanged();
        }
      } catch {
        // Transient poll errors — next interval retries.
      }

      busy = false;
    }

    void sync();
    const poll = window.setInterval(() => void sync(), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [session, useGuestSession, token, countryId, onPhotosChanged]);

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
    </div>
  );
}
