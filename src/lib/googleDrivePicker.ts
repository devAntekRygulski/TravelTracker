/**
 * Google Drive Picker: user selects images, we download them as File[].
 */

import {
  getGoogleApiKey,
  getGoogleClientId,
  GOOGLE_DRIVE_SCOPE,
  requestGoogleAccessToken,
} from './googleAuth';

const PICKER_SCRIPT = 'https://apis.google.com/js/api.js';

let pickerLoadPromise: Promise<void> | null = null;

function loadPickerApi(): Promise<void> {
  if (window.google?.picker) {
    return Promise.resolve();
  }

  if (!pickerLoadPromise) {
    pickerLoadPromise = new Promise((resolve, reject) => {
      const finish = () => {
        if (!window.gapi) {
          reject(new Error('Google API script failed to load'));
          return;
        }
        window.gapi.load('picker', () => {
          if (!window.google?.picker) {
            reject(new Error('Google Picker failed to initialize'));
            return;
          }
          resolve();
        });
      };

      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${PICKER_SCRIPT}"]`,
      );
      if (existing) {
        if (window.gapi) {
          finish();
        } else {
          existing.addEventListener('load', finish, { once: true });
          existing.addEventListener(
            'error',
            () => reject(new Error('Failed to load Google Picker script')),
            { once: true },
          );
        }
        return;
      }

      const script = document.createElement('script');
      script.src = PICKER_SCRIPT;
      script.async = true;
      script.onload = finish;
      script.onerror = () =>
        reject(new Error('Failed to load Google Picker script'));
      document.head.appendChild(script);
    });
  }

  return pickerLoadPromise;
}

async function downloadDriveFile(
  fileId: string,
  name: string,
  mimeType: string,
  accessToken: string,
): Promise<File> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to download ${name} from Google Drive`);
  }

  const blob = await response.blob();
  const type = mimeType || blob.type || 'image/jpeg';
  return new File([blob], name || `drive-photo-${fileId}.jpg`, { type });
}

interface PickedDriveDoc {
  id: string;
  name: string;
  mimeType: string;
}

function openDriveImagePicker(accessToken: string): Promise<PickedDriveDoc[]> {
  const pickerApi = window.google?.picker;
  if (!pickerApi) {
    return Promise.reject(new Error('Google Picker is unavailable'));
  }

  const apiKey = getGoogleApiKey();
  const clientId = getGoogleClientId();
  // App ID is the numeric project id prefix of the client id (before "-").
  const appId = clientId.includes('-')
    ? clientId.slice(0, clientId.indexOf('-'))
    : clientId;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (result: PickedDriveDoc[]) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(result);
    };

    const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS_IMAGES)
      .setIncludeFolders(true)
      .setMimeTypes('image/png,image/jpeg,image/jpg,image/webp,image/gif');

    const picker = new pickerApi.PickerBuilder()
      .addView(view)
      .enableFeature(pickerApi.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setCallback((data) => {
        const action = data[pickerApi.Response.ACTION] as string | undefined;

        if (action === pickerApi.Action.CANCEL) {
          settle([]);
          return;
        }

        if (action !== pickerApi.Action.PICKED) {
          return;
        }

        const documents = (data[pickerApi.Response.DOCUMENTS] ?? []) as Array<
          Record<string, string>
        >;

        settle(
          documents.map((doc) => ({
            id: doc[pickerApi.Document.ID],
            name: doc[pickerApi.Document.NAME] || 'photo.jpg',
            mimeType: doc[pickerApi.Document.MIME_TYPE] || 'image/jpeg',
          })),
        );
      })
      .build();

    picker.setVisible(true);

    // Safety: if the picker UI fails silently, don't hang forever.
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Google Drive picker timed out'));
    }, 5 * 60 * 1000);
  });
}

/** Open Drive picker and return selected images as File objects. */
export async function pickImagesFromGoogleDrive(): Promise<File[]> {
  const accessToken = await requestGoogleAccessToken(GOOGLE_DRIVE_SCOPE);
  await loadPickerApi();

  const picked = await openDriveImagePicker(accessToken);
  if (picked.length === 0) {
    return [];
  }

  const files: File[] = [];
  for (const doc of picked) {
    files.push(
      await downloadDriveFile(doc.id, doc.name, doc.mimeType, accessToken),
    );
  }

  return files;
}
