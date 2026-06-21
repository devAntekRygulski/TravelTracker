import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'visitedCountries';

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function saveVisited(visited: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
}

export function useVisitedCountries() {
  const [visited, setVisited] = useState<Set<string>>(loadVisited);

  useEffect(() => {
    saveVisited(visited);
  }, [visited]);

  const toggle = useCallback((countryId: string) => {
    setVisited((prev) => {
      const next = new Set(prev);
      if (next.has(countryId)) {
        next.delete(countryId);
      } else {
        next.add(countryId);
      }
      return next;
    });
  }, []);

  const isVisited = useCallback(
    (countryId: string) => visited.has(countryId),
    [visited],
  );

  return {
    visited,
    count: visited.size,
    toggle,
    isVisited,
  };
}
