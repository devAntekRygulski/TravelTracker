import './MapViewToggle.css';

interface MapRealisticToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function MapRealisticToggle({
  enabled,
  onChange,
}: MapRealisticToggleProps) {
  return (
    <div className="map-view-toggle" role="group" aria-label="Map style">
      <button
        type="button"
        className={`map-view-toggle__option${
          !enabled ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={!enabled}
        onClick={() => onChange(false)}
      >
        <span className="map-view-toggle__label">Stylized</span>
      </button>
      <button
        type="button"
        className={`map-view-toggle__option${
          enabled ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={enabled}
        onClick={() => onChange(true)}
      >
        <span className="map-view-toggle__label">Realistic</span>
        <span className="map-view-toggle__beta">Beta</span>
      </button>
    </div>
  );
}
