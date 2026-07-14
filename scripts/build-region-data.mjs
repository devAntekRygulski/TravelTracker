// Generates public/regions/region-map.json from Natural Earth 10m data.
// Run with: npm run build:regions
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { geoArea, geoCentroid, geoContains } from 'd3-geo';
import { feature, merge, mesh } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import {
  detectMeshOverlaps,
  detectSegmentOverlaps,
  extractBoundarySegments,
  summarizeOverlapReport,
} from './borderOverlap.mjs';

const ADMIN1_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const PLACES_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson';
const URBAN_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_urban_areas.geojson';

// Fraction of source points to keep; the goal is detail comparable to the
// low-res 110m country map, not the raw 10m data.
const SIMPLIFY_KEEP_RATIO = 0.05;

// Urban outlines should read as simple blobs, not detailed sprawl.
const URBAN_SIMPLIFY_KEEP_RATIO = 0.04;

// Drop satellite fragments smaller than this fraction of the city's
// largest polygon, so each city is one or two clean shapes.
const URBAN_MIN_PART_RATIO = 0.3;

// Countries with more admin1 units than this get their units merged into
// broader groups (by data fields when available, else geographic clusters).
const MAX_REGIONS_PER_COUNTRY = 25;

// Cluster count for countries whose data has no usable grouping field.
const CLUSTER_TARGET = 20;

// Countries kept at full admin1 detail regardless of the cap.
const KEEP_FULL_DETAIL = new Set(['USA']);

// Only metropolises make the map; smaller cities cluttered whole continents.
const MIN_CITY_POP = 1_000_000;
const MAX_CITIES_PER_COUNTRY = 5;

// Drop island fragments smaller than this (steradians). Tiny slivers render as
// circles/dots and add spurious mesh borders (e.g. Zeeland, Friesland).
const MIN_REGION_PART_AREA = 5e-7;

const COORD_PRECISION = 1e4;
const HALF_SPHERE = 2 * Math.PI;

console.log('Downloading Natural Earth data...');
const [admin1Raw, placesRaw, urbanRaw] = await Promise.all([
  fetch(ADMIN1_URL).then((r) => r.json()),
  fetch(PLACES_URL).then((r) => r.json()),
  fetch(URBAN_URL).then((r) => r.json()),
]);
console.log('admin1 features:', admin1Raw.features.length);
console.log('urban areas:', urbanRaw.features.length);

console.log('Building topology + simplifying...');
const topo = topology({ admin1: admin1Raw }, 1e5);
const presimplified = presimplify(topo);
// quantile(topo, p) returns the weight threshold that keeps fraction p of points
const minWeight = quantile(presimplified, SIMPLIFY_KEEP_RATIO);
const simplified = simplify(presimplified, minWeight);
const admin1Object = simplified.objects.admin1;

const countPoints = (t) => t.arcs.reduce((sum, arc) => sum + arc.length, 0);
console.log('points:', countPoints(topo), '->', countPoints(simplified));

// Deterministic planar k-means over unit centroids (init: evenly spaced
// points after sorting), used for countries without grouping fields.
function kmeans(points, k, iterations = 40) {
  const order = points
    .map((_, i) => i)
    .sort((a, b) => points[a][0] - points[b][0] || points[a][1] - points[b][1]);

  const centers = [];
  for (let c = 0; c < k; c++) {
    const pick = order[Math.floor(((c + 0.5) * points.length) / k)];
    centers.push([...points[pick]]);
  }

  const labels = new Array(points.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    let changed = false;

    for (let i = 0; i < points.length; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dx = points[i][0] - centers[c][0];
        const dy = points[i][1] - centers[c][1];
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (labels[i] !== bestC) {
        labels[i] = bestC;
        changed = true;
      }
    }

    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const s = sums[labels[i]];
      s[0] += points[i][0];
      s[1] += points[i][1];
      s[2]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][2] > 0) {
        centers[c] = [sums[c][0] / sums[c][2], sums[c][1] / sums[c][2]];
      }
    }

    if (!changed) break;
  }

  return labels;
}

console.log('Assigning region groups...');
const unitsByCountry = new Map();
for (const geometry of admin1Object.geometries) {
  const a3 = geometry.properties?.adm0_a3 ?? 'unknown';
  const units = unitsByCountry.get(a3) ?? [];
  units.push(geometry);
  unitsByCountry.set(a3, units);
}

