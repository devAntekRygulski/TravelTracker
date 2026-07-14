import type {
  FeatureCollection,
  Geometry,
  MultiLineString,
} from 'geojson';

export const CITY_OUTLINE_ZOOM = 5.5;

// Precomputed by scripts/build-region-data.mjs from Natural Earth 10m data.
export const REGION_MAP_URL = '/regions/region-map.json';

export interface RegionProperties {
  region_id: string;
  region_name: string;
}

export interface PopulatedPlaceProperties {
  adm0_a3?: string;
  city_name?: string;
}

export interface RegionMapData {
  regions: FeatureCollection<Geometry, RegionProperties>;
  innerBorders: MultiLineString;
  topCities: FeatureCollection<Geometry, PopulatedPlaceProperties>;
}
