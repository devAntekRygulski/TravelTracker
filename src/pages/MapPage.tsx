import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WorldMap } from '../components/WorldMap';
import { MapStats } from '../components/MapStats';
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

  if (isLoading) {
    return <div className="map-page map-page--loading" />;
  }

  if (!user && !isGuest) {
    return null;
  }

  return (
    <div className="map-page">
      <main className="map-page__main">
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
        <MapStats
          countriesVisited={count}
          continentsVisited={continentCount}
          regionalViewLocked={regionalViewLocked}
          onRegionalViewChange={setRegionalViewLocked}
        />
        <WorldMap
          isVisited={isVisited}
          onToggle={toggle}
          isRegionVisited={isRegionVisited}
          onToggleRegion={toggleRegion}
          regionalViewLocked={regionalViewLocked}
        />
      </main>
    </div>
  );
}
