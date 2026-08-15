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
import { SettingsView } from './components/SettingsView';
import { TagBossModal, generateReportRemarksText } from './components/TagBossModal';
import { LoginView } from './components/LoginView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserManagementModal } from './components/UserManagementModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { CategoryGroupModal } from './components/CategoryGroupModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { ExportLoadingModal } from './components/ExportLoadingModal';
import { getCurrentSession, logoutUser } from './services/authService';
import {
  subscribeToFirebaseData,
  saveRealtimeStoresToFirebase,
  saveLuyKeStoresToFirebase,
  saveBossAssignmentsToFirebase,
  saveSettingsToFirebase,
  saveUserPreferencesToFirebase,
  saveUserFiltersToFirebase,
  saveCategoryGroupsToFirebase,
  saveCategoryOrdersToFirebase,
  saveCategoryDisplayNamesToFirebase,
  getLocalCache,
  getIndexedDbCache,
  clearAllLocalCache,
  type DocKey,
} from './services/storeService';
import { usePersistedState } from './hooks/usePersistedState';
import { exportElementAsImage, exportCategoryGroupImages } from './services/imageExport';
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
    if (cleanHash === 'update' || cleanHash === 'cap-nhat') {
      return { tab: 'update' };
    }
    if (cleanHash === 'settings' || cleanHash === 'cai-dat') {
      return { tab: 'settings' };
    }
    return null;
  };

  const getHashFromRoute = (tab: ViewTab, scope: EntityScope): string => {
    if (tab === 'update') return '#/update';
    if (tab === 'settings') return '#/settings';
    if (scope === 'sieuthi') return '#/vung';
    if (scope === 'vung') return '#/sieuthi';
    if (scope === 'nhom') return '#/nhom';
    return '#/vung';
  };

  const getTitleFromRoute = (tab: ViewTab, scope: EntityScope, sysName?: string): string => {
    const prefix = sysName || 'THI ĐUA TNB';
    if (tab === 'update') return `Cập nhật Dữ liệu | ${prefix}`;
    if (tab === 'settings') return `Cài đặt Hệ thống | ${prefix}`;
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
  const [selectedChannels, setSelectedChannels] = usePersistedState<Channel[]>('tnb_selectedChannels', ['DML', 'DMM', 'DMS', 'TGD', 'TopZone']);
  const [selectedProvince, setSelectedProvince] = usePersistedState<string>('tnb_selectedProvince', 'ALL');
  const [selectedBoss, setSelectedBoss] = usePersistedState<string>('tnb_selectedBoss', 'ALL');
  const [selectedCategory, setSelectedCategory] = usePersistedState<string>('tnb_selectedCategory', 'ALL');
  const [selectedCategoryGroup, setSelectedCategoryGroup] = usePersistedState<string>('tnb_selectedCategoryGroup', 'ALL');
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
  const isInitialLaunchDoneRef = useRef(false);
  useEffect(() => {
    if (!isInitialLaunchDoneRef.current && currentUser) {
      isInitialLaunchDoneRef.current = true;
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
    boss_assignments: 'Danh sách BOSS',
  };

  // Coalesces same-batch remote updates (a single save on another device
  // typically touches 2+ docs, e.g. store data + settings, that each fire
  // this listener within milliseconds of each other) into ONE toast instead
  // of one per doc.
  const pendingRemoteLabelsRef = useRef<Set<string>>(new Set());
  const remoteUpdateToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyRemoteUpdate = (label: string) => {
    pendingRemoteLabelsRef.current.add(label);
    if (remoteUpdateToastTimerRef.current) clearTimeout(remoteUpdateToastTimerRef.current);
    remoteUpdateToastTimerRef.current = setTimeout(() => {
      const labels = Array.from(pendingRemoteLabelsRef.current);
      pendingRemoteLabelsRef.current.clear();
      if (labels.length === 0) return;
      showInfoToast(`🔄 Đang tải dữ liệu mới... (${labels.join(', ')})`);
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
      } else if (entityScope === 'sieuthi') {
        // VÙNG (the overview/rollup-by-tỉnh scope — see the naming note near
        // the HeaderBanner buttons) is meant to show every tỉnh at once, so a
        // narrow filter carried over from Siêu Thị/Nhóm (one tỉnh, one kênh,
        // one ngành hàng) would silently defeat that. Every time VÙNG is
        // selected, clear back to "Tất cả" / all kênh checked.
        setSelectedProvince('ALL');
        setSelectedChannels(['DML', 'DMM', 'DMS', 'TGD', 'TopZone']);
        setSelectedCategoryGroup('ALL');
        setSelectedCategory('ALL');
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

  // Show login screen if user is unauthenticated
  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={(loggedInUser) => {
          setCurrentUser(loggedInUser);
          triggerCloudSyncAnimation('Đăng nhập thành công! Đang tải & đồng bộ dữ liệu tài khoản từ máy chủ Cloud...');
        }}
      />
    );
  }

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

  // Extract unique provinces & bosses for filter dropdowns
  const provinceList = Array.from(new Set(activeStores.map((s) => s.tinh))).sort();
  const bossList: string[] = (Array.from(
    new Set([
      ...activeStores.map((s) => getBossForStore(s.sieuthi, bossAssignments, s.boss)),
      ...bossAssignments.map((b) => b.boss).filter(Boolean),
    ])
  ) as string[]).sort();

  const parsedCategoryNames = Array.from(
    new Set([
      ...realtimeStoresVung.flatMap((s) => (s.categoryMap ? Object.keys(s.categoryMap) : [])),
      ...realtimeStoresTinh.flatMap((s) => (s.categoryMap ? Object.keys(s.categoryMap) : [])),
      ...luykeStoresVung.flatMap((s) => (s.categoryMap ? Object.keys(s.categoryMap) : [])),
      ...luykeStoresTinh.flatMap((s) => (s.categoryMap ? Object.keys(s.categoryMap) : [])),
    ])
  ).sort();

  const dynamicCategoryOptions = parsedCategoryNames.map((name) => ({
    id: String(name),
    label: String(name).toUpperCase(),
  }));

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

    const updateStores = (stores: StoreRecord[]) =>
      stores.map((s) => {
        const found = findBossAssignmentRecord(s.sieuthi, newBossAssignments);
        if (found) {
          return {
            ...s,
            boss: found.boss || s.boss,
            tinh: found.tinh || s.tinh,
            kenh: (found.kenh as Channel) || s.kenh,
          };
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
    newDisplayNameMap: Record<string, string>
  ) => {
    setCategoryGroupMap(newMap);
    setCategoryOrderMap(newOrderMap);
    setCategoryDisplayNameMap(newDisplayNameMap);
    const [res1, res2, res3] = await Promise.all([
      saveCategoryGroupsToFirebase(newMap, currentUser.name),
      saveCategoryOrdersToFirebase(newOrderMap, currentUser.name),
      saveCategoryDisplayNamesToFirebase(newDisplayNameMap, currentUser.name),
    ]);
    if (!res1.success || !res2.success || !res3.success) {
      showErrorToast(res1.error || res2.error || res3.error || 'Đồng bộ Nhóm & Vị trí Ngành Hàng lên Firebase thất bại!');
      return;
    }
    showToast('Đã lưu & đồng bộ Nhóm & Vị trí Ngành Hàng lên Firebase!');
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
      const remarkText = generateReportRemarksText({
        stores: activeStores,
        selectedProvince,
        selectedChannels,
        selectedCategory,
        bossAssignments,
        timeModeName: timeMode === 'realtime' ? 'Realtime' : 'Luỹ Kế',
        lastUpdated: timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe,
        entityScope,
      });
      const blob = await exportElementAsImage(el, filename, { remarkTextToCopy: remarkText });
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
      const remarkText = generateReportRemarksText({
        stores: activeStores,
        selectedProvince,
        selectedChannels,
        selectedCategory,
        bossAssignments,
        timeModeName: timeMode === 'realtime' ? 'Realtime' : 'Luỹ Kế',
        lastUpdated: timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe,
        entityScope,
      });
      const blob = await exportElementAsImage(el, filename, { remarkTextToCopy: remarkText });
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

  // "Xuất Ảnh Theo Nhóm Ngành Hàng / Xuất All" — exports image by rendering exact target group state
  const handleExportGroup = async (target: 'ict' | 'dichvu' | 'ce' | 'all' | 'by_groups') => {
    const el = document.getElementById('report-export-root');
    if (!el) {
      showErrorToast('Không tìm thấy báo cáo để xuất ảnh — hãy mở tab Report trước.');
      return;
    }

    const groupNames: Record<string, string> = {
      ict: 'Nhóm ICT',
      dichvu: 'Nhóm Dịch Vụ',
      ce: 'Nhóm CE & Gia Dụng',
      by_groups: '3 Nhóm Ngành Hàng (3 Tấm)',
      all: 'Tất Cả 38 Ngành Hàng (1 Tấm)',
    };
    setExportModalState({
      isOpen: true,
      title: `ĐANG XUẤT ẢNH ${groupNames[target]?.toUpperCase() || 'BÁO CÁO'}`,
      subText: 'Đang tự động căn chỉnh khung cột vừa vặn nội dung & tạo file PNG sắc nét...',
    });

    const previousGroup = selectedCategoryGroup;
    const targetMap: Record<string, string> = {
      ict: 'ICT',
      dichvu: 'DỊCH VỤ',
      ce: 'CE & GD',
    };

    const remarkText = generateReportRemarksText({
      stores: activeStores,
      selectedProvince,
      selectedChannels,
      selectedCategory,
      bossAssignments,
      timeModeName: timeMode === 'realtime' ? 'Realtime' : 'Luỹ Kế',
      lastUpdated: timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe,
      entityScope,
    });

    setIsExportingAllRows(true);
    try {
      if (target === 'by_groups') {
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
            const blob = await exportElementAsImage(targetEl, filename, { remarkTextToCopy: remarkText });
            if (blob) exportedCount++;
          }
        }
        if (exportedCount > 0) {
          showToast('✨ Đã xuất tự động 3 ảnh bộ báo cáo & tự động sao chép nhận xét!');
        } else {
          showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
        }
      } else if (target === 'all') {
        setSelectedCategoryGroup('ALL');
        await new Promise((r) => setTimeout(r, 350));
        const targetEl = document.getElementById('report-export-root');
        if (targetEl) {
          const filename = `Bang_Xep_Hang_Tat_Ca_38_Nganh_Hang_${timeMode === 'realtime' ? 'Realtime' : 'LuyKe'}_${new Date().toISOString().slice(0, 10)}.png`;
          const blob = await exportElementAsImage(targetEl, filename, { remarkTextToCopy: remarkText });
          if (blob) {
            showToast('✨ Đã xuất 1 tấm ảnh đầy đủ bảng xếp hạng & tự động sao chép nhận xét!');
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
          const blob = await exportElementAsImage(targetEl, filename, { remarkTextToCopy: remarkText });
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
                ? 'bg-red-600'
                : toastBanner.type === 'warning'
                ? 'bg-amber-500'
                : toastBanner.type === 'info'
                ? 'bg-sky-600'
                : 'bg-emerald-600'
            } text-white px-4 py-2 text-center text-xs font-bold shadow-md animate-fade-in flex items-center justify-center gap-2 shrink-0 z-50`}
          >
            <span>
              {toastBanner.type === 'error' ? '⚠️' : toastBanner.type === 'warning' ? '📭' : toastBanner.type === 'info' ? '🔄' : '✨'} {toastBanner.text}
            </span>
            {(toastBanner.type === 'error' || toastBanner.type === 'warning') && (
              <button
                type="button"
                onClick={() => setToastBanner(null)}
                className="ml-1 hover:opacity-70 shrink-0"
                aria-label="Đóng thông báo"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Sticky Top Header Banner with Consolidated Filters & Controls (Only show on Report tab) */}
        {activeTab === 'report' && (
          <div className="sticky top-0 z-30 bg-slate-100/90 backdrop-blur-md px-4 md:px-6 pt-4 pb-2 border-b border-slate-200/60 shrink-0 shadow-2xs">
            <HeaderBanner
              timeMode={timeMode}
              setTimeMode={setTimeMode}
              entityScope={entityScope}
              setEntityScope={setEntityScope}
              selectedChannels={selectedChannels}
              setSelectedChannels={setSelectedChannels}
              selectedProvince={selectedProvince}
              setSelectedProvince={setSelectedProvince}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              selectedCategoryGroup={selectedCategoryGroup}
              setSelectedCategoryGroup={setSelectedCategoryGroup}
              provinceList={provinceList}
              categoryList={categoryList}
              categoryGroupList={categoryGroupList}
              categoryGroupMap={categoryGroupMap}
              categoryDisplayNameMap={categoryDisplayNameMap}
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
              systemName={settings.systemName}
              subTitle={settings.subTitle}
            />
          </div>
        )}

        {/* Scrollable Content View */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

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
                selectedCategory={selectedCategory}
                selectedCategoryGroup={selectedCategoryGroup}
                categoryGroupMap={categoryGroupMap}
                categoryOrderMap={categoryOrderMap}
                categoryDisplayNameMap={categoryDisplayNameMap}
                bossAssignments={bossAssignments}
                valueDisplayMode={valueDisplayMode}
                canViewDtQdTb={canViewDtQdTb}
                stores={activeStores}
                onOpenTagBossModal={() => setIsTagBossModalOpen(true)}
                onExportCompact={handleExportCompact}
                onExportFull={handleExportFull}
                onExportGroup={handleExportGroup}
                forceShowAllRows={isExportingAllRows}
              />
            </ErrorBoundary>
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
                currentRealtimeStoresTinh={realtimeStoresTinh}
                currentRealtimeStoresVung={realtimeStoresVung}
                currentLuyKeStoresTinh={luykeStoresTinh}
                currentLuyKeStoresVung={luykeStoresVung}
                currentBossAssignments={bossAssignments}
                lastUpdateRealtime={settings.lastUpdateRealtime}
                lastUpdateLuyKe={settings.lastUpdateLuyKe}
                canViewDtQdTb={canViewDtQdTb}
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

      {/* Tag Boss / Quick Remarks Modal */}
      <TagBossModal
        isOpen={isTagBossModalOpen}
        onClose={() => setIsTagBossModalOpen(false)}
        stores={activeStores}
        selectedProvince={selectedProvince}
        selectedChannels={selectedChannels}
        selectedCategory={selectedCategory}
        selectedCategoryGroup={selectedCategoryGroup}
        bossAssignments={bossAssignments}
        categoryDisplayNameMap={categoryDisplayNameMap}
        timeModeName={timeMode === 'realtime' ? 'Realtime' : 'Luỹ kế'}
        lastUpdated={timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe}
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
