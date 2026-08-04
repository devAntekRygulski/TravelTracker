import { api, type CreatedUploadSession } from '../lib/api';
import { addGuestPhotos } from './guestPhotos';

const STORAGE_PREFIX = 'guestUploadSessions:';
const MAX_STORED_SESSIONS = 8;

export interface GuestUploadSessionRecord {
  token: string;
  expiresAt: number;
}

function storageKey(countryId: string): string {
  return `${STORAGE_PREFIX}${countryId}`;
}

function readStoredSessions(countryId: string): GuestUploadSessionRecord[] {
  try {
    const raw = sessionStorage.getItem(storageKey(countryId));
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed
      .filter(
        (item): item is GuestUploadSessionRecord =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as GuestUploadSessionRecord).token === 'string' &&
          typeof (item as GuestUploadSessionRecord).expiresAt === 'number',
      )
      .filter((item) => item.expiresAt > now);
  } catch {
    return [];
  }
}

function writeStoredSessions(
  countryId: string,
  sessions: GuestUploadSessionRecord[],
): void {
  const now = Date.now();
  const next = sessions
    .filter((session) => session.expiresAt > now)
    .slice(0, MAX_STORED_SESSIONS);

  sessionStorage.setItem(storageKey(countryId), JSON.stringify(next));
}

/** Remember a guest QR session so remounts keep polling the same token. */
export function rememberGuestUploadSession(
  countryId: string,
  token: string,
  expiresAt: number,
): void {
  const existing = readStoredSessions(countryId).filter(
    (session) => session.token !== token,
  );
  writeStoredSessions(countryId, [{ token, expiresAt }, ...existing]);
}

/**
 * Reuse a still-valid guest session for this country, refreshing the public
 * upload URL (important when the Cloudflare tunnel hostname changes).
 */
export async function restoreGuestUploadSession(
  countryId: string,
): Promise<CreatedUploadSession | null> {
  const remembered = readStoredSessions(countryId);

  for (const entry of remembered) {
    try {
      const info = await api.getUploadSession(entry.token);
      if (info.countryId !== countryId) continue;

      const expiresAt = new Date(info.expiresAt).getTime();
      if (expiresAt <= Date.now()) continue;

      rememberGuestUploadSession(countryId, entry.token, expiresAt);

      return {
        token: entry.token,
        expiresAt: info.expiresAt,
        uploadUrl: info.uploadUrl,
      };
    } catch {
      // Expired or missing — try the next remembered token.
    }
  }

  return null;
}

async function claimToken(
  countryId: string,
  sessionToken: string,
): Promise<number> {
  const { photos } = await api.getPendingSessionPhotos(sessionToken);
  let claimed = 0;

  for (const pending of photos) {
    const blob = await api.downloadPendingSessionPhoto(
      sessionToken,
      pending.id,
    );
    await addGuestPhotos(countryId, [blob]);
    await api.deletePendingSessionPhoto(sessionToken, pending.id);
    claimed += 1;
  }

  return claimed;
}

/** Pull phone uploads for remembered + server-side unclaimed guest sessions. */
export async function claimGuestPendingPhotos(
  countryId: string,
): Promise<number> {
  const tokenSet = new Map<string, number>();

  for (const session of readStoredSessions(countryId)) {
    tokenSet.set(session.token, session.expiresAt);
  }

  try {
    const { sessions } = await api.listGuestPendingSessions(countryId);
    for (const session of sessions) {
      const expiresAt = new Date(session.expiresAt).getTime();
      tokenSet.set(session.token, expiresAt);
      rememberGuestUploadSession(countryId, session.token, expiresAt);
    }
  } catch (error) {
    console.warn('[guest-upload] Could not list pending sessions', error);
  }

  let claimed = 0;

  for (const token of tokenSet.keys()) {
    try {
      claimed += await claimToken(countryId, token);
    } catch (error) {
      console.warn('[guest-upload] Failed to claim session', token.slice(0, 8), error);
    }
  }

  if (claimed > 0) {
    console.info(`[guest-upload] Claimed ${claimed} photo(s) for country ${countryId}`);
  }

  return claimed;
}
