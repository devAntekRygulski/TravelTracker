import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './PhotoLightbox.css';

export interface LightboxPhoto {
  id: string;
  src: string;
  alt: string;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

/** Full-screen photo viewer with yellow previous/next arrows. */
export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: PhotoLightboxProps) {
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft' && hasPrev) {
        event.preventDefault();
        onIndexChange(index - 1);
        return;
      }

      if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault();
        onIndexChange(index + 1);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [hasPrev, hasNext, index, onClose, onIndexChange]);

  if (!photo) {
    return null;
  }

  return createPortal(
    <div
      className="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={photo.alt}
    >
      <button
        type="button"
        className="photo-lightbox__backdrop"
        aria-label="Close photo"
        onClick={onClose}
      />

      <button
        type="button"
        className="photo-lightbox__close"
        aria-label="Close"
        onClick={onClose}
      >
        ×
      </button>

      {hasPrev && (
        <button
          type="button"
          className="photo-lightbox__nav photo-lightbox__nav--prev"
          aria-label="Previous photo"
          onClick={() => onIndexChange(index - 1)}
        >
          &lt;
        </button>
      )}

      <img
        className="photo-lightbox__image"
        src={photo.src}
        alt={photo.alt}
        draggable={false}
      />

      {hasNext && (
        <button
          type="button"
          className="photo-lightbox__nav photo-lightbox__nav--next"
          aria-label="Next photo"
          onClick={() => onIndexChange(index + 1)}
        >
          &gt;
        </button>
      )}

      <p className="photo-lightbox__counter">
        {index + 1} / {photos.length}
      </p>
    </div>,
    document.body,
  );
}
