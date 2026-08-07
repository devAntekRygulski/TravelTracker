import { useLayoutEffect, useRef, useState } from 'react';
import './MapCountryActionBox.css';

export const ACTION_BOX_OFFSET_X = 12;
export const ACTION_BOX_OFFSET_Y = 10;
const VIEWPORT_MARGIN = 8;

interface MapCountryActionBoxProps {
  label: string;
  x: number;
  y: number;
  isMarked: boolean;
  hasPhotos: boolean;
  /** False while photo presence is still loading — avoid flashing the wrong label. */
  photosReady?: boolean;
  onAddPhotos: () => void;
  onMark: () => void;
}

/** Click popup with mark + add-photo actions for a country. */
export function MapCountryActionBox({
  label,
  x,
  y,
  isMarked,
  hasPhotos,
  photosReady = true,
  onAddPhotos,
  onMark,
}: MapCountryActionBoxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    x: x + ACTION_BOX_OFFSET_X,
    y: y + ACTION_BOX_OFFSET_Y,
  });

  const photosLabel = !photosReady
    ? 'Photos'
    : hasPhotos
      ? 'View photos'
      : 'Add photos';

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const parent = el.offsetParent as HTMLElement | null;
    const parentW = parent?.clientWidth ?? window.innerWidth;
    const parentH = parent?.clientHeight ?? window.innerHeight;
    const boxW = el.offsetWidth;
    const boxH = el.offsetHeight;

    let nextX = x + ACTION_BOX_OFFSET_X;
    let nextY = y + ACTION_BOX_OFFSET_Y;

    // Prefer right of the tap; if it would clip, place to the left instead.
    if (nextX + boxW > parentW - VIEWPORT_MARGIN) {
      nextX = x - boxW - ACTION_BOX_OFFSET_X;
    }

    nextX = Math.max(
      VIEWPORT_MARGIN,
      Math.min(nextX, parentW - boxW - VIEWPORT_MARGIN),
    );
    nextY = Math.max(
      VIEWPORT_MARGIN,
      Math.min(nextY, parentH - boxH - VIEWPORT_MARGIN),
    );

    setPos({ x: nextX, y: nextY });
  }, [x, y, label, isMarked, hasPhotos, photosReady]);

  return (
    <div
      ref={rootRef}
      className="map-country-action"
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px)`,
      }}
      role="dialog"
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="map-country-action__accent" aria-hidden="true" />
      <p className="map-country-action__name">{label}</p>
      <div className="map-country-action__actions">
        <button
          type="button"
          className="map-country-action__mark"
          onClick={onMark}
        >
          {isMarked ? 'Unmark' : 'Mark'}
        </button>
        <button
          type="button"
          className="map-country-action__photos"
          onClick={onAddPhotos}
        >
          {photosLabel}
        </button>
      </div>
    </div>
  );
}
