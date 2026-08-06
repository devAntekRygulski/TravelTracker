import { useEffect, useId, useRef } from 'react';
import { MapBurgerButton } from './MapBurgerButton';
import './MapSidePanel.css';

interface MapSidePanelProps {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
  onExport: () => void;
}

export function MapSidePanel({
  open,
  onClose,
  onToggle,
  onExport,
}: MapSidePanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        onClose();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div
      ref={rootRef}
      className={`map-side-panel${open ? ' map-side-panel--open' : ''}`}
    >
      <div className="map-side-panel__trigger">
        <MapBurgerButton open={open} onClick={onToggle} panelId={panelId} />
      </div>

      <div
        id={panelId}
        className="map-side-panel__panel"
        role="region"
        aria-label="Main menu"
        aria-hidden={!open}
      >
        <div className="map-side-panel__panel-inner">
          <button
            type="button"
            className="map-side-panel__button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onClose();
              onExport();
            }}
          >
            Export as PNG
          </button>
        </div>
      </div>
    </div>
  );
}
