import { db } from './firebase';
import { doc, setDoc, getDoc, collection, writeBatch, onSnapshot } from 'firebase/firestore';
import { StoreRecord, AppSettings } from '../types';
import { BossAssignmentRecord } from '../utils/parser';
import { idbGet, idbSet } from './indexedDbCache';

const COLLECTION = 'competition_tracker';
const LOCAL_CACHE_KEY = 'tnb_firebase_cache';

export interface FirebaseDataPayload {
  realtimeStoresTinh?: StoreRecord[];
  realtimeStoresVung?: StoreRecord[];
  luykeStoresTinh?: StoreRecord[];
  luykeStoresVung?: StoreRecord[];
  bossAssignments?: BossAssignmentRecord[];
  settings?: AppSettings;
  userPreferences?: Record<string, any>;
  userFilters?: Record<string, any>;
  categoryGroups?: Record<string, string>;
  categoryOrderMap?: Record<string, number>;
  lastUpdated?: string;
  updatedBy?: string;
}

// Each dataset gets its own Firestore document so a large BOSS/store list
// never risks pushing a combined document past Firestore's 1MiB doc limit.
// Realtime/Luỹ Kế are further split by Tỉnh vs Vùng scope — they're pasted
// into two separate boxes in the UI and must persist independently instead
// of overwriting each other.
type DocKey =
  | 'realtime_stores_tinh'
  | 'realtime_stores_vung'
  | 'luyke_stores_tinh'
  | 'luyke_stores_vung'
  | 'boss_assignments'
  | 'settings'
  | 'user_preferences'
  | 'user_filters'
  | 'category_groups'
  | 'category_orders';

const FIELD_BY_DOC: Record<DocKey, keyof FirebaseDataPayload> = {
  realtime_stores_tinh: 'realtimeStoresTinh',
  realtime_stores_vung: 'realtimeStoresVung',
  luyke_stores_tinh: 'luykeStoresTinh',
  luyke_stores_vung: 'luykeStoresVung',
  boss_assignments: 'bossAssignments',
  settings: 'settings',
  user_preferences: 'userPreferences',
  user_filters: 'userFilters',
  category_groups: 'categoryGroups',
  category_orders: 'categoryOrderMap',
};

// Realtime/Luỹ Kế "Siêu Thị" scope carries a per-store categoryMap with one
// entry per ngành hàng (often 30-40), so a single store record can run
// ~3.5KB of JSON. A few hundred stores blows straight through Firestore's
// 1MiB-per-document hard limit (711 stores measured at ~2.4MB — 2.4x over)
// — setDoc then throws, the write silently never lands, and the *previous*
// (smaller, successfully-saved) snapshot re-syncs back down over the local
// state next time the listener fires. These 4 store datasets are therefore
// stored as chunked subcollections instead of one big document; everything
// else (BOSS list, settings, preferences, filters) stays well under the
// limit and keeps the simple single-document form.
const CHUNKED_STORE_DOC_KEYS = new Set<DocKey>([
  'realtime_stores_tinh',
  'realtime_stores_vung',
  'luyke_stores_tinh',
  'luyke_stores_vung',
]);
const STORE_CHUNK_SIZE = 100; // ~350KB/chunk at the ~3.5KB/record measured above — comfortable margin under 1MiB

/**
 * Recursively remove undefined fields to prevent Firestore setDoc errors
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = sanitizeForFirestore(val);
      }
    }
    return cleaned;
  }
  return obj;
}

// In-memory mirror of the localStorage cache. A full dataset (Realtime +
// Luỹ Kế, Tỉnh + Vùng, ~700+ records each) can be a few MB as JSON, and every
// save used to re-read + JSON.parse that whole blob from localStorage just to
// merge in one changed field. Keeping it in memory after the first read turns
// every subsequent save into a single JSON.stringify instead of a parse+stringify
// pair, which is what actually eats time on a full 4-box paste.
let memCache: FirebaseDataPayload | null = null;

/**
 * Read the last known full dataset from localStorage.
 * Used to hydrate the UI instantly on load, before/without a live Firestore round-trip.
 */
