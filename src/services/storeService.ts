import { db, resetFirestoreLocalState } from './firebase';
import { doc, setDoc, getDocs, collection, writeBatch, onSnapshot, serverTimestamp, Timestamp, Bytes, disableNetwork, enableNetwork } from 'firebase/firestore';
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

// Các dataset LỚN (danh sách siêu thị, doanh thu, cùng kỳ). Trước đây chúng
// được cắt thành chunked subcollection để né trần 1 MiB/doc của Firestore;
// nay đã nén gzip nên nằm gọn trong MỘT document (đo được ~0,09-0,29 MiB tuỳ
// độ lặp của dữ liệu). Danh sách này giờ chỉ còn dùng để nhận biết dataset nào
// cần đọc nốt chunk cũ khi chưa được ghi lại theo định dạng nén.
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

// If the Firestore SDK's write stream gets stuck (e.g. "resource-exhausted:
// Write stream exhausted maximum allowed queued writes" after it backs off
// to its maximum retry delay), an unwrapped batch.commit()/setDoc() can hang
// silently for many minutes. Left alone, a frustrated retry just queues a
// second commit on top of the still-pending first one, making the backlog
// worse. Racing every write against a timeout turns that silent multi-minute
// hang into a fast, actionable error instead.
// Dynamic timeout: 60s base + 2s per batch to handle large datasets (20k+ rows = 100+ batches)
const FIRESTORE_WRITE_TIMEOUT_MS = 60000;

// Phục hồi khi write stream bị kẹt, theo 2 nấc.
//
// Nấc 1 — disableNetwork → enableNetwork: dựng lại WebChannel stream. Chỉ cứu
// được trường hợp stream lỗi tạm thời.
//
// Nấc 2 — dọn hẳn trạng thái Firestore trong IndexedDB (resetFirestoreLocalState).
// Cần nấc này vì timeout ở đây KHÔNG huỷ được lệnh ghi thật: lệnh vẫn nằm trong
// mutation queue của SDK và bị retry mãi. Mỗi lần người dùng thử lại là một
// lệnh nữa chồng lên, tới khi vượt giới hạn thì SDK trả "resource-exhausted:
// Write stream exhausted maximum allowed queued writes" và MỌI lệnh ghi sau đều
// chết. Do app bật persistentLocalCache, hàng đợi hỏng nằm trong IndexedDB nên
// sống qua cả F5 — reload lẫn disable/enableNetwork đều chỉ replay lại đúng
// đống lỗi đó. Vì vậy sau MAX_SOFT_RESETS lần timeout liên tiếp, ta coi như
// hàng đợi đã hỏng và đề nghị người dùng dọn sạch (thao tác này reload trang).
const MAX_SOFT_RESETS = 2;
let consecutiveTimeouts = 0;
let resettingConnection: Promise<void> | null = null;
let hardResetOffered = false;

/** Gọi khi một lượt ghi thành công — chuỗi timeout liên tiếp coi như đã đứt. */
function noteWriteSucceeded() {
  consecutiveTimeouts = 0;
}

function offerHardReset() {
  if (hardResetOffered) return;
  hardResetOffered = true;
  const ok = window.confirm(
    'Kết nối ghi dữ liệu của Firebase trên trình duyệt này đã bị kẹt (hàng đợi ghi tràn — lỗi "Write stream exhausted").\n\n' +
      'Tải lại trang (F5) KHÔNG sửa được vì hàng đợi hỏng nằm trong IndexedDB của trình duyệt.\n\n' +
      'Bấm OK để dọn sạch bộ nhớ đệm Firebase cục bộ và tự tải lại trang. Dữ liệu trên server không bị ảnh hưởng; ' +
      'chỉ các lượt lưu đang kẹt (vốn chưa từng gửi lên được) là mất, bạn cần dán lại sau khi trang tải xong.'
  );
  if (!ok) {
    hardResetOffered = false; // cho phép hỏi lại ở lần lỗi sau
    return;
  }
  void (async () => {
    const res = await resetFirestoreLocalState();
    if (!res.success) {
      window.alert(
        'Không dọn được bộ nhớ đệm Firebase (có thể do app đang mở ở tab khác). ' +
          'Vui lòng đóng hết các tab khác của app rồi thử lại.'
      );
      hardResetOffered = false;
      return;
    }
    window.location.reload();
  })();
}

