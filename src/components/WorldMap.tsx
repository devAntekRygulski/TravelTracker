import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geoArea, geoCentroid, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson';
import type { Topology } from 'topojson-specification';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import type { ProjectionFunction } from 'react-simple-maps';
import { CITY_OUTLINE_ZOOM } from '../data/regionData';
import {
  filterTopCityMarkers,
  findCountryIdAtPoint,
  getCityId,
  getCityName,
  getCountryA3FromNumeric,
  getRegionId,
  getRegionName,
} from '../data/regionMapUtils';
import { useRegionGeoData } from '../hooks/useRegionGeoData';
import {
  PHOTO_FOCUS_DURATION_MS,
  applyPhotoFocusFrameProgress,
  computeFlatPhotoFocusTransform,
  flatPhotoFocusTransformString,
  type PhotoFocusTransform,
} from '../lib/photoFocus';
import {
  getCountryTerritories,
  getTerritoryById,
  type CountryTerritory,
} from '../lib/countryTerritories';
import { MapHoverTooltip } from './MapHoverTooltip';
import { MapCountryActionBox } from './MapCountryActionBox';
import { PhotoFocusFrame } from './PhotoFocusFrame';
import { PhotoFocusTerritoryLinks } from './PhotoFocusTerritoryLinks';
import './WorldMap.css';

const GEO_URL = '/countries-110m.json';
const MAP_PADDING = {
  top: 28,
  right: 24,
  // Clear the bottom stats oval so southern land never sits under it at start.
  bottom: 108,
  left: 24,
};
/** Slight pullback vs original fit — more zoomed in than the prior pass. */
const INITIAL_VIEW_SCALE = 0.96;
const MAP_ROTATION: [number, number] = [-10, 0];

const EXCLUDED_COUNTRY_IDS = new Set(['010', '260']);

const COLORS = {
  bg: '#2a2a2a',
  hover: '#3d3d3d',
  yellow: '#f5c518',
};

const COUNTRY_GAP = 4;
const BORDER_WIDTH = 0.3;
const BORDER_WIDTH_ACTIVE = 0.45;
const REGION_BORDER_WIDTH = 0.22;
const HOVER_SCALE = 1.08;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 16;
/** Dismiss the country action box once the country drifts this far from it. */
const SELECTION_DISMISS_DISTANCE_PX = 110;
// Hide dense regional mesh at world view; fade it in as you zoom.
const REGION_BORDERS_FADE_START = 2.25;
const REGION_BORDERS_FADE_END = 4.5;
const REGION_BORDER_OPACITY = 0.8;
// Hit-targets for ~2k regions are expensive; only mount once zoomed in enough.
const REGION_INTERACT_ZOOM = REGION_BORDERS_FADE_START;
const COUNTRIES_CLIP_ID = 'world-map-countries-clip';
const HALF_SPHERE = 2 * Math.PI;
const MAX_VALID_REGION_AREA = HALF_SPHERE * 0.25;

type RegionBBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

type RegionPath = {
  id: string;
  name: string;
  d: string;
  adm0A3: string | null;
  bbox: RegionBBox;
};

function zoomThresholdKey(zoom: number): string {
  return [
    zoom >= REGION_INTERACT_ZOOM ? '1' : '0',
    zoom >= CITY_OUTLINE_ZOOM ? '1' : '0',
    zoom >= REGION_BORDERS_FADE_END ? '2' : zoom > REGION_BORDERS_FADE_START ? '1' : '0',
  ].join('');
}

function geometryBBox(geometry: Geometry): RegionBBox | null {
  if (geometry.type === 'GeometryCollection') {
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    let found = false;

    for (const child of geometry.geometries) {
      const box = geometryBBox(child);
      if (!box) continue;
      found = true;
      if (box.minLon < minLon) minLon = box.minLon;
      if (box.minLat < minLat) minLat = box.minLat;
      if (box.maxLon > maxLon) maxLon = box.maxLon;
      if (box.maxLat > maxLat) maxLat = box.maxLat;
    }

    return found ? { minLon, minLat, maxLon, maxLat } : null;
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number') {
      const lon = coords[0] as number;
      const lat = coords[1] as number;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const child of coords) visit(child);
  };

  visit(geometry.coordinates);
  if (!Number.isFinite(minLon)) return null;
  return { minLon, minLat, maxLon, maxLat };
}

function bboxesOverlap(a: RegionBBox, b: RegionBBox): boolean {
  return (
    a.minLon <= b.maxLon &&
    a.maxLon >= b.minLon &&
    a.minLat <= b.maxLat &&
    a.maxLat >= b.minLat
  );
}