export function getLocalCache(): FirebaseDataPayload {
  if (memCache) return memCache;
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    memCache = raw ? JSON.parse(raw) : {};
  } catch (e) {
    memCache = {};
  }
  return memCache!;
}

function writeLocalCache(partial: Partial<FirebaseDataPayload>) {
  const merged: FirebaseDataPayload = { ...getLocalCache(), ...partial };
  memCache = merged;
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(merged));
  } catch (e) {
    // localStorage quota exceeded or unavailable — IndexedDB below has much
    // more headroom and is the fallback that actually survives this.
  }
  // Best-effort mirror to IndexedDB — higher capacity & more durable than
  // localStorage, so a full paste (hundreds of rows across 4 boxes) never
  // silently fails to persist locally even if it grows past localStorage's quota.
  void idbSet(LOCAL_CACHE_KEY, merged);
}

/**
 * Async counterpart to getLocalCache(): reads the IndexedDB mirror, which can
 * hold data that no longer fits (or was evicted) in localStorage. Call this
 * once on startup, after the synchronous localStorage hydration, to recover
 * from that situation.
 */
export async function getIndexedDbCache(): Promise<FirebaseDataPayload> {
  const cached = await idbGet<FirebaseDataPayload>(LOCAL_CACHE_KEY);
  return cached || {};
}

/**
 * Force clear all local storage & IndexedDB cache for TNB app.
 */
export async function clearAllLocalCache() {
  try {
    memCache = null;
    localStorage.removeItem(LOCAL_CACHE_KEY);
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('tnb_')) {
        localStorage.removeItem(key);
      }
    });
    await idbSet(LOCAL_CACHE_KEY, null);
  } catch (e) {
    console.error('Error clearing local cache:', e);
  }
}

function firestoreErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const reason =
    code === 'permission-denied'
      ? ' (Không đủ quyền ghi dữ liệu — tài khoản của bạn cần vai trò Editor trở lên. Liên hệ Super Admin để kiểm tra.)'
      : code
      ? ` (Mã lỗi: ${code})`
      : '';
  return `Đồng bộ lên Firebase thất bại!${reason} Dữ liệu chỉ lưu tạm trên trình duyệt này — vui lòng thử lại.`;
}

/**
 * Save a store list (Realtime/Luỹ Kế, Tỉnh or Vùng scope) as a chunked
 * subcollection: competition_tracker/{docKey}/chunks/0, /1, ... Each store
 * record can be several KB (per-category breakdown), so a few hundred stores
 * in one document would blow past Firestore's 1MiB/doc limit — splitting
 * into ~100-record chunks keeps every document comfortably under it. Any
 * chunks left over from a previous, larger save are deleted in the same
 * batch so stale records can't reappear after a shrink.
 */
