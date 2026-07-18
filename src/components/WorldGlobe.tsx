import { useEffect, useMemo, useRef, useState } from 'react';
import {
  geoContains,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson';
import type { Topology } from 'topojson-specification';
import './WorldGlobe.css';

const GEO_URL = '/countries-110m.json';
// Keep French Southern Territories off the globe; Antarctica is shown in globe mode.
const EXCLUDED_COUNTRY_IDS = new Set(['260']);

const COLORS = {
  bg: '#2a2a2a',
  hover: '#3d3d3d',
  yellow: '#f5c518',
  sphereStroke: '#4a4a4a',
};

const COUNTRY_GAP = 4;
// Match WorldMap countryBorderStyle (non-scaling stroke width 0.3, #f5c518).
const BORDER_WIDTH = 0.3;
const DRAG_CLICK_THRESHOLD_PX = 5;
const ROTATION_SENSITIVITY = 0.35;
const MAX_LATITUDE = 89;
const INERTIA_FRICTION = 0.92;
const MIN_INERTIA_SPEED = 0.04;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const INITIAL_ROTATION: [number, number, number] = [-10, -20, 0];
const INITIAL_ZOOM = 1;

interface WorldGlobeProps {
  isVisited: (countryId: string) => boolean;
  onToggle: (countryId: string) => void;
}

type CountryFeature = Feature<Geometry> & { id?: string | number };

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startRotation: [number, number, number];
  startZoom: number;
  moved: boolean;
  countryId: string | null;
  lastRotation: [number, number, number];
  lastTime: number;
  velocityLon: number;
  velocityLat: number;
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

function clampLatitude(value: number): number {
  return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, value));
}

// Keep the sphere clear of the centered logo above the map.
const GLOBE_TOP_PADDING = 96;
const GLOBE_BOTTOM_PADDING = 88;

