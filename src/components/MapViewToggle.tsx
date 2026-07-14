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
        Country
      </button>
      <button
        type="button"
        className={`map-view-toggle__option${
          regionalViewLocked ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={regionalViewLocked}
        onClick={() => onChange(true)}
      >
        Regional
      </button>
    </div>
  );
}
