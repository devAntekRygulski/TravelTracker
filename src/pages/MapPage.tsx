import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapBurgerButton } from '../components/MapBurgerButton';
import { WorldMap } from '../components/WorldMap';
import { WorldGlobe } from '../components/WorldGlobe';
import { MapStats } from '../components/MapStats';
import type { MapProjectionMode } from '../components/MapProjectionToggle';
import { useAuth } from '../hooks/useAuth';
import { prefetchRegionMap } from '../hooks/useRegionGeoData';
import { useVisitedCountries } from '../hooks/useVisitedCountries';
import './MapPage.css';

const LOGO_URL = '/travel-tracker-logo.png';

export function MapPage() {
  const navigate = useNavigate();
  const { user, isGuest, isLoading, logout } = useAuth();
  const { toggle, isVisited, toggleRegion, isRegionVisited, count, continentCount } =
    useVisitedCountries();
  const [regionalViewLocked, setRegionalViewLocked] = useState(false);
  const [projectionMode, setProjectionMode] =
    useState<MapProjectionMode>('flat');

  useEffect(() => {
    prefetchRegionMap();
  }, []);

  useEffect(() => {
    if (!isLoading && !user && !isGuest) {
      navigate('/', { replace: true });
    }
  }, [isLoading, user, isGuest, navigate]);

  const handleGoBack = () => {
    logout();
  };

  const handleProjectionModeChange = (mode: MapProjectionMode) => {
    setProjectionMode(mode);
    if (mode === 'globe') {
      setRegionalViewLocked(false);
    }
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
          <MapBurgerButton />
          <div className="map-page__logo-wrap">
            <img
              className="map-page__logo"
              src={LOGO_URL}
              alt="Travel Tracker"
            />
          </div>
          <Link to="/" className="map-page__back" onClick={handleGoBack}>
            Go back
          </Link>
        </header>
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
