import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapBurgerButton } from '../components/MapBurgerButton';
import { MapSidePanel } from '../components/MapSidePanel';
import { WorldMap } from '../components/WorldMap';
import { WorldGlobe } from '../components/WorldGlobe';
import { MapStats } from '../components/MapStats';
import type { MapProjectionMode } from '../components/MapProjectionToggle';
import { useAuth } from '../hooks/useAuth';
import { prefetchRegionMap } from '../hooks/useRegionGeoData';
import { useVisitedCountries } from '../hooks/useVisitedCountries';
import { downloadFlatMapPng } from '../lib/exportFlatMapPng';
import './MapPage.css';

const LOGO_URL = '/travel-tracker-logo.png';

export function MapPage() {
  const navigate = useNavigate();
  const { user, isGuest, isLoading, logout } = useAuth();
  const {
    toggle,
    isVisited,
    toggleRegion,
    isRegionVisited,
    count,
    continentCount,
    visited,
  } = useVisitedCountries();
  const [regionalViewLocked, setRegionalViewLocked] = useState(false);
  const [projectionMode, setProjectionMode] =
    useState<MapProjectionMode>('flat');
  const [menuOpen, setMenuOpen] = useState(false);
  const switchAccountRef = useRef(false);

  useEffect(() => {
    prefetchRegionMap();
  }, []);

  useEffect(() => {
    if (!isLoading && !user && !isGuest) {
      // Switch account should land on the login form, not the landing page.
      if (switchAccountRef.current) {
        switchAccountRef.current = false;
        navigate('/login', { replace: true });
        return;
      }
      navigate('/', { replace: true });
    }
  }, [isLoading, user, isGuest, navigate]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const handleLogOut = () => {
    logout();
  };

  const handleSwitchAccount = () => {
    setMenuOpen(false);
    switchAccountRef.current = true;
    logout();
  };

  const handleProjectionModeChange = (mode: MapProjectionMode) => {
    setProjectionMode(mode);
    if (mode === 'globe') {
      setRegionalViewLocked(false);
    }
  };

  const handleMyAccount = () => {
    setMenuOpen(false);
    if (isGuest || !user) {
      navigate('/login');
      return;
    }
    navigate('/account');
  };

  const handleExport = () => {
    setMenuOpen(false);
    void downloadFlatMapPng(visited).catch((error) => {
      console.error(error);
      window.alert(
        error instanceof Error
          ? error.message
          : 'Failed to export map image.',
      );
    });
  };

  if (isLoading) {
    return <div className="map-page map-page--loading" />;
  }

  if (!user && !isGuest) {
    return null;
  }

  return (
    <div className="map-page">
      <main className="map-page__main">
        <header className="map-page__top">
          <MapBurgerButton
            open={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          />
          <div className="map-page__logo-wrap">
            <img
              className="map-page__logo"
              src={LOGO_URL}
              alt="Travel Tracker"
            />
          </div>
          <Link to="/" className="map-page__back" onClick={handleLogOut}>
            Log out
          </Link>
        </header>
        <MapSidePanel
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          accountLabel="My account"
          onMyAccount={handleMyAccount}
          onExport={handleExport}
          onSwitchAccount={handleSwitchAccount}
        />
        <MapStats
          countriesVisited={count}
          continentsVisited={continentCount}
          regionalViewLocked={regionalViewLocked}
          onRegionalViewChange={setRegionalViewLocked}
          projectionMode={projectionMode}
          onProjectionModeChange={handleProjectionModeChange}
        />
        {projectionMode === 'globe' ? (
          <WorldGlobe isVisited={isVisited} onToggle={toggle} />
        ) : (
          <WorldMap
            isVisited={isVisited}
            onToggle={toggle}
            isRegionVisited={isRegionVisited}
            onToggleRegion={toggleRegion}
            regionalViewLocked={regionalViewLocked}
          />
        )}
      </main>
    </div>
  );
}
