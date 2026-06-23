import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WorldMap } from '../components/WorldMap';
import { MapStats } from '../components/MapStats';
import { useVisitedCountries } from '../hooks/useVisitedCountries';
import './MapPage.css';

const LOGO_URL = '/travel-tracker-logo.png';

export function MapPage() {
  const navigate = useNavigate();
  const { toggle, isVisited, count, continentCount } = useVisitedCountries();

  useEffect(() => {
    if (sessionStorage.getItem('guestMode') !== 'true') {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const handleGoBack = () => {
    sessionStorage.removeItem('guestMode');
  };

  return (
    <div className="map-page">
      <header className="map-page__header">
        <img
          className="map-page__logo"
          src={LOGO_URL}
          alt="Travel Tracker"
        />
        <Link to="/" className="map-page__back" onClick={handleGoBack}>
          Go back
        </Link>
      </header>
      <main className="map-page__main">
        <MapStats
          countriesVisited={count}
          continentsVisited={continentCount}
        />
        <WorldMap isVisited={isVisited} onToggle={toggle} />
      </main>
    </div>
  );
}
