import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  geoCentroid,
  geoContains,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson';
import type { Topology } from 'topojson-specification';
import {
  PHOTO_FOCUS_DURATION_MS,
  applyPhotoFocusFrameProgress,
  easeInOutCubic,
  getPhotoFocusSafeRect,
  lerp,
  lerpLongitude,
  photoFocusFillColor,
} from '../lib/photoFocus';
import {
  getCountryTerritories,
  getTerritoryById,
  type CountryTerritory,
} from '../lib/countryTerritories';
import { useCountryHasPhotos } from '../hooks/useCountryHasPhotos';
import { MapHoverTooltip } from './MapHoverTooltip';
import { MapCountryActionBox } from './MapCountryActionBox';
import { PhotoFocusFrame } from './PhotoFocusFrame';
import { PhotoFocusTerritoryLinks } from './PhotoFocusTerritoryLinks';
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
/** Dismiss the country action box once the country drifts this far from it. */
const SELECTION_DISMISS_DISTANCE_PX = 110;
const ROTATION_SENSITIVITY = 0.35;
const MAX_LATITUDE = 89;
const INERTIA_FRICTION = 0.92;
const MIN_INERTIA_SPEED = 0.04;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 16;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const INITIAL_ROTATION: [number, number, number] = [-10, -20, 0];
const INITIAL_ZOOM = 1.15;

