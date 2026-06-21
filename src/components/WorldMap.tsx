import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import './WorldMap.css';

const GEO_URL = '/countries-110m.json';
const MAP_PADDING = 12;

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

function computeProjection(
  topology: Topology,
  width: number,
  height: number,
): { scale: number; center: [number, number] } {
  const collection = feature(
    topology,
    topology.objects.countries as Parameters<typeof feature>[1],
  ) as FeatureCollection<Geometry>;

  const projection = geoMercator().fitExtent(
    [
      [MAP_PADDING, MAP_PADDING],
      [width - MAP_PADDING, height - MAP_PADDING],
    ],
    collection,
  );

  return {
    scale: projection.scale(),
    center: projection.center() as [number, number],
  };
}

export function WorldMap({ isVisited, onToggle }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [topology, setTopology] = useState<Topology | null>(null);

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

  const projectionConfig = useMemo(() => {
    if (!topology || dimensions.width === 0 || dimensions.height === 0) {
      return undefined;
    }

    return computeProjection(topology, dimensions.width, dimensions.height);
  }, [topology, dimensions]);

  if (!topology || !projectionConfig || dimensions.width === 0 || dimensions.height === 0) {
    return <div className="world-map" ref={containerRef} />;
  }

  return (
    <div className="world-map" ref={containerRef}>
      <ComposableMap
        projection="geoMercator"
        width={dimensions.width}
        height={dimensions.height}
        projectionConfig={projectionConfig}
        style={{ width: '100%', height: '100%' }}
      >
        <Geographies geography={topology}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const countryId = String(geo.id);
              const visited = isVisited(countryId);
              const countryName =
                (geo.properties as { name?: string })?.name ?? countryId;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  aria-label={countryName}
                  onClick={() => onToggle(countryId)}
                  style={{
                    default: {
                      fill: visited ? COLORS.yellow : COLORS.bg,
                      stroke: COLORS.yellow,
                      strokeWidth: 0.6,
                      outline: 'none',
                    },
                    hover: {
                      fill: visited ? COLORS.yellow : COLORS.hover,
                      stroke: COLORS.yellow,
                      strokeWidth: 1,
                      outline: 'none',
                      cursor: 'pointer',
                    },
                    pressed: {
                      fill: COLORS.yellow,
                      stroke: COLORS.yellow,
                      strokeWidth: 1,
                      outline: 'none',
                    },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}
