import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WorldMap } from '../components/WorldMap';
import { useVisitedCountries } from '../hooks/useVisitedCountries';
import './MapPage.css';

export function MapPage() {
  const navigate = useNavigate();
  const { count, toggle, isVisited } = useVisitedCountries();

  useEffect(() => {
    if (sessionStorage.getItem('guestMode') !== 'true') {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const countryLabel = count === 1 ? 'country' : 'countries';

  return (
    <div className="map-page">
      <header className="map-page__header">
        <div className="map-page__header-left">
          <h1 className="map-page__title">Country Tracker</h1>
          <span className="map-page__count">
            {count} {countryLabel} visited
          </span>
        </div>
        <Link to="/" className="map-page__back" onClick={() => sessionStorage.removeItem('guestMode')}>
          Back
        </Link>
      </header>
      <main className="map-page__main">
        <WorldMap isVisited={isVisited} onToggle={toggle} />
      </main>
    </div>
  );
}