async function saveChunkedStoreDataset(
  docKey: DocKey,
  stores: StoreRecord[],
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  const field = FIELD_BY_DOC[docKey];
  const lastUpdated = new Date().toISOString();

  if (!db) {
    writeLocalCache({ [field]: stores, lastUpdated, updatedBy } as Partial<FirebaseDataPayload>);
    return { success: false, error: 'Chưa kết nối được Firebase — dữ liệu chỉ lưu tạm trên trình duyệt này.' };
  }

  const newChunks: StoreRecord[][] = [];
  for (let i = 0; i < stores.length; i += STORE_CHUNK_SIZE) {
    newChunks.push(stores.slice(i, i + STORE_CHUNK_SIZE));
  }
  if (newChunks.length === 0) newChunks.push([]); // write one empty chunk so reads see "cleared", not stale old data

  try {
    const chunksRef = collection(db, COLLECTION, docKey, 'chunks');
    const batch = writeBatch(db);

    newChunks.forEach((chunk, index) => {
      batch.set(doc(chunksRef, String(index)), sanitizeForFirestore({ data: chunk, index }));
    });
    // Clear out any stale chunks left over from a previous, larger save.
    // Deleting a doc that doesn't exist is a harmless no-op in Firestore, so
    // this skips the getDocs() read-before-write round trip entirely — a
    // generous fixed lookahead comfortably covers any realistic shrink (up to
    // ~10,000 fewer records) while keeping the batch well under Firestore's
    // 500-operation cap.
    const STALE_CHUNK_LOOKAHEAD = 100;
    for (let i = newChunks.length; i < newChunks.length + STALE_CHUNK_LOOKAHEAD; i++) {
      batch.delete(doc(chunksRef, String(i)));
    }
    batch.set(doc(db, COLLECTION, docKey), { chunkCount: newChunks.length, lastUpdated, updatedBy });

    // Issue the network write first, then use the in-flight wait time to do
    // the local cache write (localStorage.setItem of a multi-MB payload isn't
    // free) — the two have no dependency on each other, so overlapping them
    // shaves the local write's cost off the total instead of paying for it
    // sequentially on top of the round trip.
    const commitPromise = batch.commit();
    writeLocalCache({ [field]: stores, lastUpdated, updatedBy } as Partial<FirebaseDataPayload>);
    await commitPromise;
    return { success: true };
  } catch (error) {
    console.error(`Firestore chunked write error [${docKey}]:`, error);
    return { success: false, error: firestoreErrorMessage(error) };
  }
}

/**
 * Save one dataset (its own Firestore document) & mirror it to localStorage.
 */
async function saveDataset(
  docKey: DocKey,
  value: any,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  const field = FIELD_BY_DOC[docKey];
  const lastUpdated = new Date().toISOString();

  if (!db) {
    writeLocalCache({ [field]: value, lastUpdated, updatedBy } as Partial<FirebaseDataPayload>);
    return { success: false, error: 'Chưa kết nối được Firebase — dữ liệu chỉ lưu tạm trên trình duyệt này.' };
  }

  try {
    const docRef = doc(db, COLLECTION, docKey);
    const sanitized = sanitizeForFirestore({ data: value, lastUpdated, updatedBy });
    // Overlap the local cache write with the in-flight network write instead
    // of paying for both sequentially — see saveChunkedStoreDataset for why.
    const setPromise = setDoc(docRef, sanitized);
    writeLocalCache({ [field]: value, lastUpdated, updatedBy } as Partial<FirebaseDataPayload>);
    await setPromise;
    return { success: true };
  } catch (error) {
    console.error(`Firestore write error [${docKey}]:`, error);
    return { success: false, error: firestoreErrorMessage(error) };
  }
}

export async function saveRealtimeStoresToFirebase(stores: StoreRecord[], updatedBy: string = 'Super Admin', scope: 'tinh' | 'vung' = 'tinh') {
  return saveChunkedStoreDataset(scope === 'vung' ? 'realtime_stores_vung' : 'realtime_stores_tinh', stores, updatedBy);
}

export async function saveLuyKeStoresToFirebase(stores: StoreRecord[], updatedBy: string = 'Super Admin', scope: 'tinh' | 'vung' = 'tinh') {
  return saveChunkedStoreDataset(scope === 'vung' ? 'luyke_stores_vung' : 'luyke_stores_tinh', stores, updatedBy);
}

export async function saveBossAssignmentsToFirebase(bossItems: BossAssignmentRecord[], updatedBy: string = 'Super Admin') {
  return saveDataset('boss_assignments', bossItems, updatedBy);
}

export async function saveSettingsToFirebase(settings: AppSettings, updatedBy: string = 'Super Admin') {
  return saveDataset('settings', settings, updatedBy);
}

export async function saveUserPreferencesToFirebase(prefs: Record<string, any>, updatedBy: string = 'Super Admin') {
  return saveDataset('user_preferences', prefs, updatedBy);
}

export async function saveUserFiltersToFirebase(filters: Record<string, any>, updatedBy: string = 'Super Admin') {
  return saveDataset('user_filters', filters, updatedBy);
}

