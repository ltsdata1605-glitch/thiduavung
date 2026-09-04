import { db } from './firebase';
import { doc, setDoc, getDoc, collection, writeBatch, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { StoreRecord, AppSettings, RemarkTemplateConfig, DEFAULT_REMARK_CONFIG, RevenueCungKyRecord } from '../types';
import { BossAssignmentRecord } from '../utils/parser';
import { idbGet, idbSet } from './indexedDbCache';

const COLLECTION = 'competition_tracker';
const LOCAL_CACHE_KEY = 'tnb_firebase_cache';

export interface FirebaseDataPayload {
  realtimeStoresVung?: StoreRecord[];
  luykeStoresVung?: StoreRecord[];
  realtimeDtStores?: StoreRecord[];
  realtimeTcStores?: StoreRecord[];
  luykeDtStores?: StoreRecord[];
  luykeTcStores?: StoreRecord[];
  lastUpdateRealtimeDt?: string;
  lastUpdateRealtimeTc?: string;
  lastUpdateLuyKeDt?: string;
  lastUpdateLuyKeTc?: string;
  bossAssignments?: BossAssignmentRecord[];
  revenueCungKy?: RevenueCungKyRecord[];
  lastUpdateRevenueCungKy?: string;
  settings?: AppSettings;
  userPreferences?: Record<string, any>;
  userFilters?: Record<string, any>;
  categoryGroups?: Record<string, string>;
  categoryOrderMap?: Record<string, number>;
  categoryDisplayNames?: Record<string, string>;
  categoryHiddenMap?: Record<string, boolean>;
  groupSummaryCards?: any[];
  lastUpdated?: string;
  updatedBy?: string;
}

// Each dataset gets its own Firestore document so a large BOSS/store list
// never risks pushing a combined document past Firestore's 1MiB doc limit.
export type DocKey =
  | 'realtime_stores_vung'
  | 'luyke_stores_vung'
  | 'realtime_revenue_dt'
  | 'realtime_revenue_tc'
  | 'luyke_revenue_dt'
  | 'luyke_revenue_tc'
  | 'boss_assignments'
  | 'revenue_cung_ky'
  | 'settings'
  | 'user_preferences'
  | 'user_filters'
  | 'category_groups'
  | 'category_orders'
  | 'category_display_names'
  | 'category_hidden'
  | 'group_summary_cards';

const FIELD_BY_DOC: Record<DocKey, keyof FirebaseDataPayload> = {
  realtime_stores_vung: 'realtimeStoresVung',
  luyke_stores_vung: 'luykeStoresVung',
  realtime_revenue_dt: 'realtimeDtStores',
  realtime_revenue_tc: 'realtimeTcStores',
  luyke_revenue_dt: 'luykeDtStores',
  luyke_revenue_tc: 'luykeTcStores',
  boss_assignments: 'bossAssignments',
  revenue_cung_ky: 'revenueCungKy',
  settings: 'settings',
  user_preferences: 'userPreferences',
  user_filters: 'userFilters',
  category_groups: 'categoryGroups',
  category_orders: 'categoryOrderMap',
  category_display_names: 'categoryDisplayNames',
  category_hidden: 'categoryHiddenMap',
  group_summary_cards: 'groupSummaryCards',
};

// Realtime/Luỹ Kế "Siêu Thị" scope carries a per-store categoryMap with one
// entry per ngành hàng (often 30-40), so a single store record can run
// ~3.5KB of JSON. A few hundred stores blows straight through Firestore's
// 1MiB-per-document hard limit (711 stores measured at ~2.4MB — 2.4x over)
// — setDoc then throws, the write silently never lands, and the *previous*
// (smaller, successfully-saved) snapshot re-syncs back down over the local
// state next time the listener fires. These store datasets are therefore
// stored as chunked subcollections instead of one big document; everything
// else (BOSS list, settings, preferences, filters) stays well under the
// limit and keeps the simple single-document form.
const CHUNKED_STORE_DOC_KEYS = new Set<DocKey>([
  'realtime_stores_vung',
  'luyke_stores_vung',
  'realtime_revenue_dt',
  'realtime_revenue_tc',
  'luyke_revenue_dt',
  'luyke_revenue_tc',
  'revenue_cung_ky',
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

// Debounce the actual disk write (localStorage.setItem + IndexedDB), separate
// from the in-memory update. subscribeToFirebaseData runs 12 independent
// onSnapshot listeners, and a single save on another device typically touches
// several of them (store data + settings) within milliseconds of each other —
// each used to trigger its own full JSON.stringify + localStorage.setItem of
// the ENTIRE multi-MB cached payload (all 4 store datasets combined), even
// when only e.g. settings changed. That's redundant main-thread work exactly
// when several updates are landing at once. memCache itself still updates
// synchronously below, so getLocalCache() is always immediately correct —
// only the slower disk persistence is coalesced.
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 150;

function flushLocalCachePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!memCache) return;
  try {
    // Không ghi revenueCungKy (hàng chục nghìn dòng, >4MB) vào localStorage để tránh QuotaExceededError và nghẽn main thread
    const { revenueCungKy, ...cacheWithoutCungKy } = memCache;
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cacheWithoutCungKy));
  } catch (e) {
    // localStorage quota exceeded or unavailable — IndexedDB below has much
    // more headroom and is the fallback that actually survives this.
  }
  void idbSet(LOCAL_CACHE_KEY, memCache);
  if (memCache.revenueCungKy && memCache.revenueCungKy.length > 0) {
    void idbSet('tnb_revenue_cung_ky', memCache.revenueCungKy);
  }
}

