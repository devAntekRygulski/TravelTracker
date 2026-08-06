/**
 * Google Identity Services token helper for Drive / Photos pickers.
 */

interface GoogleDocsView {
  setMimeTypes: (mimeTypes: string) => GoogleDocsView;
  setIncludeFolders: (include: boolean) => GoogleDocsView;
}

interface GooglePickerBuilder {
  addView: (view: GoogleDocsView) => GooglePickerBuilder;
  enableFeature: (feature: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setCallback: (
    callback: (data: Record<string, unknown>) => void,
  ) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

export const GOOGLE_DRIVE_SCOPE =
  'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_PHOTOS_PICKER_SCOPE =
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
  scope: string;
}

const tokenCache = new Map<string, TokenCacheEntry>();

let gisLoadPromise: Promise<void> | null = null;

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              expires_in?: number;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (error: {
              type?: string;
              message?: string;
            }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: {
              prompt?: string;
            }) => void;
          };
          revoke: (token: string, done: () => void) => void;
        };
      };
      picker?: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new (viewId?: string) => GoogleDocsView;
        ViewId: { DOCS_IMAGES: string };
        Feature: { MULTISELECT_ENABLED: string; NAV_HIDDEN: string };
        Action: { PICKED: string; CANCEL: string };
        Response: { ACTION: string; DOCUMENTS: string };
        Document: { ID: string; NAME: string; MIME_TYPE: string };
      };
    };
  }
}

export function getGoogleClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId || typeof clientId !== 'string') {
    throw new Error(
      'Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID in .env.',
    );
  }
  return clientId;
}

export function getGoogleApiKey(): string {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error(
      'Google Picker is not configured. Set VITE_GOOGLE_API_KEY in .env.',
    );
  }
  return apiKey;
}

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (!gisLoadPromise) {
    gisLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${GIS_SCRIPT}"]`,
      );
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('Failed to load Google Identity Services')),
          { once: true },
        );
        return;
      }

      const script = document.createElement('script');
      script.src = GIS_SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  return gisLoadPromise;
}

function cacheKey(scope: string): string {
  return scope.split(/\s+/).sort().join(' ');
}

/** Returns a valid access token for the given OAuth scope(s). */
export async function requestGoogleAccessToken(scope: string): Promise<string> {
  const clientId = getGoogleClientId();
  await loadGisScript();

  const key = cacheKey(scope);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services failed to initialize');
  }

  return new Promise((resolve, reject) => {
    let retriedWithConsent = false;

    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          // First silent attempt can fail when the user has never consented.
          if (!retriedWithConsent) {
            retriedWithConsent = true;
            client.requestAccessToken({ prompt: 'consent' });
            return;
          }

          reject(
            new Error(
              response.error_description ||
                response.error ||
                'Google authorization was cancelled',
            ),
          );
          return;
        }

        const expiresIn = Number(response.expires_in ?? 3600);
        tokenCache.set(key, {
          token: response.access_token,
          expiresAt: Date.now() + expiresIn * 1000,
          scope,
        });
        resolve(response.access_token);
      },
      error_callback: (error) => {
        if (!retriedWithConsent) {
          retriedWithConsent = true;
          client.requestAccessToken({ prompt: 'consent' });
          return;
        }

        reject(
          new Error(error.message || error.type || 'Google authorization failed'),
        );
      },
    });

    client.requestAccessToken({ prompt: '' });
  });
}
