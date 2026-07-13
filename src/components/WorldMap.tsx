import { useEffect, useMemo, useRef, useState } from 'react';
import { geoCentroid, geoMercator, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import type { ProjectionFunction } from 'react-simple-maps';
import './WorldMap.css';

const GEO_URL = '/countries-110m.json';
const MAP_PADDING = {
  top: 10,
  right: 8,
  bottom: 8,
  left: 8,
};
// Shift the central meridian so Russia's eastern territories stay attached to the mainland.
const MAP_ROTATION: [number, number] = [-10, 0];

const EXCLUDED_COUNTRY_IDS = new Set([
  '010', // Antarctica
  '260', // French Southern and Antarctic Lands
  '304', // Greenland
]);

const COLORS = {
  bg: '#2a2a2a',
  hover: '#3d3d3d',
  yellow: '#f5c518',
};

// Uniform pixel gap between every shared border (screen pixels, not geographic scale).
const COUNTRY_GAP = 4;
const BORDER_WIDTH = 0.3;
const BORDER_WIDTH_ACTIVE = 0.45;
const HOVER_SCALE = 1.08;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

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

interface WorldMapProps {
  isVisited: (countryId: string) => boolean;
  onToggle: (countryId: string) => void;
}

function filterTopology(topology: Topology): Topology {
  const countries = topology.objects.countries;

  if (countries.type !== 'GeometryCollection') {
    return topology;
  }

  return {
    ...topology,
    objects: {
      ...topology.objects,
      countries: {
        ...countries,
        geometries: countries.geometries.filter(
          (geometry) => !EXCLUDED_COUNTRY_IDS.has(String(geometry.id)),
        ),
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

export function WorldMap({ isVisited, onToggle }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [topology, setTopology] = useState<Topology | null>(null);
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);

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

  const mapProjection = useMemo(() => {
    if (!topology || dimensions.width === 0 || dimensions.height === 0) {
      return null;
    }

    return createMapProjection(topology, dimensions.width, dimensions.height);
  }, [topology, dimensions]);

  const clearHover = () => setHoveredCountryId(null);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const countryElement = (event.target as Element).closest('[data-country-id]');
    const nextId = countryElement?.getAttribute('data-country-id') ?? null;
    setHoveredCountryId((current) => (current === nextId ? current : nextId));
  };

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
      <ComposableMap
        projection={mapProjection as unknown as ProjectionFunction}
        width={dimensions.width}
        height={dimensions.height}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}>
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
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
