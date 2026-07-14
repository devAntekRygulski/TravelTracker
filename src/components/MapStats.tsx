import { TOTAL_MAP_COUNTRIES } from '../data/mapCountries';
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

function PercentStat({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const digits = String(clamped).split('');

  return (
    <div className="map-stats__value" aria-label={`${clamped} percent`}>
      {digits.map((digit, index) => (
        <img
          key={`${clamped}-${index}-${digit}`}
          className="map-stats__digit"
          src={`/${digit}.png`}
          alt=""
          aria-hidden="true"
        />
      ))}
      <img
        className="map-stats__percent"
        src="/percentege_sign.png"
        alt=""
        aria-hidden="true"
      />
    </div>
  );
}

export function MapStats({
  countriesVisited,
  continentsVisited,
  regionalViewLocked,
  onRegionalViewChange,
}: MapStatsProps) {
  const percentVisited = Math.round(
    (countriesVisited / TOTAL_MAP_COUNTRIES) * 100,
  );

  return (
    <aside className="map-stats" aria-label="Travel statistics">
      <div className="map-stats__item">
        <PercentStat value={percentVisited} />
        <span className="map-stats__label">of countries visited</span>
      </div>
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
