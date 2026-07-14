import './MapStats.css';
import { MapViewToggle } from './MapViewToggle';

interface MapStatsProps {
  countriesVisited: number;
  continentsVisited: number;
  regionalViewLocked: boolean;
  onRegionalViewChange: (regionalViewLocked: boolean) => void;
}

function StatNumber({ value }: { value: number }) {
  const digits = String(Math.max(0, value)).split('');

  return (
    <div className="map-stats__value" aria-label={String(value)}>
      {digits.map((digit, index) => (
        <img
          key={`${value}-${index}-${digit}`}
          className="map-stats__digit"
          src={`/${digit}.png`}
          alt=""
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function MapStats({
  countriesVisited,
  continentsVisited,
  regionalViewLocked,
  onRegionalViewChange,
}: MapStatsProps) {
  return (
    <aside className="map-stats" aria-label="Travel statistics">
      <div className="map-stats__item">
        <StatNumber value={countriesVisited} />
        <span className="map-stats__label">countries visited</span>
      </div>
      <div className="map-stats__item">
        <StatNumber value={continentsVisited} />
        <span className="map-stats__label">continents visited</span>
      </div>
      <MapViewToggle
        regionalViewLocked={regionalViewLocked}
        onChange={onRegionalViewChange}
      />
    </aside>
  );
}
