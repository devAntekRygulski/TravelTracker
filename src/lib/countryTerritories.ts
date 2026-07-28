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

function ringCrossesAntimeridian(ring: Position[]): boolean {
  for (let i = 1; i < ring.length; i += 1) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) return true;
  }
  return false;
}

/** Make consecutive longitudes continuous (e.g. 170 → 190 instead of 170 → -170). */
function unwrapRing(ring: Position[]): Position[] {
  const out: Position[] = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i += 1) {
    let lon = ring[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, ring[i][1]]);
  }
  return out;
}

function normalizeLongitude(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/**
 * Sutherland–Hodgman clip of a ring against a half-plane lon ? boundary.
 * `inside` tests whether a longitude is retained.
 */
function clipRingToLongitude(
  ring: Position[],
  inside: (lon: number) => boolean,
  boundary: number,
): Position[] {
  const pts = ring.slice();
  if (
    pts.length > 1 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1]
  ) {
    pts.pop();
  }
  if (pts.length < 3) return [];

  const out: Position[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const start = pts[i];
    const end = pts[(i + 1) % pts.length];
    const startIn = inside(start[0]);
    const endIn = inside(end[0]);
    if (endIn) {
      if (!startIn) {
        const t = (boundary - start[0]) / (end[0] - start[0]);
        out.push([boundary, start[1] + t * (end[1] - start[1])]);
      }
      out.push([end[0], end[1]]);
    } else if (startIn) {
      const t = (boundary - start[0]) / (end[0] - start[0]);
      out.push([boundary, start[1] + t * (end[1] - start[1])]);
    }
  }

  if (out.length < 3) return [];
  out.push([out[0][0], out[0][1]]);
  return out;
}

/**
 * Split a polygon that crosses the antimeridian into non-wrapping pieces
 * so projected bounds stay tight (critical for Russia / Fiji focus framing).
 */
function splitAntimeridianPolygon(coordinates: Position[][]): Position[][][] {
  const outer = coordinates[0];
  if (!ringCrossesAntimeridian(outer)) {
    return [coordinates];
  }

  const unwrapped = unwrapRing(outer);
  const minLon = Math.min(...unwrapped.map((point) => point[0]));
  const maxLon = Math.max(...unwrapped.map((point) => point[0]));
  const holes = coordinates.slice(1);

  const result: Position[][][] = [];
  // Cover the unwrapped span with canonical 360° windows: [-180,180], [180,540], …
  let windowStart = Math.floor((minLon + 180) / 360) * 360 - 180;
  while (windowStart < maxLon) {
    const left = windowStart;
    const right = windowStart + 360;
    let ring = unwrapped;
    ring = clipRingToLongitude(ring, (lon) => lon >= left, left);
    ring = clipRingToLongitude(ring, (lon) => lon <= right, right);

    if (ring.length >= 4) {
      const shift = left + 180;
      const normalized = ring.map(
        ([lon, lat]) => [normalizeLongitude(lon - shift), lat] as Position,
      );
      if (
        normalized[0][0] !== normalized[normalized.length - 1][0] ||
        normalized[0][1] !== normalized[normalized.length - 1][1]
      ) {
        normalized.push([normalized[0][0], normalized[0][1]]);
      }
      result.push([normalized, ...holes]);
    }

    windowStart += 360;
  }

  return result.length > 0 ? result : [coordinates];
}

function partFromCoordinates(
  coordinates: Position[][],
  index: number,
): PolygonPart {
  const g: Polygon = { type: 'Polygon', coordinates };
  return {
    index,
    coordinates,
    area: geoArea(g),
    centroid: geoCentroid(g) as [number, number],
    bounds: geoBounds(g) as [[number, number], [number, number]],
  };
}

function polygonParts(geometry: Geometry): PolygonPart[] {
  const polygons: Position[][][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];

  const parts: PolygonPart[] = [];
  let index = 0;
  for (const polygon of polygons) {
    for (const split of splitAntimeridianPolygon(polygon)) {
      parts.push(partFromCoordinates(split, index));
      index += 1;
    }
  }
  return parts;
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

function isKaliningrad(lon: number, lat: number): boolean {
  return lat > 54 && lat < 56 && lon > 19 && lon < 23;
}

/** Russia: only mainland + Kaliningrad; drop arctic/island fragments. */
function keepRussiaRemote(centroid: [number, number]): boolean {
  return isKaliningrad(centroid[0], centroid[1]);
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

  // United States — Hawaii first; lon alone would also match Alaska.
  if (countryId === '840') {
    if (lat > 18 && lat < 24 && lon > -162 && lon < -154) name = 'Hawaii';
    else if (lat > 50 && lon < -129) name = 'Alaska';
  }

  // Russia — only Kaliningrad is exposed as a remote territory.
  if (countryId === '643') {
    if (isKaliningrad(lon, lat)) name = 'Kaliningrad';
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
    const isMainland = index === 0;
    const centroid = clusterCentroid(cluster);

    if (!isMainland) {
      if (countryId === '643') {
        if (!keepRussiaRemote(centroid)) return;
      } else if (area / mainlandArea < MIN_AREA_RATIO) {
        return;
      }
    }

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
