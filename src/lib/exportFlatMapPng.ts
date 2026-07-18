import { geoMercator, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { FeatureCollection, Geometry, MultiLineString } from 'geojson';
import type { Topology } from 'topojson-specification';

const GEO_URL = '/countries-110m.json';
const EXCLUDED_COUNTRY_IDS = new Set(['010', '260']);
const MAP_ROTATION: [number, number] = [-10, 0];
const MAP_PADDING = {
  top: 24,
  right: 24,
  bottom: 24,
  left: 24,
};

const COLORS = {
  bg: '#2a2a2a',
  yellow: '#f5c518',
};

const COUNTRY_GAP = 4;
const BORDER_WIDTH = 0.9;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;

type CountryFeature = {
  id?: string | number;
  type: 'Feature';
  geometry: Geometry;
  properties: Record<string, unknown>;
};

function filterTopology(topology: Topology): Topology {
  const countries = topology.objects.countries;

  if (countries.type !== 'GeometryCollection') {
    return topology;
  }

  const geometries = countries.geometries.filter(
    (geometry) => !EXCLUDED_COUNTRY_IDS.has(String(geometry.id)),
  );

  return {
    ...topology,
    objects: {
      ...topology.objects,
      countries: {
        type: 'GeometryCollection',
        geometries,
      },
    },
  };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Renders the flat world map with the user's visited countries and downloads a PNG. */
export async function downloadFlatMapPng(
  visitedCountryIds: Iterable<string>,
): Promise<void> {
  const visited = new Set(visitedCountryIds);
  const response = await fetch(GEO_URL);
  if (!response.ok) {
    throw new Error('Failed to load map data for export.');
  }

  const topology = filterTopology((await response.json()) as Topology);
  const collection = feature(
    topology,
    topology.objects.countries as Parameters<typeof feature>[1],
  ) as FeatureCollection<Geometry>;
  const countries = collection.features as CountryFeature[];
  const borders = mesh(
    topology,
    topology.objects.countries as Parameters<typeof mesh>[1],
  ) as MultiLineString;

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create export canvas.');
  }

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

  const projection = geoMercator()
    .rotate(MAP_ROTATION)
    .fitExtent(
      [
        [MAP_PADDING.left, MAP_PADDING.top],
        [EXPORT_WIDTH - MAP_PADDING.right, EXPORT_HEIGHT - MAP_PADDING.bottom],
      ],
      collection,
    );
  const path = geoPath(projection, ctx);

  for (const country of countries) {
    const id = String(country.id);
    ctx.beginPath();
    path(country);
    ctx.strokeStyle = COLORS.bg;
    ctx.lineWidth = COUNTRY_GAP;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = visited.has(id) ? COLORS.yellow : COLORS.bg;
    ctx.fill();
  }

  ctx.beginPath();
  path(borders);
  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = BORDER_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });

  if (!blob) {
    throw new Error('Failed to create PNG export.');
  }

  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `travel-tracker-map-${stamp}.png`);
}
