import './MapViewToggle.css';

interface MapViewToggleProps {
  regionalViewLocked: boolean;
  onChange: (regionalViewLocked: boolean) => void;
  regionalDisabled?: boolean;
}

export function MapViewToggle({
  regionalViewLocked,
  onChange,
  regionalDisabled = false,
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
        className={`map-view-toggle__option map-view-toggle__option--regional${
          regionalViewLocked ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={regionalViewLocked}
        disabled={regionalDisabled}
        title={
          regionalDisabled ? 'Regional view is unavailable in globe mode' : undefined
        }
        onClick={() => onChange(true)}
      >
        <span className="map-view-toggle__label">Regional</span>
        <span className="map-view-toggle__beta">Beta</span>
      </button>
    </div>
  );
}
