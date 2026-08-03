import { useCallback, useEffect, useRef, useState } from 'react';
import { getCountryNameImageSrc } from '../data/countryNameImages';
import { SAMPLE_PHOTOS } from '../data/samplePhotos';
import { useCountryPhotos } from '../hooks/useCountryPhotos';
import { useGuestPendingClaim } from '../hooks/useGuestPendingClaim';
import { claimGuestPendingPhotos } from '../lib/guestUploadSession';
import { easeInOutCubic } from '../lib/photoFocus';
import { PhotoUploadQrPanel } from './PhotoUploadQrPanel';
import './PhotoFocusFrame.css';

const CLOSE_CSS_SIZE = 18;
const CLOSE_CSS_LINE = 2;
const CLOSE_COLOR = '#9a9a9a';
const CLOSE_COLOR_HOVER = '#ffffff';

function paintCloseX(canvas: HTMLCanvasElement, color: string): void {
  const dpr = window.devicePixelRatio || 1;
  const size = Math.round(CLOSE_CSS_SIZE * dpr);
  const line = Math.max(1, Math.round(CLOSE_CSS_LINE * dpr));

  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  canvas.style.width = `${CLOSE_CSS_SIZE}px`;
  canvas.style.height = `${CLOSE_CSS_SIZE}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.lineCap = 'square';

  const inset = line;
  ctx.beginPath();
  ctx.moveTo(inset, inset);
  ctx.lineTo(size - inset, size - inset);
  ctx.moveTo(size - inset, inset);
  ctx.lineTo(inset, size - inset);
  ctx.stroke();
}

interface PhotoFocusFrameProps {
  countryId: string;
  countryName: string;
  progress: number;
  onClose: () => void;
}

/** Right-side photos panel while a country is focused. */
export function PhotoFocusFrame({
  countryId,
  countryName,
  progress,
  onClose,
}: PhotoFocusFrameProps) {
  const opacity = easeInOutCubic(progress);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameImageSrc = getCountryNameImageSrc(countryId);
  const { photos, loading, error, upload, remove, refresh } =
    useCountryPhotos(countryId);
  const [uploading, setUploading] = useState(false);
  const [syncingPhone, setSyncingPhone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** True when the user opens "Add photos" over an existing gallery. */
  const [addingMore, setAddingMore] = useState(false);
  const [trackedCountryId, setTrackedCountryId] = useState(countryId);

  if (trackedCountryId !== countryId) {
    setTrackedCountryId(countryId);
    setAddingMore(false);
  }

  const hasPhotos = photos.length > 0;
  const showUploadOverlay = !loading && (!hasPhotos || addingMore);

  useEffect(() => {
    const button = buttonRef.current;
    const canvas = canvasRef.current;
    if (!button || !canvas) return;

    const paintDefault = () => paintCloseX(canvas, CLOSE_COLOR);
    const paintHover = () => paintCloseX(canvas, CLOSE_COLOR_HOVER);

    paintDefault();

    const onEnter = () => {
      requestAnimationFrame(paintHover);
    };
    const onLeave = () => {
      requestAnimationFrame(() => {
        if (button.matches(':hover, :focus-visible')) {
          paintHover();
        } else {
          paintDefault();
        }
      });
    };

    button.addEventListener('mouseenter', onEnter);
    button.addEventListener('mouseleave', onLeave);
    button.addEventListener('focus', onEnter);
    button.addEventListener('blur', onLeave);
    window.addEventListener('resize', paintDefault);

    return () => {
      button.removeEventListener('mouseenter', onEnter);
      button.removeEventListener('mouseleave', onLeave);
      button.removeEventListener('focus', onEnter);
      button.removeEventListener('blur', onLeave);
      window.removeEventListener('resize', paintDefault);
    };
  }, []);

  const handleFilesSelected = async (fileList: FileList | null) => {
    const files = fileList ? [...fileList] : [];

    if (files.length === 0) return;

    setUploading(true);
    setActionError(null);

    try {
      await upload(files);
      setAddingMore(false);
    } catch (uploadError) {
      setActionError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to upload photos',
      );
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePhonePhotosChanged = useCallback(() => {
    void (async () => {
      await refresh();
      setAddingMore(false);
    })();
  }, [refresh]);

  useGuestPendingClaim(countryId, handlePhonePhotosChanged);

  const handleSyncPhonePhotos = async () => {
    setSyncingPhone(true);
    setActionError(null);

    try {
      const claimed = await claimGuestPendingPhotos(countryId);
      await refresh();

      if (claimed === 0) {
        setActionError(
          'No new phone photos found yet. Keep this panel open after uploading.',
        );
      } else {
        setAddingMore(false);
      }
    } catch (syncError) {
      setActionError(
        syncError instanceof Error
          ? syncError.message
          : 'Failed to sync phone photos',
      );
    } finally {
      setSyncingPhone(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    setActionError(null);

    try {
      await remove(photoId);
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Failed to delete photo',
      );
    }
  };

  const galleryPhotos = hasPhotos
    ? photos.map((photo) => ({
        id: photo.id,
        src: photo.url,
        alt: countryName,
        deletable: true as const,
      }))
    : SAMPLE_PHOTOS.map((photo) => ({
        id: photo.id,
        src: photo.src,
        alt: photo.alt,
        deletable: false as const,
      }));

  return (
    <div
      className="photo-focus-frame"
      data-photo-focus-frame
      style={{ opacity }}
    >
      <aside
        className="photo-focus-frame__panel"
        aria-label={`Photos for ${countryName}`}
      >
        <header className="photo-focus-frame__header">
          <h2 className="photo-focus-frame__title">
            {nameImageSrc ? (
              <img
                className="photo-focus-frame__title-image"
                src={nameImageSrc}
                alt={countryName}
                draggable={false}
              />
            ) : (
              countryName
            )}
          </h2>
          <button
            ref={buttonRef}
            type="button"
            className="photo-focus-frame__close"
            onClick={onClose}
            aria-label="Back to map"
          >
            <canvas
              ref={canvasRef}
              className="photo-focus-frame__close-icon"
              aria-hidden="true"
            />
          </button>
        </header>

        {(actionError ?? error) && !showUploadOverlay && (
          <p className="photo-focus-frame__error">{actionError ?? error}</p>
        )}

        <div className="photo-focus-frame__content">
          <div
            className={[
              'photo-focus-frame__body',
              showUploadOverlay ? 'photo-focus-frame__body--blurred' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {loading ? (
              <p className="photo-focus-frame__empty">Loading photos…</p>
            ) : (
              <ul className="photo-focus-frame__grid">
                {galleryPhotos.map((photo) => (
                  <li key={photo.id} className="photo-focus-frame__cell">
                    <img
                      className="photo-focus-frame__thumb"
                      src={photo.src}
                      alt={photo.alt}
                      loading="lazy"
                      draggable={false}
                    />
                    {photo.deletable && !showUploadOverlay && (
                      <button
                        type="button"
                        className="photo-focus-frame__delete"
                        aria-label="Delete photo"
                        onClick={() => void handleDelete(photo.id)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {showUploadOverlay && (
            <div className="photo-focus-frame__upload-overlay">
              <input
                ref={fileInputRef}
                className="photo-focus-frame__file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                  void handleFilesSelected(event.target.files)
                }
              />

              <div className="photo-focus-frame__upload-options">
                <div className="photo-focus-frame__upload-computer">
                  <p className="photo-focus-frame__upload-label">
                    Upload from computer
                  </p>
                  <button
                    type="button"
                    className="photo-focus-frame__action photo-focus-frame__action--primary"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? 'Uploading…' : 'Choose photos'}
                  </button>
                </div>

                <div className="photo-focus-frame__upload-divider" role="separator">
                  <span className="photo-focus-frame__upload-divider-line" />
                  <span className="photo-focus-frame__upload-divider-text">or</span>
                  <span className="photo-focus-frame__upload-divider-line" />
                </div>

                <PhotoUploadQrPanel
                  key={`${countryId}-upload`}
                  countryId={countryId}
                  countryName={countryName}
                  onPhotosChanged={handlePhonePhotosChanged}
                />

                <button
                  type="button"
                  className="photo-focus-frame__action"
                  disabled={syncingPhone}
                  onClick={() => void handleSyncPhonePhotos()}
                >
                  {syncingPhone ? 'Syncing…' : 'Sync phone photos'}
                </button>
              </div>

              {(actionError ?? error) && (
                <p className="photo-focus-frame__error photo-focus-frame__error--overlay">
                  {actionError ?? error}
                </p>
              )}

              {hasPhotos && (
                <button
                  type="button"
                  className="photo-focus-frame__cancel-add"
                  onClick={() => setAddingMore(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          {hasPhotos && !showUploadOverlay && (
            <button
              type="button"
              className="photo-focus-frame__add-photos"
              onClick={() => setAddingMore(true)}
            >
              Add photos
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
