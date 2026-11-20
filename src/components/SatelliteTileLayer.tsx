import { useMemo } from 'react';
import type { GeoProjection } from 'd3-geo';

/** Esri World Imagery — free satellite tiles (Google Earth–like look + bathymetry). */
const TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const TILE_SIZE = 256;
const MIN_Z = 1;
const MAX_Z = 10;
const MAX_TILES = 64;

type TileSpec = {
  key: string;
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

function latToTileY(lat: number, z: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  );
}

function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function chooseZoom(projection: GeoProjection, mapZoom: number): number {
  const scale = projection.scale() * Math.max(mapZoom, 0.001);
  const z = Math.log2((scale * 2 * Math.PI) / TILE_SIZE);
  return Math.max(MIN_Z, Math.min(MAX_Z, Math.round(z - 0.25)));
}

/**
 * Visible lon/lat from ZoomableGroup center/zoom (same math as getVisibleGeoBBox).
 */
function visibleLonLatBounds(
  projection: GeoProjection,
  width: number,
  height: number,
  center: [number, number],
  zoom: number,
): { minLon: number; maxLon: number; minLat: number; maxLat: number } | null {
  const projected = projection(center);
  if (!projected || !projection.invert) return null;

  const [cx, cy] = projected;
  const samples: [number, number][] = [];
  const pad = 0.2;

  for (const nx of [-pad, 0.5, 1 + pad]) {
    for (const ny of [-pad, 0.5, 1 + pad]) {
      const x = (nx * width - width / 2) / zoom + cx;
      const y = (ny * height - height / 2) / zoom + cy;
      const geo = projection.invert([x, y]);
      if (geo) samples.push(geo);
    }
  }

  if (samples.length < 2) return null;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of samples) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLon, maxLon, minLat, maxLat };
}

function tilesForView(
  projection: GeoProjection,
  width: number,
  height: number,
  center: [number, number],
  mapZoom: number,
): TileSpec[] {
  const bounds = visibleLonLatBounds(
    projection,
    width,
    height,
    center,
    mapZoom,
  );
  if (!bounds) return [];

  const z = chooseZoom(projection, mapZoom);
  const n = 2 ** z;

  let x0 = Math.floor(lonToTileX(bounds.minLon, z));
  let x1 = Math.floor(lonToTileX(bounds.maxLon, z));
  let y0 = Math.floor(latToTileY(bounds.maxLat, z));
  let y1 = Math.floor(latToTileY(bounds.minLat, z));

  // Handle antimeridian wrap simply by clamping for now.
  x0 = Math.max(0, x0);
  x1 = Math.min(n - 1, x1);
  y0 = Math.max(0, y0);
  y1 = Math.min(n - 1, y1);

  const tiles: TileSpec[] = [];

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (tiles.length >= MAX_TILES) break;

      const west = tileXToLon(x, z);
      const east = tileXToLon(x + 1, z);
      const north = tileYToLat(y, z);
      const south = tileYToLat(y + 1, z);

      const nw = projection([west, north]);
      const se = projection([east, south]);
      if (!nw || !se) continue;

      const tileW = se[0] - nw[0];
      const tileH = se[1] - nw[1];
      if (!(tileW > 0) || !(tileH > 0)) continue;

      tiles.push({
        key: `${z}/${y}/${x}`,
        href: TILE_URL.replace('{z}', String(z))
          .replace('{y}', String(y))
          .replace('{x}', String(x)),
        x: nw[0],
        y: nw[1],
        width: tileW,
        height: tileH,
      });
    }
  }

  return tiles;
}

interface SatelliteTileLayerProps {
  projection: GeoProjection;
  width: number;
  height: number;
  mapCenter: [number, number];
  mapZoom: number;
}

/**
 * Google Earth–style satellite base using Esri World Imagery XYZ tiles.
 * Requires an unrotated Web Mercator projection so tile quads stay rectangular.
 */
export function SatelliteTileLayer({
  projection,
  width,
  height,
  mapCenter,
  mapZoom,
}: SatelliteTileLayerProps) {
  const tiles = useMemo(
    () => tilesForView(projection, width, height, mapCenter, mapZoom),
    [projection, width, height, mapCenter, mapZoom],
  );

  return (
    <g pointerEvents="none" aria-hidden="true">
      {tiles.map((tile) => (
        <image
          key={tile.key}
          href={tile.href}
          x={tile.x}
          y={tile.y}
          width={tile.width}
          height={tile.height}
          preserveAspectRatio="none"
        />
      ))}
    </g>
  );
}
