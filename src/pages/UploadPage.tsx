import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type UploadSessionInfo } from '../lib/api';
import './UploadPage.css';

type Status =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; session: UploadSessionInfo }
  | { kind: 'uploading'; session: UploadSessionInfo }
  | { kind: 'done'; session: UploadSessionInfo; count: number };

/** Phone-side page opened by scanning the upload QR code. */
export function UploadPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>(() =>
    token
      ? { kind: 'loading' }
      : { kind: 'invalid', message: 'Invalid upload link.' },
  );
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    api
      .getUploadSession(token)
      .then((session) => {
        if (!cancelled) {
          setStatus({ kind: 'ready', session });
        }
      })
      .catch((sessionError: unknown) => {
        if (!cancelled) {
          setStatus({
            kind: 'invalid',
            message:
              sessionError instanceof Error
                ? sessionError.message
                : 'This upload link is no longer valid.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (
      !token ||
      (status.kind !== 'ready' && status.kind !== 'done') ||
      !fileList ||
      fileList.length === 0
    ) {
      return;
    }

    const files = [...fileList];
    const session = status.session;

    setError(null);
    setStatus({ kind: 'uploading', session });

    try {
      const { photos } = await api.uploadSessionPhotos(token, files);

      setStatus({ kind: 'done', session, count: photos.length });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to upload photos',
      );
      setStatus({ kind: 'ready', session });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const countryLabel =
    status.kind !== 'loading' && status.kind !== 'invalid'
      ? status.session.countryName || 'this country'
      : '';

  return (
    <main className="upload-page">
      <div className="upload-page__card">
        <p className="upload-page__brand">Travel Tracker</p>

        {status.kind === 'loading' && (
          <p className="upload-page__text">Checking upload link…</p>
        )}

        {status.kind === 'invalid' && (
          <>
            <h1 className="upload-page__heading">Link expired</h1>
            <p className="upload-page__text">{status.message}</p>
            <p className="upload-page__text">
              Generate a new QR code on your computer and scan it again.
            </p>
          </>
        )}

        {(status.kind === 'ready' ||
          status.kind === 'uploading' ||
          status.kind === 'done') && (
          <>
            <h1 className="upload-page__heading">{countryLabel}</h1>
            <p className="upload-page__text">
              Add photos to your {countryLabel} gallery.
            </p>

            {status.kind === 'done' && (
              <p className="upload-page__success">
                Uploaded {status.count}{' '}
                {status.count === 1 ? 'photo' : 'photos'}. They will appear on
                your computer shortly.
              </p>
            )}

            {error && <p className="upload-page__error">{error}</p>}

            <input
              ref={fileInputRef}
              className="upload-page__file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => void handleFilesSelected(event.target.files)}
            />
            <button
              type="button"
              className="upload-page__button"
              disabled={status.kind === 'uploading'}
              onClick={() => fileInputRef.current?.click()}
            >
              {status.kind === 'uploading'
                ? 'Uploading…'
                : status.kind === 'done'
                  ? 'Upload more photos'
                  : 'Choose photos'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