function createProjection(
  width: number,
  height: number,
  rotation: [number, number, number],
  zoom: number,
): GeoProjection {
  const availableHeight = Math.max(
    0,
    height - GLOBE_TOP_PADDING - GLOBE_BOTTOM_PADDING,
  );
  const size = Math.min(width, availableHeight);
  const cx = width / 2;
  const cy = GLOBE_TOP_PADDING + availableHeight / 2;
  return geoOrthographic()
    .scale(size * 0.42 * zoom)
    .translate([cx, cy])
    .clipAngle(90)
    .rotate(rotation);
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function rotationFromDrag(
  startRotation: [number, number, number],
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  zoom: number,
): [number, number, number] {
  const sensitivity = ROTATION_SENSITIVITY / Math.max(zoom, MIN_ZOOM);
  const dx = clientX - startX;
  const dy = clientY - startY;
  return [
    startRotation[0] - dx * sensitivity,
    clampLatitude(startRotation[1] + dy * sensitivity),
    startRotation[2],
  ];
}

/** Keep the geographic point under the cursor stable while zooming (flat-map style). */
function rotationAfterZoomAtPoint(
  rotation: [number, number, number],
  currentZoom: number,
  nextZoom: number,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number] {
  if (currentZoom === nextZoom) return rotation;

  const before = createProjection(width, height, rotation, currentZoom);
  const geo = before.invert?.([x, y]);
  if (!geo) return rotation;

  const after = createProjection(width, height, rotation, nextZoom);
  const projected = after(geo);
  if (!projected) return rotation;

  const dx = projected[0] - x;
  const dy = projected[1] - y;
  const scale = after.scale();
  if (!scale) return rotation;
  const degreesPerPixel = 180 / (Math.PI * scale);

  return [
    rotation[0] + dx * degreesPerPixel,
    clampLatitude(rotation[1] - dy * degreesPerPixel),
    rotation[2],
  ];
}

function findCountryAtPoint(
  countries: CountryFeature[],
  projection: GeoProjection,
  localX: number,
  localY: number,
): string | null {
  const inverted = projection.invert?.([localX, localY]);
  if (!inverted) return null;

  for (let i = countries.length - 1; i >= 0; i -= 1) {
    const country = countries[i];
    if (geoContains(country, inverted)) {
      return String(country.id);
    }
  }
  return null;
}

export function WorldGlobe({ isVisited, onToggle }: WorldGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onToggleRef = useRef(onToggle);
  const isVisitedRef = useRef(isVisited);
  const hoveredRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const countriesRef = useRef<CountryFeature[]>([]);
  const bordersRef = useRef<MultiLineString | null>(null);
  const rotationRef = useRef<[number, number, number]>(INITIAL_ROTATION);
  const zoomRef = useRef(INITIAL_ZOOM);
  const dragRef = useRef<DragState | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const renderFrameRef = useRef<number | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [topology, setTopology] = useState<Topology | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  useEffect(() => {
    isVisitedRef.current = isVisited;
  }, [isVisited]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    let cancelled = false;

    fetch(GEO_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${GEO_URL}`);
        }
        return response.json();
      })
      .then((data: Topology) => {
        if (!cancelled) setTopology(filterTopology(data));
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const countries = useMemo(() => {
    if (!topology) return [] as CountryFeature[];
    const collection = feature(
      topology,
      topology.objects.countries as Parameters<typeof feature>[1],
    ) as FeatureCollection<Geometry>;
    return collection.features as CountryFeature[];
  }, [topology]);

  const bordersObject = useMemo(() => {
    if (!topology) return null;
    return mesh(
      topology,
      topology.objects.countries as Parameters<typeof mesh>[1],
    ) as MultiLineString;
  }, [topology]);

  useEffect(() => {
    countriesRef.current = countries;
  }, [countries]);

  useEffect(() => {
    bordersRef.current = bordersObject;
  }, [bordersObject]);

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height } = sizeRef.current;
    if (width <= 0 || height <= 0) return;

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

    const projection = createProjection(
      width,
      height,
      rotationRef.current,
      zoomRef.current,
    );
    const path = geoPath(projection, ctx);
    const hovered = hoveredRef.current;
    const dragging = isDraggingRef.current;
    const visitedOf = isVisitedRef.current;

    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fillStyle = COLORS.bg;
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = COLORS.sphereStroke;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.clip();

    // Match flat map: background stroke under the fill creates a gap between countries.
    for (const country of countriesRef.current) {
      const id = String(country.id);
      const visited = visitedOf(id);
      const isHovered = !dragging && hovered === id;
      ctx.beginPath();
      path(country);
      ctx.strokeStyle = COLORS.bg;
      ctx.lineWidth = COUNTRY_GAP;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = visited
        ? COLORS.yellow
        : isHovered
          ? COLORS.hover
          : COLORS.bg;
      ctx.fill();
    }

    if (bordersRef.current) {
      ctx.beginPath();
      path(bordersRef.current as GeoPermissibleObjects);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.yellow;
      ctx.lineWidth = BORDER_WIDTH;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();
  };

  const paintRef = useRef(paint);
  paintRef.current = paint;

  const schedulePaint = () => {
    if (renderFrameRef.current !== null) return;
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = null;
      paintRef.current();
    });
  };

  const schedulePaintRef = useRef(schedulePaint);
  schedulePaintRef.current = schedulePaint;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({
        width: Math.max(0, Math.floor(width)),
        height: Math.max(0, Math.floor(height)),
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    schedulePaintRef.current();
  }, [size, countries, bordersObject, isVisited, isDragging]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const stopInertia = () => {
      if (inertiaFrameRef.current !== null) {
        cancelAnimationFrame(inertiaFrameRef.current);
        inertiaFrameRef.current = null;
      }
    };

    const localPoint = (
      event: PointerEvent | WheelEvent,
    ): [number, number] => {
      const rect = element.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };

    const countryAtEvent = (event: PointerEvent): string | null => {
      const [x, y] = localPoint(event);
      const { width, height } = sizeRef.current;
      const projection = createProjection(
        width,
        height,
        rotationRef.current,
        zoomRef.current,
      );
      return findCountryAtPoint(countriesRef.current, projection, x, y);
    };

    const flushRotation = (next: [number, number, number]) => {
      rotationRef.current = next;
      schedulePaintRef.current();
    };

    const startInertia = (velocityLon: number, velocityLat: number) => {
      stopInertia();
      let lon = velocityLon;
      let lat = velocityLat;

      const tick = () => {
        const speed = Math.hypot(lon, lat);
        if (speed < MIN_INERTIA_SPEED) {
          inertiaFrameRef.current = null;
          return;
        }

        const [lambda, phi, gamma] = rotationRef.current;
        flushRotation([lambda + lon, clampLatitude(phi + lat), gamma]);
        lon *= INERTIA_FRICTION;
        lat *= INERTIA_FRICTION;
        inertiaFrameRef.current = requestAnimationFrame(tick);
      };

      inertiaFrameRef.current = requestAnimationFrame(tick);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      stopInertia();
      element.setPointerCapture(event.pointerId);
      const startRotation: [number, number, number] = [
        rotationRef.current[0],
        rotationRef.current[1],
        rotationRef.current[2],
      ];
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startRotation,
        startZoom: zoomRef.current,
        moved: false,
        countryId: countryAtEvent(event),
        lastRotation: startRotation,
        lastTime: performance.now(),
        velocityLon: 0,
        velocityLat: 0,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        if (dragRef.current) return;
        const countryId = countryAtEvent(event);
        if (hoveredRef.current !== countryId) {
          hoveredRef.current = countryId;
          schedulePaintRef.current();
        }
        return;
      }

      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >=
          DRAG_CLICK_THRESHOLD_PX
      ) {
        drag.moved = true;
        isDraggingRef.current = true;
        setIsDragging(true);
        hoveredRef.current = null;
      }

      if (!drag.moved) return;

      const next = rotationFromDrag(
        drag.startRotation,
        drag.startX,
        drag.startY,
        event.clientX,
        event.clientY,
        drag.startZoom,
      );

      const now = performance.now();
      const dt = Math.max(1, now - drag.lastTime);
      const frameScale = 16 / dt;
      drag.velocityLon = (next[0] - drag.lastRotation[0]) * frameScale;
      drag.velocityLat = (next[1] - drag.lastRotation[1]) * frameScale;
      drag.lastRotation = next;
      drag.lastTime = now;

      flushRotation(next);
    };

    const endDrag = (event: PointerEvent, cancelled: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      isDraggingRef.current = false;
      setIsDragging(false);

      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }

      if (!cancelled && !drag.moved) {
        if (drag.countryId) onToggleRef.current(drag.countryId);
        schedulePaintRef.current();
        return;
      }

      if (drag.moved) {
        startInertia(drag.velocityLon, drag.velocityLat);
      } else {
        schedulePaintRef.current();
      }
    };

    const onPointerUp = (event: PointerEvent) => endDrag(event, false);
    const onPointerCancel = (event: PointerEvent) => endDrag(event, true);

    const onPointerLeave = () => {
      if (dragRef.current) return;
      if (hoveredRef.current !== null) {
        hoveredRef.current = null;
        schedulePaintRef.current();
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { width, height } = sizeRef.current;
      if (width <= 0 || height <= 0) return;

      const currentZoom = zoomRef.current;
      const nextZoom = clampZoom(
        currentZoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
      );
      if (nextZoom === currentZoom) return;

      const [x, y] = localPoint(event);
      rotationRef.current = rotationAfterZoomAtPoint(
        rotationRef.current,
        currentZoom,
        nextZoom,
        width,
        height,
        x,
        y,
      );
      zoomRef.current = nextZoom;
      schedulePaintRef.current();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      stopInertia();
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('wheel', onWheel);
    };
  }, []);

  const ready = topology !== null && size.width > 0 && size.height > 0;

  return (
    <div
      ref={containerRef}
      className={`world-globe${isDragging ? ' world-globe--dragging' : ''}`}
      role="img"
      aria-label="Interactive globe map"
    >
      {!ready && (
        <div className="world-globe__loading-screen" aria-busy="true">
          <div className="world-globe__spinner" aria-hidden="true" />
          <p className="world-globe__loading-label">Loading globe…</p>
        </div>
      )}
      <canvas ref={canvasRef} className="world-globe__canvas" />
    </div>
  );
}
