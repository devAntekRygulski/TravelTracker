import { geoContains } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import countryIsoMap from './countryIsoMap.json';
import type {
  PopulatedPlaceProperties,
  RegionProperties,
} from './regionData';

const isoNumericToA3 = countryIsoMap as Record<string, string>;

const a3ToIsoNumeric = Object.fromEntries(
  Object.entries(isoNumericToA3).map(([numeric, a3]) => [a3, numeric]),
);

export function getCountryA3FromNumeric(countryId: string): string | undefined {
  return isoNumericToA3[countryId];
}

export function getCountryNumericFromA3(adm0A3: string): string | undefined {
  return a3ToIsoNumeric[adm0A3];
}

export function findCountryIdAtPoint(
  countries: Feature<Geometry>[],
  point: [number, number],
): string | null {
  for (const country of countries) {
    if (geoContains(country, point)) {
      return String(country.id);
    }
  }

  return null;
}

export function filterTopCityMarkers(
  topCities: FeatureCollection<Geometry>,
  options: {
    regionalViewLocked: boolean;
    focusAdm0A3: string | null;
    citiesEnabled: boolean;
  },
) {
  const { regionalViewLocked, focusAdm0A3, citiesEnabled } = options;

  if (!citiesEnabled) {
    return [];
  }

  // Prefer cities in the focused country so regional view doesn't spray
  // dashed city boxes across the whole continent.
  if (focusAdm0A3) {
    return topCities.features.filter((feature) => {
      const adm0A3 = (feature.properties as { adm0_a3?: string } | null)?.adm0_a3;
      return adm0A3 === focusAdm0A3;
    });
  }

  if (regionalViewLocked) {
    return topCities.features;
  }

  return [];
}

export function getRegionId(feature: Feature<Geometry>): string {
  const properties = feature.properties as RegionProperties | null;
  return properties?.region_id ?? 'region';
}

export function getRegionName(feature: Feature<Geometry>): string {
  const properties = feature.properties as RegionProperties | null;
  return properties?.region_name ?? 'Region';
}

export function getCityId(feature: Feature<Geometry>, index: number): string {
  const cityName = (feature.properties as { city_name?: string } | null)?.city_name;
  return `city-${cityName ?? index}`;
}

export function getCityName(feature: Feature<Geometry>): string {
  const properties = feature.properties as PopulatedPlaceProperties | null;
  return properties?.city_name ?? 'City';
}
