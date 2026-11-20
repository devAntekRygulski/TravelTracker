export const REALISTIC_MODE_STORAGE_KEY = 'map-realistic-mode';

export function getStoredRealisticMode(): boolean {
  try {
    return localStorage.getItem(REALISTIC_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setStoredRealisticMode(enabled: boolean): void {
  try {
    localStorage.setItem(REALISTIC_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore quota / private-mode failures.
  }
}
