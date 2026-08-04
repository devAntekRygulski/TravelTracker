import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { listGuestPhotos } from '../lib/guestPhotos';
import { useAuth } from './useAuth';

/** Whether the current user/guest already has photos for a country. */
export function useCountryHasPhotos(countryId: string | null): boolean {
  const { token, isGuest } = useAuth();
  const [hasPhotos, setHasPhotos] = useState(false);

  useEffect(() => {
    if (!countryId) {
      setHasPhotos(false);
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        if (isGuest || !token) {
          const records = await listGuestPhotos(countryId!);
          if (!cancelled) {
            setHasPhotos(records.length > 0);
          }
          return;
        }

        const { photos } = await api.getCountryPhotos(token, countryId!);
        if (!cancelled) {
          setHasPhotos(photos.length > 0);
        }
      } catch {
        if (!cancelled) {
          setHasPhotos(false);
        }
      }
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, [countryId, token, isGuest]);

  return hasPhotos;
}
