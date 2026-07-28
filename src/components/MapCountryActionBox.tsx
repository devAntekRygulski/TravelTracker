import './MapCountryActionBox.css';

export const ACTION_BOX_OFFSET_X = 12;
export const ACTION_BOX_OFFSET_Y = 10;

interface MapCountryActionBoxProps {
  label: string;
  x: number;
  y: number;
  isMarked: boolean;
  onAddPhotos: () => void;
  onMark: () => void;
}

/** Click popup with mark + add-photo actions for a country. */
export function MapCountryActionBox({
  label,
  x,
  y,
  isMarked,
  onAddPhotos,
  onMark,
}: MapCountryActionBoxProps) {
  return (
    <div
      className="map-country-action"
      style={{
        transform: `translate(${x + ACTION_BOX_OFFSET_X}px, ${y + ACTION_BOX_OFFSET_Y}px)`,
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
          Add photos
        </button>
      </div>
    </div>
  );
}
