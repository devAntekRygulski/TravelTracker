import { useEffect, useState } from 'react';
import { REGION_MAP_URL, type RegionMapData } from '../data/regionData';

let regionMapCache: RegionMapData | null = null;
let regionMapPromise: Promise<RegionMapData> | null = null;

function loadRegionMap(): Promise<RegionMapData> {
  if (regionMapCache) {
    return Promise.resolve(regionMapCache);
  }

  if (!regionMapPromise) {
    regionMapPromise = fetch(REGION_MAP_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load regional map data');
        }
        return response.json() as Promise<RegionMapData>;
      })
      .then((loaded) => {
        regionMapCache = loaded;
        return loaded;
      })
      .catch((error) => {
        regionMapPromise = null;
        throw error;
      });
  }

  return regionMapPromise;
}

/** Warm the regional dataset so the first toggle is mostly prepare-time. */
export function prefetchRegionMap(): void {
  void loadRegionMap().catch(() => {
    // Prefetch is best-effort; the hook surfaces errors on demand.
  });
}

export function useRegionGeoData(enabled: boolean) {
  const [data, setData] = useState<RegionMapData | null>(regionMapCache);
  const [isLoading, setIsLoading] = useState(enabled && !regionMapCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (regionMapCache) {
      setData(regionMapCache);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setError(null);

    loadRegionMap()
      .then((loaded) => {
        if (!cancelled) {
          setData(loaded);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load regional map data',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    admin1: enabled ? data?.regions ?? null : null,
    admin1InnerBorders: enabled ? data?.innerBorders ?? null : null,
    topCities: enabled ? data?.topCities ?? null : null,
    isLoading,
    error,
  };
}
