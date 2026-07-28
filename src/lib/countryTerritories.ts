import { geoArea, geoBounds, geoCentroid } from 'd3-geo';
import type { Feature, Geometry, Polygon, Position } from 'geojson';

export type CountryTerritory = {
  id: string;
  name: string;
  isMainland: boolean;
  feature: Feature<Geometry>;
};

type PolygonPart = {
  index: number;
  coordinates: Position[][];
  area: number;
  centroid: [number, number];
  bounds: [[number, number], [number, number]];
};

/** Degrees — polygons closer than this merge into one territory. */
const CLUSTER_DISTANCE_DEG = 12;
/** Ignore tiny fragments relative to the mainland. */
const MIN_AREA_RATIO = 0.002;

function lonDistance(a: number, b: number): number {
  return Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
}

function centroidDistance(
  a: [number, number],
  b: [number, number],
): number {
  const dLon = lonDistance(a[0], b[0]);
  const dLat = Math.abs(a[1] - b[1]);
  return Math.hypot(dLon, dLat);
}

function polygonParts(geometry: Geometry): PolygonPart[] {
  if (geometry.type === 'Polygon') {
    const g: Polygon = geometry;
    return [
      {
        index: 0,
        coordinates: g.coordinates,
        area: geoArea(g),
        centroid: geoCentroid(g) as [number, number],
        bounds: geoBounds(g) as [[number, number], [number, number]],
      },
    ];
  }

  if (geometry.type !== 'MultiPolygon') {
    return [];
  }

  return geometry.coordinates.map((coordinates, index) => {
    const g: Polygon = { type: 'Polygon', coordinates };
    return {
      index,
      coordinates,
      area: geoArea(g),
      centroid: geoCentroid(g) as [number, number],
      bounds: geoBounds(g) as [[number, number], [number, number]],
    };
  });
}

function clusterParts(parts: PolygonPart[]): PolygonPart[][] {
  const remaining = [...parts].sort((a, b) => b.area - a.area);
  const clusters: PolygonPart[][] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const cluster = [seed];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = remaining.length - 1; i >= 0; i -= 1) {
        const candidate = remaining[i];
        const near = cluster.some(
          (member) =>
            centroidDistance(member.centroid, candidate.centroid) <=
            CLUSTER_DISTANCE_DEG,
        );
        if (near) {
          cluster.push(candidate);
          remaining.splice(i, 1);
          changed = true;
        }
      }
    }
    clusters.push(cluster);
  }

  return clusters;
}

function clusterFeature(
  country: Feature<Geometry>,
  cluster: PolygonPart[],
): Feature<Geometry> {
  if (cluster.length === 1) {
    return {
      type: 'Feature',
      id: country.id,
      properties: country.properties,
      geometry: {
        type: 'Polygon',
        coordinates: cluster[0].coordinates,
      },
    };
  }

  return {
    type: 'Feature',
    id: country.id,
    properties: country.properties,
    geometry: {
      type: 'MultiPolygon',
      coordinates: cluster.map((part) => part.coordinates),
    },
  };
}

function clusterCentroid(cluster: PolygonPart[]): [number, number] {
  let areaSum = 0;
  let lonSum = 0;
  let latSum = 0;
  for (const part of cluster) {
    areaSum += part.area;
    lonSum += part.centroid[0] * part.area;
    latSum += part.centroid[1] * part.area;
  }
  if (areaSum <= 0) return cluster[0].centroid;
  return [lonSum / areaSum, latSum / areaSum];
}

function nameTerritory(
  countryId: string,
  countryName: string,
  centroid: [number, number],
  isMainland: boolean,
  usedNames: Set<string>,
): string {
  if (isMainland) return 'Mainland';

  const [lon, lat] = centroid;
  let name: string | null = null;

  // United States
  if (countryId === '840') {
    if (lat > 50 || lon < -129) name = 'Alaska';
    else if (lat > 18 && lat < 24 && lon > -162 && lon < -154) name = 'Hawaii';
  }

  // France
  if (countryId === '250') {
    if (lat > 2 && lat < 7 && lon > -56 && lon < -50) name = 'French Guiana';
    else if (lat > 41 && lat < 44 && lon > 8 && lon < 10) name = 'Corsica';
  }

  // Netherlands
  if (countryId === '528') {
    if (lat < 20) name = 'Caribbean Netherlands';
  }

  // Denmark
  if (countryId === '208') {
    if (lat > 55 && lon < 0) name = 'Faroe Islands';
  }

  // Spain
  if (countryId === '724') {
    if (lat > 27 && lat < 30 && lon > -19 && lon < -13) name = 'Canary Islands';
  }

  // Portugal
  if (countryId === '620') {
    if (lat > 36 && lat < 40 && lon > -32 && lon < -24) name = 'Azores';
    else if (lat > 32 && lat < 34 && lon > -18 && lon < -16) name = 'Madeira';
  }

  // Chile
  if (countryId === '152') {
    if (lat > -28 && lat < -26 && lon > -110 && lon < -108) name = 'Easter Island';
  }

  // New Zealand
  if (countryId === '554') {
    if (lat > -45 && lon > 165) name = 'Chatham Islands';
  }

  if (!name) {
    name = `${countryName} territory`;
  }

  let unique = name;
  let n = 2;
  while (usedNames.has(unique)) {
    unique = `${name} ${n}`;
    n += 1;
  }
  usedNames.add(unique);
  return unique;
}

/**
 * Split a country into mainland + remote territories for photo-focus framing.
 * Mainland is the largest polygon cluster; tiny fragments are dropped.
 */
export function getCountryTerritories(
  country: Feature<Geometry>,
): CountryTerritory[] {
  const countryId = String(country.id ?? '');
  const countryName =
    (country.properties as { name?: string } | null)?.name ?? countryId;
  const parts = polygonParts(country.geometry);
  if (parts.length === 0) {
    return [
      {
        id: 'mainland',
        name: 'Mainland',
        isMainland: true,
        feature: country,
      },
    ];
  }

  const clusters = clusterParts(parts);
  const mainlandArea = clusters[0].reduce((sum, part) => sum + part.area, 0);
  const usedNames = new Set<string>(['Mainland']);

  const territories: CountryTerritory[] = [];

  clusters.forEach((cluster, index) => {
    const area = cluster.reduce((sum, part) => sum + part.area, 0);
    if (index > 0 && area / mainlandArea < MIN_AREA_RATIO) {
      return;
    }

    const isMainland = index === 0;
    const centroid = clusterCentroid(cluster);
    const name = nameTerritory(
      countryId,
      countryName,
      centroid,
      isMainland,
      usedNames,
    );
    const id = isMainland
      ? 'mainland'
      : name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    territories.push({
      id,
      name,
      isMainland,
      feature: clusterFeature(country, cluster),
    });
  });

  return territories;
}

export function getTerritoryById(
  territories: CountryTerritory[],
  territoryId: string,
): CountryTerritory {
  return (
    territories.find((territory) => territory.id === territoryId) ??
    territories[0]
  );
}
