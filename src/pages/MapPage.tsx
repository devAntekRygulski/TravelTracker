import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapSidePanel } from '../components/MapSidePanel';
import { MapSettingsMenu } from '../components/MapSettingsMenu';
import { MapUserMenu } from '../components/MapUserMenu';
import { WorldMap } from '../components/WorldMap';
import { WorldGlobe } from '../components/WorldGlobe';
import { MapStats } from '../components/MapStats';
import type { MapProjectionMode } from '../components/MapProjectionToggle';
import { useAuth } from '../hooks/useAuth';
import { prefetchCountryPhotoPresence } from '../hooks/useCountryHasPhotos';
import { prefetchRegionMap } from '../hooks/useRegionGeoData';
import { useVisitedCountries } from '../hooks/useVisitedCountries';
import { downloadFlatMapPng } from '../lib/exportFlatMapPng';
import './MapPage.css';

const LOGO_URL = '/travel-tracker-logo.png';

export function MapPage() {
  const navigate = useNavigate();
  const { user, token, isGuest, isLoading, logout } = useAuth();
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
  const [photoFocusActive, setPhotoFocusActive] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const switchAccountRef = useRef(false);

  useEffect(() => {
    prefetchRegionMap();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user && !isGuest) return;

    void prefetchCountryPhotoPresence(token, isGuest);
  }, [isLoading, user, isGuest, token]);

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
    if (lightboxOpen) setMenuOpen(false);
  }, [lightboxOpen]);

  const handleLogOut = () => {
    logout();
  };

  const handleSwitchAccount = () => {
    setMenuOpen(false);
    switchAccountRef.current = true;
    logout();
  };

  const handleProjectionModeChange = (mode: MapProjectionMode) => {
    setPhotoFocusActive(false);
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
    <div className={`map-page${lightboxOpen ? ' map-page--lightbox' : ''}`}>
      <main className="map-page__main">
        {!lightboxOpen && (
          <header className="map-page__top">
            <div className="map-page__top-start">
              <MapSidePanel
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                onToggle={() => setMenuOpen((open) => !open)}
                onExport={handleExport}
              />
              <MapSettingsMenu
                regionalViewLocked={regionalViewLocked}
                onRegionalViewChange={setRegionalViewLocked}
                projectionMode={projectionMode}
                onProjectionModeChange={handleProjectionModeChange}
                hidden={photoFocusActive}
              />
            </div>
            <div className="map-page__logo-wrap">
              <img
                className="map-page__logo"
                src={LOGO_URL}
                alt="Travel Tracker"
              />
            </div>
            <MapUserMenu
              accountLabel="My account"
              onMyAccount={handleMyAccount}
              onSwitchAccount={handleSwitchAccount}
              onLogOut={handleLogOut}
            />
          </header>
        )}
        {!lightboxOpen && (
          <MapStats
            countriesVisited={count}
            continentsVisited={continentCount}
            regionalViewLocked={regionalViewLocked}
            onRegionalViewChange={setRegionalViewLocked}
            projectionMode={projectionMode}
            onProjectionModeChange={handleProjectionModeChange}
            hideToggles={photoFocusActive}
          />
        )}
        {projectionMode === 'globe' ? (
          <WorldGlobe
            isVisited={isVisited}
            onToggle={toggle}
            onPhotoFocusChange={setPhotoFocusActive}
            onLightboxChange={setLightboxOpen}
          />
        ) : (
          <WorldMap
            isVisited={isVisited}
            onToggle={toggle}
            isRegionVisited={isRegionVisited}
            onToggleRegion={toggleRegion}
            regionalViewLocked={regionalViewLocked}
            onPhotoFocusChange={setPhotoFocusActive}
            onLightboxChange={setLightboxOpen}
          />
        )}
      </main>
    </div>
  );
}
