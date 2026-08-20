/**
 * Native IndexedDB key/value cache — a higher-capacity, more durable local
 * fallback than localStorage (which is capped around ~5-10MB per origin and
 * can silently evict data). Used as a second local persistence layer beneath
 * Firestore: Firestore is the cross-device source of truth, IndexedDB keeps
 * the last known full dataset available offline / before the Firestore
 * round-trip completes, even if localStorage's quota is exceeded.
 */
const DB_NAME = 'tnb_thidua_cache';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available in this environment'));
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error('IndexedDB open timed out'));
    }, 2500);

    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const idb = req.result;
        if (!idb.objectStoreNames.contains(STORE_NAME)) {
          idb.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = () => {
        clearTimeout(timer);
        reject(req.error);
      };
      req.onblocked = () => {
        clearTimeout(timer);
        reject(new Error('IndexedDB blocked'));
      };
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const idb = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn(`IndexedDB get('${key}') failed:`, e);
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const idb = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn(`IndexedDB set('${key}') failed:`, e);
  }
}
