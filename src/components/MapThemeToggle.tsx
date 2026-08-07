import type { ColorMode } from '../lib/colorMode';
import './MapViewToggle.css';

interface MapThemeToggleProps {
  mode: ColorMode;
  onChange: (mode: ColorMode) => void;
}

/** Dark / Light pill toggle — same chrome as map view toggles. */
export function MapThemeToggle({ mode, onChange }: MapThemeToggleProps) {
  return (
    <div className="map-view-toggle" role="group" aria-label="Color mode">
      <button
        type="button"
        className={`map-view-toggle__option${
          mode === 'dark' ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={mode === 'dark'}
        onClick={() => onChange('dark')}
      >
        <span className="map-view-toggle__label">Dark</span>
      </button>
      <button
        type="button"
        className={`map-view-toggle__option${
          mode === 'light' ? ' map-view-toggle__option--active' : ''
        }`}
        aria-pressed={mode === 'light'}
        onClick={() => onChange('light')}
      >
        <span className="map-view-toggle__label">Light</span>
        <span className="map-view-toggle__beta">Beta</span>
      </button>
    </div>
  );
}
