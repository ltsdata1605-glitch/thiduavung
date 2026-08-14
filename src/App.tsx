import React, { useState, useEffect, useRef } from 'react';
import { ViewTab, TimeMode, EntityScope, Channel, StoreRecord, UserProfile, AppSettings, UserAccount } from './types';
import { initialUserProfile, initialSettings } from './data/sampleData';
import { getBossForStore, extractMst, BossAssignmentRecord } from './utils/parser';
import { Sidebar } from './components/Sidebar';
import { HeaderBanner } from './components/HeaderBanner';
import { ReportView, DEFAULT_CATEGORY_GROUP_MAP } from './components/ReportView';
import { UpdateDataView } from './components/UpdateDataView';
import { SettingsView } from './components/SettingsView';
import { TagBossModal } from './components/TagBossModal';
import { LoginView } from './components/LoginView';
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
  getLocalCache,
  getIndexedDbCache,
  clearAllLocalCache,
} from './services/storeService';
import { usePersistedState } from './hooks/usePersistedState';
import { exportElementAsImage, exportCategoryGroupImages } from './services/imageExport';
import confetti from 'canvas-confetti';

export default function App() {
  // Authentication State — requires an actual login; no silent Super Admin bypass
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => getCurrentSession());

  // Last known dataset from localStorage, used to hydrate instantly on load
  // (before/without waiting on the live Firestore round-trip)
  const [cachedData] = useState(() => getLocalCache());

  // Navigation & Mode States — activeTab persisted so a refresh reopens the
  // same tab (Báo cáo / Cập nhật dữ liệu / Cài đặt) instead of resetting to Report.
  const [activeTab, setActiveTab] = usePersistedState<ViewTab>('tnb_activeTab', 'report');
  const [timeMode, setTimeMode] = usePersistedState<TimeMode>('tnb_timeMode', 'luyke');
  const [entityScope, setEntityScope] = usePersistedState<EntityScope>('tnb_entityScope', 'vung');
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

  // Ngành hàng → Nhóm mapping (global, shared by every account — same idea
  // as `settings`), managed via the Category Group modal from the Report
  // filter bar. Firestore doc: category_groups.
  const [categoryGroupMap, setCategoryGroupMap] = useState<Record<string, string>>(() => ({
    ...DEFAULT_CATEGORY_GROUP_MAP,
    ...(cachedData.categoryGroups || {}),
  }));
  const [categoryOrderMap, setCategoryOrderMap] = useState<Record<string, number>>(cachedData.categoryOrderMap || {});
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

  const triggerCloudSyncAnimation = (customSubText?: string) => {
    setCloudSyncState({
      isOpen: true,
      progress: 25,
      stepText: '⚡ 1. Đang kết nối máy chủ dữ liệu Firebase Cloud...',
      subText: customSubText,
    });

    setTimeout(() => {
      setCloudSyncState((prev) => ({
        ...prev,
        progress: 60,
        stepText: '📊 2. Đang tải & tính toán tỷ lệ % Realtime & Luỹ kế...',
      }));
    }, 450);

    setTimeout(() => {
      setCloudSyncState((prev) => ({
        ...prev,
        progress: 88,
        stepText: '👥 3. Đang đồng bộ danh sách Boss & bộ lọc cá nhân...',
      }));
    }, 900);

    setTimeout(() => {
      setCloudSyncState((prev) => ({
        ...prev,
        progress: 100,
        stepText: '✨ 4. Đã hoàn tất tải dữ liệu! Đang mở bảng thi đua...',
      }));
    }, 1350);

    setTimeout(() => {
      setCloudSyncState((prev) => ({ ...prev, isOpen: false }));
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.5 } });
    }, 1750);
  };

  // Modals & Notifications
  const [isTagBossModalOpen, setIsTagBossModalOpen] = useState(false);
  const [isUserMgmtModalOpen, setIsUserMgmtModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [toastBanner, setToastBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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

  // Subscribe to Firebase Firestore Realtime Database updates
  useEffect(() => {
    const unsubscribe = subscribeToFirebaseData((payload) => {
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

  // When switching into Siêu Thị scope with no province chosen yet ("Tất cả"),
  // default to the first province instead of leaving the list unfiltered —
  // a fresh switch into per-store view with hundreds of rows is not useful.
  // Only fires on an actual scope transition (via the ref), so a province the
  // user already picked — or an explicit "Tất cả" they chose while already in
  // Siêu Thị — is left alone.
  const prevEntityScopeRef = useRef(entityScope);
  useEffect(() => {
    if (prevEntityScopeRef.current !== entityScope) {
      if (entityScope === 'vung' && selectedProvince === 'ALL') {
        const stores = timeMode === 'realtime' ? realtimeStoresVung : luykeStoresVung;
        const firstProvince = Array.from(new Set(stores.map((s: StoreRecord) => s.tinh))).sort()[0];
        if (firstProvince) setSelectedProvince(firstProvince);
      }
      prevEntityScopeRef.current = entityScope;
    }
  }, [entityScope, selectedProvince, timeMode, realtimeStoresVung, luykeStoresVung]);

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

  // Get active stores depending on TimeMode & Scope (Vùng vs Siêu Thị / Tỉnh)
  const activeStores = timeMode === 'realtime'
    ? (entityScope === 'sieuthi' ? realtimeStoresTinh : realtimeStoresVung)
    : (entityScope === 'sieuthi' ? luykeStoresTinh : luykeStoresVung);

  // Extract unique provinces & bosses for filter dropdowns
  const provinceList = Array.from(new Set(activeStores.map((s) => s.tinh))).sort();
  const bossList = Array.from(
    new Set([
      ...activeStores.map((s) => getBossForStore(s.sieuthi, bossAssignments, s.boss)),
      ...bossAssignments.map((b) => b.boss).filter(Boolean),
    ])
  ).sort();

  // The "Ngành hàng" filter's option list always comes from Realtime Thi Đua
  // Tỉnh specifically — that's the one box pasted with the full per-category
  // BI breakdown (categoryMap on every record). The other 3 boxes (Siêu Thị,
  // Luỹ Kế) are typically flat per-store data without that breakdown, so
  // deriving the list from `activeStores` (whichever is currently being
  // viewed) made the filter fall back to a generic 12-item list instead of
  // the real ~38 ngành hàng whenever a non-Tỉnh/non-Realtime view was open.
  const parsedCategoryNames = Array.from(
    new Set(realtimeStoresTinh.flatMap((s) => (s.categoryMap ? Object.keys(s.categoryMap) : [])))
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

    // Keyed by MST (leading store code) — the only reliable join key between
    // datasets; two different stores can have very similar names (e.g. two
    // branches in the same "cụm"/ward), so matching by name text risks
    // pulling the wrong store's BOSS/KÊNH. This also turns what used to be an
    // O(stores × bossAssignments) substring-scan fallback into an O(1) lookup
    // per store, which matters once both lists run into the hundreds.
    const bossMstMap = new Map<string, BossAssignmentRecord>();
    newBossAssignments.forEach((b) => {
      const mst = extractMst(b.sieuthi);
      if (mst) bossMstMap.set(mst, b);
    });

    const updateStores = (stores: StoreRecord[]) =>
      stores.map((s) => {
        const mst = extractMst(s.sieuthi);
        const found = mst ? bossMstMap.get(mst) : undefined;
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
  const handleSaveCategoryGroups = async (newMap: Record<string, string>, newOrderMap: Record<string, number>) => {
    setCategoryGroupMap(newMap);
    setCategoryOrderMap(newOrderMap);
    const [res1, res2] = await Promise.all([
      saveCategoryGroupsToFirebase(newMap, currentUser.name),
      saveCategoryOrdersToFirebase(newOrderMap, currentUser.name),
    ]);
    if (!res1.success || !res2.success) {
      showErrorToast(res1.error || res2.error || 'Đồng bộ Nhóm & Vị trí Ngành Hàng lên Firebase thất bại!');
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
      const blob = await exportElementAsImage(el, filename);
      if (!blob) {
        showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
        return;
      }
      showToast('Đã xuất báo cáo tóm tắt thi đua!');
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
      const blob = await exportElementAsImage(el, filename);
      if (!blob) {
        showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
        return;
      }
      showToast('Đã xuất đầy đủ bảng xếp hạng thi đua toàn vùng TNB!');
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
            const blob = await exportElementAsImage(targetEl, filename);
            if (blob) exportedCount++;
          }
        }
        if (exportedCount > 0) {
          showToast('✨ Đã xuất tự động 3 ảnh bộ báo cáo theo từng nhóm Ngành Hàng (ICT, Dịch Vụ, CE & GD)!');
        } else {
          showErrorToast('Xuất ảnh thất bại — vui lòng thử lại.');
        }
      } else if (target === 'all') {
        setSelectedCategoryGroup('ALL');
        await new Promise((r) => setTimeout(r, 350));
        const targetEl = document.getElementById('report-export-root');
        if (targetEl) {
          const filename = `Bang_Xep_Hang_Tat_Ca_38_Nganh_Hang_${timeMode === 'realtime' ? 'Realtime' : 'LuyKe'}_${new Date().toISOString().slice(0, 10)}.png`;
          const blob = await exportElementAsImage(targetEl, filename);
          if (blob) {
            showToast('✨ Đã xuất 1 tấm ảnh đầy đủ bảng xếp hạng tất cả ngành hàng!');
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
          const blob = await exportElementAsImage(targetEl, filename);
          if (blob) {
            showToast('✨ Đã xuất 1 tấm ảnh báo cáo nhóm ngành hàng!');
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
              toastBanner.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
            } text-white px-4 py-2 text-center text-xs font-bold shadow-md animate-fade-in flex items-center justify-center gap-2 shrink-0 z-50`}
          >
            <span>{toastBanner.type === 'error' ? '⚠️' : '✨'} {toastBanner.text}</span>
            {toastBanner.type === 'error' && (
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
              onOpenCategoryGroupModal={() => setIsCategoryGroupModalOpen(true)}
              lastUpdated={timeMode === 'realtime' ? settings.lastUpdateRealtime : settings.lastUpdateLuyKe}
              onRefreshClick={() => setActiveTab('update')}
              onForceClearCache={handleForceClearCache}
              onOpenTagBossModal={() => setIsTagBossModalOpen(true)}
              onExportCompact={handleExportCompact}
              onExportFull={handleExportFull}
              onExportGroup={handleExportGroup}
              showSummarySection={showSummarySection}
              setShowSummarySection={setShowSummarySection}
              systemName={settings.systemName}
              subTitle={settings.subTitle}
            />
          </div>
        )}

        {/* Scrollable Content View */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

          {/* MAIN TAB CONTENT RENDER */}
          {activeTab === 'report' && (
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
              bossAssignments={bossAssignments}
              showSummarySection={showSummarySection}
              stores={activeStores}
              onOpenTagBossModal={() => setIsTagBossModalOpen(true)}
              onExportCompact={handleExportCompact}
              onExportFull={handleExportFull}
              onExportGroup={handleExportGroup}
              forceShowAllRows={isExportingAllRows}
            />
          )}

          {activeTab === 'update' && (
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
            />
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
        timeModeName={timeMode === 'realtime' ? 'Realtime' : 'Luỹ kế'}
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
        onSave={handleSaveCategoryGroups}
      />
    </div>
  );
}
