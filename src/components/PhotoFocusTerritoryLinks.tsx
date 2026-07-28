import { easeInOutCubic } from '../lib/photoFocus';
import type { CountryTerritory } from '../lib/countryTerritories';
import './PhotoFocusTerritoryLinks.css';

interface PhotoFocusTerritoryLinksProps {
  territories: CountryTerritory[];
  activeTerritoryId: string;
  progress: number;
  onSelect: (territoryId: string) => void;
}

/** Links to jump between mainland and remote territories while focused. */
export function PhotoFocusTerritoryLinks({
  territories,
  activeTerritoryId,
  progress,
  onSelect,
}: PhotoFocusTerritoryLinksProps) {
  const links = territories.filter(
    (territory) => territory.id !== activeTerritoryId,
  );
  if (links.length === 0) return null;

  const opacity = easeInOutCubic(Math.max(0, (progress - 0.55) / 0.45));

  return (
    <div className="photo-focus-territories" style={{ opacity }}>
      {links.map((territory) => (
        <button
          key={territory.id}
          type="button"
          className="photo-focus-territories__link"
          onClick={() => onSelect(territory.id)}
        >
          Go to {territory.name}
        </button>
      ))}
    </div>
  );
}
