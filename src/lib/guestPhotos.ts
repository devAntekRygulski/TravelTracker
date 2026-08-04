/**
 * Browser-only photo storage for guests (no account): blobs live in
 * IndexedDB keyed by country, and are never synced to the cloud.
 */

const DB_NAME = 'country-tracker-guest-photos';
const DB_VERSION = 1;
const STORE = 'photos';

export interface GuestPhotoRecord {
  id: string;
  countryId: string;
  blob: Blob;
  contentType: string;
  size: number;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('countryId', 'countryId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB error'));
  });
}

function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB error'));
  });
}

export async function listGuestPhotos(
  countryId: string,
): Promise<GuestPhotoRecord[]> {
  const db = await openDb();

  try {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const records = await awaitRequest(
      store.index('countryId').getAll(countryId) as IDBRequest<GuestPhotoRecord[]>,
    );

    return records.sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}

export async function addGuestPhotos(
  countryId: string,
  files: Blob[],
): Promise<GuestPhotoRecord[]> {
  const db = await openDb();

  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const created: GuestPhotoRecord[] = [];

    for (const file of files) {
      const record: GuestPhotoRecord = {
        id: crypto.randomUUID(),
        countryId,
        blob: file,
        contentType: file.type,
        size: file.size,
        createdAt: Date.now(),
      };

      store.put(record);
      created.push(record);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB error'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'));
    });

    return created;
  } finally {
    db.close();
  }
}

export async function deleteGuestPhoto(id: string): Promise<void> {
  const db = await openDb();

  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB error'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'));
    });
  } finally {
    db.close();
  }
}
