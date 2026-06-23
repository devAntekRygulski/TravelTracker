import './MapStats.css';

interface MapStatsProps {
  countriesVisited: number;
  continentsVisited: number;
}

export function MapStats({ countriesVisited, continentsVisited }: MapStatsProps) {
  return (
    <aside className="map-stats" aria-label="Travel statistics">
      <div className="map-stats__item">
        <span className="map-stats__value">{countriesVisited}</span>
        <span className="map-stats__label">countries visited</span>
      </div>
      <div className="map-stats__item">
        <span className="map-stats__value">{continentsVisited}</span>
        <span className="map-stats__label">continents visited</span>
      </div>
    </aside>
  );
}