if (typeof window !== 'undefined') {
  // Flush synchronously before the tab actually closes so a debounced write
  // still in flight isn't silently lost — localStorage.setItem is synchronous
  // and safe to call here, unlike the IndexedDB write inside it.
  window.addEventListener('pagehide', flushLocalCachePersist);
}

function writeLocalCache(partial: Partial<FirebaseDataPayload>) {
  const merged: FirebaseDataPayload = { ...getLocalCache(), ...partial };
  memCache = merged;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushLocalCachePersist, PERSIST_DEBOUNCE_MS);
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
async function saveChunkedStoreDataset<T>(
  docKey: DocKey,
  stores: T[],
  updatedBy: string,
  customLastUpdated?: string
): Promise<{ success: boolean; error?: string }> {
  const field = FIELD_BY_DOC[docKey];
  const lastUpdated = new Date().toISOString();

  const tsField =
    docKey === 'realtime_revenue_dt' ? 'lastUpdateRealtimeDt' :
    docKey === 'realtime_revenue_tc' ? 'lastUpdateRealtimeTc' :
    docKey === 'luyke_revenue_dt' ? 'lastUpdateLuyKeDt' :
    docKey === 'luyke_revenue_tc' ? 'lastUpdateLuyKeTc' : undefined;

  const localPayload: any = { [field]: stores, lastUpdated, updatedBy };
  if (tsField && customLastUpdated) {
    localPayload[tsField] = customLastUpdated;
  }

  if (!db) {
    writeLocalCache(localPayload as Partial<FirebaseDataPayload>);
    return { success: false, error: 'Chưa kết nối được Firebase — dữ liệu chỉ lưu tạm trên trình duyệt này.' };
  }

  const isCungKy = docKey === 'revenue_cung_ky';
  const chunkSize = isCungKy ? 1000 : STORE_CHUNK_SIZE;

  const newChunks: T[][] = [];
  for (let i = 0; i < stores.length; i += chunkSize) {
    newChunks.push(stores.slice(i, i + chunkSize));
  }
  if (newChunks.length === 0) newChunks.push([]); // write one empty chunk so reads see "cleared", not stale old data

  try {
    const chunksRef = collection(db, COLLECTION, docKey, 'chunks');

    // With large datasets (20k+ rows, e.g. revenue_cung_ky), writing all 20+ chunks
    // in a single batch easily exceeds Firestore's 10MB batch/request limits.
    // Chunking into smaller batches of 4 documents ensures fast, reliable commits.
    const BATCH_SIZE_LIMIT = isCungKy ? 4 : 50;
    for (let bStart = 0; bStart < newChunks.length; bStart += BATCH_SIZE_LIMIT) {
      const batch = writeBatch(db);
      const bEnd = Math.min(bStart + BATCH_SIZE_LIMIT, newChunks.length);
      for (let index = bStart; index < bEnd; index++) {
        const chunk = newChunks[index];
        const chunkData = isCungKy
          ? (chunk as any[]).map((r) => ({
              id: r.id || '',
              maKho: r.maKho || '',
              ngay: r.ngay || '',
              doanhThu: Number(r.doanhThu) || 0,
              doanhThuQd: Number(r.doanhThuQd) || 0,
              sieuthi: r.sieuthi || '',
              tinh: r.tinh || '',
              kenh: r.kenh || '',
              boss: r.boss || '',
              phanLoaiShop: r.phanLoaiShop || '',
            }))
          : sanitizeForFirestore({ data: chunk, index }).data;
        batch.set(doc(chunksRef, String(index)), { data: chunkData, index });
      }
      await batch.commit();
    }

    // Clean up any stale chunks leftover from a previously larger dataset
    const previousStores = (getLocalCache()[field] as T[] | undefined) || [];
    const previousChunkCount = previousStores.length > 0 ? Math.ceil(previousStores.length / chunkSize) : 0;
    const STALE_CHUNK_SAFETY_MARGIN = 10;
    const staleChunkLookaheadEnd = Math.max(newChunks.length, previousChunkCount) + STALE_CHUNK_SAFETY_MARGIN;
    if (staleChunkLookaheadEnd > newChunks.length) {
      const delBatch = writeBatch(db);
      for (let i = newChunks.length; i < staleChunkLookaheadEnd; i++) {
        delBatch.delete(doc(chunksRef, String(i)));
      }
      await delBatch.commit();
    }

    // Write main doc metadata
    await setDoc(doc(db, COLLECTION, docKey), {
      chunkCount: newChunks.length,
      lastUpdated: serverTimestamp(),
      customLastUpdated: customLastUpdated || null,
      updatedBy,
    });

    writeLocalCache(localPayload as Partial<FirebaseDataPayload>);
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
    const sanitized = { ...sanitizeForFirestore({ data: value, updatedBy }), lastUpdated: serverTimestamp() };
    const setPromise = setDoc(docRef, sanitized);
    writeLocalCache({ [field]: value, lastUpdated, updatedBy } as Partial<FirebaseDataPayload>);
    await setPromise;
    return { success: true };
  } catch (error) {
    console.error(`Firestore write error [${docKey}]:`, error);
    return { success: false, error: firestoreErrorMessage(error) };
  }
}

