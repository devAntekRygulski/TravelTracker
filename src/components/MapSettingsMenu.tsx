import { useEffect, useId, useRef, useState } from 'react';
import {
  MapProjectionToggle,
  type MapProjectionMode,
} from './MapProjectionToggle';
import { MapViewToggle } from './MapViewToggle';
import './MapSettingsMenu.css';

interface MapSettingsMenuProps {
  regionalViewLocked: boolean;
  onRegionalViewChange: (regionalViewLocked: boolean) => void;
  projectionMode: MapProjectionMode;
  onProjectionModeChange: (mode: MapProjectionMode) => void;
  hidden?: boolean;
}

function GearIcon() {
  return (
    <svg
      className="map-settings-menu__icon"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96c.24.1.5 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
      />
    </svg>
  );
}

/** Phone-only map settings — gear icon expands into view / projection toggles. */
export function MapSettingsMenu({
  regionalViewLocked,
  onRegionalViewChange,
  projectionMode,
  onProjectionModeChange,
  hidden = false,
}: MapSettingsMenuProps) {
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
        <GearIcon />
      </button>

      <div
        id={panelId}
        className="map-settings-menu__panel"
        role="region"
        aria-label="Map settings"
        aria-hidden={!open}
      >
        <div className="map-settings-menu__panel-inner">
          <MapViewToggle
            regionalViewLocked={regionalViewLocked}
            onChange={onRegionalViewChange}
            regionalDisabled={projectionMode === 'globe'}
          />
          <MapProjectionToggle
            mode={projectionMode}
            onChange={onProjectionModeChange}
          />
        </div>
      </div>
    </div>
  );
}