function resetFirestoreConnection(): Promise<void> {
  if (!db) return Promise.resolve();
  consecutiveTimeouts++;
  if (consecutiveTimeouts > MAX_SOFT_RESETS) {
    // Soft reset đã thử đủ và vẫn timeout → hàng đợi ghi đã hỏng thật sự.
    offerHardReset();
    return Promise.resolve();
  }
  if (resettingConnection) return resettingConnection;
  resettingConnection = (async () => {
    try {
      await disableNetwork(db!);
      await enableNetwork(db!);
      console.log(
        `[storeService] Đã reset kết nối Firestore (disableNetwork → enableNetwork) sau timeout (lần ${consecutiveTimeouts}/${MAX_SOFT_RESETS}).`
      );
    } catch (e) {
      console.warn('[storeService] Reset kết nối Firestore thất bại:', e);
    } finally {
      resettingConnection = null;
    }
  })();
  return resettingConnection;
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs?: number): Promise<T> {
  const timeout = timeoutMs ?? FIRESTORE_WRITE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    // Huỷ đồng hồ khi lệnh ghi về đích, nếu không mỗi lệnh ghi THÀNH CÔNG vẫn
    // để lại một setTimeout chạy tiếp rồi kích reset kết nối oan.
    promise.then((v) => {
      clearTimeout(timer);
      noteWriteSucceeded();
      return v;
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        void resetFirestoreConnection();
        reject(
          new Error(
            `Mất kết nối tới Firebase quá lâu khi ${label} (>${(timeout / 1000).toFixed(0)}s). Hệ thống đang tự thử reset kết nối — vui lòng đợi lát rồi thử lại; nếu vẫn lỗi, hãy TẢI LẠI TRANG (F5).`
          )
        );
      }, timeout);
    }),
  ]);
}

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

// ---------------------------------------------------------------------------
// Nén dữ liệu trước khi ghi Firestore
// ---------------------------------------------------------------------------
// Đo trên dataset thật (706 siêu thị × 35 ngành hàng): JSON thô 1,54 MiB —
// vượt trần 1 MiB/doc của Firestore, và đó là toàn bộ lý do tồn tại của cơ chế
// chunking cũ. Nén gzip đưa xuống ~0,29 MiB (5-10x tuỳ độ lặp của dữ liệu),
// tức vừa gọn trong MỘT document, nên:
//   - 9 doc ghi (8 chunk + 1 meta) → 1 doc
//   - băng thông tải về của MỌI client giảm 5-10x (đây mới là chi phí lớn nhất:
//     mỗi lần dán, tất cả client đang mở đều tải lại nguyên dataset)
//   - bỏ luôn getDoc(meta) phụ ở đường đọc vì metadata nằm chung doc
// Giá phải trả đo được: nén ~27ms, giải nén + parse ~12ms — không đáng kể.
//
// Lưu bằng kiểu Bytes native của Firestore, KHÔNG base64 (base64 sẽ phình +33%
// và ăn mất phần lớn lợi ích).
//
// Dùng CompressionStream — API chuẩn có sẵn trong trình duyệt, không cần thư
// viện. Brotli nén tốt hơn nhiều nhưng trình duyệt không hỗ trợ NÉN brotli
// (chỉ giải nén ở tầng HTTP), nên gzip là lựa chọn đúng ở đây.
const COMPRESSED_FORMAT_VERSION = 2;

function compressionSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function gzipJson(value: unknown): Promise<Uint8Array> {
  const json = JSON.stringify(value);
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  void writer.write(new TextEncoder().encode(json));
  void writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function gunzipJson<T>(bytes: Uint8Array): Promise<T> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  void writer.write(bytes as unknown as BufferSource);
  void writer.close();
  const text = await new Response(ds.readable).text();
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Doanh thu cùng kỳ: cắt theo THÁNG
// ---------------------------------------------------------------------------
// Dataset này là chuỗi thời gian (1 dòng / siêu thị / ngày) nên phình đều theo
// tháng: đo được 30 ngày = 4,19 MiB thô → 0,17 MiB sau nén, nhưng 180 ngày thì
// bản nén đã vượt 1 MiB. Cắt mỗi tháng một document vừa giữ mỗi doc rất nhỏ
// mãi mãi, vừa cho cập nhật tăng dần: nhập thêm tháng 10 chỉ ghi lại doc tháng
// 10, thay vì rewrite toàn bộ như trước.
const CUNG_KY_MONTH_COLLECTION = 'months';

/** "01/09/2025" -> "2025-09". Trả về '' nếu không đọc được ngày. */
function monthKeyOf(ngay: unknown): string {
  if (typeof ngay !== 'string') return '';
  const m = ngay.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}`;
}

// In-memory mirror of the localStorage cache. A full dataset (Realtime +
// Luỹ Kế, Tỉnh + Vùng, ~700+ records each) can be a few MB as JSON, and every
// save used to re-read + JSON.parse that whole blob from localStorage just to
// merge in one changed field. Keeping it in memory after the first read turns
// every subsequent save into a single JSON.stringify instead of a parse+stringify
// pair, which is what actually eats time on a full 4-box paste.
let memCache: FirebaseDataPayload | null = null;

// Cache cục bộ được tách theo TỪNG dataset thay vì gộp một blob khổng lồ.
// Trước đây mỗi lần bất kỳ dataset nào đổi, flush ghi lại TOÀN BỘ payload —
// đo được 3,71 MiB: JSON.stringify 12ms + structuredClone (IndexedDB) 28ms
// chặn main thread, dù chỉ một dataset thay đổi. Tệ hơn: 3,71 MiB đã sát trần
// ~5 MiB của localStorage, và khi setItem ném QuotaExceededError thì catch nuốt
// im lặng làm mất SẠCH cache — kể cả phần cấu hình nhỏ xíu. Tách theo key:
// chỉ dataset vừa đổi mới bị ghi, và một dataset quá lớn không kéo đổ phần còn lại.
const CACHE_FIELDS: (keyof FirebaseDataPayload)[] = [
  'realtimeStoresVung',
  'luykeStoresVung',
  'realtimeDtStores',
  'realtimeTcStores',
  'luykeDtStores',
  'luykeTcStores',
  'bossAssignments',
  'settings',
  'userPreferences',
  'userFilters',
  'categoryGroups',
  'categoryOrderMap',
  'categoryDisplayNames',
  'categoryHiddenMap',
  'groupSummaryCards',
  'lastUpdateRealtimeDt',
  'lastUpdateRealtimeTc',
  'lastUpdateLuyKeDt',
  'lastUpdateLuyKeTc',
  'lastUpdateRevenueCungKy',
  'lastUpdated',
  'updatedBy',
];

// Dữ liệu lớn (hàng nghìn / chục nghìn dòng) chỉ đi IndexedDB + Firebase,
// không bao giờ vào localStorage để tránh tràn quota 5MB của trình duyệt.
const IDB_ONLY_FIELDS = new Set<keyof FirebaseDataPayload>([
  'revenueCungKy',
  'realtimeStoresVung',
  'luykeStoresVung',
  'realtimeDtStores',
  'realtimeTcStores',
  'luykeDtStores',
  'luykeTcStores',
  'bossAssignments',
]);

function localCacheKeyFor(field: keyof FirebaseDataPayload): string {
  return `tnb_c_${field}`;
}

/**
 * Read the last known full dataset from localStorage.
 * Used to hydrate the UI instantly on load, before/without a live Firestore round-trip.
 */
export function getLocalCache(): FirebaseDataPayload {
  if (memCache) return memCache;
  const merged: FirebaseDataPayload = {};
  // 1) Blob cũ (một key chứa tất cả) — đọc trước để không mất cache của người
  //    dùng đã có sẵn từ phiên bản trước.
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (raw) Object.assign(merged, JSON.parse(raw));
  } catch (e) {
    /* hỏng hoặc không đọc được — bỏ qua, các key riêng bên dưới vẫn dùng được */
  }
  // 2) Key riêng từng dataset (định dạng mới) — đè lên blob cũ vì mới hơn.
  //    Mỗi dataset một key nên một dataset hỏng/quá lớn không kéo đổ phần còn lại.
  for (const field of CACHE_FIELDS) {
    try {
      const raw = localStorage.getItem(localCacheKeyFor(field));
      if (raw) (merged as any)[field] = JSON.parse(raw);
    } catch (e) {
      /* bỏ qua đúng dataset này thôi */
    }
  }
  memCache = merged;
  return memCache;
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

// Chỉ những dataset thực sự đổi kể từ lần flush trước mới được ghi xuống đĩa.
const dirtyFields = new Set<keyof FirebaseDataPayload>();

function flushLocalCachePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!memCache || dirtyFields.size === 0) return;
  const fields = Array.from(dirtyFields);
  dirtyFields.clear();

  for (const field of fields) {
    const value = (memCache as any)[field];
    if (value === undefined) continue;

    if (!IDB_ONLY_FIELDS.has(field)) {
      try {
        localStorage.setItem(localCacheKeyFor(field), JSON.stringify(value));
      } catch (e) {
        // Quá quota / không dùng được: bỏ riêng dataset này khỏi localStorage
        // (IndexedDB bên dưới vẫn giữ được), thay vì làm hỏng cả cache như trước.
        try {
          localStorage.removeItem(localCacheKeyFor(field));
        } catch {
          /* không làm gì thêm được */
        }
      }
    }
    void idbSet(localCacheKeyFor(field), value);
  }

  // Giữ tương thích ngược: bản cũ đọc revenueCungKy từ key riêng này.
  if (fields.includes('revenueCungKy') && memCache.revenueCungKy?.length) {
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
  for (const key of Object.keys(partial) as (keyof FirebaseDataPayload)[]) {
    dirtyFields.add(key);
  }
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
  // Blob cũ trước (tương thích ngược), rồi đè bằng các key riêng mới hơn.
  const legacy = (await idbGet<FirebaseDataPayload>(LOCAL_CACHE_KEY)) || {};
  const merged: FirebaseDataPayload = { ...legacy };
  const fields: (keyof FirebaseDataPayload)[] = [...CACHE_FIELDS, ...IDB_ONLY_FIELDS];
  await Promise.all(
    fields.map(async (field) => {
      const value = await idbGet(localCacheKeyFor(field));
      if (value !== undefined) (merged as any)[field] = value;
    })
  );
  return merged;
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
 * Ghi một dataset lớn (danh sách siêu thị / doanh thu) vào MỘT document duy
 * nhất, nén gzip và lưu bằng kiểu Bytes native của Firestore.
 *
 * Thay cho cơ chế chunked subcollection cũ (8 chunk + 1 meta doc = 9 lần ghi,
 * truyền 1,54 MiB thô). Chunking sinh ra chỉ để né trần 1 MiB/doc, nhưng mỗi
 * lần dán nó vẫn ghi lại TẤT CẢ chunk nên chẳng tiết kiệm được gì — chỉ đem
 * thêm batch/write-stream và đúng lớp lỗi "Write stream exhausted". Nén xong
 * dataset chỉ còn ~0,29 MiB (29% ngưỡng), thừa sức nằm gọn trong 1 doc.
 *
 * Metadata (customLastUpdated/updatedBy) nằm luôn trong doc này, nên đường đọc
 * bỏ được hẳn lần getDoc(meta) phụ vốn tốn thêm một round-trip mỗi lần cập nhật.
 */
async function saveCompressedDataset<T>(
  docKey: DocKey,
  records: T[],
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

  const localPayload: any = { [field]: records, lastUpdated, updatedBy };
  if (tsField && customLastUpdated) localPayload[tsField] = customLastUpdated;

  const perfTag = `[PERF][storeService] ${docKey}`;
  const tFnStart = performance.now();

  // Cập nhật cache cục bộ NGAY, không đợi mạng — UI và lần mở lại tiếp theo
  // luôn thấy dữ liệu mới kể cả khi Firestore đang trục trặc.
  writeLocalCache(localPayload as Partial<FirebaseDataPayload>);

  if (!db) {
    return { success: false, error: 'Chưa kết nối được Firebase — dữ liệu chỉ lưu tạm trên trình duyệt này.' };
  }

  try {
    if (!compressionSupported()) {
      // Trình duyệt quá cũ, không có CompressionStream: quay về ghi chunk như
      // bản cũ để không mất khả năng đồng bộ.
      return await saveChunkedStoreDatasetLegacy(docKey, records, updatedBy, customLastUpdated);
    }

    const tGzStart = performance.now();
    const packed = await gzipJson(records);
    const tGzMs = performance.now() - tGzStart;

    if (packed.byteLength > 1_000_000) {
      // Vượt trần 1 MiB/doc ngay cả sau khi nén — cực hiếm với quy mô hiện tại,
      // nhưng nếu xảy ra thì ghi chunk vẫn đúng hơn là ghi hỏng.
      console.warn(`${perfTag} — bản nén ${(packed.byteLength / 1048576).toFixed(2)} MiB vượt 1 MiB, quay về ghi chunk.`);
      return await saveChunkedStoreDatasetLegacy(docKey, records, updatedBy, customLastUpdated);
    }

    const tWriteStart = performance.now();
    await withTimeout(
      setDoc(doc(db, COLLECTION, docKey), {
        v: COMPRESSED_FORMAT_VERSION,
        gz: Bytes.fromUint8Array(packed),
        n: records.length,
        customLastUpdated: customLastUpdated || null,
        updatedBy,
        lastUpdated: serverTimestamp(),
      }),
      `ghi ${docKey}`,
      30000
    );
    const tWriteMs = performance.now() - tWriteStart;

    console.log(
      `${perfTag} — XONG ${records.length} bản ghi trong ${(performance.now() - tFnStart).toFixed(0)}ms ` +
        `(nén ${tGzMs.toFixed(0)}ms → ${(packed.byteLength / 1024).toFixed(0)}KB, ghi 1 doc ${tWriteMs.toFixed(0)}ms)`
    );

    void cleanupLegacyChunks(docKey);
    return { success: true };
  } catch (error) {
    console.error(`Firestore write error [${docKey}]:`, error);
    return { success: false, error: firestoreErrorMessage(error) };
  }
}

// Dọn chunk cũ MỘT lần sau khi dataset đã chuyển sang định dạng nén. Chạy nền,
// lỗi bỏ qua: chunk thừa chỉ tốn chỗ chứ không ảnh hưởng tính đúng đắn (đường
// đọc chỉ dùng tới chunk khi doc chưa có trường `gz`).
const legacyChunksCleaned = new Set<DocKey>();
async function cleanupLegacyChunks(docKey: DocKey): Promise<void> {
  if (legacyChunksCleaned.has(docKey) || !db) return;
  legacyChunksCleaned.add(docKey);
  try {
    const snap = await getDocs(collection(db, COLLECTION, docKey, 'chunks'));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`[storeService] Đã dọn ${snap.size} chunk cũ của ${docKey} sau khi chuyển sang định dạng nén.`);
  } catch (e) {
    legacyChunksCleaned.delete(docKey);
  }
}

/**
 * Đường ghi chunk cũ — chỉ còn dùng làm phương án dự phòng khi trình duyệt
 * không có CompressionStream, hoặc khi bản nén vẫn vượt 1 MiB.
 */
async function saveChunkedStoreDatasetLegacy<T>(
  docKey: DocKey,
  stores: T[],
  updatedBy: string,
  customLastUpdated?: string
): Promise<{ success: boolean; error?: string }> {
  if (!db) return { success: false, error: 'Chưa kết nối được Firebase.' };
  const isCungKy = docKey === 'revenue_cung_ky';
  const chunkSize = isCungKy ? 1000 : STORE_CHUNK_SIZE;

  const newChunks: T[][] = [];
  for (let i = 0; i < stores.length; i += chunkSize) newChunks.push(stores.slice(i, i + chunkSize));
  if (newChunks.length === 0) newChunks.push([]);

  try {
    const chunksRef = collection(db, COLLECTION, docKey, 'chunks');
    const BATCH_SIZE_LIMIT = isCungKy ? 4 : 50;
    const totalBatches = Math.ceil(newChunks.length / BATCH_SIZE_LIMIT);
    let batchCount = 0;

    for (let bStart = 0; bStart < newChunks.length; bStart += BATCH_SIZE_LIMIT) {
      batchCount++;
      const batch = writeBatch(db);
      const bEnd = Math.min(bStart + BATCH_SIZE_LIMIT, newChunks.length);
      for (let index = bStart; index < bEnd; index++) {
        batch.set(doc(chunksRef, String(index)), {
          data: sanitizeForFirestore({ data: newChunks[index] }).data,
          index,
        });
      }
      await withTimeout(batch.commit(), `ghi chunk ${docKey} (batch ${batchCount}/${totalBatches})`, 30000);
    }

    const previousStores = (getLocalCache()[FIELD_BY_DOC[docKey]] as T[] | undefined) || [];
    const previousChunkCount = previousStores.length > 0 ? Math.ceil(previousStores.length / chunkSize) : 0;
    if (previousChunkCount > newChunks.length) {
      const delBatch = writeBatch(db);
      for (let i = newChunks.length; i < previousChunkCount + 2; i++) delBatch.delete(doc(chunksRef, String(i)));
      await withTimeout(delBatch.commit(), `dọn chunk thừa ${docKey}`, 30000);
    }

    await withTimeout(
      setDoc(doc(db, COLLECTION, docKey), {
        chunkCount: newChunks.length,
        lastUpdated: serverTimestamp(),
        customLastUpdated: customLastUpdated || null,
        updatedBy,
      }),
      `ghi meta doc ${docKey}`,
      30000
    );
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
    const setPromise = withTimeout(setDoc(docRef, sanitized), `ghi ${docKey}`, 30000);
    writeLocalCache({ [field]: value, lastUpdated, updatedBy } as Partial<FirebaseDataPayload>);
    await setPromise;
    return { success: true };
  } catch (error) {
    console.error(`Firestore write error [${docKey}]:`, error);
    return { success: false, error: firestoreErrorMessage(error) };
  }
}

export async function saveRealtimeStoresToFirebase(stores: StoreRecord[], updatedBy: string = 'Super Admin') {
  return saveCompressedDataset('realtime_stores_vung', stores, updatedBy);
}

export async function saveLuyKeStoresToFirebase(stores: StoreRecord[], updatedBy: string = 'Super Admin') {
  return saveCompressedDataset('luyke_stores_vung', stores, updatedBy);
}

export async function saveRealtimeDtToFirebase(stores: StoreRecord[], lastUpdated: string, updatedBy: string = 'Super Admin') {
  return saveCompressedDataset('realtime_revenue_dt', stores, updatedBy, lastUpdated);
}

export async function saveRealtimeTcToFirebase(stores: StoreRecord[], lastUpdated: string, updatedBy: string = 'Super Admin') {
  return saveCompressedDataset('realtime_revenue_tc', stores, updatedBy, lastUpdated);
}

export async function saveLuyKeDtToFirebase(stores: StoreRecord[], lastUpdated: string, updatedBy: string = 'Super Admin') {
  return saveCompressedDataset('luyke_revenue_dt', stores, updatedBy, lastUpdated);
}

export async function saveLuyKeTcToFirebase(stores: StoreRecord[], lastUpdated: string, updatedBy: string = 'Super Admin') {
  return saveCompressedDataset('luyke_revenue_tc', stores, updatedBy, lastUpdated);
}

export async function saveBossAssignmentsToFirebase(bossItems: BossAssignmentRecord[], updatedBy: string = 'Super Admin') {
  return saveDataset('boss_assignments', bossItems, updatedBy);
}

/**
 * Doanh thu cùng kỳ: 1 dòng / siêu thị / NGÀY, nên phình đều theo thời gian.
 * Đo được: 30 ngày = 4,19 MiB thô → 0,17 MiB nén (vừa 1 doc), nhưng 180 ngày
 * thì bản nén đã vượt trần 1 MiB/doc. Vì vậy cắt MỖI THÁNG một document nén
 * riêng — mỗi doc luôn nhỏ bất kể tích luỹ bao nhiêu năm.
 *
 * Vẫn giữ đúng ngữ nghĩa "thay thế toàn bộ" như trước: tháng nào không có
 * trong lần nhập này thì xoá khỏi Firestore.
 */
export async function saveRevenueCungKyToFirebase(records: RevenueCungKyRecord[], updatedBy: string = 'Super Admin') {
  const lastUpdated = new Date().toISOString();
  writeLocalCache({ revenueCungKy: records, lastUpdated, updatedBy });

  if (!db) {
    return { success: false, error: 'Chưa kết nối được Firebase — dữ liệu chỉ lưu tạm trên trình duyệt này.' };
  }
  if (!compressionSupported()) {
    return saveChunkedStoreDatasetLegacy('revenue_cung_ky', records, updatedBy);
  }

  const perfTag = '[PERF][storeService] revenue_cung_ky';
  const tStart = performance.now();

  // Gom theo tháng. Dòng không đọc được ngày dồn vào nhóm "unknown" để không
  // bao giờ bị rơi mất im lặng.
  const byMonth = new Map<string, RevenueCungKyRecord[]>();
  for (const r of records) {
    const key = monthKeyOf((r as any).ngay) || 'unknown';
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(r);
    else byMonth.set(key, [r]);
  }

  try {
    const monthsRef = collection(db, COLLECTION, 'revenue_cung_ky', CUNG_KY_MONTH_COLLECTION);
    const months = Array.from(byMonth.keys()).sort();

    // Ghi tuần tự từng tháng — mỗi tháng là 1 doc nhỏ, không cần batch.
    let totalBytes = 0;
    for (const month of months) {
      const rows = byMonth.get(month)!;
      const packed = await gzipJson(rows);
      totalBytes += packed.byteLength;
      await withTimeout(
        setDoc(doc(monthsRef, month), {
          v: COMPRESSED_FORMAT_VERSION,
          gz: Bytes.fromUint8Array(packed),
          n: rows.length,
          month,
          updatedBy,
          lastUpdated: serverTimestamp(),
        }),
        `ghi doanh thu cùng kỳ tháng ${month}`,
        30000
      );
    }

    // Xoá những tháng không còn trong lần nhập này (giữ ngữ nghĩa thay thế toàn bộ).
    const existing = await getDocs(monthsRef);
    const stale = existing.docs.filter((d) => !byMonth.has(d.id));
    if (stale.length > 0) {
      const delBatch = writeBatch(db);
      stale.forEach((d) => delBatch.delete(d.ref));
      await withTimeout(delBatch.commit(), 'dọn tháng cũ của doanh thu cùng kỳ', 30000);
    }

    await withTimeout(
      setDoc(doc(db, COLLECTION, 'revenue_cung_ky'), {
        v: COMPRESSED_FORMAT_VERSION,
        partitionedByMonth: true,
        months,
        n: records.length,
        updatedBy,
        lastUpdated: serverTimestamp(),
      }),
      'ghi meta doanh thu cùng kỳ',
      30000
    );

    console.log(
      `${perfTag} — XONG ${records.length} dòng / ${months.length} tháng trong ${(performance.now() - tStart).toFixed(0)}ms ` +
        `(tổng nén ${(totalBytes / 1024).toFixed(0)}KB)`
    );
    void cleanupLegacyChunks('revenue_cung_ky');
    return { success: true };
  } catch (error) {
    console.error('Firestore write error [revenue_cung_ky]:', error);
    return { success: false, error: firestoreErrorMessage(error) };
  }
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
 *
 * Mỗi dataset một listener trên MỘT document duy nhất. So với bản cũ:
 *   - dataset lớn không còn là listener trên collection chunk, nên không phải
 *     gộp + sắp xếp lại 8 chunk mỗi lần cập nhật;
 *   - bỏ hẳn lần getDoc(meta) phụ sau mỗi snapshot (7 round-trip thừa mỗi lượt
 *     cập nhật ở bản cũ) vì metadata nằm chung document;
 *   - dữ liệu về ở dạng nén nên nhẹ hơn 5-10 lần trên đường truyền.
 *
 * Tương thích ngược: dataset nào chưa từng lưu lại theo định dạng mới sẽ không
 * có trường `gz`; khi đó đọc nốt các chunk cũ (một lần, bằng getDocs) để không
 * mất dữ liệu. Lần dán kế tiếp sẽ tự ghi sang định dạng nén.
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
    const isBigDataset = CHUNKED_STORE_DOC_KEYS.has(docKey);
    // Captured per docKey by this listener's own closure — the first
    // snapshot flips it, every later one for this same docKey sees it true.
    let hasSeenFirstSnapshot = false;

    const tsField =
      docKey === 'realtime_revenue_dt' ? 'lastUpdateRealtimeDt' :
      docKey === 'realtime_revenue_tc' ? 'lastUpdateRealtimeTc' :
      docKey === 'luyke_revenue_dt' ? 'lastUpdateLuyKeDt' :
      docKey === 'luyke_revenue_tc' ? 'lastUpdateLuyKeTc' : undefined;

    // isInitial phải được chốt NGAY tại thời điểm snapshot (đồng bộ), không
    // phải lúc deliver chạy — vì giải nén/đọc chunk là bất đồng bộ, nếu chốt
    // muộn thì hai snapshot dồn nhau sẽ cùng báo "lần đầu".
    const takeIsInitial = () => {
      const isInitial = !hasSeenFirstSnapshot;
      hasSeenFirstSnapshot = true;
      return isInitial;
    };

    const deliver = (
      value: unknown,
      isInitial: boolean,
      customTs?: string,
      extra?: Partial<FirebaseDataPayload>
    ) => {
      const partial: Partial<FirebaseDataPayload> = { ...extra, [field]: value } as Partial<FirebaseDataPayload>;
      if (tsField && customTs) (partial as any)[tsField] = customTs;
      writeLocalCache(partial);
      onDataReceived(partial, { isInitial, docKey });
    };

    // Doanh thu cùng kỳ được cắt mỗi tháng một doc nén (xem
    // saveRevenueCungKyToFirebase) → lắng nghe cả collection `months` và ghép lại.
    if (docKey === 'revenue_cung_ky') {
      return onSnapshot(
        collection(db!, COLLECTION, 'revenue_cung_ky', CUNG_KY_MONTH_COLLECTION),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          const isInitial = takeIsInitial();
          if (snap.empty) {
            // Chưa chuyển đổi: rơi về chunk cũ để không mất dữ liệu.
            void getDocs(collection(db!, COLLECTION, docKey, 'chunks'))
              .then((chunkSnap) => {
                if (chunkSnap.empty) return;
                const merged = chunkSnap.docs
                  .map((d) => {
                    const c = d.data() as { data?: unknown[]; index?: number };
                    return { index: c.index ?? Number(d.id), data: c.data || [] };
                  })
                  .sort((a, b) => a.index - b.index)
                  .flatMap((c) => c.data);
                deliver(merged, isInitial);
              })
              .catch((e) => console.warn(`Không đọc được chunk cũ [${docKey}]:`, e));
            return;
          }
          const sorted = snap.docs.slice().sort((a, b) => a.id.localeCompare(b.id));
          void Promise.all(
            sorted.map(async (d) => {
              const raw = d.data() as any;
              if (!raw?.gz) return [] as unknown[];
              const bytes: Uint8Array = raw.gz.toUint8Array ? raw.gz.toUint8Array() : raw.gz;
              return await gunzipJson<unknown[]>(bytes);
            })
          )
            .then((chunks) => deliver(chunks.flat(), isInitial))
            .catch((e) => console.error('Không giải nén được doanh thu cùng kỳ:', e));
        },
        (error) => {
          console.warn(`Firestore subscription notice [${docKey}] (using local cache):`, error);
        }
      );
    }

    return onSnapshot(
      doc(db!, COLLECTION, docKey),
      (docSnap) => {
        // Bỏ qua tiếng vọng của chính lượt ghi mình vừa thực hiện: Firestore
        // áp dụng nó vào cache cục bộ (và bắn listener) trước khi server xác
        // nhận, nhưng phía gọi đã cập nhật state + cache rồi — xử lý lại chỉ
        // tổ render lại bảng 700+ dòng lần nữa vô ích.
        if (docSnap.metadata.hasPendingWrites) return;
        const isInitial = takeIsInitial();

        const raw = docSnap.exists() ? (docSnap.data() as any) : null;

        // --- Định dạng mới: 1 document nén ---
        if (raw?.gz) {
          const bytes: Uint8Array = raw.gz.toUint8Array ? raw.gz.toUint8Array() : raw.gz;
          void gunzipJson<unknown>(bytes)
            .then((records) => deliver(records, isInitial, raw.customLastUpdated))
            .catch((e) => console.error(`Không giải nén được dataset [${docKey}]:`, e));
          return;
        }

        // --- Dataset lớn chưa chuyển đổi: đọc nốt chunk cũ ---
        if (isBigDataset) {
          void getDocs(collection(db!, COLLECTION, docKey, 'chunks'))
            .then((snap) => {
              if (snap.empty) {
                // Không có chunk: có thể là dữ liệu dạng doc đơn rất cũ.
                if (Array.isArray(raw?.data) && raw.data.length > 0) deliver(raw.data, isInitial, raw.customLastUpdated);
                return;
              }
              const merged = snap.docs
                .map((d) => {
                  const c = d.data() as { data?: unknown[]; index?: number };
                  return { index: c.index ?? Number(d.id), data: c.data || [] };
                })
                .sort((a, b) => a.index - b.index)
                .flatMap((c) => c.data);
              deliver(merged, isInitial, raw?.customLastUpdated);
            })
            .catch((e) => console.warn(`Không đọc được chunk cũ [${docKey}]:`, e));
          return;
        }

        // --- Dataset nhỏ: doc đơn như cũ ---
        if (raw) {
          const rawLastUpdated = raw.lastUpdated;
          const lastUpdatedIso =
            rawLastUpdated instanceof Timestamp ? rawLastUpdated.toDate().toISOString() : rawLastUpdated;
          deliver(raw.data, isInitial, undefined, { lastUpdated: lastUpdatedIso, updatedBy: raw.updatedBy });
        }
      },
      (error) => {
        console.warn(`Firestore subscription notice [${docKey}] (using local cache):`, error);
      }
    );
  });

  return () => unsubscribers.forEach((unsub) => unsub());
}