export async function saveCategoryGroupsToFirebase(categoryGroups: Record<string, string>, updatedBy: string = 'Super Admin') {
  return saveDataset('category_groups', categoryGroups, updatedBy);
}

export async function saveCategoryOrdersToFirebase(categoryOrders: Record<string, number>, updatedBy: string = 'Super Admin') {
  return saveDataset('category_orders', categoryOrders, updatedBy);
}

/**
 * Subscribe to realtime changes in Firebase Firestore database.
 * Listens to each dataset's document (or chunk subcollection, for the store
 * datasets) independently so one large dataset never blocks or drops
 * updates from the others.
 */
export function subscribeToFirebaseData(onDataReceived: (data: FirebaseDataPayload) => void): () => void {
  if (!db) {
    console.warn('Firestore instance not ready. Using local cache only.');
    return () => {};
  }

  const unsubscribers = (Object.keys(FIELD_BY_DOC) as DocKey[]).map((docKey) => {
    const field = FIELD_BY_DOC[docKey];

    if (CHUNKED_STORE_DOC_KEYS.has(docKey)) {
      const chunksRef = collection(db!, COLLECTION, docKey, 'chunks');
      return onSnapshot(
        chunksRef,
        (snap) => {
          // Skip the optimistic echo of our OWN in-flight write: Firestore
          // applies a batch to the local cache (and fires this listener)
          // before the server round trip finishes, but the caller who
          // triggered that write already updated React state and the local
          // cache directly — reprocessing it here would re-render a
          // 700+ row table and re-stringify the local cache a second time
          // for no reason, right while the save is still in progress.
          if (snap.metadata.hasPendingWrites) return;
          if (snap.empty) {
            // Not chunked yet — this dataset may still hold data saved
            // before this dataset started being chunked (single-document
            // form, {data: [...]}). Check once so that data isn't treated
            // as lost until the next save migrates it into chunks.
            void getDoc(doc(db!, COLLECTION, docKey)).then((legacyDoc) => {
              const raw = legacyDoc.exists() ? (legacyDoc.data() as { data?: StoreRecord[] }) : null;
              if (raw?.data && Array.isArray(raw.data) && raw.data.length > 0) {
                const partial: Partial<FirebaseDataPayload> = { [field]: raw.data } as Partial<FirebaseDataPayload>;
                writeLocalCache(partial);
                onDataReceived(partial);
              }
            });
            return;
          }
          const chunks = snap.docs
            .map((chunkDoc) => {
              const raw = chunkDoc.data() as { data?: StoreRecord[]; index?: number };
              return { index: raw.index ?? Number(chunkDoc.id), data: raw.data || [] };
            })
            .sort((a, b) => a.index - b.index);
          const merged = chunks.flatMap((c) => c.data);
          const partial: Partial<FirebaseDataPayload> = { [field]: merged } as Partial<FirebaseDataPayload>;
          writeLocalCache(partial);
          onDataReceived(partial);
        },
        (error) => {
          console.warn(`Firestore subscription notice [${docKey}] (using local cache):`, error);
        }
      );
    }

    const docRef = doc(db!, COLLECTION, docKey);
    return onSnapshot(
      docRef,
      (docSnap) => {
        // Same reasoning as the chunked-collection listener above: don't
        // reprocess our own not-yet-confirmed write.
        if (docSnap.metadata.hasPendingWrites) return;
        if (docSnap.exists()) {
          const raw = docSnap.data();
          const partial: Partial<FirebaseDataPayload> = {
            [field]: raw.data,
            lastUpdated: raw.lastUpdated,
            updatedBy: raw.updatedBy,
          } as Partial<FirebaseDataPayload>;
          writeLocalCache(partial);
          onDataReceived(partial);
        }
      },
      (error) => {
        console.warn(`Firestore subscription notice [${docKey}] (using local cache):`, error);
      }
    );
  });

  return () => unsubscribers.forEach((unsub) => unsub());
}
