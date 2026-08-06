import { useEffect, useId, useRef, useState } from 'react';
import './MapUserMenu.css';

interface MapUserMenuProps {
  accountLabel: string;
  onMyAccount: () => void;
  onSwitchAccount: () => void;
  onLogOut: () => void;
}

function UserIcon() {
  return (
    <svg
      className="map-user-menu__icon"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12Zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8Z"
      />
    </svg>
  );
}

/** Desktop account menu — user icon expands into a panel with account actions. */
export function MapUserMenu({
  accountLabel,
  onMyAccount,
  onSwitchAccount,
  onLogOut,
}: MapUserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

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
      className={`map-user-menu${open ? ' map-user-menu--open' : ''}`}
    >
      <button
        type="button"
        className="map-user-menu__trigger"
        aria-label={open ? 'Close account menu' : 'Open account menu'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <UserIcon />
      </button>

      <div
        id={panelId}
        className="map-user-menu__panel"
        role="region"
        aria-label="Account menu"
        aria-hidden={!open}
      >
        <div className="map-user-menu__panel-inner">
          <button
            type="button"
            className="map-user-menu__button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOpen(false);
              onMyAccount();
            }}
          >
            {accountLabel}
          </button>
          <button
            type="button"
            className="map-user-menu__button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOpen(false);
              onSwitchAccount();
            }}
          >
            Switch account
          </button>
          <button
            type="button"
            className="map-user-menu__button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOpen(false);
              onLogOut();
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
