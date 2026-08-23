import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { ViewTab, TimeMode, EntityScope, Channel, StoreRecord, UserProfile, AppSettings, UserAccount } from './types';
import { initialUserProfile, initialSettings } from './data/sampleData';
import { getBossForStore, extractMst, findBossAssignmentRecord, BossAssignmentRecord } from './utils/parser';
import { Sidebar } from './components/Sidebar';
import { HeaderBanner } from './components/HeaderBanner';
import { ReportView, DEFAULT_CATEGORY_GROUP_MAP } from './components/ReportView';
// Lazy-loaded: only Super Admin/Admin can ever open this tab (see
// canUpdateData below), so Editor/Viewer sessions — the majority of
// logins — never download or parse this chunk (it also pulls in xlsx's
// caller code) at all.
const UpdateDataView = React.lazy(() =>
  import('./components/UpdateDataView').then((m) => ({ default: m.UpdateDataView }))
);
const RevenueReportView = React.lazy(() =>
  import('./components/RevenueReportView').then((m) => ({ default: m.RevenueReportView }))
);
import { SettingsView } from './components/SettingsView';
import { TagBossModal, generateReportRemarksText } from './components/TagBossModal';
import { LoginView } from './components/LoginView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserManagementModal } from './components/UserManagementModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { CategoryGroupModal } from './components/CategoryGroupModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { ExportLoadingModal } from './components/ExportLoadingModal';
import { ExportSuccessModal } from './components/ExportSuccessModal';
import { RefreshCw, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { getCurrentSession, logoutUser } from './services/authService';
import {
  subscribeToFirebaseData,
  saveRealtimeStoresToFirebase,
  saveLuyKeStoresToFirebase,
  saveRealtimeDtToFirebase,
  saveRealtimeTcToFirebase,
  saveLuyKeDtToFirebase,
  saveLuyKeTcToFirebase,
  saveBossAssignmentsToFirebase,
  saveSettingsToFirebase,
  saveUserPreferencesToFirebase,
  saveUserFiltersToFirebase,
  saveCategoryGroupsToFirebase,
  saveCategoryOrdersToFirebase,
  saveCategoryDisplayNamesToFirebase,
  saveCategoryHiddenToFirebase,
  getLocalCache,
  getIndexedDbCache,
  clearAllLocalCache,
  getLocalRemarkConfig,
  type DocKey,
} from './services/storeService';
import { usePersistedState } from './hooks/usePersistedState';
import { exportElementAsImage, exportGroupSpecificElement, exportCategoryGroupImages } from './services/imageExport';
import confetti from 'canvas-confetti';

function AppInner() {
  // Authentication State — requires an actual login; no silent Super Admin bypass
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => getCurrentSession());

  // Last known dataset from localStorage, used to hydrate instantly on load
  // (before/without waiting on the live Firestore round-trip)
  const [cachedData] = useState(() => getLocalCache());

  // Route helpers for URL hash & document title synchronization
  const parseRouteFromHash = (hash: string): { tab: ViewTab; scope?: EntityScope } | null => {
    const cleanHash = hash.replace(/^#\/?/, '').toLowerCase().trim();
    if (!cleanHash) return null;

    if (cleanHash === 'tong' || cleanHash === 'report/tong') {
      return { tab: 'report', scope: 'tong' };
    }
    if (cleanHash === 'vung' || cleanHash === 'report/vung') {
      return { tab: 'report', scope: 'sieuthi' };
    }
    if (cleanHash === 'sieuthi' || cleanHash === 'report/sieuthi') {
      return { tab: 'report', scope: 'vung' };
    }
    if (cleanHash === 'nhom' || cleanHash === 'report/nhom') {
      return { tab: 'report', scope: 'nhom' };
    }
    if (cleanHash === 'report') {
      return { tab: 'report', scope: 'sieuthi' };
    }
    if (cleanHash === 'revenue' || cleanHash === 'doanh-thu') {
      return { tab: 'revenue' };
    }
    if (cleanHash === 'update' || cleanHash === 'cap-nhat') {
      return { tab: 'update' };
    }
    if (cleanHash === 'settings' || cleanHash === 'cai-dat') {
      return { tab: 'settings' };
    }
    return null;
  };

  const getHashFromRoute = (tab: ViewTab, scope: EntityScope): string => {
    if (tab === 'revenue') return '#/revenue';
    if (tab === 'update') return '#/update';
    if (tab === 'settings') return '#/settings';
    if (scope === 'tong') return '#/tong';
    if (scope === 'sieuthi') return '#/vung';
    if (scope === 'vung') return '#/sieuthi';
    if (scope === 'nhom') return '#/nhom';
    return '#/vung';
  };

  const getTitleFromRoute = (tab: ViewTab, scope: EntityScope, sysName?: string): string => {
    const prefix = sysName || 'THI ĐUA TNB';
    if (tab === 'revenue') return `Báo cáo Doanh thu & Trả chậm | ${prefix}`;
    if (tab === 'update') return `Cập nhật Dữ liệu | ${prefix}`;
    if (tab === 'settings') return `Cài đặt Hệ thống | ${prefix}`;
    if (scope === 'tong') return `Tổng quan TGD & ĐMX | ${prefix}`;
    if (scope === 'sieuthi') return `Thi đua VÙNG | ${prefix}`;
    if (scope === 'vung') return `Thi đua SIÊU THỊ | ${prefix}`;
    if (scope === 'nhom') return `Thi đua NHÓM | ${prefix}`;
    return prefix;
  };

  // Initial Route Check: Priority 1: URL Hash, Priority 2: LocalStorage (Lần 2 mở), Priority 3: Default 'report' & 'sieuthi' (Vùng)
  const initialRoute = parseRouteFromHash(window.location.hash);

  // Navigation & Mode States
  const [activeTab, setActiveTab] = usePersistedState<ViewTab>(
    'tnb_activeTab',
    initialRoute?.tab || 'report'
  );
  const [timeMode, setTimeMode] = usePersistedState<TimeMode>('tnb_timeMode', 'luyke');
  const [entityScope, setEntityScope] = usePersistedState<EntityScope>(
    'tnb_entityScope',
    initialRoute?.scope || 'sieuthi'
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Filters — persisted to localStorage + IndexedDB (usePersistedState) for
  // instant same-device reload, AND synced to Firestore per-account (see the
  // userFiltersMap effects below) so the last-used filter set follows the
  // account across devices too.
  const [selectedChannels, setSelectedChannels] = usePersistedState<Channel[]>('tnb_selectedChannels', ['TGD']);
  const [selectedProvince, setSelectedProvince] = usePersistedState<string>('tnb_selectedProvince', 'ALL');
  const [selectedBoss, setSelectedBoss] = usePersistedState<string>('tnb_selectedBoss', 'ALL');
  const [selectedCategory, setSelectedCategory] = usePersistedState<string>('tnb_selectedCategory', 'ALL');
  const [selectedCategoryGroup, setSelectedCategoryGroup] = usePersistedState<string>('tnb_selectedCategoryGroup', 'ICT,DỊCH VỤ');
  const [selectedPhanLoaiShop, setSelectedPhanLoaiShop] = usePersistedState<string>('tnb_selectedPhanLoaiShop', 'ALL');
  const [selectedTinhMoi, setSelectedTinhMoi] = usePersistedState<string>('tnb_selectedTinhMoi', 'ALL');
  const [valueDisplayMode, setValueDisplayMode] = usePersistedState<'percent' | 'value'>('tnb_valueDisplayMode', 'percent');

  // Ngành hàng → Nhóm mapping (global, shared by every account — same idea
  // as `settings`), managed via the Category Group modal from the Report
  // filter bar. Firestore doc: category_groups.
  const [categoryGroupMap, setCategoryGroupMap] = useState<Record<string, string>>(() => ({
    ...DEFAULT_CATEGORY_GROUP_MAP,
    ...(cachedData.categoryGroups || {}),
  }));
  const [categoryOrderMap, setCategoryOrderMap] = useState<Record<string, number>>(cachedData.categoryOrderMap || {});
  // Custom, user-shortened display names for Ngành hàng (overrides the
  // built-in auto-abbreviation dictionary in getShortCategoryName). Same
  // sync doc pattern as categoryGroups/categoryOrderMap.
  const [categoryDisplayNameMap, setCategoryDisplayNameMap] = useState<Record<string, string>>(cachedData.categoryDisplayNames || {});
  const [categoryHiddenMap, setCategoryHiddenMap] = useState<Record<string, boolean>>(cachedData.categoryHiddenMap || {});
  const [isCategoryGroupModalOpen, setIsCategoryGroupModalOpen] = useState(false);

  // Per-account synced filter snapshots (Firestore `user_filters` doc, keyed
  // by accountId like userPreferencesMap) + a guard so a device only ever
  // applies the account's remote filter snapshot once per login, instead of
  // fighting with the user's own subsequent clicks every time Firestore
  // echoes back their own write.
  const [userFiltersMap, setUserFiltersMap] = useState<Record<string, any>>(cachedData.userFilters || {});
  const appliedFiltersForAccountRef = useRef<string | null>(null);

  // Stores Data — Tỉnh & Vùng are independently persisted (separate Firestore
  // docs, see storeService.ts) since they're pasted into two separate boxes
  // in the UI and must not overwrite each other.
  const [realtimeStoresTinh, setRealtimeStoresTinh] = useState<StoreRecord[]>(cachedData.realtimeStoresTinh?.length ? cachedData.realtimeStoresTinh : []);
  const [realtimeStoresVung, setRealtimeStoresVung] = useState<StoreRecord[]>(cachedData.realtimeStoresVung?.length ? cachedData.realtimeStoresVung : []);
  const [luykeStoresTinh, setLuyKeStoresTinh] = useState<StoreRecord[]>(cachedData.luykeStoresTinh?.length ? cachedData.luykeStoresTinh : []);
  const [luykeStoresVung, setLuyKeStoresVung] = useState<StoreRecord[]>(cachedData.luykeStoresVung?.length ? cachedData.luykeStoresVung : []);

  // Revenue & Installment (Doanh thu & Trả chậm) Data
  const [realtimeDtStores, setRealtimeDtStores] = usePersistedState<StoreRecord[]>('tnb_realtime_doanhthu', []);
  const [realtimeTcStores, setRealtimeTcStores] = usePersistedState<StoreRecord[]>('tnb_realtime_tracham', []);
  const [luykeDtStores, setLuyKeDtStores] = usePersistedState<StoreRecord[]>('tnb_luyke_doanhthu', []);
  const [luykeTcStores, setLuyKeTcStores] = usePersistedState<StoreRecord[]>('tnb_luyke_tracham', []);
  const [lastUpdateRealtimeDt, setLastUpdateRealtimeDt] = usePersistedState<string>('tnb_last_update_realtime_dt', '');
  const [lastUpdateRealtimeTc, setLastUpdateRealtimeTc] = usePersistedState<string>('tnb_last_update_realtime_tc', '');
  const [lastUpdateLuyKeDt, setLastUpdateLuyKeDt] = usePersistedState<string>('tnb_last_update_luyke_dt', '');
  const [lastUpdateLuyKeTc, setLastUpdateLuyKeTc] = usePersistedState<string>('tnb_last_update_luyke_tc', '');

  // BOSS assignment list, hydrated from local cache first
  const [bossAssignments, setBossAssignments] = useState<BossAssignmentRecord[]>(
    cachedData.bossAssignments?.length ? cachedData.bossAssignments : []
  );

  // Settings (global, shared by every account) & User Profile (per-account
  // display info — name/title/region/avatar shown in the header). All
  // accounts' profiles live inside the single `user_preferences` Firestore
  // doc, keyed by accountId, so editing one admin's profile can never
  // clobber another's, and each account's edits sync across their own devices.
  const [settings, setSettings] = useState<AppSettings>(cachedData.settings ? { ...initialSettings, ...cachedData.settings } : initialSettings);
  const [userPreferencesMap, setUserPreferencesMap] = useState<Record<string, UserProfile>>(cachedData.userPreferences || {});
  const [user, setUser] = useState<UserProfile>(() => {
    const acc = currentUser?.accountId;
    return (acc && cachedData.userPreferences?.[acc]) || initialUserProfile;
  });

  // Only account 3717 may see and access the "Doanh thu" feature
  const isUser3717 =
    currentUser?.accountId === '3717' ||
    currentUser?.username === '3717' ||
    currentUser?.username?.toLowerCase().includes('3717') ||
    currentUser?.accountId?.toLowerCase().includes('3717');

  // Tự động giới hạn các kênh được phép xem theo tài khoản
  useEffect(() => {
    if (currentUser?.allowedChannels && currentUser.allowedChannels.length > 0) {
      const allowed = currentUser.allowedChannels as Channel[];
      setSelectedChannels((prev) => {
        const valid = prev.filter((c) => allowed.includes(c));
        return valid.length > 0 ? valid : [allowed[0]];
      });
    }
  }, [currentUser]);

  // If user is not 3717 and is on revenue tab, redirect to report tab
  useEffect(() => {
    if (activeTab === 'revenue' && currentUser && !isUser3717) {
      setActiveTab('report');
    }
  }, [activeTab, currentUser, isUser3717, setActiveTab]);

  // Cloud Loading / Data Sync Modal state
  const [cloudSyncState, setCloudSyncState] = useState<{
    isOpen: boolean;
    progress: number;
    stepText: string;
    subText?: string;
  }>({
    isOpen: false,
    progress: 0,
    stepText: '',
  });

  // Keeps the loading modal open until the first real Firestore read has
  // actually landed, instead of a fixed timer — on a slow connection (mobile
  // data, cold Firestore read) the old fixed 1.75s timer could close before
  // any data arrived, leaving the user staring at "0 dòng" with no sign
  // anything was still loading. Capped by a safety timeout so an unreachable
  // Firestore never traps the user behind a stuck loading screen.
  const CLOUD_SYNC_TIMEOUT_MS = 15000;

  // Gates the loading modal on the SAME onSnapshot listeners the app already
  // runs (see the "Subscribe to Firebase Firestore" effect below) instead of
  // a separate getDoc/getDocs read per dataset — that older approach
  // (waitForInitialSync) opened a second, fully redundant round of network
  // requests in parallel with the listeners on every fresh device/login,
  // roughly doubling Firestore round trips right when the connection is
  // already the bottleneck. Only the 3 datasets the loading text promises
  // ("Realtime, Luỹ kế & danh sách Boss") gate it — the rest still load via
  // the same listeners just without blocking the modal on them.
  const CRITICAL_SYNC_DOC_KEYS: DocKey[] = ['realtime_stores_tinh', 'luyke_stores_tinh', 'boss_assignments'];
  const criticalDocsSeenRef = useRef<Set<DocKey>>(new Set());
  const resolveCriticalSyncRef = useRef<(() => void) | null>(null);
  const waitForCriticalSync = () =>
    new Promise<void>((resolve) => {
      if (CRITICAL_SYNC_DOC_KEYS.every((k) => criticalDocsSeenRef.current.has(k))) {
        resolve();
        return;
      }
      resolveCriticalSyncRef.current = resolve;
    });

  // True once the full-screen loading modal has been shown this session
  // (explicit login, or launching fresh with an empty local cache). Used to
  // gate the lightweight top-banner notification below — only needed when
  // the modal DIDN'T already tell the user data was loading, which is
  // exactly the "reopened the app, already logged in, cache has stale data
  // from before someone else's update" case.
  const cloudSyncShownRef = useRef(false);

  const triggerCloudSyncAnimation = async (customSubText?: string) => {
    cloudSyncShownRef.current = true;
    setCloudSyncState({
      isOpen: true,
      progress: 20,
      stepText: '⚡ 1. Đang kết nối máy chủ dữ liệu Firebase Cloud...',
      subText: customSubText,
    });
    await new Promise((r) => setTimeout(r, 200));

    setCloudSyncState((prev) => ({
      ...prev,
      progress: 55,
      stepText: '📊 2. Đang tải dữ liệu Realtime, Luỹ kế & danh sách Boss...',
    }));

    await Promise.race([
      waitForCriticalSync(),
      new Promise((resolve) => setTimeout(resolve, CLOUD_SYNC_TIMEOUT_MS)),
    ]);

    setCloudSyncState((prev) => ({
      ...prev,
      progress: 100,
      stepText: '✨ Đã tải xong dữ liệu! Đang mở bảng thi đua...',
    }));
    await new Promise((r) => setTimeout(r, 400));

    setCloudSyncState((prev) => ({ ...prev, isOpen: false }));

    // Read the freshest local cache (kept live by the onSnapshot listeners,
    // unlike React state which may not have re-rendered into this closure
    // yet) to tell a genuinely-empty server apart from data that's simply
    // still in flight — no confetti and a warning banner instead when the
    // account just logged in to find nothing has been uploaded at all.
    const freshCache = getLocalCache();
    const stillEmpty = !freshCache.realtimeStoresTinh?.length && !freshCache.luykeStoresTinh?.length;
    if (stillEmpty) {
      showWarningToast('📭 Hệ thống chưa có dữ liệu thi đua nào. Vui lòng chờ Super Admin/Admin cập nhật dữ liệu Realtime & Luỹ kế.');
    } else {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.5 } });
    }
  };

  // Modals & Notifications
  const [isTagBossModalOpen, setIsTagBossModalOpen] = useState(false);
  const [isUserMgmtModalOpen, setIsUserMgmtModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [toastBanner, setToastBanner] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null);
  const [showSummarySection, setShowSummarySection] = useState(false);
  // Export Loading Overlay state
  const [exportModalState, setExportModalState] = useState<{
    isOpen: boolean;
    title?: string;
    subText?: string;
  }>({ isOpen: false });

  // Export Success Notification Modal state (Popup with Copy Image & Copy Remark options)
  const [exportSuccessState, setExportSuccessState] = useState<{
    isOpen: boolean;
    blob?: Blob | null;
    filename: string;
    remarkText?: string;
    remarkContext?: Record<string, any>;
  }>({
    isOpen: false,
    filename: '',
  });

  useEffect(() => {
    const handleExportSuccess = (e: Event) => {
      const customEvent = e as CustomEvent<{
        blob?: Blob | null;
        filename: string;
        remarkText?: string;
        remarkContext?: Record<string, any>;
      }>;
      if (customEvent.detail) {
        setExportSuccessState({
          isOpen: true,
          blob: customEvent.detail.blob,
          filename: customEvent.detail.filename,
          remarkText: customEvent.detail.remarkText,
          remarkContext: customEvent.detail.remarkContext,
        });
      }
    };

    window.addEventListener('export-image-success', handleExportSuccess);
    return () => {
      window.removeEventListener('export-image-success', handleExportSuccess);
    };
  }, []);

  // Siêu Thị table paginates for render performance — flip this on before an
  // image export so ReportView renders every row for the capture, then off
  // again once the capture is done.
  const [isExportingAllRows, setIsExportingAllRows] = useState(false);

  // Sync browser document tab title
  useEffect(() => {
    document.title = 'Report thi đua - TNB Leaderboard';
  }, []);

  // AppInner successfully mounting means this load is healthy — clear the
  // one-shot auto-reload flag ErrorBoundary sets on a stale-chunk error, so
  // a *future* deploy that hits the same issue can still recover itself
  // instead of silently staying stuck on a flag left over from today.
  useEffect(() => {
    try {
      sessionStorage.removeItem('tnb_chunk_reload_attempted');
    } catch {}
  }, []);

  // Show Cloud Sync Modal when launching on a fresh device (when local store cache is empty)
  // Only fires when the app was opened ALREADY logged in (session from localStorage) — the
  // explicit login path in onLoginSuccess handles its own sync animation.
  const isInitialLaunchDoneRef = useRef(false);
  useEffect(() => {
    if (!isInitialLaunchDoneRef.current && currentUser) {
      isInitialLaunchDoneRef.current = true;
      // Skip if login handler already triggered the sync animation this session
      if (cloudSyncShownRef.current) return;
      const isFreshDevice = !cachedData.realtimeStoresTinh?.length || !cachedData.luykeStoresTinh?.length;
      if (isFreshDevice) {
        triggerCloudSyncAnimation('Đang tải dữ liệu thi đua từ máy chủ Cloud cho thiết bị mới...');
      }
    }
  }, [currentUser]);

  // Human-readable labels for the datasets worth telling the user about when
  // they change remotely (i.e. saved from another device/session). Settings,
  // filters, category config etc. update too often/quietly to be worth a toast.
  const REMOTE_UPDATE_LABELS: Partial<Record<DocKey, string>> = {
    realtime_stores_tinh: 'Realtime Tỉnh',
    realtime_stores_vung: 'Realtime Vùng',
    luyke_stores_tinh: 'Luỹ Kế Tỉnh',
    luyke_stores_vung: 'Luỹ Kế Vùng',
    realtime_revenue_dt: 'Doanh thu Realtime',
    realtime_revenue_tc: 'Trả chậm Realtime',
    luyke_revenue_dt: 'Doanh thu Luỹ kế',
    luyke_revenue_tc: 'Trả chậm Luỹ kế',
    boss_assignments: 'Danh sách BOSS',
  };

  // Coalesces same-batch remote updates (a single save on another device
  // typically touches 2+ docs, e.g. store data + settings, that each fire
  // this listener within milliseconds of each other) into ONE toast instead
  // of one per doc.
  const pendingRemoteLabelsRef = useRef<Set<string>>(new Set());
  const remoteUpdateToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against showing the exact same "(these sources) loading" banner
  // twice in a row within a few seconds. In dev (npm run dev), React 18
  // StrictMode intentionally mounts effects twice to surface missing-cleanup
  // bugs — subscribeToFirebaseData's effect (and this whole notification
  // sequence) genuinely runs a second time as a result, which is why the
  // banner can flash, disappear, then reappear with the identical source
  // list on a fresh page load. That double-run doesn't happen in the
  // production build (only React's dev runtime does the extra pass), but
  // this dedupe makes the notification robust either way instead of
  // depending on that distinction.
  const lastShownRemoteUpdateRef = useRef<{ key: string; time: number } | null>(null);
  const notifyRemoteUpdate = (label: string) => {
    pendingRemoteLabelsRef.current.add(label);
    if (remoteUpdateToastTimerRef.current) clearTimeout(remoteUpdateToastTimerRef.current);
    remoteUpdateToastTimerRef.current = setTimeout(() => {
      const labels = Array.from(pendingRemoteLabelsRef.current).sort();
      pendingRemoteLabelsRef.current.clear();
      if (labels.length === 0) return;
      const key = labels.join('|');
      const now = Date.now();
      if (lastShownRemoteUpdateRef.current && lastShownRemoteUpdateRef.current.key === key && now - lastShownRemoteUpdateRef.current.time < 4000) {
        return;
      }
      lastShownRemoteUpdateRef.current = { key, time: now };
      showInfoToast(`Đang tải dữ liệu mới... (${labels.join(', ')})`);
    }, 600);
  };

  // Subscribe to Firebase Firestore Realtime Database updates
  useEffect(() => {
    const unsubscribe = subscribeToFirebaseData((payload, meta) => {
      if (payload.realtimeStoresTinh && payload.realtimeStoresTinh.length > 0) {
        setRealtimeStoresTinh(payload.realtimeStoresTinh);
      }
      if (payload.realtimeStoresVung && payload.realtimeStoresVung.length > 0) {
        setRealtimeStoresVung(payload.realtimeStoresVung);
      }
      if (payload.luykeStoresTinh && payload.luykeStoresTinh.length > 0) {
        setLuyKeStoresTinh(payload.luykeStoresTinh);
      }
      if (payload.luykeStoresVung && payload.luykeStoresVung.length > 0) {
        setLuyKeStoresVung(payload.luykeStoresVung);
      }
      if (payload.realtimeDtStores && payload.realtimeDtStores.length > 0) {
        setRealtimeDtStores(payload.realtimeDtStores);
      }
      if (payload.realtimeTcStores && payload.realtimeTcStores.length > 0) {
        setRealtimeTcStores(payload.realtimeTcStores);
      }
      if (payload.luykeDtStores && payload.luykeDtStores.length > 0) {
        setLuyKeDtStores(payload.luykeDtStores);
      }
      if (payload.luykeTcStores && payload.luykeTcStores.length > 0) {
        setLuyKeTcStores(payload.luykeTcStores);
      }
      if (payload.lastUpdateRealtimeDt) {
        setLastUpdateRealtimeDt(payload.lastUpdateRealtimeDt);
      }
      if (payload.lastUpdateRealtimeTc) {
        setLastUpdateRealtimeTc(payload.lastUpdateRealtimeTc);
      }
      if (payload.lastUpdateLuyKeDt) {
        setLastUpdateLuyKeDt(payload.lastUpdateLuyKeDt);
      }
      if (payload.lastUpdateLuyKeTc) {
        setLastUpdateLuyKeTc(payload.lastUpdateLuyKeTc);
      }
      if (payload.bossAssignments && payload.bossAssignments.length > 0) {
        setBossAssignments(payload.bossAssignments);
      }
      if (payload.settings) {
        setSettings((prev) => ({ ...prev, ...payload.settings }));
      }
      if (payload.userPreferences) {
        setUserPreferencesMap(payload.userPreferences);
      }
      if (payload.userFilters) {
        setUserFiltersMap(payload.userFilters);
      }
      if (payload.categoryGroups) {
        setCategoryGroupMap((prev) => ({ ...DEFAULT_CATEGORY_GROUP_MAP, ...prev, ...payload.categoryGroups }));
      }
      if (payload.categoryOrderMap) {
        setCategoryOrderMap(payload.categoryOrderMap);
      }
      if (payload.categoryDisplayNames) {
        setCategoryDisplayNameMap(payload.categoryDisplayNames);
      }
      if (payload.categoryHiddenMap) {
        setCategoryHiddenMap(payload.categoryHiddenMap);
      }
      if (payload.groupSummaryCards && Array.isArray(payload.groupSummaryCards) && payload.groupSummaryCards.length > 0) {
        try {
          localStorage.setItem('tnb_summary_cards', JSON.stringify(payload.groupSummaryCards));
        } catch {}
      }

      // Notify for genuine remote pushes (app already open, data changed
      // elsewhere) always. Also notify on this listener's own initial
      // snapshot IF the loading modal never ran this session — that's the
      // "reopened the app already logged in, cache still had yesterday's
      // data" case: nothing else ever told this user a refresh was
      // happening, so the silent background swap needs its own signal too.
      if (!meta.isInitial || !cloudSyncShownRef.current) {
        const label = REMOTE_UPDATE_LABELS[meta.docKey];
        if (label) notifyRemoteUpdate(label);
      }

      // First time THIS docKey has reported anything (initial or not) —
      // resolves the cloud-sync loading modal's wait once all 3 critical
      // datasets have checked in, without a second redundant read.
      if (CRITICAL_SYNC_DOC_KEYS.includes(meta.docKey) && !criticalDocsSeenRef.current.has(meta.docKey)) {
        criticalDocsSeenRef.current.add(meta.docKey);
        if (CRITICAL_SYNC_DOC_KEYS.every((k) => criticalDocsSeenRef.current.has(k))) {
          resolveCriticalSyncRef.current?.();
          resolveCriticalSyncRef.current = null;
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Derive the active `user` display profile from the synced preferences map
  // whenever either the map or the logged-in account changes — kept as its
  // own effect (rather than set inline above) so it stays correct even when
  // login happens after the Firestore subscription was first set up.
  useEffect(() => {
    if (currentUser && userPreferencesMap[currentUser.accountId]) {
      setUser(userPreferencesMap[currentUser.accountId]);
    }
  }, [currentUser, userPreferencesMap]);

  // Apply this account's last-synced filter snapshot exactly once per login
  // (guarded by the ref) — after that, the user's own clicks are the source
  // of truth locally; the debounced save effect below keeps pushing those
  // back up so other devices pick them up on their own next login.
  useEffect(() => {
    if (!currentUser) return;
    if (appliedFiltersForAccountRef.current === currentUser.accountId) return;
    appliedFiltersForAccountRef.current = currentUser.accountId;

    const saved = userFiltersMap[currentUser.accountId];
    if (!saved) return;
    if (saved.activeTab) setActiveTab(saved.activeTab);
    if (saved.timeMode) setTimeMode(saved.timeMode);
    if (saved.entityScope) setEntityScope(saved.entityScope);
    if (saved.selectedChannels) setSelectedChannels(saved.selectedChannels);
    if (saved.selectedProvince) setSelectedProvince(saved.selectedProvince);
    if (saved.selectedBoss) setSelectedBoss(saved.selectedBoss);
    if (saved.selectedCategory) setSelectedCategory(saved.selectedCategory);
    if (saved.selectedCategoryGroup) setSelectedCategoryGroup(saved.selectedCategoryGroup);
  }, [currentUser, userFiltersMap]);

  // Debounced sync of the current filter selection (incl. which tab is open)
  // up to Firestore, scoped under this account's own key in the shared
  // user_filters doc. Debounced (not one write per click/tab-switch) since
  // these change far more often than the other synced datasets.
  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      const snapshot = { activeTab, timeMode, entityScope, selectedChannels, selectedProvince, selectedBoss, selectedCategory, selectedCategoryGroup };
      setUserFiltersMap((prev) => {
        const next = { ...prev, [currentUser.accountId]: snapshot };
        void saveUserFiltersToFirebase(next, currentUser.name);
        return next;
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [currentUser, activeTab, timeMode, entityScope, selectedChannels, selectedProvince, selectedBoss, selectedCategory, selectedCategoryGroup]);

  // Synchronize activeTab & entityScope with URL hash & document.title
  useEffect(() => {
    const targetHash = getHashFromRoute(activeTab, entityScope);
    const targetTitle = getTitleFromRoute(activeTab, entityScope, settings.systemName);

    document.title = targetTitle;

    // Update URL hash without polluting browser history
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  }, [activeTab, entityScope, settings.systemName]);

  // Listen to browser hash changes (Back / Forward navigation or manual URL typing)
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseRouteFromHash(window.location.hash);
      if (parsed) {
        if (parsed.tab !== activeTab) setActiveTab(parsed.tab);
        if (parsed.scope && parsed.scope !== entityScope) setEntityScope(parsed.scope);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab, entityScope, setActiveTab, setEntityScope]);

  // Secondary local hydration: localStorage (read synchronously above, into
  // `cachedData`) has a small quota and can silently evict data once several
  // hundred pasted rows accumulate across all 4 boxes. IndexedDB has far more
  // headroom and is written on every save (see storeService.writeLocalCache),
  // so recover from it here whenever localStorage came up empty for a
  // dataset. Firestore (subscription above) remains authoritative and will
  // overwrite this the moment it connects — this only covers the gap before
  // that, or while offline/signed-out.
  useEffect(() => {
    (async () => {
      const idbCache = await getIndexedDbCache();
      if (!cachedData.realtimeStoresTinh?.length && idbCache.realtimeStoresTinh?.length) {
        setRealtimeStoresTinh(idbCache.realtimeStoresTinh);
      }
      if (!cachedData.realtimeStoresVung?.length && idbCache.realtimeStoresVung?.length) {
        setRealtimeStoresVung(idbCache.realtimeStoresVung);
      }
      if (!cachedData.luykeStoresTinh?.length && idbCache.luykeStoresTinh?.length) {
        setLuyKeStoresTinh(idbCache.luykeStoresTinh);
      }
      if (!cachedData.luykeStoresVung?.length && idbCache.luykeStoresVung?.length) {
        setLuyKeStoresVung(idbCache.luykeStoresVung);
      }
      if (!cachedData.bossAssignments?.length && idbCache.bossAssignments?.length) {
        setBossAssignments(idbCache.bossAssignments);
      }
      if (!cachedData.settings && idbCache.settings) {
        setSettings((prev) => ({ ...prev, ...idbCache.settings }));
      }
      if (!cachedData.userPreferences && idbCache.userPreferences) {
        setUserPreferencesMap(idbCache.userPreferences);
      }
      if (!cachedData.userFilters && idbCache.userFilters) {
        setUserFiltersMap(idbCache.userFilters);
      }
      if (!cachedData.categoryGroups && idbCache.categoryGroups) {
        setCategoryGroupMap(idbCache.categoryGroups);
      }
      if (!cachedData.categoryHiddenMap && idbCache.categoryHiddenMap) {
        setCategoryHiddenMap(idbCache.categoryHiddenMap);
      }
    })();
  }, []);

  // Siêu Thị and Nhóm are both per-store views (hundreds of rows) — opening
  // either with no province chosen yet ("Tất cả") renders every store in the
  // whole vùng at once, which is what caused the lag. Default to the first
  // province instead. The ref starts at null (not the current entityScope),
  // so this also covers loading straight into one of these scopes on a fresh
  // account (persisted entityScope='vung'/'nhom' but selectedProvince never
  // set) — not just switching tabs mid-session. A province the user already
  // picked (persisted, or an explicit "Tất cả" chosen while already in one of
  // these scopes) is left alone — that's the "mở lần sau lấy dữ liệu đã lưu"
  // part of the requirement.
  // useLayoutEffect (not useEffect) so this correction lands before the
  // browser paints — with useEffect, React committed and painted the
  // still-unfiltered ("Tất cả") render first, then this ran and triggered a
  // second render/paint moments later. That's the visible "loads everything,
  // then reloads by tỉnh" flash/lag the switch felt like.
  const prevEntityScopeRef = useRef<EntityScope | null>(null);
  useLayoutEffect(() => {
    if (prevEntityScopeRef.current !== entityScope) {
      if ((entityScope === 'vung' || entityScope === 'nhom') && selectedProvince === 'ALL') {
        const stores = timeMode === 'realtime' ? realtimeStoresVung : luykeStoresVung;
        const firstProvince = Array.from(new Set(stores.map((s: StoreRecord) => s.tinh))).sort()[0];
        if (firstProvince) setSelectedProvince(firstProvince);
      } else if (entityScope === 'sieuthi' || entityScope === 'tong') {
        // SIÊU THỊ / TỔNG (the overview scopes) are meant to show everything
        // by default, so clear filters back to "Tất cả" — except Kênh, whose
        // default across every tab is TGD-only, not every channel checked.
        setSelectedProvince('ALL');
        setSelectedChannels(['TGD']);
        setSelectedCategoryGroup('ALL');
        setSelectedCategory('ALL');
        setSelectedPhanLoaiShop('ALL');
        setSelectedTinhMoi('ALL');
      }
      prevEntityScopeRef.current = entityScope;
    }
  }, [entityScope, selectedProvince, timeMode, realtimeStoresVung, luykeStoresVung]);

  // Defense in depth: the Sidebar already hides the "Cập nhật" menu item for
  // Editor/Viewer, but a stale persisted tab (from before a role downgrade,
  // or a role change on another device) could otherwise still land them on
  // it directly on load — bounce back to Report in that case.
  useEffect(() => {
    if (!currentUser) return;
    const canUpdateData = currentUser.role === 'super_admin' || currentUser.role === 'admin';
    if (activeTab === 'update' && !canUpdateData) {
      setActiveTab('report');
    }
  }, [activeTab, currentUser]);

  // Show login screen if user is unauthenticated is moved to the render return below
  // so all hooks execute in constant order across login state changes.

  // Helper to extract number of days in month from timestamp text
  const daysInMonth = useMemo(() => {
    const text = timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe;
    if (text) {
      const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) {
        const month = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        return new Date(year, month, 0).getDate();
      }
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }, [timeMode, settings.lastUpdateRealtime, settings.lastUpdateLuyKe]);

  // Number of days elapsed (completed) in the month — the day from lastUpdated
  // MINUS 1 because the current day hasn't finished yet (e.g. ngày 17 → 16
  // ngày đã qua). Used for Luỹ Kế % HT Dự Kiến formula:
  //   ((DTLK / daysElapsed) * daysInMonth) / Target * 100
  const daysElapsed = useMemo(() => {
    const text = timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe;
    if (text) {
      const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) {
        return Math.max(1, parseInt(m[1], 10) - 1); // DD - 1, min 1
      }
    }
    return Math.max(1, new Date().getDate() - 1); // fallback: today - 1
  }, [timeMode, settings.lastUpdateRealtime, settings.lastUpdateLuyKe]);

  // Get active stores depending on TimeMode & Scope (Vùng vs Siêu Thị / Tỉnh)
  // Both Tab VÙNG and Tab SIÊU THỊ use the store-level dataset so data calculates dynamically per KÊNH
  const activeStores = useMemo(() => {
    const rawStores = timeMode === 'realtime'
      ? (realtimeStoresVung.length > 0 ? realtimeStoresVung : realtimeStoresTinh)
      : (luykeStoresVung.length > 0 ? luykeStoresVung : luykeStoresTinh);

    // If in Realtime mode, compute Target Ngày = Target Tháng (từ Luỹ Kế Siêu Thị) / số ngày trong tháng
    if (timeMode === 'realtime' && luykeStoresVung.length > 0) {
      const luykeByMst = new Map<string, StoreRecord>();
      const luykeByName = new Map<string, StoreRecord>();
      luykeStoresVung.forEach((ls) => {
        const mst = extractMst(ls.sieuthi);
        if (mst) luykeByMst.set(mst, ls);
        luykeByName.set(ls.sieuthi.toLowerCase().trim(), ls);
      });

      return rawStores.map((s) => {
        const mst = extractMst(s.sieuthi);
        const lStore = (mst ? luykeByMst.get(mst) : undefined) || luykeByName.get(s.sieuthi.toLowerCase().trim());
        if (!lStore) return s;

        const monthlyTotalTarget = lStore.target || 0;
        const dailyTotalTarget = daysInMonth > 0 && monthlyTotalTarget > 0 ? Number((monthlyTotalTarget / daysInMonth).toFixed(2)) : s.target;
        const totalAchieved = s.achieved || 0;
        const totalRate = dailyTotalTarget > 0 ? Number(((totalAchieved / dailyTotalTarget) * 100).toFixed(1)) : s.rate;

        const newCategoryMap: Record<string, { target: number; achieved: number; rate: number }> = {};
        const allCats = new Set([
          ...Object.keys(s.categoryMap || {}),
          ...Object.keys(lStore.categoryMap || {}),
        ]);

        allCats.forEach((cat) => {
          const sCat = s.categoryMap?.[cat] || { target: 0, achieved: 0, rate: 0 };
          const lCat = lStore.categoryMap?.[cat];
          const monthlyTarget = lCat?.target || 0;
          const dailyTarget = daysInMonth > 0 && monthlyTarget > 0 ? Number((monthlyTarget / daysInMonth).toFixed(2)) : sCat.target;
          const achieved = sCat.achieved || 0;
          const rate = dailyTarget > 0 ? Number(((achieved / dailyTarget) * 100).toFixed(1)) : (sCat.rate || 0);

          newCategoryMap[cat] = {
            target: dailyTarget,
            achieved,
            rate,
          };
        });

        return {
          ...s,
          target: dailyTotalTarget,
          rate: totalRate,
          categoryMap: newCategoryMap,
        };
      });
    }

    return rawStores;
  }, [timeMode, realtimeStoresVung, realtimeStoresTinh, luykeStoresVung, luykeStoresTinh, daysInMonth]);

  // Extract unique provinces & bosses for filter dropdowns. These used to be
  // plain `const`s recomputed on every App render (any keystroke/state
  // change anywhere), not just when their own source data changed — bossList
  // in particular calls getBossForStore() once per store, so this alone was
  // an O(stores) pass through the whole active dataset on every render.
  const provinceList = useMemo(
    () => Array.from(new Set(activeStores.map((s) => s.tinh))).sort(),
    [activeStores]
  );
  // Phân Loại Shop values come from the BOSS file (e.g. "<3 TỶ", "3-5 TỶ") —
  // sourced from bossAssignments directly rather than per-store lookups,
  // since a store may not have a resolvable BOSS match yet.
  const phanLoaiShopList = useMemo(
    () => Array.from(
      new Set(bossAssignments.map((b) => b.phanLoaiShop).filter((v): v is string => Boolean(v && v !== '-')))
    ).sort(),
    [bossAssignments]
  );
  // Tỉnh MỚI 2026 (cột H file BOSS) — tỉnh sáp nhập mới, độc lập với cột
  // TỈNH (K) hiện dùng cho bộ lọc Tỉnh gốc.
  const tinhMoiList = useMemo(
    () => Array.from(
      new Set(bossAssignments.map((b) => b.tinhMoi).filter((v): v is string => Boolean(v && v !== '-')))
    ).sort(),
    [bossAssignments]
  );
  const bossList: string[] = useMemo(
    () => (Array.from(
      new Set([
        ...activeStores.map((s) => getBossForStore(s.sieuthi, bossAssignments, s.boss)),
        ...bossAssignments.map((b) => b.boss).filter(Boolean),
      ])
    ) as string[]).sort(),
    [activeStores, bossAssignments]
  );

  const parsedCategoryNames = useMemo(
    () => Array.from(
      new Set([
        ...realtimeStoresVung.flatMap((s) => (s.categoryMap ? Object.keys(s.categoryMap) : [])),
        ...realtimeStoresTinh.flatMap((s) => (s.categoryMap ? Object.keys(s.categoryMap) : [])),
        ...luykeStoresVung.flatMap((s) => (s.categoryMap ? Object.keys(s.categoryMap) : [])),
        ...luykeStoresTinh.flatMap((s) => (s.categoryMap ? Object.keys(s.categoryMap) : [])),
      ])
    ).sort(),
    [realtimeStoresVung, realtimeStoresTinh, luykeStoresVung, luykeStoresTinh]
  );

  const dynamicCategoryOptions = useMemo(
    () => parsedCategoryNames.map((name) => ({
      id: String(name),
      label: String(name).toUpperCase(),
    })),
    [parsedCategoryNames]
  );

  const baseCategoryList = [
    { id: 'ict', label: 'NHÓM ICT TỔNG' },
    { id: 'flagship', label: 'ĐIỆN THOẠI FLAGSHIP' },
    { id: 'phoneTablet', label: 'ĐIỆN THOẠI & TABLET' },
    { id: 'laptop', label: 'LAPTOP' },
    { id: 'phukien', label: 'PHỤ KIỆN' },
    { id: 'dongho', label: 'ĐỒNG HỒ' },
    { id: 'camera', label: 'CAMERA' },
    { id: 'loa', label: 'LOA' },
    { id: 'sacduphong', label: 'SẠC DỰ PHÒNG' },
    { id: 'tainghe', label: 'TAI NGHE' },
    { id: 'dennangluong', label: 'ĐÈN NĂNG LƯỢNG' },
    { id: 'baohanh', label: 'BẢO HÀNH' },
  ];

  const categoryList = dynamicCategoryOptions.length > 0 ? dynamicCategoryOptions : baseCategoryList;

  // Unique group names declared via the Category Group modal (Ngành hàng → Nhóm mapping)
  const categoryGroupList = Array.from(new Set(Object.values(categoryGroupMap))).sort();

  // DTQĐ TB (revenue-per-sales-headcount, sourced from the BOSS file) and the
  // DT Luỹ Kế/Realtime value-display toggle are restricted to Super Admin
  // and Admin — Editor/Viewer accounts never see this figure anywhere
  // (Report tables, BOSS list, or the toolbar toggle).
  const canViewDtQdTb = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  // Only Super Admin / Admin may paste & sync new data — everyone else is
  // view-only. Mirrors the Sidebar's own menu-item gating as a render-time
  // guard, so the Update tab's content never even briefly flashes for a
  // role that shouldn't have it.
  const canUpdateData = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  // Helper to format exact timestamp like "12:37:00 NGÀY 09/8/2026"
  const getFormattedNow = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return `${hours}:${minutes}:${seconds} NGÀY ${day}/${month}/${year}`;
  };

  const extractTimestampFromRawText = (rawText: string): string => {
    if (rawText) {
      const match = rawText.match(/(\d{1,2}:\d{2}:\d{2}(?:\s+NGÀY|\s+-)?\s+\d{1,2}\/\d{1,2}(?:\/20\d\d)?)/i);
      if (match) {
        let ts = match[1].trim();
        if (!ts.toUpperCase().includes('NGÀY')) {
          ts = ts.replace(/(\d{1,2}:\d{2}:\d{2})\s*(?:-)?\s*(\d{1,2}\/\d{1,2})/, '$1 NGÀY $2');
        }
        return ts;
      }
    }
    return getFormattedNow();
  };

  // Handler to update Realtime dataset from Update tab & sync Firebase
  const handleUpdateRealtimeData = async (newStores: StoreRecord[], rawText: string, scope: 'tinh' | 'vung' = 'tinh') => {
    if (scope === 'vung') {
      setRealtimeStoresVung(newStores);
    } else {
      setRealtimeStoresTinh(newStores);
    }
    const timestamp = extractTimestampFromRawText(rawText);
    const newSettings = { ...settings, lastUpdateRealtime: timestamp };
    setSettings(newSettings);
    setTimeMode('realtime');

    // Sync to Firebase (scope-specific document — Tỉnh & Vùng persist independently)
    const [res1, res2] = await Promise.all([
      saveRealtimeStoresToFirebase(newStores, currentUser.name, scope),
      saveSettingsToFirebase(newSettings, currentUser.name),
    ]);
    if (!res1.success || !res2.success) {
      showErrorToast(res1.error || res2.error || 'Đồng bộ lên Firebase thất bại!');
      return;
    }
    showToast(`Đã đồng bộ ${newStores.length} siêu thị Realtime (${scope === 'vung' ? 'Thi đua Vùng' : 'Thi đua Tỉnh'}) lúc ${timestamp}!`);
  };

  // Handler to update Luỹ Kế dataset from Update tab & sync Firebase
  const handleUpdateLuyKeData = async (newStores: StoreRecord[], rawText: string, scope: 'tinh' | 'vung' = 'tinh') => {
    if (scope === 'vung') {
      setLuyKeStoresVung(newStores);
    } else {
      setLuyKeStoresTinh(newStores);
    }
    const timestamp = extractTimestampFromRawText(rawText);
    const newSettings = { ...settings, lastUpdateLuyKe: timestamp };
    setSettings(newSettings);
    setTimeMode('luyke');

    // Sync to Firebase (scope-specific document — Tỉnh & Vùng persist independently)
    const [res1, res2] = await Promise.all([
      saveLuyKeStoresToFirebase(newStores, currentUser.name, scope),
      saveSettingsToFirebase(newSettings, currentUser.name),
    ]);
    if (!res1.success || !res2.success) {
      showErrorToast(res1.error || res2.error || 'Đồng bộ lên Firebase thất bại!');
      return;
    }
    showToast(`Đã đồng bộ ${newStores.length} siêu thị Luỹ kế (${scope === 'vung' ? 'Thi đua Vùng' : 'Thi đua Tỉnh'}) lúc ${timestamp}!`);
  };

  // Handler to update Boss assignments across both Realtime & Luỹ kế datasets & sync Firebase
  const handleUpdateBossData = async (newBossAssignments: BossAssignmentRecord[]) => {
    if (newBossAssignments.length === 0) return;

    // Keeps the SAME object reference for a store whose boss/tinh/kenh didn't
    // actually change — a BOSS file upload typically reassigns only a
    // handful of stores, not all of them. saveChunkedStoreDataset below uses
    // that reference identity to skip re-uploading any 100-store chunk
    // that's untouched, instead of always rewriting all ~9 chunks per
    // dataset (x4 datasets) on every single BOSS import.
    const updateStores = (stores: StoreRecord[]) =>
      stores.map((s) => {
        const found = findBossAssignmentRecord(s.sieuthi, newBossAssignments);
        if (found) {
          const newBoss = found.boss || s.boss;
          const newTinh = found.tinh || s.tinh;
          const newKenh = (found.kenh as Channel) || s.kenh;
          if (newBoss === s.boss && newTinh === s.tinh && newKenh === s.kenh) {
            return s;
          }
          return { ...s, boss: newBoss, tinh: newTinh, kenh: newKenh };
        }
        return s;
      });

    const updatedRealtimeTinh = updateStores(realtimeStoresTinh);
    const updatedRealtimeVung = updateStores(realtimeStoresVung);
    const updatedLuyKeTinh = updateStores(luykeStoresTinh);
    const updatedLuyKeVung = updateStores(luykeStoresVung);

    setRealtimeStoresTinh(updatedRealtimeTinh);
    setRealtimeStoresVung(updatedRealtimeVung);
    setLuyKeStoresTinh(updatedLuyKeTinh);
    setLuyKeStoresVung(updatedLuyKeVung);

    setBossAssignments(newBossAssignments);

    // Sync to Firebase — each Tỉnh/Vùng dataset is its own document
    const results = await Promise.all([
      saveRealtimeStoresToFirebase(updatedRealtimeTinh, currentUser.name, 'tinh'),
      saveRealtimeStoresToFirebase(updatedRealtimeVung, currentUser.name, 'vung'),
      saveLuyKeStoresToFirebase(updatedLuyKeTinh, currentUser.name, 'tinh'),
      saveLuyKeStoresToFirebase(updatedLuyKeVung, currentUser.name, 'vung'),
      saveBossAssignmentsToFirebase(newBossAssignments, currentUser.name),
    ]);
    const failed = results.find((r) => !r.success);
    if (failed) {
      showErrorToast(failed.error || 'Đồng bộ phân công BOSS lên Firebase thất bại!');
      return;
    }

    showToast(`Đã đồng bộ phân công BOSS thành công lên Firebase cho ${newBossAssignments.length} siêu thị!`);
  };

  // Handlers to update & sync Revenue & Installment (Doanh thu & Trả chậm) to Firebase
  const handleUpdateRealtimeDt = async (newStores: StoreRecord[], timestamp: string = '') => {
    setRealtimeDtStores(newStores);
    if (timestamp) setLastUpdateRealtimeDt(timestamp);
    const ts = timestamp || lastUpdateRealtimeDt || '';
    const res = await saveRealtimeDtToFirebase(newStores, ts, currentUser?.name || 'Super Admin');
    if (!res.success) {
      showErrorToast(res.error || 'Đồng bộ Doanh thu Realtime lên Firebase thất bại!');
      return;
    }
    showToast(`Đã đồng bộ ${newStores.length} dòng Doanh thu Realtime lên Firebase!`);
  };

  const handleUpdateRealtimeTc = async (newStores: StoreRecord[], timestamp: string = '') => {
    setRealtimeTcStores(newStores);
    if (timestamp) setLastUpdateRealtimeTc(timestamp);
    const ts = timestamp || lastUpdateRealtimeTc || '';
    const res = await saveRealtimeTcToFirebase(newStores, ts, currentUser?.name || 'Super Admin');
    if (!res.success) {
      showErrorToast(res.error || 'Đồng bộ Trả chậm Realtime lên Firebase thất bại!');
      return;
    }
    showToast(`Đã đồng bộ ${newStores.length} dòng Trả chậm Realtime lên Firebase!`);
  };

  const handleUpdateLuyKeDt = async (newStores: StoreRecord[], timestamp: string = '') => {
    setLuyKeDtStores(newStores);
    if (timestamp) setLastUpdateLuyKeDt(timestamp);
    const ts = timestamp || lastUpdateLuyKeDt || '';
    const res = await saveLuyKeDtToFirebase(newStores, ts, currentUser?.name || 'Super Admin');
    if (!res.success) {
      showErrorToast(res.error || 'Đồng bộ Doanh thu Luỹ kế lên Firebase thất bại!');
      return;
    }
    showToast(`Đã đồng bộ ${newStores.length} dòng Doanh thu Luỹ kế lên Firebase!`);
  };

  const handleUpdateLuyKeTc = async (newStores: StoreRecord[], timestamp: string = '') => {
    setLuyKeTcStores(newStores);
    if (timestamp) setLastUpdateLuyKeTc(timestamp);
    const ts = timestamp || lastUpdateLuyKeTc || '';
    const res = await saveLuyKeTcToFirebase(newStores, ts, currentUser?.name || 'Super Admin');
    if (!res.success) {
      showErrorToast(res.error || 'Đồng bộ Trả chậm Luỹ kế lên Firebase thất bại!');
      return;
    }
    showToast(`Đã đồng bộ ${newStores.length} dòng Trả chậm Luỹ kế lên Firebase!`);
  };

  const showToast = (msg: string) => {
    setToastBanner({ type: 'success', text: msg });
    confetti({ particleCount: 60, spread: 60, origin: { y: 0.2 } });
    setTimeout(() => setToastBanner(null), 3000);
  };

  const showErrorToast = (msg: string) => {
    setToastBanner({ type: 'error', text: msg });
    // Kept up noticeably longer than the success toast — sync failures are
    // easy to miss otherwise, which previously left users thinking a paste
    // had saved when it had actually silently failed.
    setTimeout(() => setToastBanner(null), 12000);
  };

  // Passive notice that another device/session just pushed new data — no
  // confetti (this wasn't the user's own action) but kept up long enough to
  // actually notice on a phone that isn't being stared at.
  const showInfoToast = (msg: string) => {
    setToastBanner({ type: 'info', text: msg });
    setTimeout(() => setToastBanner(null), 6000);
  };

  // Persistent-ish notice (needs a manual close, like errors) that the
  // account just logged in / opened the app and there's genuinely no data
  // on the server yet — as opposed to silently showing an empty report with
  // no explanation of why.
  const showWarningToast = (msg: string) => {
    setToastBanner({ type: 'warning', text: msg });
    setTimeout(() => setToastBanner(null), 12000);
  };

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
  };

  const handleForceClearCache = async () => {
    await clearAllLocalCache();
    setLuyKeStoresTinh([]);
    setLuyKeStoresVung([]);
    setRealtimeStoresTinh([]);
    setRealtimeStoresVung([]);
    setSettings(initialSettings);
    setCategoryGroupMap(DEFAULT_CATEGORY_GROUP_MAP);

    showToast('⚡ Đã xoá bộ nhớ cache và làm mới dữ liệu!');
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Handler for the Settings tab's "Lưu Cài Đặt Hệ Thống" form. Previously
  // this only called the raw setSettings/setUser React setters (no Firebase
  // sync at all) — the "Đã lưu!" confirmation was misleading since nothing
  // persisted past a refresh unless a paste happened to piggyback the sync
  // afterward. Settings (global) go straight to their own doc; the user
  // profile is merged into the shared user_preferences doc under this
  // account's own key so it doesn't overwrite other accounts' profiles.
  const handleSaveSettings = async (newSettings: AppSettings, newUserProfile: UserProfile) => {
    setSettings(newSettings);
    setUser(newUserProfile);
    const newPreferencesMap = { ...userPreferencesMap, [currentUser.accountId]: newUserProfile };
    setUserPreferencesMap(newPreferencesMap);

    const [res1, res2] = await Promise.all([
      saveSettingsToFirebase(newSettings, currentUser.name),
      saveUserPreferencesToFirebase(newPreferencesMap, currentUser.name),
    ]);
    if (!res1.success || !res2.success) {
      showErrorToast(res1.error || res2.error || 'Đồng bộ cài đặt lên Firebase thất bại!');
      return;
    }
    showToast('Đã lưu & đồng bộ cài đặt lên Firebase!');
  };

  // Handler for the Category Group modal (Quản lý Nhóm & Vị trí Ngành Hàng). Global
  // mapping, shared by every account — same doc pattern as `settings`.
  const handleSaveCategoryGroups = async (
    newMap: Record<string, string>,
    newOrderMap: Record<string, number>,
    newDisplayNameMap: Record<string, string>,
    newHiddenMap: Record<string, boolean>
  ) => {
    setCategoryGroupMap(newMap);
    setCategoryOrderMap(newOrderMap);
    setCategoryDisplayNameMap(newDisplayNameMap);
    setCategoryHiddenMap(newHiddenMap);
    const [res1, res2, res3, res4] = await Promise.all([
      saveCategoryGroupsToFirebase(newMap, currentUser.name),
      saveCategoryOrdersToFirebase(newOrderMap, currentUser.name),
      saveCategoryDisplayNamesToFirebase(newDisplayNameMap, currentUser.name),
      saveCategoryHiddenToFirebase(newHiddenMap, currentUser.name),
    ]);
    if (!res1.success || !res2.success || !res3.success || !res4.success) {
      showErrorToast(res1.error || res2.error || res3.error || res4.error || 'Đồng bộ cấu hình Ngành Hàng lên Firebase thất bại!');
      return;
    }
    showToast('Đã lưu & đồng bộ Nhóm, Vị trí & Trạng thái Ẩn/Hiện lên Firebase!');
  };

  // "Xuất Rút Gọn" — just the leaderboard table (no KPI cards/charts).
  const handleExportCompact = async () => {
    const el = document.getElementById('report-table-export-root');
    if (!el) {
      showErrorToast('Không tìm thấy bảng để xuất ảnh — hãy mở tab Report trước.');
      return;
    }
    setExportModalState({
      isOpen: true,
      title: 'ĐANG XUẤT ẢNH BÁO CÁO (GỌN)',
      subText: 'Hệ thống đang chụp & tự động fix chuẩn độ rộng từng cột...',
    });
    setIsExportingAllRows(true);
    try {
      // Let ReportView re-render with pagination bypassed before capturing.
      await new Promise((r) => setTimeout(r, 350));
      const filename = `ThiDua_RutGon_${timeMode === 'realtime' ? 'Realtime' : 'LuyKe'}_${new Date().toISOString().slice(0, 10)}.png`;
      const remarkConfig = getLocalRemarkConfig();
      const remarkContext = {
        stores: activeStores,
        selectedProvince,
        selectedChannels,
        selectedBoss,
        selectedPhanLoaiShop,
        selectedTinhMoi,
        selectedCategory,
        selectedCategoryGroup,
        categoryGroupMap,
        bossAssignments,
        categoryDisplayNameMap,
        timeModeName: timeMode === 'realtime' ? 'Realtime' : 'Luỹ Kế',
        lastUpdated: timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe,
        entityScope,
        remarkDisplayMode: remarkConfig.displayMode,
        templateType: remarkConfig.templateType,
        includeEmoji: remarkConfig.includeEmoji,
        includeCallToAction: remarkConfig.includeCallToAction,
      };
      const remarkText = generateReportRemarksText(remarkContext);
      const blob = await exportElementAsImage(el, filename, { remarkTextToCopy: remarkText, remarkContext });
      if (!blob) {
        showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
        return;
      }
      showToast('Đã xuất báo cáo & tự động sao chép nhận xét!');
    } finally {
      setIsExportingAllRows(false);
      setExportModalState({ isOpen: false });
    }
  };

  // "Xuất Ảnh Tổng" — the whole report (KPI cards + charts + table).
  const handleExportFull = async () => {
    const el = document.getElementById('report-export-root');
    if (!el) {
      showErrorToast('Không tìm thấy báo cáo để xuất ảnh — hãy mở tab Report trước.');
      return;
    }
    setExportModalState({
      isOpen: true,
      title: 'ĐANG XUẤT TẤT CẢ (1 TẤM HD)',
      subText: 'Hệ thống đang định dạng toàn bộ 38 ngành hàng & tự động fix kích thước cột...',
    });
    setIsExportingAllRows(true);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const filename = `ThiDua_TongHop_${timeMode === 'realtime' ? 'Realtime' : 'LuyKe'}_${new Date().toISOString().slice(0, 10)}.png`;
      const remarkConfig = getLocalRemarkConfig();
      const remarkContext = {
        stores: activeStores,
        selectedProvince,
        selectedChannels,
        selectedBoss,
        selectedPhanLoaiShop,
        selectedTinhMoi,
        selectedCategory,
        selectedCategoryGroup,
        categoryGroupMap,
        bossAssignments,
        categoryDisplayNameMap,
        timeModeName: timeMode === 'realtime' ? 'Realtime' : 'Luỹ Kế',
        lastUpdated: timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe,
        entityScope,
        remarkDisplayMode: remarkConfig.displayMode,
        templateType: remarkConfig.templateType,
        includeEmoji: remarkConfig.includeEmoji,
        includeCallToAction: remarkConfig.includeCallToAction,
      };
      const remarkText = generateReportRemarksText(remarkContext);
      const blob = await exportElementAsImage(el, filename, { remarkTextToCopy: remarkText, remarkContext });
      if (!blob) {
        showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
        return;
      }
      showToast('Đã xuất đầy đủ bảng xếp hạng & tự động sao chép nhận xét!');
    } finally {
      setIsExportingAllRows(false);
      setExportModalState({ isOpen: false });
    }
  };

  // "Xuất Nhanh / Xuất Theo Nhóm / Xuất Hiển Thị" — exports image by rendering exact target group state
  const handleExportGroup = async (target: 'ict' | 'dichvu' | 'ce' | 'all' | 'by_groups' | 'quick') => {
    const el = document.getElementById('report-export-root');
    if (!el) {
      showErrorToast('Không tìm thấy báo cáo để xuất ảnh — hãy mở tab Report trước.');
      return;
    }

    const groupNames: Record<string, string> = {
      quick: 'Nhanh (STT -> Tỉ lệ)',
      ict: 'Nhóm ICT',
      dichvu: 'Nhóm Dịch Vụ',
      ce: 'Nhóm CE & Gia Dụng',
      by_groups: 'Theo Nhóm Ngành Hàng',
      all: 'Hiển Thị',
    };
    setExportModalState({
      isOpen: true,
      title: `ĐANG XUẤT ẢNH ${groupNames[target]?.toUpperCase() || 'BÁO CÁO'}`,
      subText: 'Đang tự động căn chỉnh khung cột vừa vặn nội dung & tạo file PNG sắc nét...',
    });

    const previousGroup = selectedCategoryGroup;
    const remarkConfig = getLocalRemarkConfig();
    const baseRemarkContext = {
      stores: activeStores,
      selectedProvince,
      selectedChannels,
      selectedBoss,
      selectedPhanLoaiShop,
      selectedTinhMoi,
      selectedCategory,
      selectedCategoryGroup,
      categoryGroupMap,
      bossAssignments,
      categoryDisplayNameMap,
      timeModeName: timeMode === 'realtime' ? 'Realtime' : 'Luỹ Kế',
      lastUpdated: timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe,
      entityScope,
      remarkDisplayMode: remarkConfig.displayMode,
      templateType: remarkConfig.templateType,
      includeEmoji: remarkConfig.includeEmoji,
      includeCallToAction: remarkConfig.includeCallToAction,
    };
    const remarkText = generateReportRemarksText(baseRemarkContext);

    setIsExportingAllRows(true);
    try {
      if (target === 'quick') {
        await new Promise((r) => setTimeout(r, 200));
        const targetEl = document.getElementById('report-export-root');
        if (targetEl) {
          const filename = `Bang_Xep_Hang_Xuat_Nhanh_${timeMode === 'realtime' ? 'Realtime' : 'LuyKe'}_${new Date().toISOString().slice(0, 10)}.png`;
          const blob = await exportGroupSpecificElement(targetEl, 'quick', filename, { remarkTextToCopy: remarkText, remarkContext: baseRemarkContext });
          if (blob) {
            showToast('✨ Đã xuất nhanh bảng xếp hạng (STT -> Tỉ lệ) & tự động sao chép nhận xét!');
          } else {
            showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
          }
        }
      } else if (target === 'by_groups') {
        showToast('Đang khởi tạo và xuất tự động 3 bộ ảnh theo nhóm...');
        const groupsToExport = ['ICT', 'DỊCH VỤ', 'CE & GD'];
        let exportedCount = 0;

        for (const grp of groupsToExport) {
          setSelectedCategoryGroup(grp);
          // Allow React to re-render component with new group data & ranking
          await new Promise((r) => setTimeout(r, 350));
          const targetEl = document.getElementById('report-export-root');
          if (targetEl) {
            const filename = `Bang_Xep_Hang_Nhom_${grp.replace(/[^a-zA-Z0-9]/g, '_')}_${timeMode === 'realtime' ? 'Realtime' : 'LuyKe'}_${new Date().toISOString().slice(0, 10)}.png`;
            const groupRemarkCtx = { ...baseRemarkContext, selectedCategoryGroup: grp };
            const groupRemarkTxt = generateReportRemarksText(groupRemarkCtx);
            const blob = await exportElementAsImage(targetEl, filename, { remarkTextToCopy: groupRemarkTxt, remarkContext: groupRemarkCtx });
            if (blob) exportedCount++;
          }
        }
        if (exportedCount > 0) {
          showToast('✨ Đã xuất tự động 3 ảnh bộ báo cáo & tự động sao chép nhận xét!');
        } else {
          showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
        }
      } else if (target === 'all') {
        await new Promise((r) => setTimeout(r, 200));
        const targetEl = document.getElementById('report-export-root');
        if (targetEl) {
          const filename = `Bang_Xep_Hang_Hien_Thi_${timeMode === 'realtime' ? 'Realtime' : 'LuyKe'}_${new Date().toISOString().slice(0, 10)}.png`;
          const blob = await exportElementAsImage(targetEl, filename, { remarkTextToCopy: remarkText, remarkContext: baseRemarkContext });
          if (blob) {
            showToast('✨ Đã xuất ảnh bảng xếp hạng hiển thị & tự động sao chép nhận xét!');
          } else {
            showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
          }
        }
      } else {
        const grp = targetMap[target] || 'ALL';
        setSelectedCategoryGroup(grp);
        await new Promise((r) => setTimeout(r, 350));
        const targetEl = document.getElementById('report-export-root');
        if (targetEl) {
          const filename = `Bang_Xep_Hang_Nhom_${grp.replace(/[^a-zA-Z0-9]/g, '_')}_${timeMode === 'realtime' ? 'Realtime' : 'LuyKe'}_${new Date().toISOString().slice(0, 10)}.png`;
          const blob = await exportElementAsImage(targetEl, filename, { remarkTextToCopy: remarkText, remarkContext });
          if (blob) {
            showToast('✨ Đã xuất 1 tấm ảnh báo cáo nhóm & tự động sao chép nhận xét!');
          } else {
            showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
          }
        }
      }
    } catch (err) {
      console.error('Lỗi xuất ảnh nhóm:', err);
      showErrorToast('Có lỗi xảy ra khi xuất ảnh.');
    } finally {
      // Restore user's original selected category group filter
      setSelectedCategoryGroup(previousGroup);
      setIsExportingAllRows(false);
      setExportModalState({ isOpen: false });
    }
  };

  // Show login screen if user is unauthenticated
  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={(loggedInUser) => {
          // Reset critical-sync tracking so the loading modal actually waits
          // for Firestore data to arrive fresh, instead of resolving
          // immediately from snapshots received while the login screen was
          // displayed (which causes the "no data" flash).
          criticalDocsSeenRef.current = new Set();
          resolveCriticalSyncRef.current = null;
          isInitialLaunchDoneRef.current = true; // prevent the useEffect duplicate
          setCurrentUser(loggedInUser);
          triggerCloudSyncAnimation('Đăng nhập thành công! Đang tải & đồng bộ dữ liệu tài khoản từ máy chủ Cloud...');
        }}
      />
    );
  }

  return (
    <div className="h-screen bg-slate-100/70 font-sans text-slate-800 flex flex-row overflow-hidden antialiased">
      {/* Left Sidebar Menu */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenUserManagement={() => setIsUserMgmtModalOpen(true)}
        onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />

      {/* Main Right Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Toast Alert Banner */}
        {toastBanner && (
          <div
            className={`${
              toastBanner.type === 'error'
                ? 'bg-red-600 border-b border-red-700'
                : toastBanner.type === 'warning'
                ? 'bg-amber-500 border-b border-amber-600'
                : toastBanner.type === 'info'
                ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-600 border-b-2 border-red-800 shadow-lg shadow-red-500/30'
                : 'bg-emerald-600 border-b border-emerald-700'
            } text-white px-4 py-2 text-center text-xs sm:text-[13px] font-black shadow-md animate-fade-in flex items-center justify-center gap-2.5 shrink-0 z-50`}
          >
            <div className="flex items-center gap-2 tracking-wide">
              {toastBanner.type === 'info' ? (
                <RefreshCw className="w-4 h-4 text-white animate-spin shrink-0 stroke-[2.5]" />
              ) : toastBanner.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />
              ) : toastBanner.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />
              )}
              <span>{toastBanner.text.replace(/^🔄\s*/, '')}</span>
            </div>

            <button
              type="button"
              onClick={() => setToastBanner(null)}
              className="ml-3 hover:bg-white/30 p-1 rounded-lg cursor-pointer shrink-0 transition-colors bg-white/15 text-white flex items-center justify-center"
              aria-label="Đóng thông báo"
            >
              <X className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          </div>
        )}

        {/* Sticky Top Header Banner with Consolidated Filters & Controls (Only show on Report tab) */}
        {activeTab === 'report' && (
          <div
            className="sticky top-0 z-50 bg-slate-100/90 backdrop-blur-md px-4 md:px-6 pt-4 pb-2 border-b border-slate-200/60 shrink-0 shadow-2xs"
            // Was z-30 — exactly equal to the report table's own sticky
            // <thead> (see ReportView.tsx), and the table comes later in
            // the DOM, so on an equal z-index it wins the stacking tie and
            // rendered on top of this bar's dropdown popups (Ngành hàng,
            // Nhóm N.Hàng) whenever they overlapped it. z-50 clears the
            // table's highest sticky z-index (40 on its frozen <th> cells)
            // with headroom, so this bar's popovers always win.
          >
            <HeaderBanner
              timeMode={timeMode}
              setTimeMode={setTimeMode}
              entityScope={entityScope}
              setEntityScope={setEntityScope}
              selectedChannels={selectedChannels}
              setSelectedChannels={setSelectedChannels}
              selectedProvince={selectedProvince}
              setSelectedProvince={setSelectedProvince}
              selectedPhanLoaiShop={selectedPhanLoaiShop}
              setSelectedPhanLoaiShop={setSelectedPhanLoaiShop}
              phanLoaiShopList={phanLoaiShopList}
              selectedTinhMoi={selectedTinhMoi}
              setSelectedTinhMoi={setSelectedTinhMoi}
              tinhMoiList={tinhMoiList}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              selectedCategoryGroup={selectedCategoryGroup}
              setSelectedCategoryGroup={setSelectedCategoryGroup}
              provinceList={provinceList}
              categoryList={categoryList}
              categoryGroupList={categoryGroupList}
              categoryGroupMap={categoryGroupMap}
              categoryDisplayNameMap={categoryDisplayNameMap}
              categoryHiddenMap={categoryHiddenMap}
              onOpenCategoryGroupModal={() => setIsCategoryGroupModalOpen(true)}
              lastUpdated={timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe}
              onRefreshClick={() => setActiveTab('update')}
              onForceClearCache={handleForceClearCache}
              onOpenTagBossModal={() => setIsTagBossModalOpen(true)}
              onExportCompact={handleExportCompact}
              onExportFull={handleExportFull}
              onExportGroup={handleExportGroup}
              valueDisplayMode={valueDisplayMode}
              setValueDisplayMode={setValueDisplayMode}
              canViewDtQdTb={canViewDtQdTb}
              currentUser={currentUser}
              systemName={settings.systemName}
              subTitle={settings.subTitle}
            />
          </div>
        )}

        {/* Scrollable Content View */}
        <main className={`flex-1 overflow-y-auto ${activeTab === 'revenue' ? 'p-0' : 'p-4 md:p-6 space-y-6'}`}>

          {/* MAIN TAB CONTENT RENDER */}
          {activeTab === 'report' && (
            <ErrorBoundary fallbackTitle="Không thể tải báo cáo thi đua">
              <ReportView
                timeMode={timeMode}
                lastUpdated={timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe}
                entityScope={entityScope}
                selectedChannels={selectedChannels}
                selectedProvince={selectedProvince}
                selectedBoss={selectedBoss}
                selectedPhanLoaiShop={selectedPhanLoaiShop}
                selectedTinhMoi={selectedTinhMoi}
                selectedCategory={selectedCategory}
                selectedCategoryGroup={selectedCategoryGroup}
                categoryGroupMap={categoryGroupMap}
                categoryOrderMap={categoryOrderMap}
                categoryDisplayNameMap={categoryDisplayNameMap}
                categoryHiddenMap={categoryHiddenMap}
                bossAssignments={bossAssignments}
                valueDisplayMode={valueDisplayMode}
                canViewDtQdTb={canViewDtQdTb}
                stores={activeStores}
                daysInMonth={daysInMonth}
                daysElapsed={daysElapsed}
                onOpenTagBossModal={() => setIsTagBossModalOpen(true)}
                onExportCompact={handleExportCompact}
                onExportFull={handleExportFull}
                onExportGroup={handleExportGroup}
                forceShowAllRows={isExportingAllRows}
                currentUser={currentUser}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'revenue' && isUser3717 && (
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center py-24 text-slate-400 text-sm font-semibold">
                  Đang tải báo cáo doanh thu &amp; trả chậm...
                </div>
              }
            >
              <ErrorBoundary>
                <RevenueReportView
                  realtimeDtStores={realtimeDtStores}
                  realtimeTcStores={realtimeTcStores}
                  luykeDtStores={luykeDtStores}
                  luykeTcStores={luykeTcStores}
                  bossAssignments={bossAssignments}
                  lastUpdateRealtimeDt={lastUpdateRealtimeDt}
                  lastUpdateRealtimeTc={lastUpdateRealtimeTc}
                  lastUpdateLuyKeDt={lastUpdateLuyKeDt}
                  lastUpdateLuyKeTc={lastUpdateLuyKeTc}
                  timeMode={timeMode}
                  setTimeMode={setTimeMode}
                  entityScope={entityScope}
                  setEntityScope={setEntityScope}
                  currentUser={currentUser}
                  onNavigateToUpdate={() => setActiveTab('update')}
                />
              </ErrorBoundary>
            </React.Suspense>
          )}

          {activeTab === 'update' && canUpdateData && (
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center py-24 text-slate-400 text-sm font-semibold">
                  Đang tải màn hình cập nhật dữ liệu...
                </div>
              }
            >
              <UpdateDataView
                onUpdateRealtimeData={handleUpdateRealtimeData}
                onUpdateLuyKeData={handleUpdateLuyKeData}
                onUpdateBossData={handleUpdateBossData}
                onUpdateRealtimeDt={handleUpdateRealtimeDt}
                onUpdateRealtimeTc={handleUpdateRealtimeTc}
                onUpdateLuyKeDt={handleUpdateLuyKeDt}
                onUpdateLuyKeTc={handleUpdateLuyKeTc}
                currentRealtimeStoresTinh={realtimeStoresTinh}
                currentRealtimeStoresVung={realtimeStoresVung}
                currentLuyKeStoresTinh={luykeStoresTinh}
                currentLuyKeStoresVung={luykeStoresVung}
                currentBossAssignments={bossAssignments}
                lastUpdateRealtime={settings.lastUpdateRealtime}
                lastUpdateLuyKe={settings.lastUpdateLuyKe}
                canViewDtQdTb={canViewDtQdTb}
                currentUser={currentUser}
              />
            </React.Suspense>
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              user={user}
              onSave={handleSaveSettings}
            />
          )}
        </main>
      </div>

      {/* Cloud Data Loading Overlay Modal (Shows on login or when syncing from new device) */}
      <CloudSyncModal
        isOpen={cloudSyncState.isOpen}
        progress={cloudSyncState.progress}
        stepText={cloudSyncState.stepText}
        subText={cloudSyncState.subText}
      />

      {/* Export Loading Overlay Modal */}
      <ExportLoadingModal
        isOpen={exportModalState.isOpen}
        exportTitle={exportModalState.title}
        subText={exportModalState.subText}
      />

      {/* Export Success Popup Modal with Copy Image & Copy Remark options */}
      <ExportSuccessModal
        isOpen={exportSuccessState.isOpen}
        onClose={() => setExportSuccessState((prev) => ({ ...prev, isOpen: false }))}
        blob={exportSuccessState.blob}
        filename={exportSuccessState.filename}
        remarkText={exportSuccessState.remarkText}
        remarkContext={exportSuccessState.remarkContext}
        currentUser={currentUser}
      />

      {/* Tag Boss / Quick Remarks Modal */}
      <TagBossModal
        isOpen={isTagBossModalOpen}
        onClose={() => setIsTagBossModalOpen(false)}
        stores={activeStores}
        selectedProvince={selectedProvince}
        selectedChannels={selectedChannels}
        selectedBoss={selectedBoss}
        selectedPhanLoaiShop={selectedPhanLoaiShop}
        selectedTinhMoi={selectedTinhMoi}
        selectedCategory={selectedCategory}
        selectedCategoryGroup={selectedCategoryGroup}
        categoryGroupMap={categoryGroupMap}
        bossAssignments={bossAssignments}
        categoryDisplayNameMap={categoryDisplayNameMap}
        timeModeName={timeMode === 'realtime' ? 'Realtime' : 'Luỹ kế'}
        lastUpdated={timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe}
        entityScope={entityScope}
      />

      {/* Super Admin User Management Modal */}
      <UserManagementModal
        isOpen={isUserMgmtModalOpen}
        onClose={() => setIsUserMgmtModalOpen(false)}
        currentUser={currentUser}
      />

      {/* Self-service Change Password Modal (available to every logged-in account) */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
      />

      {/* Category Group Management Modal (Ngành hàng → Nhóm) */}
      <CategoryGroupModal
        isOpen={isCategoryGroupModalOpen}
        onClose={() => setIsCategoryGroupModalOpen(false)}
        categoryList={categoryList}
        categoryGroupMap={categoryGroupMap}
        categoryOrderMap={categoryOrderMap}
        categoryDisplayNameMap={categoryDisplayNameMap}
        categoryHiddenMap={categoryHiddenMap}
        onSave={handleSaveCategoryGroups}
      />
    </div>
  );
}

// Top-level safety net: previously only the Report tab's content was wrapped
// in an ErrorBoundary, so an uncaught error anywhere else (LoginView, the
// Sidebar/HeaderBanner shell, an effect firing during the login/logout
// transition, a lazy-chunk import failing after a fresh deploy invalidated
// the old chunk hash the browser still had loaded) unmounted the *entire*
// React tree with nothing left to render — a blank white page the user had
// to manually refresh to recover from. Wrapping the whole app here means
// every one of those cases now shows the same "Tải lại trang" recovery UI
// instead of silence.
export default function App() {
  return (
    <ErrorBoundary fallbackTitle="Đã xảy ra sự cố — vui lòng tải lại trang">
      <AppInner />
    </ErrorBoundary>
  );
}
