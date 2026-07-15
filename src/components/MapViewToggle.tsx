import './MapViewToggle.css';

interface MapViewToggleProps {
  regionalViewLocked: boolean;
  onChange: (regionalViewLocked: boolean) => void;
}

export function MapViewToggle({
  regionalViewLocked,
  onChange,
}: MapViewToggleProps) {
  return (
    <div className="map-view-toggle" role="group" aria-label="Map view mode">
      <button
        type="button"
        className={`map-view-toggle__option${
          !regionalViewLocked ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={!regionalViewLocked}
        onClick={() => onChange(false)}
      >
        <span className="map-view-toggle__label">Country</span>
      </button>
      <button
        type="button"
        className={`map-view-toggle__option${
          regionalViewLocked ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={regionalViewLocked}
        onClick={() => onChange(true)}
      >
        <span className="map-view-toggle__label">Regional</span>
      </button>
    </div>
  );
}
