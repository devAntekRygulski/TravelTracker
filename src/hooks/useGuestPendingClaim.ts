import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { claimGuestPendingPhotos } from '../lib/guestUploadSession';

const POLL_MS = 2500;

/**
 * While a country panel is open in guest mode, keep claiming phone uploads
 * into IndexedDB — even if the QR overlay was remounted or briefly closed.
 */
export function useGuestPendingClaim(
  countryId: string,
  onClaimed: () => void,
): void {
  const { token, isGuest } = useAuth();
  const onClaimedRef = useRef(onClaimed);
  onClaimedRef.current = onClaimed;

  // Prefer explicit guest mode so a racing auth restore cannot stop claiming.
  const shouldClaim = isGuest || !token;

  const sync = useCallback(async () => {
    if (!shouldClaim) return;

    const claimed = await claimGuestPendingPhotos(countryId);
    if (claimed > 0) {
      onClaimedRef.current();
    }
  }, [shouldClaim, countryId]);

  useEffect(() => {
    if (!shouldClaim) return;

    let cancelled = false;
    let busy = false;

    async function tick() {
      if (busy || cancelled) return;
      busy = true;
      try {
        await sync();
      } catch (error) {
        console.warn('[guest-upload] claim tick failed', error);
      } finally {
        busy = false;
      }
    }

    void tick();
    const poll = window.setInterval(() => void tick(), POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [shouldClaim, sync]);
}
