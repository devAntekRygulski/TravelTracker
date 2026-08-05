import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  addGuestPhotos,
  deleteGuestPhoto,
  listGuestPhotos,
} from '../lib/guestPhotos';
import { setCountryHasPhotosCache } from './useCountryHasPhotos';
import { useAuth } from './useAuth';

export interface CountryPhotoItem {
  id: string;
  url: string;
}

interface CountryPhotosState {
  /** Identifies which country/account this state belongs to. */
  key: string;
  photos: CountryPhotoItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Per-country photo gallery. Logged-in users read/write the cloud API;
 * guests read/write browser IndexedDB (object URLs, revoked on cleanup).
 */
export function useCountryPhotos(countryId: string) {
  const { token, isGuest } = useAuth();
  const useGuestStorage = isGuest || !token;
  const galleryKey = `${useGuestStorage ? 'guest' : token}|${countryId}`;
  const [state, setState] = useState<CountryPhotosState>({
    key: galleryKey,
    photos: [],
    loading: true,
    error: null,
  });
  const objectUrlsRef = useRef<string[]>([]);

  // Reset during render when the country or account changes.
  if (state.key !== galleryKey) {
    setState({ key: galleryKey, photos: [], loading: true, error: null });
  }

  const revokeObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }

    objectUrlsRef.current = [];
  }, []);

  const refresh = useCallback(async () => {
    try {
      if (!useGuestStorage && token) {
        const { photos } = await api.getCountryPhotos(token, countryId);

        setCountryHasPhotosCache(
          countryId,
          photos.length > 0,
          useGuestStorage ? 'guest' : token,
        );
        setState({
          key: galleryKey,
          photos: photos.map((photo) => ({ id: photo.id, url: photo.url })),
          loading: false,
          error: null,
        });
        return;
      }

      const records = await listGuestPhotos(countryId);

      revokeObjectUrls();

      const photos = records.map((record) => {
        const url = URL.createObjectURL(record.blob);
        objectUrlsRef.current.push(url);
        return { id: record.id, url };
      });

      setCountryHasPhotosCache(countryId, photos.length > 0, 'guest');
      setState({ key: galleryKey, photos, loading: false, error: null });
    } catch (error) {
      setState({
        key: galleryKey,
        photos: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load photos',
      });
    }
  }, [useGuestStorage, token, countryId, galleryKey, revokeObjectUrls]);

  useEffect(() => {
    async function load() {
      await refresh();
    }

    void load();
  }, [refresh]);

  useEffect(() => revokeObjectUrls, [revokeObjectUrls]);

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      if (!useGuestStorage && token) {
        await api.uploadCountryPhotos(token, countryId, files);
      } else {
        await addGuestPhotos(countryId, files);
      }

      await refresh();
    },
    [useGuestStorage, token, countryId, refresh],
  );

  const remove = useCallback(
    async (photoId: string) => {
      if (!useGuestStorage && token) {
        await api.deleteCountryPhoto(token, photoId);
      } else {
        await deleteGuestPhoto(photoId);
      }

      await refresh();
    },
    [useGuestStorage, token, refresh],
  );

  return {
    photos: state.photos,
    loading: state.loading,
    error: state.error,
    upload,
    remove,
    refresh,
  };
}
