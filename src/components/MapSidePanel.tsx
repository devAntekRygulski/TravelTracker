import './MapSidePanel.css';

interface MapSidePanelProps {
  open: boolean;
  onClose: () => void;
  accountLabel: string;
  onMyAccount: () => void;
  onExport: () => void;
  onSwitchAccount: () => void;
}

export function MapSidePanel({
  open,
  onClose,
  accountLabel,
  onMyAccount,
  onExport,
  onSwitchAccount,
}: MapSidePanelProps) {
  return (
    <div
      className={`map-side-panel${open ? ' map-side-panel--open' : ''}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="map-side-panel__backdrop"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <nav
        className="map-side-panel__drawer"
        id="map-side-panel"
        aria-label="Main menu"
      >
        <div className="map-side-panel__actions">
          <button
            type="button"
            className="map-side-panel__button"
            tabIndex={open ? 0 : -1}
            onClick={onMyAccount}
          >
            {accountLabel}
          </button>
          <button
            type="button"
            className="map-side-panel__button"
            tabIndex={open ? 0 : -1}
            onClick={onSwitchAccount}
          >
            Switch account
          </button>
          <button
            type="button"
            className="map-side-panel__button"
            tabIndex={open ? 0 : -1}
            onClick={onExport}
          >
            Export as PNG
          </button>
        </div>
      </nav>
    </div>
  );
}