// geometry object -> { key, name } group assignment
const assignments = new Map();
let clusteredCountries = 0;

for (const [a3, units] of unitsByCountry) {
  if (units.length <= MAX_REGIONS_PER_COUNTRY || KEEP_FULL_DETAIL.has(a3)) {
    for (const g of units) {
      assignments.set(g, {
        key: g.properties?.adm1_code ?? `${a3}:${g.properties?.name ?? 'region'}`,
        name: g.properties?.name_en ?? g.properties?.name ?? 'Region',
      });
    }
    continue;
  }

  // Prefer the finest grouping field that stays under the cap
  // (e.g. US census divisions over the 4 coarse census regions).
  let bestField = null;
  let bestCount = 0;
  for (const field of ['region_sub', 'region']) {
    const values = new Set(
      units.map((g) => g.properties?.[field]?.trim() || null),
    );
    const count = values.size;
    if (count >= 2 && count <= MAX_REGIONS_PER_COUNTRY && count > bestCount) {
      bestField = field;
      bestCount = count;
    }
  }

  if (bestField) {
    for (const g of units) {
      const value = g.properties?.[bestField]?.trim();
      // geonunit disambiguates identical region names within one country,
      // e.g. "Eastern" exists in both England and Scotland.
      const geonunit = g.properties?.geonunit?.trim();

      if (value) {
        assignments.set(g, { key: `${a3}:${geonunit ?? ''}:${value}`, name: value });
      } else if (geonunit) {
        assignments.set(g, { key: `${a3}:${geonunit}`, name: geonunit });
      } else {
        assignments.set(g, {
          key: `${a3}:other`,
          name: g.properties?.admin ?? 'Region',
        });
      }
    }
    continue;
  }

  // No usable grouping field (e.g. Turkey, Algeria, Mexico): merge units
  // into geographic clusters, each named after its largest member.
  clusteredCountries++;
  const k = Math.min(CLUSTER_TARGET, units.length);
  const unitFeatures = units.map((g) => feature(simplified, g));
  const centroids = unitFeatures.map((f) => geoCentroid(f));
  const labels = kmeans(centroids, k);

  const clusterName = new Array(k).fill(null);
  unitFeatures.forEach((f, i) => {
    const area = geoArea(f);
    const c = labels[i];
    if (!clusterName[c] || area > clusterName[c].area) {
      clusterName[c] = {
        area,
        name: f.properties?.name_en ?? f.properties?.name ?? 'Region',
      };
    }
  });

  units.forEach((g, i) => {
    const c = labels[i];
    assignments.set(g, {
      key: `${a3}:cluster:${c}`,
      name: clusterName[c]?.name ?? 'Region',
    });
  });
}
console.log('clustered countries:', clusteredCountries);

console.log('Merging region groups...');
const groups = new Map();
for (const geometry of admin1Object.geometries) {
  const { key, name } = assignments.get(geometry);
  const group = groups.get(key);
  if (group) {
    group.geometries.push(geometry);
  } else {
    groups.set(key, { name, geometries: [geometry] });
  }
}

function roundCoords(value) {
  if (typeof value === 'number') {
    return Math.round(value * COORD_PRECISION) / COORD_PRECISION;
  }
  return value.map(roundCoords);
}

const ringArea = (ring) => geoArea({ type: 'Polygon', coordinates: [ring] });

// d3-geo treats polygons as spherical: a wrongly wound ring means "the whole
// world except this shape" and lights up the entire map when filled.
let rewoundRings = 0;
function rewindMultiPolygon(multiPolygon) {
  for (const polygon of multiPolygon) {
    if (polygon.length === 0) continue;
    if (ringArea(polygon[0]) > HALF_SPHERE) {
      polygon[0].reverse();
      rewoundRings++;
    }
    for (let i = 1; i < polygon.length; i++) {
      if (ringArea(polygon[i]) < HALF_SPHERE) {
        polygon[i].reverse();
        rewoundRings++;
      }
    }
  }
}

