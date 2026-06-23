import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { countVisitedContinents } from '../data/countryContinents';
import { useAuth } from './useAuth';
import { api } from '../lib/api';

const STORAGE_KEY = 'visitedCountries';

function loadGuestVisited(): Set<string> {
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

function saveGuestVisited(visited: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
}

export function useVisitedCountries() {
  const { user, token, isGuest, updateUserVisitedCountries } = useAuth();
  const [guestVisited, setGuestVisited] = useState<Set<string>>(loadGuestVisited);
  const syncRequestId = useRef(0);

  const visited = useMemo(() => {
    if (user) {
      return new Set(user.visitedCountries);
    }

    return guestVisited;
  }, [user, guestVisited]);

  useEffect(() => {
    if (isGuest && !user) {
      saveGuestVisited(guestVisited);
    }
  }, [guestVisited, isGuest, user]);

  const persistVisited = useCallback(
    async (visitedCountries: string[]) => {
      if (!token) {
        return;
      }

      const requestId = ++syncRequestId.current;

      try {
        const response = await api.updateVisitedCountries(token, visitedCountries);

        if (requestId === syncRequestId.current) {
          updateUserVisitedCountries(response.visitedCountries);
        }
      } catch (error) {
        console.error('Failed to sync visited countries:', error);
      }
    },
    [token, updateUserVisitedCountries],
  );

  const toggle = useCallback(
    (countryId: string) => {
      if (user && token) {
        const next = new Set(user.visitedCountries);

        if (next.has(countryId)) {
          next.delete(countryId);
        } else {
          next.add(countryId);
        }

        updateUserVisitedCountries([...next]);
        void persistVisited([...next]);
        return;
      }

      setGuestVisited((prev) => {
        const next = new Set(prev);

        if (next.has(countryId)) {
          next.delete(countryId);
        } else {
          next.add(countryId);
        }

        return next;
      });
    },
    [user, token, persistVisited, updateUserVisitedCountries],
  );

  const isVisited = useCallback(
    (countryId: string) => visited.has(countryId),
    [visited],
  );

  const continentCount = useMemo(
    () => countVisitedContinents(visited),
    [visited],
  );

  return {
    visited,
    count: visited.size,
    continentCount,
    toggle,
    isVisited,
  };
}
