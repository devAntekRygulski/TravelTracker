import { useEffect, useRef } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { FeatureCollection, Geometry, MultiLineString } from 'geojson';
import type { Topology } from 'topojson-specification';
import { LANDING_MAP_HIGHLIGHT_IDS } from '../data/landingMapHighlights';
import './LandingMapBackdrop.css';

const GEO_URL = '/countries-110m.json';
const EXCLUDED_COUNTRY_IDS = new Set(['010', '260']);
const HIGHLIGHT_IDS = new Set<string>(LANDING_MAP_HIGHLIGHT_IDS);

const COLORS = {
  bg: '#2a2a2a',
  yellow: '#f5c518',
};

const COUNTRY_GAP = 3.5;
const BORDER_WIDTH = 0.7;
const ZOOM = 2.35;
const PAN_DEGREES_PER_SECOND = 4.2;
const LAT_SWAY = 8;
const LAT_SWAY_PERIOD_MS = 28000;

/** Mercator rotate[0] values that frame interesting highlight clusters. */
const START_SPOTS = [
  { lon: 70, label: 'Americas' }, // ~90°W–50°W
  { lon: 20, label: 'Atlantic' }, // Americas–Europe bridge
  { lon: -15, label: 'Europe–Africa' },
  { lon: -55, label: 'Middle East–India' },
  { lon: -100, label: 'East Asia' }, // Japan / China
  { lon: -135, label: 'Oceania' }, // Australia / NZ
] as const;

function pickStartSpot(): { lon: number; latPhaseMs: number } {
  const spot = START_SPOTS[Math.floor(Math.random() * START_SPOTS.length)]!;
  return {
    lon: spot.lon,
    // Randomize where we are in the north/south sway cycle.
    latPhaseMs: Math.random() * LAT_SWAY_PERIOD_MS,
  };
}

type CountryFeature = {
  id?: string | number;
  type: 'Feature';
  geometry: Geometry;
  properties: Record<string, unknown>;
};

function filterTopology(topology: Topology): Topology {
  const countries = topology.objects.countries;
  if (countries.type !== 'GeometryCollection') return topology;

  return {
    ...topology,
    objects: {
      ...topology.objects,
      countries: {
        type: 'GeometryCollection',
        geometries: countries.geometries.filter(
          (geometry) => !EXCLUDED_COUNTRY_IDS.has(String(geometry.id)),
        ),
      },
    },
  };
}

export function LandingMapBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const countriesRef = useRef<CountryFeature[]>([]);
  const bordersRef = useRef<MultiLineString | null>(null);
  const baseScaleRef = useRef(0);
  const lonRef = useRef(-20);
  const latPhaseRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let cancelled = false;
    const start = pickStartSpot();
    lonRef.current = start.lon;
    latPhaseRef.current = start.latPhaseMs;

    const paint = (timeMs: number) => {
      const { width, height } = sizeRef.current;
      if (width <= 0 || height <= 0 || countriesRef.current.length === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.floor(width * dpr);
      const targetH = Math.floor(height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, width, height);

      const lat =
        Math.sin(
          ((timeMs + latPhaseRef.current) / LAT_SWAY_PERIOD_MS) * Math.PI * 2,
        ) * LAT_SWAY;
      const projection = geoMercator()
        .rotate([lonRef.current, lat])
        .scale(baseScaleRef.current * ZOOM)
        .translate([width / 2, height / 2]);
      const path = geoPath(projection, ctx);

      for (const country of countriesRef.current) {
        const id = String(country.id);
        ctx.beginPath();
        path(country);
        ctx.strokeStyle = COLORS.bg;
        ctx.lineWidth = COUNTRY_GAP;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.fillStyle = HIGHLIGHT_IDS.has(id) ? COLORS.yellow : COLORS.bg;
        ctx.fill();
      }

      if (bordersRef.current) {
        ctx.beginPath();
        path(bordersRef.current);
        ctx.strokeStyle = COLORS.yellow;
        ctx.lineWidth = BORDER_WIDTH;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    };

    const tick = (ts: number) => {
      if (cancelled) return;
      const last = lastTsRef.current ?? ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;
      lonRef.current = (lonRef.current + PAN_DEGREES_PER_SECOND * dt) % 360;
      paint(ts);
      rafRef.current = requestAnimationFrame(tick);
    };

    const recomputeBaseScale = (width: number, height: number) => {
      if (!countriesRef.current.length || width <= 0 || height <= 0) return;
      const collection: FeatureCollection<Geometry> = {
        type: 'FeatureCollection',
        features: countriesRef.current,
      };
      const fitted = geoMercator().fitExtent(
        [
          [0, 0],
          [width, height],
        ],
        collection,
      );
      baseScaleRef.current = fitted.scale();
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(0, Math.floor(entry.contentRect.width));
      const height = Math.max(0, Math.floor(entry.contentRect.height));
      sizeRef.current = { width, height };
      recomputeBaseScale(width, height);
    });
    observer.observe(parent);

    fetch(GEO_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load map');
        return response.json();
      })
      .then((data: Topology) => {
        if (cancelled) return;
        const topology = filterTopology(data);
        const collection = feature(
          topology,
          topology.objects.countries as Parameters<typeof feature>[1],
        ) as FeatureCollection<Geometry>;
        countriesRef.current = collection.features as CountryFeature[];
        bordersRef.current = mesh(
          topology,
          topology.objects.countries as Parameters<typeof mesh>[1],
        ) as MultiLineString;
        recomputeBaseScale(sizeRef.current.width, sizeRef.current.height);
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="landing-map-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="landing-map-backdrop__canvas" />
      <div className="landing-map-backdrop__veil" />
    </div>
  );
}