function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, c) {
  return (
    Math.min(a[0], b[0]) <= c[0] + 1e-12 &&
    c[0] <= Math.max(a[0], b[0]) + 1e-12 &&
    Math.min(a[1], b[1]) <= c[1] + 1e-12 &&
    c[1] <= Math.max(a[1], b[1]) + 1e-12
  );
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) < 1e-12 && onSegment(a, b, c)) return true;
  if (Math.abs(o2) < 1e-12 && onSegment(a, b, d)) return true;
  if (Math.abs(o3) < 1e-12 && onSegment(c, d, a)) return true;
  if (Math.abs(o4) < 1e-12 && onSegment(c, d, b)) return true;
  return false;
}

function ringSelfIntersects(ring) {
  const n = ring.length - 1;
  if (n < 4) return false;

  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

function convexHull(points) {
  const unique = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()];
  unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  if (unique.length < 3) return null;

  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower = [];
  for (const p of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();

  const hull = lower.concat(upper);
  if (hull.length < 3) return null;

  hull.push([...hull[0]]);
  return hull;
}

// Aggressive decimation removes bow-tie rings produced by topojson simplify.
function repairRing(ring, repairLevel = 0) {
  if (!ringSelfIntersects(ring)) return ring;

  const open =
    ring.length > 1 &&
    ring[0][0] === ring.at(-1)[0] &&
    ring[0][1] === ring.at(-1)[1]
      ? ring.slice(0, -1)
      : ring.slice();

  const startStep = Math.max(2, 2 ** repairLevel);
  for (let step = startStep; step <= 32 * startStep; step *= 2) {
    const decimated = open.filter((_, index) => index % step === 0);
    if (decimated.length < 3) continue;

    const closed = [...decimated, decimated[0]];
    if (!ringSelfIntersects(closed)) {
      fixedSelfIntersectRings++;
      return closed;
    }
  }

  // Drop tiny self-intersecting fragments instead of hulling them into circles.
  const area = geoArea({ type: 'Polygon', coordinates: [ring] });
  if (area < MIN_REGION_PART_AREA) {
    return null;
  }

  return ring;
}

function finalizeRing(ring, repairLevel = 0) {
  if (!ring || ring.length < 4) return null;

  let finalized = repairRing(ring, repairLevel);
  if (!finalized) return null;

  if (ringArea(finalized) > HALF_SPHERE) {
    finalized = [...finalized].reverse();
    rewoundRings++;
  }

  if (ringSelfIntersects(finalized)) {
    return null;
  }

  if (ringArea(finalized) > HALF_SPHERE) {
    return null;
  }

  return finalized;
}

/** Drop tiny MultiPolygon fragments without changing kept ring vertices. */
function dropTinyParts(geometry) {
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    if (!ring || ring.length < 4 || ringArea(ring) < MIN_REGION_PART_AREA) {
      return null;
    }
    if (ringArea(ring) > HALF_SPHERE) return null;
    return geometry;
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates.filter((polygon) => {
      const ring = polygon[0];
      if (!ring || ring.length < 4) return false;
      const area = ringArea(ring);
      return area >= MIN_REGION_PART_AREA && area <= HALF_SPHERE;
    });

    if (polygons.length === 0) return null;
    if (polygons.length === 1) {
      return { type: 'Polygon', coordinates: polygons[0] };
    }
    return { type: 'MultiPolygon', coordinates: polygons };
  }

  return null;
}

/**
 * Build fill polygons + interior border mesh from ONE shared topology.
 * Never decimate rings independently — that breaks shared edges and leaves
 * regional borders as incomplete dangling segments (Canada prairies, UK, etc.).
 */
function buildRegionMap(rawRegionFeatures) {
  let droppedRegions = 0;
  const keptFeatures = [];

  for (const f of rawRegionFeatures) {
    const geometry = dropTinyParts(f.geometry);
    if (!geometry) {
      droppedRegions++;
      continue;
    }

    keptFeatures.push({
      type: 'Feature',
      properties: {
        region_id: f.properties.region_id,
        region_name: f.properties.region_name,
        adm0_a3: f.properties.adm0_a3,
      },
      geometry,
    });
  }

  const finalTopo = topology(
    { regions: { type: 'FeatureCollection', features: keptFeatures } },
    1e5,
  );
  const finalObject = finalTopo.objects.regions;

  // Interior borders only: edges shared by two regions of the same country.
  // Extracted from shared topology so each border is complete end-to-end.
  const innerBorders = mesh(finalTopo, finalObject, (a, b) => {
    if (a === b) return false;
    return a.properties?.adm0_a3 === b.properties?.adm0_a3;
  });

  const finalRegions = feature(finalTopo, finalObject);
  const regionOutput = finalRegions.features.map((f) => ({
    type: 'Feature',
    properties: {
      region_id: f.properties.region_id,
      region_name: f.properties.region_name,
      adm0_a3: f.properties.adm0_a3,
    },
    geometry: {
      ...f.geometry,
      coordinates: roundCoords(f.geometry.coordinates),
    },
  }));

  return {
    regionOutput,
    innerBorders: {
      ...innerBorders,
      coordinates: roundCoords(innerBorders.coordinates),
    },
    droppedRegions,
  };
}

