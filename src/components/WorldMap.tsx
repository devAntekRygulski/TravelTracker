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
import './WorldMap.css';

const GEO_URL = '/countries-110m.json';
const MAP_PADDING = {
  top: 10,
  right: 8,
  bottom: 8,
  left: 8,
};
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
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
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

  return geoMercator()
    .rotate(MAP_ROTATION)
    .fitExtent(
      [
        [MAP_PADDING.left, MAP_PADDING.top],
        [width - MAP_PADDING.right, height - MAP_PADDING.bottom],
      ],
      collection,
    );
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
  const [mapZoom, setMapZoom] = useState(1);
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 20]);
  const [regionPaths, setRegionPaths] = useState<RegionPath[]>([]);
  const [innerBordersD, setInnerBordersD] = useState<string | null>(null);
  const [regionalPrepared, setRegionalPrepared] = useState(false);

  const showRegionalView = regionalViewLocked;

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
    setHoveredCountryId(null);
    setHoveredRegionId(null);
  };

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
    if (showRegionalView) {
      if (!regionInteractionEnabled) {
        setHoveredRegionId(null);
        return;
      }

      const regionElement = (event.target as Element).closest('[data-region-id]');
      const nextId = regionElement?.getAttribute('data-region-id') ?? null;
      setHoveredRegionId((current) => (current === nextId ? current : nextId));
      return;
    }

    const countryElement = (event.target as Element).closest('[data-country-id]');
    const nextId = countryElement?.getAttribute('data-country-id') ?? null;
    setHoveredCountryId((current) => (current === nextId ? current : nextId));
  };

  useEffect(() => {
    applyRegionBorderOpacity(mapZoomRef.current);
  }, [showRegionBorders, regionalPrepared, applyRegionBorderOpacity]);

  useEffect(() => {
    return () => {
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }
    };
  }, []);

  if (!topology || !mapProjection || dimensions.width === 0 || dimensions.height === 0) {
    return <div className="world-map" ref={containerRef} />;
  }

  return (
    <div
      className="world-map"
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={clearHover}
    >
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
            onMove={(position) => {
              pendingZoomRef.current = position.zoom;
              applyRegionBorderOpacity(position.zoom);
              if (zoomRafRef.current) return;
              zoomRafRef.current = requestAnimationFrame(() => {
                zoomRafRef.current = 0;
                commitZoomIfNeeded(pendingZoomRef.current);
              });
            }}
            onMoveEnd={handleMapMoveEnd}
            filterZoomEvent={(event) => mapZoomFilter(event as unknown as Event)}
          >
            {!showRegionalView && (
              <Geographies geography={topology}>
                {({ geographies }) =>
                  [...geographies]
                    .sort((a, b) => {
                      const aHovered = String(a.id) === hoveredCountryId ? 1 : 0;
                      const bHovered = String(b.id) === hoveredCountryId ? 1 : 0;
                      return aHovered - bHovered;
                    })
                    .map((geo) => {
                      const countryId = String(geo.id);
                      const visited = isVisited(countryId);
                      const hovered = hoveredCountryId === countryId;
                      const countryName =
                        (geo.properties as { name?: string })?.name ?? countryId;

                      const fillStyle = {
                        ...countryFillStyle(visited, hovered),
                        cursor: 'pointer',
                      };
                      const borderStyle = countryBorderStyle(
                        hovered ? BORDER_WIDTH_ACTIVE : BORDER_WIDTH,
                      );

                      return (
                        <g
                          key={geo.rsmKey}
                          className="world-map__country"
                          data-country-id={countryId}
                          transform={getHoverTransform(geo, mapProjection, hovered)}
                        >
                          <Geography
                            geography={geo}
                            aria-label={countryName}
                            onClick={() => onToggle(countryId)}
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
