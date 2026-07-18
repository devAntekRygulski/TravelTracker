import './MapViewToggle.css';

export type MapProjectionMode = 'flat' | 'globe';

interface MapProjectionToggleProps {
  mode: MapProjectionMode;
  onChange: (mode: MapProjectionMode) => void;
}

export function MapProjectionToggle({
  mode,
  onChange,
}: MapProjectionToggleProps) {
  return (
    <div className="map-view-toggle" role="group" aria-label="Map projection">
      <button
        type="button"
        className={`map-view-toggle__option${
          mode === 'flat' ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={mode === 'flat'}
        onClick={() => onChange('flat')}
      >
        <span className="map-view-toggle__label">Flat</span>
      </button>
      <button
        type="button"
        className={`map-view-toggle__option${
          mode === 'globe' ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={mode === 'globe'}
        onClick={() => onChange('globe')}
      >
        <span className="map-view-toggle__label">Globe</span>
      </button>
    </div>
  );
}