let fixedSelfIntersectRings = 0;

const regionFeatures = [];
for (const [key, group] of groups) {
  const merged = merge(simplified, group.geometries);
  rewindMultiPolygon(merged.coordinates);

  regionFeatures.push({
    type: 'Feature',
    properties: {
      region_id: key,
      region_name: group.name,
      adm0_a3: group.geometries[0]?.properties?.adm0_a3 ?? key.slice(0, 3),
    },
    geometry: merged,
  });
}

// Build topology from merged groups, then finalize rings once geometry is shared.
console.log('Building grouped topology...');
const groupedTopo = topology(
  { regions: { type: 'FeatureCollection', features: regionFeatures } },
  1e5,
);
const groupedObject = groupedTopo.objects.regions;
const rawRegions = feature(groupedTopo, groupedObject);

const rawRegionFeatures = rawRegions.features.map((f) => ({
  type: 'Feature',
  properties: {
    region_id: f.properties.region_id,
    region_name: f.properties.region_name,
    adm0_a3: f.properties.adm0_a3,
  },
  geometry: f.geometry,
}));

const { regionOutput, innerBorders, droppedRegions } = buildRegionMap(
  rawRegionFeatures,
);

console.log('dropped tiny/invalid regions:', droppedRegions);

console.log('Validating border overlaps...');
const finalRegionSegments = extractBoundarySegments(regionOutput);
const finalRegionOverlap = detectSegmentOverlaps(finalRegionSegments);
const finalMeshOverlap = detectMeshOverlaps(innerBorders);

const borderOverlapReport = {
  ...summarizeOverlapReport(finalRegionOverlap, finalMeshOverlap),
  guarantee:
    finalMeshOverlap.overlappingSegmentCount === 0
      ? 'Every rendered border segment has overlap=0 (no drawn border crosses another)'
      : 'Rendered border overlaps remain',
  overlapRepairPasses: 0,
  droppedRegions,
  renderedBorderSegmentCount: finalMeshOverlap.segments.length,
  renderedOverlapZero: finalMeshOverlap.segments.filter((s) => s.overlap === 0).length,
  renderedOverlapOne: finalMeshOverlap.overlappingSegmentCount,
  renderedOverlaps: finalMeshOverlap.overlappingSegmentCount,
  geometryOverlaps: finalRegionOverlap.overlappingSegmentCount,
  overlappingRenderedSegments: finalMeshOverlap.segments
    .filter((segment) => segment.overlap === 1)
    .map((segment) => ({
      id: segment.id,
      meshLineIndex: segment.meshLineIndex,
      segIndex: segment.segIndex,
      overlap: segment.overlap,
      coordinates: segment.coordinates,
    })),
  overlappingGeometrySegments: finalRegionOverlap.overlappingSegments,
};

console.log(
  'border validation:',
  borderOverlapReport.renderedOverlaps === 0
    ? 'CLEAN (0 rendered overlaps)'
    : `RENDER OVERLAPS: ${borderOverlapReport.renderedOverlaps}`,
  '| geometry overlaps:',
  borderOverlapReport.geometryOverlaps,
);
console.log('regions:', regionOutput.length, '| rewound rings:', rewoundRings);

console.log('Selecting top cities...');
const populations = JSON.parse(
  await readFile(new URL('../src/data/countryPopulations.json', import.meta.url), 'utf8'),
);
const popValues = Object.values(populations).filter((v) => v > 0);
const logMin = Math.log(Math.min(...popValues) + 1);
const logMax = Math.log(Math.max(...popValues) + 1);

function cityLimit(a3) {
  const population = populations[a3] ?? 0;
  if (population <= 0) return 1;
  const ratio = (Math.log(population + 1) - logMin) / (logMax - logMin);
  return Math.max(1, Math.min(MAX_CITIES_PER_COUNTRY, Math.round(1 + ratio * (MAX_CITIES_PER_COUNTRY - 1))));
}

