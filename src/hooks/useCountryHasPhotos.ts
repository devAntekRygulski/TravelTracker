import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../lib/api';
import { listGuestCountriesWithPhotos } from '../lib/guestPhotos';
import { useAuth } from './useAuth';

/** Per-account cache of whether a country has photos. */
const photoPresenceCache = new Map<string, boolean>();
/** Accounts for which the full presence map has been loaded. */
const prefetchedAccounts = new Set<string>();
const prefetchInFlight = new Map<string, Promise<void>>();

let presenceVersion = 0;
const presenceListeners = new Set<() => void>();

function bumpPresence(): void {
  presenceVersion += 1;
  for (const listener of presenceListeners) {
    listener();
  }
}

function subscribePresence(listener: () => void): () => void {
  presenceListeners.add(listener);
  return () => {
    presenceListeners.delete(listener);
  };
}

function getPresenceVersion(): number {
  return presenceVersion;
}

function accountKeyFor(token: string | null, isGuest: boolean): string {
  return isGuest || !token ? 'guest' : token;
}

function presenceCacheKey(accountKey: string, countryId: string): string {
  return `${accountKey}|${countryId}`;
}

export function setCountryHasPhotosCache(
  countryId: string,
  hasPhotos: boolean,
  accountKey: string = 'guest',
): void {
  photoPresenceCache.set(presenceCacheKey(accountKey, countryId), hasPhotos);
  bumpPresence();
}

/**
 * Load which countries already have photos for the current account so action
 * labels are correct before the user clicks a country.
 */
export async function prefetchCountryPhotoPresence(
  token: string | null,
  isGuest: boolean,
): Promise<void> {
  const accountKey = accountKeyFor(token, isGuest);

  if (prefetchedAccounts.has(accountKey)) {
    return;
  }

  const existing = prefetchInFlight.get(accountKey);
  if (existing) {
    await existing;
    return;
  }

  const task = (async () => {
    try {
      let countryIds: string[] = [];

      try {
        countryIds =
          isGuest || !token
            ? await listGuestCountriesWithPhotos()
            : (await api.getCountriesWithPhotos(token)).countryIds;
      } catch {
        // Prefer an empty known map over leaving labels stuck on "Photos".
        countryIds = [];
      }

      // Clear previous entries for this account, then mark all with photos.
      for (const key of [...photoPresenceCache.keys()]) {
        if (key.startsWith(`${accountKey}|`)) {
          photoPresenceCache.delete(key);
        }
      }

      for (const countryId of countryIds) {
        photoPresenceCache.set(presenceCacheKey(accountKey, countryId), true);
      }

      prefetchedAccounts.add(accountKey);
      bumpPresence();
    } finally {
      prefetchInFlight.delete(accountKey);
    }
  })();

  prefetchInFlight.set(accountKey, task);
  await task;
}

export interface CountryHasPhotosState {
  hasPhotos: boolean;
  /** False only before the map-level prefetch has finished. */
  ready: boolean;
}

/** Whether the current user/guest already has photos for a country. */
export function useCountryHasPhotos(
  countryId: string | null,
): CountryHasPhotosState {
  const { token, isGuest } = useAuth();
  const accountKey = accountKeyFor(token, isGuest);
  useSyncExternalStore(subscribePresence, getPresenceVersion, getPresenceVersion);

  useEffect(() => {
    void prefetchCountryPhotoPresence(token, isGuest).catch(() => {
      // Leave ready=false until a later successful prefetch / cache write.
    });
  }, [token, isGuest]);

  if (countryId === null) {
    return { hasPhotos: false, ready: true };
  }

  const cacheKey = presenceCacheKey(accountKey, countryId);
  const cached = photoPresenceCache.get(cacheKey);
  const prefetched = prefetchedAccounts.has(accountKey);

  if (cached !== undefined) {
    return { hasPhotos: cached, ready: true };
  }

  if (prefetched) {
    // Full map loaded: absence means no photos.
    return { hasPhotos: false, ready: true };
  }

  return { hasPhotos: false, ready: false };
}