export async function saveRealtimeStoresToFirebase(stores: StoreRecord[], updatedBy: string = 'Super Admin') {
  return saveChunkedStoreDataset('realtime_stores_vung', stores, updatedBy);
}

export async function saveLuyKeStoresToFirebase(stores: StoreRecord[], updatedBy: string = 'Super Admin') {
  return saveChunkedStoreDataset('luyke_stores_vung', stores, updatedBy);
}

export async function saveRealtimeDtToFirebase(stores: StoreRecord[], lastUpdated: string, updatedBy: string = 'Super Admin') {
  return saveChunkedStoreDataset('realtime_revenue_dt', stores, updatedBy, lastUpdated);
}

export async function saveRealtimeTcToFirebase(stores: StoreRecord[], lastUpdated: string, updatedBy: string = 'Super Admin') {
  return saveChunkedStoreDataset('realtime_revenue_tc', stores, updatedBy, lastUpdated);
}

export async function saveLuyKeDtToFirebase(stores: StoreRecord[], lastUpdated: string, updatedBy: string = 'Super Admin') {
  return saveChunkedStoreDataset('luyke_revenue_dt', stores, updatedBy, lastUpdated);
}

export async function saveLuyKeTcToFirebase(stores: StoreRecord[], lastUpdated: string, updatedBy: string = 'Super Admin') {
  return saveChunkedStoreDataset('luyke_revenue_tc', stores, updatedBy, lastUpdated);
}