const placesByCountry = new Map();
for (const place of placesRaw.features) {
  if (place.geometry?.type !== 'Point') continue;
  if ((place.properties?.POP_MAX ?? 0) < MIN_CITY_POP) continue;
  const a3 = place.properties?.ADM0_A3;
  if (!a3) continue;
  const existing = placesByCountry.get(a3) ?? [];
  existing.push(place);
  placesByCountry.set(a3, existing);
}

const selectedCities = [];
for (const [a3, places] of placesByCountry) {
  const top = [...places]
    .sort((a, b) => (b.properties?.POP_MAX ?? 0) - (a.properties?.POP_MAX ?? 0))
    .slice(0, cityLimit(a3));

  for (const place of top) {
    selectedCities.push({
      a3,
      name: place.properties?.NAME ?? place.properties?.NAMEASCII,
      pop: place.properties?.POP_MAX ?? 0,
      lon: place.geometry.coordinates[0],
      lat: place.geometry.coordinates[1],
    });
  }
}
console.log('selected cities:', selectedCities.length);

console.log('Matching cities to urban area outlines...');
function computeBbox(geometry) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      if (coords[0] < minLon) minLon = coords[0];
      if (coords[0] > maxLon) maxLon = coords[0];
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
      return;
    }
    for (const child of coords) visit(child);
  };

  visit(geometry.coordinates);
  return [minLon, minLat, maxLon, maxLat];
}

const urbanBboxes = urbanRaw.features.map((f) => computeBbox(f.geometry));

function findUrbanIndex(lon, lat) {
  for (let i = 0; i < urbanRaw.features.length; i++) {
    const [minLon, minLat, maxLon, maxLat] = urbanBboxes[i];
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    if (geoContains(urbanRaw.features[i], [lon, lat])) return i;
  }
  return -1;
}

// One urban footprint can contain several selected cities (e.g. Tokyo and
// Yokohama); keep it once, named after the biggest city.
const matchedUrban = new Map();
const fallbackPointCities = [];

for (const city of selectedCities) {
  const urbanIndex = findUrbanIndex(city.lon, city.lat);

  if (urbanIndex === -1) {
    fallbackPointCities.push(city);
  } else if (!matchedUrban.has(urbanIndex)) {
    matchedUrban.set(urbanIndex, city);
  }
}
console.log(
  'urban outlines:', matchedUrban.size,
  '| point fallbacks:', fallbackPointCities.length,
);

const urbanSelection = {
  type: 'FeatureCollection',
  features: [...matchedUrban.entries()].map(([urbanIndex, city]) => ({
    type: 'Feature',
    properties: {
      adm0_a3: city.a3,
      city_name: city.name,
      __pop: city.pop,
      __lon: city.lon,
      __lat: city.lat,
    },
    geometry: urbanRaw.features[urbanIndex].geometry,
  })),
};

const urbanTopo = topology({ urban: urbanSelection }, 1e5);
const urbanPre = presimplify(urbanTopo);
const urbanSimplified = simplify(
  urbanPre,
  quantile(urbanPre, URBAN_SIMPLIFY_KEEP_RATIO),
);
const simplifiedUrban = feature(urbanSimplified, urbanSimplified.objects.urban);

// Compact axis-aligned box around a city centre — reads as urban area, not a circle.
function cityRadiusKm(pop) {
  return Math.min(18, 4 + (pop / 1e6) * 1.2);
}

function cityBoxRing(lon, lat, pop) {
  const radiusKm = cityRadiusKm(pop);
  const kmPerDegLat = 111.32;
  const kmPerDegLon = kmPerDegLat * Math.cos((lat * Math.PI) / 180);
  const dLat = radiusKm / kmPerDegLat;
  const dLon = radiusKm / kmPerDegLon;
  const ring = [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
  return ring;
}

function cityBoxFromGeometry(geometry, city) {
  const points = [];
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      points.push(coords);
      return;
    }
    for (const child of coords) visit(child);
  };
  visit(geometry.coordinates);

  const kmPerDegLat = 111.32;
  const kmPerDegLon = kmPerDegLat * Math.cos((city.lat * Math.PI) / 180);
  const distKm = (p) =>
    Math.hypot((p[0] - city.lon) * kmPerDegLon, (p[1] - city.lat) * kmPerDegLat);

  const radius = cityRadiusKm(city.pop);
  const near = points.filter((p) => distKm(p) <= radius);
  if (near.length < 3) {
    return cityBoxRing(city.lon, city.lat, city.pop);
  }

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [x, y] of near) {
    if (x < minLon) minLon = x;
    if (x > maxLon) maxLon = x;
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }

  return [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat],
  ];
}

