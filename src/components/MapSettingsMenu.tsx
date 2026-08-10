import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  MapProjectionToggle,
  type MapProjectionMode,
} from './MapProjectionToggle';
import { MapThemeToggle } from './MapThemeToggle';
import { MapViewToggle } from './MapViewToggle';
import './MapSettingsMenu.css';

interface MapSettingsMenuProps {
  regionalViewLocked: boolean;
  onRegionalViewChange: (regionalViewLocked: boolean) => void;
  projectionMode: MapProjectionMode;
  onProjectionModeChange: (mode: MapProjectionMode) => void;
  hidden?: boolean;
  /** header = phone top-left; oval = desktop left of stats counters */
  placement?: 'header' | 'oval';
}

function MapIcon() {
  return (
    <span className="map-settings-menu__icon" aria-hidden="true" />
  );
}

/** Map icon expands into Country/Regional + Flat/Globe toggles. */
export function MapSettingsMenu({
  regionalViewLocked,
  onRegionalViewChange,
  projectionMode,
  onProjectionModeChange,
  hidden = false,
  placement = 'header',
}: MapSettingsMenuProps) {
  const { colorMode, setColorMode } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={[
        'map-settings-menu',
        `map-settings-menu--${placement}`,
        open ? 'map-settings-menu--open' : '',
        hidden ? 'map-settings-menu--hidden' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="map-settings-menu__trigger"
        aria-label={open ? 'Close map settings' : 'Open map settings'}
        aria-expanded={open}
        aria-controls={panelId}
        tabIndex={hidden ? -1 : 0}
        onClick={() => setOpen((value) => !value)}
      >
        <MapIcon />
      </button>

      <div
        id={panelId}
        className="map-settings-menu__panel"
        role="region"
        aria-label="Map settings"
        aria-hidden={!open}
      >
        <div className="map-settings-menu__panel-inner">
          <MapProjectionToggle
            mode={projectionMode}
            onChange={onProjectionModeChange}
          />
          <MapViewToggle
            regionalViewLocked={regionalViewLocked}
            onChange={onRegionalViewChange}
            regionalDisabled={projectionMode === 'globe'}
          />
          <MapThemeToggle mode={colorMode} onChange={setColorMode} />
        </div>
      </div>
    </div>
  );
}