export async function saveBossAssignmentsToFirebase(bossItems: BossAssignmentRecord[], updatedBy: string = 'Super Admin') {
  return saveDataset('boss_assignments', bossItems, updatedBy);
}

export async function saveRevenueCungKyToFirebase(records: RevenueCungKyRecord[], updatedBy: string = 'Super Admin') {
  // Doanh thu cùng kỳ is one row per siêu thị per NGÀY — a full month across
  // ~700 siêu thị is 20k+ records, easily several MB serialized. It's
  // already listed in CHUNKED_STORE_DOC_KEYS (the read side expects chunks —
  // see subscribeToFirebaseData) but was still being written through
  // saveDataset as a single document, which silently exceeds Firestore's
  // 1MiB/doc limit and hangs/fails the upload instead of chunking it.
  return saveChunkedStoreDataset('revenue_cung_ky', records, updatedBy);
}

export async function saveSettingsToFirebase(settings: AppSettings, updatedBy: string = 'Super Admin') {
  return saveDataset('settings', settings, updatedBy);
}

export async function saveUserPreferencesToFirebase(prefs: Record<string, any>, updatedBy: string = 'Super Admin') {
  return saveDataset('user_preferences', prefs, updatedBy);
}

const REMARK_CONFIG_STORAGE_KEY = 'tnb_remark_template_config';

// Mỗi tài khoản có mẫu nhận xét riêng — namespace theo accountId để tránh
// 2 tài khoản dùng chung 1 trình duyệt bị lẫn cấu hình của nhau. Fallback về
// key cũ (không namespace) khi tài khoản này chưa từng lưu riêng, để không
// mất cấu hình đã lưu từ trước khi có accountId-scoping.
function remarkConfigStorageKey(accountId?: string): string {
  return accountId && accountId !== 'global' ? `${REMARK_CONFIG_STORAGE_KEY}_${accountId}` : REMARK_CONFIG_STORAGE_KEY;
}

export function getLocalRemarkConfig(accountId?: string): RemarkTemplateConfig {
  try {
    const raw = localStorage.getItem(remarkConfigStorageKey(accountId)) || localStorage.getItem(REMARK_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        displayMode: parsed.displayMode || DEFAULT_REMARK_CONFIG.displayMode,
        templateType: parsed.templateType || DEFAULT_REMARK_CONFIG.templateType,
        includeEmoji: parsed.includeEmoji !== false,
        includeCallToAction: parsed.includeCallToAction !== false,
        botCount: Number.isFinite(parsed.botCount) && parsed.botCount > 0 ? parsed.botCount : DEFAULT_REMARK_CONFIG.botCount,
      };
    }
  } catch (e) {}
  return DEFAULT_REMARK_CONFIG;
}