/** Geographic extent currently on screen (with padding so edges stay clickable). */
function getVisibleGeoBBox(
  projection: GeoProjection,
  width: number,
  height: number,
  center: [number, number],
  zoom: number,
  padRatio = 0.4,
): RegionBBox | null {
  const projected = projection(center);
  if (!projected || !projection.invert) return null;

  const [cx, cy] = projected;
  const samples: [number, number][] = [];

  for (const nx of [-padRatio, 0.5, 1 + padRatio]) {
    for (const ny of [-padRatio, 0.5, 1 + padRatio]) {
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
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  return { minLon, minLat, maxLon, maxLat };
}

function isValidRegionGeometry(geometry: Geometry): boolean {
  const rings: number[][][] = [];

  if (geometry.type === 'Polygon') {
    rings.push(geometry.coordinates[0] as number[][]);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      rings.push(polygon[0] as number[][]);
    }
  } else {
    return false;
  }

  for (const ring of rings) {
    const area = geoArea({ type: 'Polygon', coordinates: [ring] });
    if (!Number.isFinite(area) || area <= 0 || area > MAX_VALID_REGION_AREA) {
      return false;
    }
  }

  return true;
}

function mapZoomFilter(event: Event): boolean {
  if (event.type === 'wheel') {
    return true;
  }

  if (event.type === 'mousedown' || event.type === 'touchstart') {
    return (event as MouseEvent).button === 0;
  }

  return false;
}

function getHoverTransform(
  geo: Feature<Geometry>,
  projection: GeoProjection,
  hovered: boolean,
): string {
  if (!hovered) return '';

  const centroid = projection(geoCentroid(geo));
  if (!centroid) return '';

  const [cx, cy] = centroid;
  return `translate(${cx},${cy}) scale(${HOVER_SCALE}) translate(${-cx},${-cy})`;
}

function countryFillStyle(visited: boolean, hovered = false) {
  return {
    fill: visited ? COLORS.yellow : hovered ? COLORS.hover : COLORS.bg,
    stroke: COLORS.bg,
    strokeWidth: COUNTRY_GAP,
    strokeLinejoin: 'round' as const,
    paintOrder: 'stroke fill' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    outline: 'none',
  };
}

function countryBorderStyle(strokeWidth = BORDER_WIDTH) {
  return {
    fill: 'none',
    stroke: COLORS.yellow,
    strokeWidth,
    strokeLinejoin: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    outline: 'none',
    pointerEvents: 'none' as const,
  };
}

const BASE_COUNTRY_FILL_STYLE = countryFillStyle(false);
const COUNTRY_BORDER_STYLE = countryBorderStyle();
// Invisible hit-test layer: transparent fills cost almost nothing to paint.
const REGION_STATIC_STYLE = {
  fill: 'transparent',
  stroke: 'none',
  cursor: 'pointer',
  outline: 'none',
};
const REGION_HOVER_STYLE = {
  ...countryFillStyle(false, true),
  pointerEvents: 'none' as const,
};
const REGION_VISITED_STYLE = {
  ...countryFillStyle(true),
  pointerEvents: 'none' as const,
};

const REGION_BORDER_STYLE = {
  fill: 'none',
  stroke: COLORS.yellow,
  strokeWidth: REGION_BORDER_WIDTH,
  strokeOpacity: REGION_BORDER_OPACITY,
  strokeLinejoin: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
  pointerEvents: 'none' as const,
};

function regionalBorderOpacity(zoom: number): number {
  if (zoom <= REGION_BORDERS_FADE_START) return 0;
  if (zoom >= REGION_BORDERS_FADE_END) return REGION_BORDER_OPACITY;
  const t =
    (zoom - REGION_BORDERS_FADE_START) /
    (REGION_BORDERS_FADE_END - REGION_BORDERS_FADE_START);
  return REGION_BORDER_OPACITY * t;
}

const CITY_OUTLINE_STYLE = {
  fill: 'none',
  stroke: COLORS.yellow,
  strokeWidth: 0.28,
  strokeOpacity: 0.55,
  strokeDasharray: '3 2',
  strokeLinejoin: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
  pointerEvents: 'none' as const,
};

interface WorldMapProps {
  isVisited: (countryId: string) => boolean;
  onToggle: (countryId: string) => void;
  isRegionVisited: (regionId: string) => boolean;
  onToggleRegion: (regionId: string) => void;
  regionalViewLocked: boolean;
  onPhotoFocusChange?: (active: boolean) => void;
}

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

function createMapProjection(
  topology: Topology,
  width: number,
  height: number,
): GeoProjection {
  const collection = feature(
    topology,
    topology.objects.countries as Parameters<typeof feature>[1],
  ) as FeatureCollection<Geometry>;

  const projection = geoMercator()
    .rotate(MAP_ROTATION)
    .fitExtent(
      [
        [MAP_PADDING.left, MAP_PADDING.top],
        [width - MAP_PADDING.right, height - MAP_PADDING.bottom],
      ],
      collection,
    );

  return projection.scale(projection.scale() * INITIAL_VIEW_SCALE);
}

function buildRegionPaths(
  admin1: FeatureCollection<Geometry>,
  pathGenerator: ReturnType<typeof geoPath>,
): RegionPath[] {
  const paths: RegionPath[] = [];

  for (const regionFeature of admin1.features) {
    if (!isValidRegionGeometry(regionFeature.geometry)) continue;
    const bbox = geometryBBox(regionFeature.geometry);
    if (!bbox) continue;

    paths.push({
      id: getRegionId(regionFeature),
      name: getRegionName(regionFeature),
      adm0A3:
        (regionFeature.properties as { adm0_a3?: string } | null)?.adm0_a3 ?? null,
      bbox,
      d: pathGenerator(regionFeature) ?? '',
    });
  }

  return paths;
}

export function WorldMap({
  isVisited,
  onToggle,
  isRegionVisited,
  onToggleRegion,
  regionalViewLocked,
  onPhotoFocusChange,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRafRef = useRef(0);
  const pendingZoomRef = useRef(1);
  const mapZoomRef = useRef(1);
  const zoomThresholdRef = useRef(zoomThresholdKey(1));
  const regionBorderPathRef = useRef<SVGPathElement | null>(null);
  const preparedRegionalRef = useRef<{
    key: string;
    paths: RegionPath[];
    bordersD: string | null;
  } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [topology, setTopology] = useState<Topology | null>(null);
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const hoverHideTimeoutRef = useRef<number | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<{
    id: string;
    label: string;
    x: number;
    y: number;
    /** Click point in the country group's SVG user space. */
    anchorLocalX: number;
    anchorLocalY: number;
  } | null>(null);
  const selectedCountryRef = useRef(selectedCountry);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 20]);
  const [regionPaths, setRegionPaths] = useState<RegionPath[]>([]);
  const [innerBordersD, setInnerBordersD] = useState<string | null>(null);
  const [regionalPrepared, setRegionalPrepared] = useState(false);
  const [photoFocus, setPhotoFocus] = useState<{
    countryId: string;
    territoryId: string;
    territories: CountryTerritory[];
    progress: number;
    transform: PhotoFocusTransform;
  } | null>(null);
  const photoFocusRafRef = useRef(0);
  const photoFocusRef = useRef(photoFocus);
  const onPhotoFocusChangeRef = useRef(onPhotoFocusChange);

  const showRegionalView = regionalViewLocked;
  const isPhotoFocusing = photoFocus !== null;

  const {
    admin1,
    admin1InnerBorders,
    topCities,
    isLoading: isRegionDataLoading,
  } = useRegionGeoData(showRegionalView);

  useEffect(() => {
    let cancelled = false;

    fetch(GEO_URL)
      .then((response) => response.json())
      .then((data: Topology) => {
        if (!cancelled) {
          setTopology(filterTopology(data));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const { width, height } = container.getBoundingClientRect();
      setDimensions({ width, height });
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const blockBrowserZoom = (event: WheelEvent) => {
      event.preventDefault();
    };

    container.addEventListener('wheel', blockBrowserZoom, { passive: false });

    return () => {
      container.removeEventListener('wheel', blockBrowserZoom);
    };
  }, [topology, dimensions.width, dimensions.height]);

  const mapProjection = useMemo(() => {
    if (!topology || dimensions.width === 0 || dimensions.height === 0) {
      return null;
    }

    return createMapProjection(topology, dimensions.width, dimensions.height);
  }, [topology, dimensions]);

  const pathGenerator = useMemo(
    () => (mapProjection ? geoPath(mapProjection) : null),
    [mapProjection],
  );

  const countryFeatures = useMemo(() => {
    if (!topology) {
      return [] as Feature<Geometry>[];
    }

    const collection = feature(
      topology,
      topology.objects.countries as Parameters<typeof feature>[1],
    ) as FeatureCollection<Geometry>;

    return collection.features;
  }, [topology]);

  // One stroke per national boundary (shared frontiers drawn once), so regional
  // view matches country-view thickness instead of double-stroking every outline.
  const countryBordersD = useMemo(() => {
    if (!topology || !pathGenerator) {
      return null;
    }

    const countries = topology.objects.countries;
    if (countries.type !== 'GeometryCollection') {
      return null;
    }

    const borderMesh = mesh(
      topology,
      countries as Parameters<typeof mesh>[1],
    ) as MultiLineString;
    return pathGenerator(borderMesh);
  }, [topology, pathGenerator]);

  // Path strings for the low-res country shapes, reused by the regional view
  // as base fill and clip shape so both views share the exact same outlines.
  const countryPathDs = useMemo(() => {
    if (!pathGenerator) {
      return [] as string[];
    }

    return countryFeatures.map(
      (countryFeature) => pathGenerator(countryFeature) ?? '',
    );
  }, [countryFeatures, pathGenerator]);

  const focusCountryId = useMemo(
    () => findCountryIdAtPoint(countryFeatures, mapCenter),
    [countryFeatures, mapCenter],
  );

  const focusAdm0A3 = useMemo(
    () => (focusCountryId ? getCountryA3FromNumeric(focusCountryId) ?? null : null),
    [focusCountryId],
  );

  // Prepare heavy regional path strings after the spinner can paint, then
  // reveal the map only when everything is ready. Cache across toggles.
  useEffect(() => {
    if (!showRegionalView) {
      setRegionalPrepared(false);
      return;
    }

    if (isRegionDataLoading || !admin1 || !admin1InnerBorders || !pathGenerator) {
      setRegionalPrepared(false);
      return;
    }

    const cacheKey = `${dimensions.width}x${dimensions.height}`;
    const cached = preparedRegionalRef.current;
    if (cached && cached.key === cacheKey) {
      setRegionPaths(cached.paths);
      setInnerBordersD(cached.bordersD);
      setRegionalPrepared(true);
      return;
    }

    let cancelled = false;
    setRegionalPrepared(false);

    const timer = window.setTimeout(() => {
      const paths = buildRegionPaths(admin1, pathGenerator);
      const bordersD = pathGenerator(admin1InnerBorders);

      if (cancelled) return;

      preparedRegionalRef.current = {
        key: cacheKey,
        paths,
        bordersD,
      };
      setRegionPaths(paths);
      setInnerBordersD(bordersD);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) {
            setRegionalPrepared(true);
          }
        });
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    showRegionalView,
    isRegionDataLoading,
    admin1,
    admin1InnerBorders,
    pathGenerator,
    dimensions.width,
    dimensions.height,
  ]);

  const showRegionalLoading = showRegionalView && !regionalPrepared;

  const regionPathById = useMemo(
    () => new Map(regionPaths.map((region) => [region.id, region])),
    [regionPaths],
  );

  // Cities only at high zoom — showing every city box in locked regional view
  // at continent scale looked like broken-border artifacts.
  const citiesEnabled = mapZoom >= CITY_OUTLINE_ZOOM;
  const regionInteractionEnabled = mapZoom >= REGION_INTERACT_ZOOM;

  const regionBorderOpacity = regionalBorderOpacity(mapZoom);
  const showRegionBorders =
    Boolean(innerBordersD) &&
    regionalPrepared &&
    regionBorderOpacity > 0.02;

  const applyRegionBorderOpacity = useCallback((zoom: number) => {
    const path = regionBorderPathRef.current;
    if (!path) return;
    const opacity = regionalBorderOpacity(zoom);
    path.style.strokeOpacity = String(opacity);
    path.style.display = opacity > 0.02 ? '' : 'none';
  }, []);

  const commitZoomIfNeeded = useCallback((zoom: number, force = false) => {
    const nextKey = zoomThresholdKey(zoom);
    mapZoomRef.current = zoom;
    if (force || nextKey !== zoomThresholdRef.current) {
      zoomThresholdRef.current = nextKey;
      setMapZoom(zoom);
    }
  }, []);

  const visibleCities = useMemo(() => {
    if (!topCities || !showRegionalView || !regionalPrepared) {
      return [] as Feature<Geometry>[];
    }

    return filterTopCityMarkers(topCities, {
      regionalViewLocked,
      focusAdm0A3,
      citiesEnabled,
    });
  }, [
    topCities,
    showRegionalView,
    regionalPrepared,
    regionalViewLocked,
    focusAdm0A3,
    citiesEnabled,
  ]);

  const citiesLayer = useMemo(() => {
    if (visibleCities.length === 0 || !pathGenerator) {
      return null;
    }

    const outlineCities = visibleCities.filter(
      (cityFeature) => cityFeature.geometry.type !== 'Point',
    );

    return (
      <g className="world-map__overlays" aria-hidden="true">
        <g clipPath={`url(#${COUNTRIES_CLIP_ID})`}>
          {outlineCities.map((cityFeature, index) => {
            let d = '';
            try {
              d = pathGenerator(cityFeature) ?? '';
            } catch {
              return null;
            }
            if (!d) return null;

            return (
              <path
                key={getCityId(cityFeature, index)}
                d={d}
                style={CITY_OUTLINE_STYLE}
              >
                <title>{getCityName(cityFeature)}</title>
              </path>
            );
          })}
        </g>
      </g>
    );
  }, [visibleCities, pathGenerator]);

  const handleMapMoveEnd = useCallback(
    (position: { coordinates: [number, number]; zoom: number }) => {
      setMapCenter(position.coordinates);
      commitZoomIfNeeded(position.zoom, true);
      applyRegionBorderOpacity(position.zoom);
    },
    [applyRegionBorderOpacity, commitZoomIfNeeded],
  );

  const clearHover = () => {
    if (hoverHideTimeoutRef.current !== null) {
      window.clearTimeout(hoverHideTimeoutRef.current);
      hoverHideTimeoutRef.current = null;
    }
    setHoveredCountryId(null);
    setHoveredRegionId(null);
    setHoverLabel(null);
  };

  const cancelHoverHide = () => {
    if (hoverHideTimeoutRef.current !== null) {
      window.clearTimeout(hoverHideTimeoutRef.current);
      hoverHideTimeoutRef.current = null;
    }
  };

  const clearSelection = useCallback(() => {
    setSelectedCountry(null);
  }, []);

  useEffect(() => {
    selectedCountryRef.current = selectedCountry;
  }, [selectedCountry]);

  const dismissSelectionIfCountryFar = useCallback(() => {
    const selected = selectedCountryRef.current;
    const container = containerRef.current;
    if (!selected || !container) return;

    const el = container.querySelector(
      `[data-country-id="${CSS.escape(selected.id)}"]`,
    ) as SVGGraphicsElement | null;
    const svg = el?.ownerSVGElement;
    const ctm = el?.getScreenCTM?.();
    if (!el || !svg || !ctm) {
      clearSelection();
      return;
    }

    const pt = svg.createSVGPoint();
    pt.x = selected.anchorLocalX;
    pt.y = selected.anchorLocalY;
    const screen = pt.matrixTransform(ctm);
    const containerRect = container.getBoundingClientRect();
    const currentX = screen.x - containerRect.left;
    const currentY = screen.y - containerRect.top;

    if (
      Math.hypot(currentX - selected.x, currentY - selected.y) >
      SELECTION_DISMISS_DISTANCE_PX
    ) {
      clearSelection();
    }
  }, [clearSelection]);

  const countryNameById = useMemo(() => {
    const names = new Map<string, string>();
    if (!topology) return names;
    const countries = topology.objects.countries;
    if (countries.type !== 'GeometryCollection') return names;
    for (const geometry of countries.geometries) {
      const id = String(geometry.id);
      const name =
        (geometry.properties as { name?: string } | null)?.name ?? id;
      names.set(id, name);
    }
    return names;
  }, [topology]);

  // Fills only — national outlines come from a single border mesh so shared
  // frontiers aren't painted twice (which looked thicker than country view).
  const countryFillLayer = useMemo(
    () => (
      <g pointerEvents="none" aria-hidden="true">
        {countryPathDs.map((d, index) => (
          <path key={index} d={d} style={BASE_COUNTRY_FILL_STYLE} />
        ))}
      </g>
    ),
    [countryPathDs],
  );

  const countryBorderLayer = useMemo(() => {
    if (!countryBordersD) {
      return null;
    }

    return (
      <g pointerEvents="none" aria-hidden="true">
        <path d={countryBordersD} style={COUNTRY_BORDER_STYLE} />
      </g>
    );
  }, [countryBordersD]);

  const countriesClipDef = useMemo(
    () => (
      <defs>
        <clipPath id={COUNTRIES_CLIP_ID}>
          {countryPathDs.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </clipPath>
      </defs>
    ),
    [countryPathDs],
  );

  // Click/hover any region currently on screen (padded viewport), not only the
  // country under the crosshair. Borders stay global and unchanged.
  const interactiveRegionPaths = useMemo(() => {
    if (!regionInteractionEnabled || !mapProjection) {
      return [] as RegionPath[];
    }

    const visible = getVisibleGeoBBox(
      mapProjection,
      dimensions.width,
      dimensions.height,
      mapCenter,
      mapZoom,
      0.55,
    );

    if (!visible) {
      return regionPaths;
    }

    return regionPaths.filter((region) => bboxesOverlap(region.bbox, visible));
  }, [
    regionInteractionEnabled,
    mapProjection,
    dimensions.width,
    dimensions.height,
    mapCenter,
    mapZoom,
    regionPaths,
  ]);

  // Visited fills stay visible at every zoom (including fully zoomed out).
  // Click targets are separate and only mount when zoomed in enough.
  const visitedRegionPaths = useMemo(() => {
    if (!regionalPrepared || !showRegionalView) {
      return [] as RegionPath[];
    }

    return regionPaths.filter((region) => isRegionVisited(region.id));
  }, [regionalPrepared, showRegionalView, regionPaths, isRegionVisited]);

  const regionsLayer = useMemo(
    () => (
      <g>
        {interactiveRegionPaths.map((region) => (
          <path
            key={region.id}
            d={region.d}
            data-region-id={region.id}
            aria-label={region.name}
            onClick={() => onToggleRegion(region.id)}
            style={REGION_STATIC_STYLE}
          />
        ))}
      </g>
    ),
    [interactiveRegionPaths, onToggleRegion],
  );

  const visitedRegionsLayer = useMemo(
    () => (
      <g pointerEvents="none" aria-hidden="true">
        {visitedRegionPaths.map((region) => (
          <path key={region.id} d={region.d} style={REGION_VISITED_STYLE} />
        ))}
      </g>
    ),
    [visitedRegionPaths],
  );

  const hoveredRegion =
    hoveredRegionId &&
    regionInteractionEnabled &&
    !isRegionVisited(hoveredRegionId)
      ? regionPathById.get(hoveredRegionId) ?? null
      : null;

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (selectedCountry) {
      clearHover();
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    const localX = rect ? event.clientX - rect.left : 0;
    const localY = rect ? event.clientY - rect.top : 0;

    if (showRegionalView) {
      if (!regionInteractionEnabled) {
        clearHover();
        return;
      }

      const regionElement = (event.target as Element).closest('[data-region-id]');
      const nextId = regionElement?.getAttribute('data-region-id') ?? null;
      if (nextId) {
        cancelHoverHide();
        setHoverPos({ x: localX, y: localY });
        setHoveredRegionId((current) => (current === nextId ? current : nextId));
        const region = regionPathById.get(nextId);
        setHoverLabel(region?.name ?? nextId);
      } else {
        clearHover();
      }
      return;
    }

    const countryElement = (event.target as Element).closest('[data-country-id]');
    const nextId = countryElement?.getAttribute('data-country-id') ?? null;
    if (nextId) {
      cancelHoverHide();
      setHoverPos({ x: localX, y: localY });
      setHoveredCountryId((current) => (current === nextId ? current : nextId));
      setHoverLabel(countryNameById.get(nextId) ?? nextId);
    } else {
      clearHover();
    }
  };

  useEffect(() => {
    applyRegionBorderOpacity(mapZoomRef.current);
  }, [showRegionBorders, regionalPrepared, applyRegionBorderOpacity]);

  useEffect(() => {
    photoFocusRef.current = photoFocus;
  }, [photoFocus]);

  useEffect(() => {
    onPhotoFocusChangeRef.current = onPhotoFocusChange;
  }, [onPhotoFocusChange]);

  useEffect(() => {
    return () => {
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }
      if (photoFocusRafRef.current) {
        cancelAnimationFrame(photoFocusRafRef.current);
      }
      if (hoverHideTimeoutRef.current !== null) {
        window.clearTimeout(hoverHideTimeoutRef.current);
      }
      onPhotoFocusChangeRef.current?.(false);
    };
  }, []);

  const exitPhotoFocus = useCallback(() => {
    if (!photoFocusRef.current) return;
    if (photoFocusRafRef.current) {
      cancelAnimationFrame(photoFocusRafRef.current);
      photoFocusRafRef.current = 0;
    }
    containerRef.current?.style.removeProperty('--photo-fade');
    setPhotoFocus(null);
    onPhotoFocusChangeRef.current?.(false);
  }, []);

  useEffect(() => {
    if (!photoFocus && !selectedCountry) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (photoFocus) {
        exitPhotoFocus();
        return;
      }
      clearSelection();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photoFocus, selectedCountry, exitPhotoFocus, clearSelection]);

  const startPhotoFocus = useCallback(
    (countryId: string) => {
      if (!mapProjection || showRegionalView || photoFocusRef.current) return;

      const geo = countryFeatures.find(
        (feature) => String(feature.id) === countryId,
      );
      if (!geo) return;

      const territories = getCountryTerritories(geo);
      const mainland = territories[0];
      const transform = computeFlatPhotoFocusTransform(
        mainland.feature,
        mapProjection,
        dimensions.width,
        dimensions.height,
        mapCenter,
        mapZoomRef.current,
      );
      if (!transform) return;

      if (hoverHideTimeoutRef.current !== null) {
        window.clearTimeout(hoverHideTimeoutRef.current);
        hoverHideTimeoutRef.current = null;
      }
      setHoveredCountryId(null);
      setHoveredRegionId(null);
      setHoverLabel(null);
      setSelectedCountry(null);

      if (photoFocusRafRef.current) {
        cancelAnimationFrame(photoFocusRafRef.current);
      }

      const startedAt = performance.now();
      const base = {
        countryId,
        territoryId: mainland.id,
        territories,
        transform,
      };
      photoFocusRef.current = { ...base, progress: 0 };
      setPhotoFocus({ ...base, progress: 0 });
      onPhotoFocusChangeRef.current?.(true);

      const tick = (now: number) => {
        const progress = Math.min(
          1,
          (now - startedAt) / PHOTO_FOCUS_DURATION_MS,
        );
        const next = { ...base, progress };
        photoFocusRef.current = next;
        // Animate via DOM — avoid React re-rendering the whole map each frame.
        applyPhotoFocusFrameProgress(
          containerRef.current,
          progress,
          transform,
        );
        if (progress < 1) {
          photoFocusRafRef.current = requestAnimationFrame(tick);
        } else {
          photoFocusRafRef.current = 0;
          setPhotoFocus(next);
        }
      };

      photoFocusRafRef.current = requestAnimationFrame(tick);
    },
    [
      countryFeatures,
      dimensions.height,
      dimensions.width,
      mapCenter,
      mapProjection,
      showRegionalView,
    ],
  );

  const switchPhotoTerritory = useCallback(
    (territoryId: string) => {
      if (!mapProjection || !photoFocusRef.current) return;
      const current = photoFocusRef.current;
      const territory = getTerritoryById(current.territories, territoryId);
      const transform = computeFlatPhotoFocusTransform(
        territory.feature,
        mapProjection,
        dimensions.width,
        dimensions.height,
        mapCenter,
        mapZoomRef.current,
      );
      if (!transform) return;

      const next = {
        ...current,
        territoryId: territory.id,
        transform,
        progress: 1,
      };
      photoFocusRef.current = next;
      setPhotoFocus(next);
    },
    [dimensions.height, dimensions.width, mapCenter, mapProjection],
  );

  if (!topology || !mapProjection || dimensions.width === 0 || dimensions.height === 0) {
    return <div className="world-map" ref={containerRef} />;
  }

  const activeFocusTerritory = photoFocus
    ? getTerritoryById(photoFocus.territories, photoFocus.territoryId)
    : null;
  const activeFocusTerritoryPath =
    activeFocusTerritory && pathGenerator
      ? pathGenerator(activeFocusTerritory.feature) ?? ''
      : '';

  return (
    <div
      className={`world-map${isPhotoFocusing ? ' world-map--photo-focus' : ''}`}
      ref={containerRef}
      onPointerMove={isPhotoFocusing ? undefined : handlePointerMove}
      onPointerLeave={isPhotoFocusing ? undefined : clearHover}
      onClick={(event) => {
        if (isPhotoFocusing || showRegionalView) return;
        const target = event.target as Element;
        if (target.closest('.map-country-action')) return;
        if (!target.closest('[data-country-id]')) {
          clearSelection();
        }
      }}
    >
      {photoFocus && (
        <>
          <PhotoFocusFrame
            countryName={
              countryNameById.get(photoFocus.countryId) ?? photoFocus.countryId
            }
            progress={photoFocus.progress}
            onClose={exitPhotoFocus}
          />
          <PhotoFocusTerritoryLinks
            territories={photoFocus.territories}
            activeTerritoryId={photoFocus.territoryId}
            progress={photoFocus.progress}
            onSelect={switchPhotoTerritory}
          />
        </>
      )}
      <MapHoverTooltip
        label={hoverLabel}
        x={hoverPos.x}
        y={hoverPos.y}
        visible={
          !isPhotoFocusing &&
          selectedCountry === null &&
          hoverLabel !== null
        }
      />
      {selectedCountry && !isPhotoFocusing && (
        <MapCountryActionBox
          label={selectedCountry.label}
          x={selectedCountry.x}
          y={selectedCountry.y}
          isMarked={isVisited(selectedCountry.id)}
          onMark={() => onToggle(selectedCountry.id)}
          onAddPhotos={() => startPhotoFocus(selectedCountry.id)}
        />
      )}
      {showRegionalLoading && (
        <div className="world-map__loading-screen" role="status" aria-live="polite">
          <div className="world-map__spinner" aria-hidden="true" />
          <p className="world-map__loading-label">Loading regional map…</p>
        </div>
      )}

      <ComposableMap
        projection={mapProjection as unknown as ProjectionFunction}
        width={dimensions.width}
        height={dimensions.height}
        style={{
          width: '100%',
          height: '100%',
          visibility: showRegionalLoading ? 'hidden' : 'visible',
        }}
      >
          <ZoomableGroup
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            disablePanning={isPhotoFocusing}
            disableZooming={isPhotoFocusing}
            onMove={(position) => {
              if (photoFocusRef.current) return;
              pendingZoomRef.current = position.zoom;
              applyRegionBorderOpacity(position.zoom);
              if (selectedCountryRef.current) {
                dismissSelectionIfCountryFar();
              }
              if (zoomRafRef.current) return;
              zoomRafRef.current = requestAnimationFrame(() => {
                zoomRafRef.current = 0;
                commitZoomIfNeeded(pendingZoomRef.current);
                dismissSelectionIfCountryFar();
              });
            }}
            onMoveEnd={(position) => {
              handleMapMoveEnd(position);
              dismissSelectionIfCountryFar();
            }}
            filterZoomEvent={(event) =>
              !photoFocusRef.current &&
              mapZoomFilter(event as unknown as Event)
            }
          >
            {!showRegionalView && (
              <Geographies geography={topology}>
                {({ geographies }) =>
                  [...geographies]
                    .sort((a, b) => {
                      const focusId = photoFocus?.countryId;
                      if (focusId) {
                        const aFocus = String(a.id) === focusId ? 1 : 0;
                        const bFocus = String(b.id) === focusId ? 1 : 0;
                        if (aFocus !== bFocus) return aFocus - bFocus;
                      }
                      const selectedId = selectedCountry?.id;
                      const aLifted =
                        String(a.id) === hoveredCountryId ||
                        String(a.id) === selectedId
                          ? 1
                          : 0;
                      const bLifted =
                        String(b.id) === hoveredCountryId ||
                        String(b.id) === selectedId
                          ? 1
                          : 0;
                      return aLifted - bLifted;
                    })
                    .map((geo) => {
                      const countryId = String(geo.id);
                      const visited = isVisited(countryId);
                      const isFocusCountry = photoFocus?.countryId === countryId;
                      const isSelected = selectedCountry?.id === countryId;
                      const hovered =
                        !isPhotoFocusing &&
                        !selectedCountry &&
                        hoveredCountryId === countryId;
                      // Keep click highlight identical to hover (same lift + stroke).
                      const isHighlighted = hovered || isSelected;
                      const countryName =
                        (geo.properties as { name?: string })?.name ?? countryId;
                      // Fade other countries via CSS --photo-fade during focus animation.
                      const opacity = 1;

                      const fillStyle = {
                        ...countryFillStyle(
                          visited,
                          isHighlighted || isFocusCountry,
                        ),
                        cursor: isPhotoFocusing ? 'default' : 'pointer',
                        opacity,
                      };
                      const borderStyle = {
                        ...countryBorderStyle(
                          isHighlighted || isFocusCountry
                            ? BORDER_WIDTH_ACTIVE
                            : BORDER_WIDTH,
                        ),
                        opacity,
                      };

                      const transform = isFocusCountry && photoFocus
                        ? flatPhotoFocusTransformString(
                            photoFocus.transform,
                            photoFocus.progress,
                          )
                        : getHoverTransform(geo, mapProjection, isHighlighted);

                      if (isFocusCountry && photoFocus && pathGenerator) {
                        const remoteStyle = {
                          ...countryFillStyle(visited, false),
                          cursor: 'default',
                          opacity: 1,
                        };
                        const remoteBorder = {
                          ...countryBorderStyle(BORDER_WIDTH),
                          opacity: 1,
                        };

                        return (
                          <g
                            key={geo.rsmKey}
                            className="world-map__country"
                            data-country-id={countryId}
                            style={{ pointerEvents: 'none' }}
                            aria-label={countryName}
                          >
                            {photoFocus.territories.map((territory) => {
                              if (territory.id === photoFocus.territoryId) {
                                return null;
                              }
                              const d = pathGenerator(territory.feature) ?? '';
                              if (!d) return null;
                              return (
                                <g key={territory.id} data-photo-fade>
                                  <path d={d} style={remoteStyle} />
                                  <path d={d} style={remoteBorder} />
                                </g>
                              );
                            })}
                            {activeFocusTerritoryPath ? (
                              <g data-photo-focus-transform transform={transform}>
                                <path
                                  d={activeFocusTerritoryPath}
                                  style={fillStyle}
                                />
                                <path
                                  d={activeFocusTerritoryPath}
                                  style={borderStyle}
                                />
                              </g>
                            ) : null}
                          </g>
                        );
                      }

                      return (
                        <g
                          key={geo.rsmKey}
                          className="world-map__country"
                          data-country-id={countryId}
                          data-photo-fade={photoFocus ? '' : undefined}
                          transform={transform}
                          style={{ pointerEvents: isPhotoFocusing ? 'none' : undefined }}
                        >
                          <Geography
                            geography={geo}
                            aria-label={countryName}
                            onClick={(event) => {
                              if (isPhotoFocusing) return;
                              event.stopPropagation();
                              if (selectedCountry) {
                                clearSelection();
                                return;
                              }
                              const rect =
                                containerRef.current?.getBoundingClientRect();
                              const x = rect
                                ? event.clientX - rect.left
                                : 0;
                              const y = rect
                                ? event.clientY - rect.top
                                : 0;
                              clearHover();
                              const group = (event.currentTarget as Element)
                                .closest('[data-country-id]') as SVGGraphicsElement | null;
                              const svg = group?.ownerSVGElement;
                              const ctm = group?.getScreenCTM?.();
                              let anchorLocalX = 0;
                              let anchorLocalY = 0;
                              if (group && svg && ctm) {
                                const pt = svg.createSVGPoint();
                                pt.x = event.clientX;
                                pt.y = event.clientY;
                                const local = pt.matrixTransform(ctm.inverse());
                                anchorLocalX = local.x;
                                anchorLocalY = local.y;
                              }
                              setSelectedCountry({
                                id: countryId,
                                label: countryName,
                                x,
                                y,
                                anchorLocalX,
                                anchorLocalY,
                              });
                            }}
                            style={{
                              default: fillStyle,
                              hover: fillStyle,
                              pressed: fillStyle,
                            }}
                          />
                          <Geography
                            geography={geo}
                            tabIndex={-1}
                            style={{
                              default: borderStyle,
                              hover: borderStyle,
                              pressed: borderStyle,
                            }}
                          />
                        </g>
                      );
                    })
                }
              </Geographies>
            )}

            {showRegionalView && regionalPrepared && (
              <>
                {countriesClipDef}
                {countryFillLayer}
                {regionsLayer}

                <g
                  clipPath={`url(#${COUNTRIES_CLIP_ID})`}
                  pointerEvents="none"
                  aria-hidden="true"
                >
                  {hoveredRegion && (
                    <path d={hoveredRegion.d} style={REGION_HOVER_STYLE} />
                  )}
                  {visitedRegionsLayer}
                </g>

                {showRegionBorders && (
                  <g pointerEvents="none" aria-hidden="true">
                    <path
                      ref={regionBorderPathRef}
                      d={innerBordersD ?? undefined}
                      style={{
                        ...REGION_BORDER_STYLE,
                        strokeOpacity: regionBorderOpacity,
                        shapeRendering: 'optimizeSpeed',
                      }}
                    />
                  </g>
                )}

                {countryBorderLayer}
              </>
            )}

            {showRegionalView && regionalPrepared && citiesLayer}
          </ZoomableGroup>
        </ComposableMap>
    </div>
  );
}