// Separating-axis test for two convex polygons (open rings, planar lon/lat).
function convexOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const axisX = p2[1] - p1[1];
      const axisY = p1[0] - p2[0];

      let minA = Infinity;
      let maxA = -Infinity;
      for (const p of a) {
        const t = p[0] * axisX + p[1] * axisY;
        if (t < minA) minA = t;
        if (t > maxA) maxA = t;
      }

      let minB = Infinity;
      let maxB = -Infinity;
      for (const p of b) {
        const t = p[0] * axisX + p[1] * axisY;
        if (t < minB) minB = t;
        if (t > maxB) maxB = t;
      }

      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

// Each city contributes one bounded hull; overlapping hulls of nearby
// cities get merged into one, named after the most populous city.
const lobes = [];

for (const urbanFeature of simplifiedUrban.features) {
  const { __pop, __lon, __lat, ...cityProps } = urbanFeature.properties;
  const city = { pop: __pop ?? 0, lon: __lon, lat: __lat };
  const hull = cityBoxFromGeometry(urbanFeature.geometry, city);

  if (!hull) {
    fallbackPointCities.push({
      a3: cityProps.adm0_a3,
      name: cityProps.city_name,
      pop: __pop ?? 0,
      lon: __lon,
      lat: __lat,
    });
    continue;
  }

  lobes.push({
    points: hull.slice(0, -1),
    a3: cityProps.adm0_a3,
    name: cityProps.city_name,
    pop: __pop ?? 0,
  });
}

let mergedLobes = 0;
let didMerge = true;
while (didMerge) {
  didMerge = false;

  outer: for (let i = 0; i < lobes.length; i++) {
    for (let j = i + 1; j < lobes.length; j++) {
      if (!convexOverlap(lobes[i].points, lobes[j].points)) continue;

      const winner = lobes[i].pop >= lobes[j].pop ? lobes[i] : lobes[j];
      const combined = convexHull([...lobes[i].points, ...lobes[j].points]);
      if (!combined) continue;

      const mergedLobe = {
        points: combined.slice(0, -1),
        a3: winner.a3,
        name: winner.name,
        pop: winner.pop,
      };

      lobes.splice(j, 1);
      lobes.splice(i, 1);
      lobes.push(mergedLobe);
      mergedLobes++;
      didMerge = true;
      break outer;
    }
  }
}
console.log('merged overlapping city outlines:', mergedLobes);

const cityFeatures = [];
for (const lobe of lobes) {
  const ring = [...lobe.points, [...lobe.points[0]]];
  const coordinates = [[ring]];
  rewindMultiPolygon(coordinates);

  cityFeatures.push({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: roundCoords(coordinates[0]),
    },
    properties: { adm0_a3: lobe.a3, city_name: lobe.name },
  });
}
for (const city of fallbackPointCities) {
  const ring = cityBoxRing(city.lon, city.lat, city.pop ?? 1_000_000);
  cityFeatures.push({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: roundCoords([ring]),
    },
    properties: { adm0_a3: city.a3, city_name: city.name },
  });
}
console.log('cities:', cityFeatures.length);

const output = {
  regions: { type: 'FeatureCollection', features: regionOutput },
  innerBorders,
  topCities: { type: 'FeatureCollection', features: cityFeatures },
};

const outUrl = new URL('../public/regions/region-map.json', import.meta.url);
const reportUrl = new URL('../public/regions/border-overlap-report.json', import.meta.url);
await mkdir(new URL('../public/regions/', import.meta.url), { recursive: true });
const json = JSON.stringify(output);
await writeFile(outUrl, json);
await writeFile(reportUrl, JSON.stringify(borderOverlapReport, null, 2));
console.log(
  'Wrote public/regions/region-map.json:',
  (json.length / 1024 / 1024).toFixed(2),
  'MB',
);
console.log('Wrote public/regions/border-overlap-report.json');