export async function saveRemarkConfigToFirebaseAndLocal(
  config: RemarkTemplateConfig,
  currentPrefs: Record<string, any> = {},
  accountId: string = 'global',
  updatedBy: string = 'User'
): Promise<{ success: boolean; error?: string }> {
  try {
    localStorage.setItem(remarkConfigStorageKey(accountId), JSON.stringify(config));
  } catch (e) {}

  const updatedPrefs = {
    ...currentPrefs,
    [accountId]: {
      ...(currentPrefs[accountId] || {}),
      remarkConfig: config,
    },
    global_remark_config: config,
  };

  return saveUserPreferencesToFirebase(updatedPrefs, updatedBy);
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

export async function saveCategoryDisplayNamesToFirebase(categoryDisplayNames: Record<string, string>, updatedBy: string = 'Super Admin') {
  return saveDataset('category_display_names', categoryDisplayNames, updatedBy);
}

export async function saveCategoryHiddenToFirebase(categoryHiddenMap: Record<string, boolean>, updatedBy: string = 'Super Admin') {
  return saveDataset('category_hidden', categoryHiddenMap, updatedBy);
}

export async function saveGroupSummaryCardsToFirebase(cards: any[], updatedBy: string = 'Super Admin') {
  return saveDataset('group_summary_cards', cards, updatedBy);
}

export interface FirebaseUpdateMeta {
  // False for the very first snapshot each listener delivers on attach
  // (that's just normal initial load, not a "someone else changed this"
  // event) — true for every snapshot after that, i.e. a genuine remote
  // change pushed while this device already had the listener open.
  isInitial: boolean;
  docKey: DocKey;
}

/**
 * Subscribe to realtime changes in Firebase Firestore database.
 * Listens to each dataset's document (or chunk subcollection, for the store
 * datasets) independently so one large dataset never blocks or drops
 * updates from the others.
 */
export function subscribeToFirebaseData(
  onDataReceived: (data: FirebaseDataPayload, meta: FirebaseUpdateMeta) => void
): () => void {
  if (!db) {
    console.warn('Firestore instance not ready. Using local cache only.');
    return () => {};
  }

  const unsubscribers = (Object.keys(FIELD_BY_DOC) as DocKey[]).map((docKey) => {
    const field = FIELD_BY_DOC[docKey];
    // Captured per docKey by this listener's own closure — the first
    // snapshot flips it, every later one for this same docKey sees it true.
    let hasSeenFirstSnapshot = false;

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
          const isInitial = !hasSeenFirstSnapshot;
          hasSeenFirstSnapshot = true;
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
                onDataReceived(partial, { isInitial, docKey });
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

          const tsField =
            docKey === 'realtime_revenue_dt' ? 'lastUpdateRealtimeDt' :
            docKey === 'realtime_revenue_tc' ? 'lastUpdateRealtimeTc' :
            docKey === 'luyke_revenue_dt' ? 'lastUpdateLuyKeDt' :
            docKey === 'luyke_revenue_tc' ? 'lastUpdateLuyKeTc' : undefined;

          void getDoc(doc(db!, COLLECTION, docKey)).then((metaDoc) => {
            const metaData = metaDoc.exists() ? metaDoc.data() : null;
            const customTs = metaData?.customLastUpdated as string | undefined;
            const partial: Partial<FirebaseDataPayload> = { [field]: merged } as Partial<FirebaseDataPayload>;
            if (tsField && customTs) {
              (partial as any)[tsField] = customTs;
            }
            writeLocalCache(partial);
            onDataReceived(partial, { isInitial, docKey });
          });
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
        const isInitial = !hasSeenFirstSnapshot;
        hasSeenFirstSnapshot = true;
        if (docSnap.exists()) {
          const raw = docSnap.data();
          // lastUpdated is a Firestore server Timestamp now (was a client ISO
          // string) — normalize back to ISO string so every consumer downstream
          // keeps working with a plain string regardless of which form a given
          // document was last written with (old docs may still hold a string).
          const rawLastUpdated = raw.lastUpdated;
          const lastUpdatedIso = rawLastUpdated instanceof Timestamp ? rawLastUpdated.toDate().toISOString() : rawLastUpdated;
          const partial: Partial<FirebaseDataPayload> = {
            [field]: raw.data,
            lastUpdated: lastUpdatedIso,
            updatedBy: raw.updatedBy,
          } as Partial<FirebaseDataPayload>;
          writeLocalCache(partial);
          onDataReceived(partial, { isInitial, docKey });
        }
      },
      (error) => {
        console.warn(`Firestore subscription notice [${docKey}] (using local cache):`, error);
      }
    );
  });

  return () => unsubscribers.forEach((unsub) => unsub());
}