interface WorldGlobeProps {
  isVisited: (countryId: string) => boolean;
  onToggle: (countryId: string) => void;
  onPhotoFocusChange?: (active: boolean) => void;
  onLightboxChange?: (open: boolean) => void;
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

function defaultGlobeTranslate(
  width: number,
  height: number,
): [number, number] {
  const availableHeight = Math.max(
    0,
    height - GLOBE_TOP_PADDING - GLOBE_BOTTOM_PADDING,
  );
  return [width * 0.5, GLOBE_TOP_PADDING + availableHeight / 2];
}

function createProjection(
  width: number,
  height: number,
  rotation: [number, number, number],
  zoom: number,
  translate?: [number, number],
): GeoProjection {
  const availableHeight = Math.max(
    0,
    height - GLOBE_TOP_PADDING - GLOBE_BOTTOM_PADDING,
  );
  const size = Math.min(width, availableHeight);
  const [cx, cy] = translate ?? defaultGlobeTranslate(width, height);
  return geoOrthographic()
    .scale(size * 0.42 * zoom)
    .translate([cx, cy])
    .clipAngle(90)
    .rotate(rotation);
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Zoom so the country fits the UI-safe left frame with the globe centered there. */
function fitGlobeZoomForCountry(
  country: CountryFeature,
  width: number,
  height: number,
  rotation: [number, number, number],
  translate: [number, number],
): number {
  const safe = getPhotoFocusSafeRect(width, height);
  if (!(safe.width > 0) || !(safe.height > 0)) return INITIAL_ZOOM;

  let lo = MIN_ZOOM;
  let hi = MAX_ZOOM;
  let best = INITIAL_ZOOM;

  for (let i = 0; i < 22; i += 1) {
    const mid = (lo + hi) / 2;
    const projection = createProjection(
      width,
      height,
      rotation,
      mid,
      translate,
    );
    const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(country);
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (!(bw > 0) || !(bh > 0)) {
      hi = mid;
      continue;
    }
    if (bw <= safe.width * 0.82 && bh <= safe.height * 0.82) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return clampZoom(best);
}

function rotationFacingFeature(
  feature: Feature<Geometry>,
): [number, number, number] {
  const [lon, lat] = geoCentroid(feature);
  return [-lon, clampLatitude(-lat), 0];
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
  // Drag direction matches spin direction (not grab-the-surface).
  return [
    startRotation[0] + dx * sensitivity,
    clampLatitude(startRotation[1] - dy * sensitivity),
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

export function WorldGlobe({
  isVisited,
  onToggle,
  onPhotoFocusChange,
  onLightboxChange,
}: WorldGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onToggleRef = useRef(onToggle);
  const isVisitedRef = useRef(isVisited);
  const onPhotoFocusChangeRef = useRef(onPhotoFocusChange);
  const hoveredRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const countriesRef = useRef<CountryFeature[]>([]);
  const countryNameByIdRef = useRef<Map<string, string>>(new Map());
  const bordersRef = useRef<MultiLineString | null>(null);
  const rotationRef = useRef<[number, number, number]>(INITIAL_ROTATION);
  const zoomRef = useRef(INITIAL_ZOOM);
  const translateRef = useRef<[number, number] | null>(null);
  const photoFocusRef = useRef<{
    countryId: string;
    territoryId: string;
    territories: CountryTerritory[];
    progress: number;
    startFill: string;
  } | null>(null);
  const photoFocusRafRef = useRef<number | null>(null);
  const photoFocusRestoreRef = useRef<{
    rotation: [number, number, number];
    zoom: number;
    translate: [number, number] | null;
  } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const renderFrameRef = useRef<number | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [topology, setTopology] = useState<Topology | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [photoFocus, setPhotoFocus] = useState<{
    countryId: string;
    territoryId: string;
    territories: CountryTerritory[];
    progress: number;
    /** Fill color when focus starts (yellow or bright grey). */
    startFill: string;
  } | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{
    label: string | null;
    x: number;
    y: number;
  }>({ label: null, x: 0, y: 0 });
  const hoverTooltipRef = useRef(hoverTooltip);
  const hoverHideTimeoutRef = useRef<number | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<{
    id: string;
    label: string;
    x: number;
    y: number;
    /** Geographic point under the click. */
    lon: number;
    lat: number;
  } | null>(null);
  const { hasPhotos: selectedHasPhotos, ready: selectedPhotosReady } =
    useCountryHasPhotos(selectedCountry?.id ?? null);
  const selectedCountryRef = useRef(selectedCountry);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const handleLightboxChange = useCallback(
    (open: boolean) => {
      setLightboxOpen(open);
      onLightboxChange?.(open);
    },
    [onLightboxChange],
  );
  const setSelectedCountryRef = useRef(setSelectedCountry);

  useEffect(() => {
    hoverTooltipRef.current = hoverTooltip;
  }, [hoverTooltip]);

  useEffect(() => {
    selectedCountryRef.current = selectedCountry;
    schedulePaintRef.current();
  }, [selectedCountry]);

  useEffect(() => {
    setSelectedCountryRef.current = setSelectedCountry;
  }, []);

  useEffect(() => {
    photoFocusRef.current = photoFocus;
  }, [photoFocus]);

  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  useEffect(() => {
    onPhotoFocusChangeRef.current = onPhotoFocusChange;
  }, [onPhotoFocusChange]);

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
    const names = new Map<string, string>();
    for (const country of countries) {
      const id = String(country.id);
      const name =
        (country.properties as { name?: string } | null)?.name ?? id;
      names.set(id, name);
    }
    countryNameByIdRef.current = names;
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
      translateRef.current ?? undefined,
    );
    const path = geoPath(projection, ctx);
    const hovered = hoveredRef.current;
    const selectedId = selectedCountryRef.current?.id ?? null;
    const dragging = isDraggingRef.current;
    const visitedOf = isVisitedRef.current;
    const focus = photoFocusRef.current;
    const focusProgress = focus ? easeInOutCubic(focus.progress) : 0;
    const othersAlpha = focus ? 1 - focusProgress : 1;

    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fillStyle = COLORS.bg;
    ctx.fill();
    ctx.globalAlpha = othersAlpha;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = COLORS.sphereStroke;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.clip();

    let focusCountryId: string | null = null;
    let focusTerritory: Feature<Geometry> | null = null;
    let focusRemoteTerritories: Feature<Geometry>[] = [];
    let highlightedCountry: CountryFeature | null = null;

    if (focus) {
      focusCountryId = focus.countryId;
      const active = getTerritoryById(focus.territories, focus.territoryId);
      focusTerritory = active.feature;
      focusRemoteTerritories = focus.territories
        .filter((territory) => territory.id !== focus.territoryId)
        .map((territory) => territory.feature);
    }

    // Match flat map: background stroke under the fill creates a gap between countries.
    for (const country of countriesRef.current) {
      const id = String(country.id);
      if (focusCountryId && id === focusCountryId) {
        // Keep non-active territories in place and fade them with the rest of the map.
        const visited = visitedOf(id);
        for (const remote of focusRemoteTerritories) {
          ctx.globalAlpha = othersAlpha;
          ctx.beginPath();
          path(remote);
          ctx.strokeStyle = COLORS.bg;
          ctx.lineWidth = COUNTRY_GAP;
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.fillStyle = visited ? COLORS.yellow : COLORS.bg;
          ctx.fill();
        }
        continue;
      }

      const isHighlighted =
        !dragging && !focus && (hovered === id || selectedId === id);
      if (isHighlighted) {
        highlightedCountry = country;
        continue;
      }

      const visited = visitedOf(id);
      ctx.globalAlpha = othersAlpha;
      ctx.beginPath();
      path(country);
      ctx.strokeStyle = COLORS.bg;
      ctx.lineWidth = COUNTRY_GAP;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = visited ? COLORS.yellow : COLORS.bg;
      ctx.fill();
    }

    if (bordersRef.current && othersAlpha > 0.01) {
      ctx.beginPath();
      path(bordersRef.current as GeoPermissibleObjects);
      ctx.globalAlpha = othersAlpha;
      ctx.strokeStyle = COLORS.yellow;
      ctx.lineWidth = BORDER_WIDTH;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Draw hover/selection last so the outline matches the hover lift on the flat map.
    if (highlightedCountry) {
      const id = String(highlightedCountry.id);
      const visited = visitedOf(id);
      ctx.globalAlpha = othersAlpha;
      ctx.beginPath();
      path(highlightedCountry);
      ctx.strokeStyle = COLORS.bg;
      ctx.lineWidth = COUNTRY_GAP;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = visited ? COLORS.yellow : COLORS.hover;
      ctx.fill();
      ctx.beginPath();
      path(highlightedCountry);
      ctx.strokeStyle = COLORS.yellow;
      ctx.lineWidth = BORDER_WIDTH;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    if (focusTerritory && focusCountryId && focus) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      path(focusTerritory);
      ctx.strokeStyle = COLORS.bg;
      ctx.lineWidth = COUNTRY_GAP;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = photoFocusFillColor(focus.startFill, focus.progress);
      ctx.fill();
      ctx.beginPath();
      path(focusTerritory);
      ctx.strokeStyle = COLORS.yellow;
      ctx.lineWidth = BORDER_WIDTH;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
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
    // Listen on the canvas only so overlays (action box, photo panel) keep
    // working — container-level handlers steal pointerup and clear selection.
    const element = canvasRef.current;
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
        translateRef.current ?? undefined,
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

    const cancelHoverHide = () => {
      if (hoverHideTimeoutRef.current !== null) {
        window.clearTimeout(hoverHideTimeoutRef.current);
        hoverHideTimeoutRef.current = null;
      }
    };

    const clearHoverTooltip = () => {
      cancelHoverHide();
      if (hoveredRef.current !== null) {
        hoveredRef.current = null;
        schedulePaintRef.current();
      }
      hoverTooltipRef.current = { ...hoverTooltipRef.current, label: null };
      setHoverTooltip((current) =>
        current.label === null ? current : { ...current, label: null },
      );
    };

    const clearSelection = () => {
      if (!selectedCountryRef.current) return;
      selectedCountryRef.current = null;
      setSelectedCountryRef.current(null);
      schedulePaintRef.current();
    };

    const dismissSelectionIfCountryFar = (
      rotation: [number, number, number] = rotationRef.current,
      zoom: number = zoomRef.current,
    ) => {
      const selected = selectedCountryRef.current;
      if (!selected) return;

      const { width, height } = sizeRef.current;
      const projection = createProjection(
        width,
        height,
        rotation,
        zoom,
        translateRef.current ?? undefined,
      );
      const projected = projection([selected.lon, selected.lat]);
      if (
        !projected ||
        Math.hypot(projected[0] - selected.x, projected[1] - selected.y) >
          SELECTION_DISMISS_DISTANCE_PX
      ) {
        clearSelection();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (photoFocusRef.current) return;
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
      const [x, y] = localPoint(event);

      if (!drag || drag.pointerId !== event.pointerId) {
        if (dragRef.current) return;
        if (photoFocusRef.current) return;
        if (selectedCountryRef.current) {
          clearHoverTooltip();
          return;
        }

        const countryId = countryAtEvent(event);
        if (countryId) {
          cancelHoverHide();
          if (hoveredRef.current !== countryId) {
            hoveredRef.current = countryId;
            schedulePaintRef.current();
          }
          const next = {
            label: countryNameByIdRef.current.get(countryId) ?? countryId,
            x,
            y,
          };
          hoverTooltipRef.current = next;
          setHoverTooltip(next);
        } else {
          clearHoverTooltip();
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
        clearHoverTooltip();
      }

      if (!drag.moved) {
        return;
      }

      setHoverTooltip({ label: null, x, y });

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
      dismissSelectionIfCountryFar(next, zoomRef.current);
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
        const [x, y] = localPoint(event);
        clearHoverTooltip();
        if (selectedCountryRef.current) {
          clearSelection();
          schedulePaintRef.current();
          return;
        }
        if (drag.countryId) {
          const { width, height } = sizeRef.current;
          const projection = createProjection(
            width,
            height,
            rotationRef.current,
            zoomRef.current,
            translateRef.current ?? undefined,
          );
          const geo = projection.invert?.([x, y]);
          const next = {
            id: drag.countryId,
            label:
              countryNameByIdRef.current.get(drag.countryId) ?? drag.countryId,
            x,
            y,
            lon: geo?.[0] ?? 0,
            lat: geo?.[1] ?? 0,
          };
          selectedCountryRef.current = next;
          setSelectedCountryRef.current(next);
        } else {
          clearSelection();
        }
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
      clearHoverTooltip();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (photoFocusRef.current) return;
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
      dismissSelectionIfCountryFar(rotationRef.current, nextZoom);
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      stopInertia();
      cancelHoverHide();
      if (photoFocusRafRef.current !== null) {
        cancelAnimationFrame(photoFocusRafRef.current);
        photoFocusRafRef.current = null;
      }
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
      onPhotoFocusChangeRef.current?.(false);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('wheel', onWheel);
    };
  }, []);

  const exitPhotoFocus = () => {
    if (!photoFocusRef.current) return;

    if (photoFocusRafRef.current !== null) {
      cancelAnimationFrame(photoFocusRafRef.current);
      photoFocusRafRef.current = null;
    }

    const restore = photoFocusRestoreRef.current;
    if (restore) {
      rotationRef.current = restore.rotation;
      zoomRef.current = restore.zoom;
      translateRef.current = restore.translate;
      photoFocusRestoreRef.current = null;
    } else {
      translateRef.current = null;
    }

    containerRef.current?.style.removeProperty('--photo-fade');
    photoFocusRef.current = null;
    setPhotoFocus(null);
    onPhotoFocusChangeRef.current?.(false);
    schedulePaintRef.current();
  };

  const startPhotoFocus = (countryId: string) => {
    if (photoFocusRef.current) return;

    const country = countriesRef.current.find(
      (feature) => String(feature.id) === countryId,
    );
    if (!country) return;

    const { width, height } = sizeRef.current;
    if (width <= 0 || height <= 0) return;

    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
    dragRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);

    hoveredRef.current = null;
    hoverTooltipRef.current = { ...hoverTooltipRef.current, label: null };
    setHoverTooltip((current) =>
      current.label === null ? current : { ...current, label: null },
    );
    selectedCountryRef.current = null;
    setSelectedCountry(null);

    const territories = getCountryTerritories(country);
    const mainland = territories[0];

    const startRotation: [number, number, number] = [
      rotationRef.current[0],
      rotationRef.current[1],
      rotationRef.current[2],
    ];
    const startZoom = zoomRef.current;
    const startTranslate =
      translateRef.current ?? defaultGlobeTranslate(width, height);
    photoFocusRestoreRef.current = {
      rotation: startRotation,
      zoom: startZoom,
      translate: translateRef.current,
    };

    const safe = getPhotoFocusSafeRect(width, height);
    const endRotation = rotationFacingFeature(mainland.feature);
    const endTranslate: [number, number] = [safe.centerX, safe.centerY];
    const endZoom = fitGlobeZoomForCountry(
      mainland.feature as CountryFeature,
      width,
      height,
      endRotation,
      endTranslate,
    );

    if (photoFocusRafRef.current !== null) {
      cancelAnimationFrame(photoFocusRafRef.current);
    }

    const startedAt = performance.now();
    const startFill = isVisited(countryId) ? COLORS.yellow : COLORS.hover;
    const base = {
      countryId,
      territoryId: mainland.id,
      territories,
      startFill,
    };
    const initial = { ...base, progress: 0 };
    photoFocusRef.current = initial;
    setPhotoFocus(initial);
    onPhotoFocusChangeRef.current?.(true);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / PHOTO_FOCUS_DURATION_MS);
      const t = easeInOutCubic(progress);

      rotationRef.current = [
        lerpLongitude(startRotation[0], endRotation[0], t),
        lerp(startRotation[1], endRotation[1], t),
        lerp(startRotation[2], endRotation[2], t),
      ];
      zoomRef.current = lerp(startZoom, endZoom, t);
      translateRef.current = [
        lerp(startTranslate[0], endTranslate[0], t),
        lerp(startTranslate[1], endTranslate[1], t),
      ];

      const next = { ...base, progress };
      photoFocusRef.current = next;
      // Canvas already paints from refs; avoid React re-renders each frame.
      applyPhotoFocusFrameProgress(containerRef.current, progress);
      schedulePaintRef.current();

      if (progress < 1) {
        photoFocusRafRef.current = requestAnimationFrame(tick);
      } else {
        photoFocusRafRef.current = null;
        setPhotoFocus(next);
      }
    };

    photoFocusRafRef.current = requestAnimationFrame(tick);
  };

  const switchPhotoTerritory = (territoryId: string) => {
    const current = photoFocusRef.current;
    if (!current) return;

    const territory = getTerritoryById(current.territories, territoryId);
    const { width, height } = sizeRef.current;
    if (width <= 0 || height <= 0) return;

    const safe = getPhotoFocusSafeRect(width, height);
    const endRotation = rotationFacingFeature(territory.feature);
    const endTranslate: [number, number] = [safe.centerX, safe.centerY];
    const endZoom = fitGlobeZoomForCountry(
      territory.feature as CountryFeature,
      width,
      height,
      endRotation,
      endTranslate,
    );

    rotationRef.current = endRotation;
    zoomRef.current = endZoom;
    translateRef.current = endTranslate;

    const next = {
      ...current,
      territoryId: territory.id,
      progress: 1,
    };
    photoFocusRef.current = next;
    setPhotoFocus(next);
    schedulePaintRef.current();
  };

  useEffect(() => {
    if (!photoFocus && !selectedCountry) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (photoFocus) {
        exitPhotoFocus();
        return;
      }
      selectedCountryRef.current = null;
      setSelectedCountry(null);
      schedulePaintRef.current();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photoFocus, selectedCountry]);

  const ready = topology !== null && size.width > 0 && size.height > 0;
  const isPhotoFocusing = photoFocus !== null;

  return (
    <div
      ref={containerRef}
      className={`world-globe${isDragging ? ' world-globe--dragging' : ''}${
        isPhotoFocusing ? ' world-globe--photo-focus' : ''
      }`}
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
      {photoFocus && (
        <>
          <PhotoFocusFrame
            countryId={photoFocus.countryId}
            countryName={
              countryNameByIdRef.current.get(photoFocus.countryId) ??
              photoFocus.countryId
            }
            progress={photoFocus.progress}
            onClose={exitPhotoFocus}
            onLightboxChange={handleLightboxChange}
          />
          {!lightboxOpen && (
            <PhotoFocusTerritoryLinks
              territories={photoFocus.territories}
              activeTerritoryId={photoFocus.territoryId}
              progress={photoFocus.progress}
              onSelect={switchPhotoTerritory}
            />
          )}
        </>
      )}
      <MapHoverTooltip
        label={hoverTooltip.label}
        x={hoverTooltip.x}
        y={hoverTooltip.y}
        visible={
          !isDragging &&
          !isPhotoFocusing &&
          selectedCountry === null &&
          hoverTooltip.label !== null
        }
      />
      {selectedCountry && !isPhotoFocusing && (
        <MapCountryActionBox
          label={selectedCountry.label}
          x={selectedCountry.x}
          y={selectedCountry.y}
          isMarked={isVisited(selectedCountry.id)}
          hasPhotos={selectedHasPhotos}
          photosReady={selectedPhotosReady}
          onMark={() => {
            onToggle(selectedCountry.id);
            schedulePaintRef.current();
          }}
          onAddPhotos={() => startPhotoFocus(selectedCountry.id)}
        />
      )}
    </div>
  );
}
