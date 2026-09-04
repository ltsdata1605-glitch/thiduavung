import React, { useState, useMemo, useRef, useEffect } from 'react';
import { StoreRecord, TimeMode, EntityScope, Channel, UserAccount, RemarkDisplayMode, RevenueCungKyRecord } from '../types';
import {
  formatVND,
  formatPercent,
  formatStoreDisplayName,
  formatStoreRemarkLine,
  getChannelForStore,
  getBossForStore,
  getPhanLoaiShopForStore,
  getTinhMoiForStore,
  isExcludedStore,
  extractMst,
  extractStoreCode,
  BossAssignmentRecord,
  getFormattedNow,
  checkDataFreshness,
} from '../utils/parser';
import { idbGet, idbSet } from '../services/indexedDbCache';
import {
  Coins,
  TrendingUp,
  Zap,
  Store,
  Globe,
  Layers,
  LayoutDashboard,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Check,
  X,
  AlertTriangle,
  AlertCircle,
  Flame,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  Tv,
  Sparkles,
  MapPin,
  Boxes,
  Sliders,
  Calendar,
  Percent,
  RotateCcw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { exportElementAsImage, copyTextToClipboard } from '../services/imageExport';
import { usePersistedState } from '../hooks/usePersistedState';

export interface TargetConfig {
  mode: 'default' | 'cung_ky';
  heSo: number; // e.g. 100, 120, 180 (%)
}

export function getChannelHeaderBg(kenh: string): string {
  const u = (kenh || '').toUpperCase();
  if (u.includes('DML')) return 'bg-teal-600 text-white';
  if (u.includes('DMM')) return 'bg-indigo-600 text-white';
  if (u.includes('DMS')) return 'bg-violet-600 text-white';
  if (u.includes('TGD')) return 'bg-amber-400 text-slate-950 font-black';
  if (u.includes('TOPZONE') || u.includes('TZ')) return 'bg-slate-700 text-white';
  return 'bg-amber-400 text-slate-950 font-black';
}

export function formatBillionsOnly(num: number): string {
  if (!num || num === 0) return '0';
  const val = num / 1_000_000_000;
  return val.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function getChannelBadgeStyle(kenh: string): string {
  const u = (kenh || '').toUpperCase();
  if (u.includes('DML')) return 'bg-teal-100 text-teal-800 border border-teal-300';
  if (u.includes('DMM')) return 'bg-indigo-100 text-indigo-800 border border-indigo-300';
  if (u.includes('DMS')) return 'bg-violet-100 text-violet-800 border border-violet-300';
  if (u.includes('TGD')) return 'bg-amber-100 text-amber-900 border border-amber-400 font-extrabold';
  if (u.includes('TOPZONE') || u.includes('TZ')) return 'bg-slate-200 text-slate-800 border border-slate-300';
  return 'bg-amber-100 text-amber-900 border border-amber-400 font-extrabold';
}

export interface RevenueRecordItem {
  stt: number;
  id: string;
  tinh: string;
  sieuthi: string;
  boss: string;
  kenh: string;
  phanLoaiShop: string;
  tinhMoi: string;
  targetDt: number;
  achievedDt: number;
  rateDt: number;
  dtThuc: number; // Doanh thu thực trước quy đổi (DT Realtime / DTLK)
  dtQd: number;   // Doanh thu sau quy đổi (DT Realtime QĐ / DTQĐ)
  qdEff: number;  // Hiệu quả quy đổi = (dtQd - dtThuc) / dtThuc * 100
  targetTc?: number;
  achievedTc: number;
  rateTc?: number;
  tcRatio: number;
}

export interface RevenueReportViewProps {
  realtimeDtStores: StoreRecord[];
  realtimeTcStores: StoreRecord[];
  luykeDtStores: StoreRecord[];
  luykeTcStores: StoreRecord[];
  bossAssignments?: BossAssignmentRecord[];
  revenueCungKy?: RevenueCungKyRecord[];
  lastUpdateRealtimeDt?: string;
  lastUpdateRealtimeTc?: string;
  lastUpdateLuyKeDt?: string;
  lastUpdateLuyKeTc?: string;
  timeMode: TimeMode;
  setTimeMode: (mode: TimeMode) => void;
  entityScope: EntityScope;
  setEntityScope: (scope: EntityScope) => void;
  currentUser?: UserAccount | null;
  onNavigateToUpdate?: () => void;
  savedUserFilters?: Record<string, any>;
  onSaveRevenueProvince?: (province: string) => void;
  onSaveUserFilters?: (filters: Record<string, any>) => void;
}

const ALL_REVENUE_CHANNELS: Channel[] = ['DML', 'DMM', 'DMS', 'TGD', 'TopZone'];

export const RevenueReportView: React.FC<RevenueReportViewProps> = ({
  realtimeDtStores = [],
  realtimeTcStores = [],
  luykeDtStores = [],
  luykeTcStores = [],
  bossAssignments = [],
  revenueCungKy = [],
  lastUpdateRealtimeDt,
  lastUpdateRealtimeTc,
  lastUpdateLuyKeDt,
  lastUpdateLuyKeTc,
  timeMode,
  setTimeMode,
  entityScope,
  setEntityScope,
  currentUser,
  onNavigateToUpdate,
  savedUserFilters,
  onSaveRevenueProvince,
  onSaveUserFilters,
}) => {
  // Helper lấy kênh đã lưu cho từng tab (mặc định: TOP/BOT là DML, các tab khác là All)
  const getSavedChannelsForScope = (scope: EntityScope): Channel[] => {
    if (scope === 'topbot') {
      const saved =
        savedUserFilters?.revenue_topbot_channels ??
        (() => {
          try {
            const raw = localStorage.getItem('revenue_topbot_channels');
            return raw ? JSON.parse(raw) : null;
          } catch (e) {
            return null;
          }
        })();
      return saved && Array.isArray(saved) && saved.length > 0 ? saved : ['DML'];
    }
    if (scope === 'tong') {
      const saved =
        savedUserFilters?.revenue_tong_channels ??
        (() => {
          try {
            const raw = localStorage.getItem('revenue_tong_channels');
            return raw ? JSON.parse(raw) : null;
          } catch (e) {
            return null;
          }
        })();
      return saved && Array.isArray(saved) && saved.length > 0 ? saved : ALL_REVENUE_CHANNELS;
    }
    if (scope === 'sieuthi') { // Tab VÙNG trong UI
      const saved =
        savedUserFilters?.revenue_vung_channels ??
        (() => {
          try {
            const raw = localStorage.getItem('revenue_vung_channels');
            return raw ? JSON.parse(raw) : null;
          } catch (e) {
            return null;
          }
        })();
      return saved && Array.isArray(saved) && saved.length > 0 ? saved : ALL_REVENUE_CHANNELS;
    }

    if (scope === 'sieuthimoi') {
      const saved =
        savedUserFilters?.revenue_sieuthimoi_channels ??
        (() => {
          try {
            const raw = localStorage.getItem('revenue_sieuthimoi_channels');
            return raw ? JSON.parse(raw) : null;
          } catch (e) {
            return null;
          }
        })();
      return saved && Array.isArray(saved) && saved.length > 0 ? saved : ALL_REVENUE_CHANNELS;
    }

    // Tab SIÊU THỊ (scope === 'vung'):
    const saved =
      savedUserFilters?.revenue_sieuthi_channels ??
      (() => {
        try {
          const raw = localStorage.getItem('revenue_sieuthi_channels');
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      })();
    return saved && Array.isArray(saved) && saved.length > 0 ? saved : ALL_REVENUE_CHANNELS;
  };

  // Helper lấy tỉnh đã lưu cho từng tab (mỗi tab lưu riêng biệt, không bị đè chéo)
  const getSavedProvinceForScope = (scope: EntityScope, availableProvinces: string[]): string => {
    const firstProv = availableProvinces.length > 0 ? availableProvinces[0] : 'ALL';
    if (scope === 'topbot') {
      const saved =
        savedUserFilters?.revenue_topbot_province ??
        localStorage.getItem('revenue_topbot_province');
      if (saved && (saved === 'ALL' || availableProvinces.includes(saved))) return saved;
      return 'ALL';
    }

    if (scope === 'sieuthimoi') {
      const savedMoi =
        savedUserFilters?.revenue_sieuthimoi_province ??
        localStorage.getItem('revenue_sieuthimoi_province');
      if (savedMoi && (savedMoi === 'ALL' || availableProvinces.includes(savedMoi))) return savedMoi;
      return firstProv;
    }

    if (scope === 'vung') {
      // Tab SIÊU THỊ
      const savedSt =
        savedUserFilters?.revenue_sieuthi_province ??
        localStorage.getItem('revenue_sieuthi_province');
      if (savedSt && (savedSt === 'ALL' || availableProvinces.includes(savedSt))) return savedSt;
      return firstProv;
    }

    return 'ALL';
  };

  // Helper lấy size đã lưu cho từng tab
  const getSavedSizeForScope = (scope: EntityScope): string => {
    if (scope === 'vung') {
      return savedUserFilters?.revenue_sieuthi_size ?? localStorage.getItem('revenue_sieuthi_size') ?? 'ALL';
    }
    if (scope === 'sieuthimoi') {
      return savedUserFilters?.revenue_sieuthimoi_size ?? localStorage.getItem('revenue_sieuthimoi_size') ?? 'ALL';
    }
    if (scope === 'topbot') {
      return savedUserFilters?.revenue_topbot_size ?? localStorage.getItem('revenue_topbot_size') ?? 'ALL';
    }
    return 'ALL';
  };

  // Helper lấy tỉnh mới đã lưu cho từng tab
  const getSavedTinhMoiForScope = (scope: EntityScope): string => {
    if (scope === 'vung') {
      return savedUserFilters?.revenue_sieuthi_tinhmoi ?? localStorage.getItem('revenue_sieuthi_tinhmoi') ?? 'ALL';
    }
    if (scope === 'sieuthimoi') {
      return savedUserFilters?.revenue_sieuthimoi_tinhmoi ?? localStorage.getItem('revenue_sieuthimoi_tinhmoi') ?? 'ALL';
    }
    if (scope === 'topbot') {
      return savedUserFilters?.revenue_topbot_tinhmoi ?? localStorage.getItem('revenue_topbot_tinhmoi') ?? 'ALL';
    }
    return 'ALL';
  };

  // Helper lấy từ khoá tìm kiếm cho từng tab
  const getSavedSearchForScope = (scope: EntityScope): string => {
    if (scope === 'vung') {
      return localStorage.getItem('revenue_sieuthi_search') ?? '';
    }
    if (scope === 'sieuthimoi') {
      return localStorage.getItem('revenue_sieuthimoi_search') ?? '';
    }
    return '';
  };

  // Target Configuration (Mặc định vs CK Năm, và Hệ số %)
  const [targetConfig, setTargetConfig] = usePersistedState<TargetConfig>('tnb_revenue_target_config', {
    mode: 'default',
    heSo: 100,
  });

  // Đồng bộ cấu hình target từ userFilters nếu có lưu
  useEffect(() => {
    if (savedUserFilters?.revenue_target_config) {
      setTargetConfig(savedUserFilters.revenue_target_config);
    }
  }, [savedUserFilters?.revenue_target_config]);

  const [isTargetConfigModalOpen, setIsTargetConfigModalOpen] = useState(false);
  const [tempTargetConfig, setTempTargetConfig] = useState<TargetConfig>(targetConfig);

  useEffect(() => {
    if (isTargetConfigModalOpen) {
      setTempTargetConfig(targetConfig);
    }
  }, [isTargetConfigModalOpen, targetConfig]);

  // Value display mode: 'percent' (% HT) | 'value' (Giá trị Triệu VND)
  const [valueDisplayMode, setValueDisplayMode] = useState<'percent' | 'value'>('percent');

  // Metric mode: 'all' (DT + Trả chậm), 'dt_only' (Chỉ Doanh Thu), 'tc_only' (Chỉ Trả Chậm)
  const [selectedMetricGroup, setSelectedMetricGroup] = useState<string>('ALL');

  // Filters - Khởi tạo độc lập theo entityScope
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(() => getSavedChannelsForScope(entityScope));
  const [selectedProvince, setSelectedProvince] = useState<string>(() => {
    if (entityScope === 'topbot') {
      const saved = savedUserFilters?.revenue_topbot_province ?? localStorage.getItem('revenue_topbot_province');
      return saved || 'ALL';
    }
    if (entityScope === 'sieuthimoi') {
      const saved = savedUserFilters?.revenue_sieuthimoi_province ?? localStorage.getItem('revenue_sieuthimoi_province');
      return saved || 'ALL';
    }
    if (entityScope === 'vung') {
      const saved = savedUserFilters?.revenue_sieuthi_province ?? localStorage.getItem('revenue_sieuthi_province');
      return saved || 'ALL';
    }
    return 'ALL';
  });
  const [selectedBoss, setSelectedBoss] = useState<string>('ALL');
  const [selectedPhanLoaiShop, setSelectedPhanLoaiShop] = useState<string>(() => getSavedSizeForScope(entityScope));
  const [selectedTinhMoi, setSelectedTinhMoi] = useState<string>(() => getSavedTinhMoiForScope(entityScope));
  const [searchTerm, setSearchTerm] = useState<string>(() => getSavedSearchForScope(entityScope));

  const isInitialProvinceLoadedRef = useRef(false);

  // Sorting
  const [sortField, setSortField] = useState<string>('rateDt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Remarks Modal State
  const [isRemarksModalOpen, setIsRemarksModalOpen] = useState(false);
  const [remarkCopied, setRemarkCopied] = useState(false);
  const [activeRemarkTemplate, setActiveRemarkTemplate] = useState<'template_1' | 'template_2' | 'template_3'>('template_1');
  const [remarkDisplayMode, setRemarkDisplayMode] = useState<RemarkDisplayMode>(
    () => (entityScope === 'vung' || entityScope === 'sieuthimoi' || entityScope === 'topbot') ? 'no_tag_top' : 'user'
  );
  const [customRemarkText, setCustomRemarkText] = useState<string>('');

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'quick' | 'group' | 'all' | 'province' | 'tinhmoi' | 'size'>('all');

  // Selected Active Stores based on Time Mode
  const activeDtStores = timeMode === 'realtime' ? realtimeDtStores : luykeDtStores;
  const activeTcStores = timeMode === 'realtime' ? realtimeTcStores : luykeTcStores;
  const lastUpdatedTime =
    timeMode === 'realtime'
      ? lastUpdateRealtimeDt || lastUpdateRealtimeTc || getFormattedNow()
      : lastUpdateLuyKeDt || lastUpdateLuyKeTc || getFormattedNow();

  const [idbCungKy, setIdbCungKy] = useState<RevenueCungKyRecord[]>([]);

  useEffect(() => {
    if (!revenueCungKy || revenueCungKy.length === 0) {
      void idbGet<RevenueCungKyRecord[]>('tnb_revenue_cung_ky').then((res) => {
        if (res && res.length > 0) {
          setIdbCungKy(res);
        }
      });
    }
  }, [revenueCungKy]);

  // Fallback to local storage or IndexedDB if props revenueCungKy is empty
  const effectiveRevenueCungKy = useMemo<RevenueCungKyRecord[]>(() => {
    if (revenueCungKy && revenueCungKy.length > 0) return revenueCungKy;
    if (idbCungKy && idbCungKy.length > 0) return idbCungKy;
    try {
      const raw1 = localStorage.getItem('tnb_revenue_cung_ky');
      if (raw1) {
        const parsed = JSON.parse(raw1);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const raw2 = localStorage.getItem('tnb_revenue_cung_ky_records');
      if (raw2) {
        const parsed = JSON.parse(raw2);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const rawCache = localStorage.getItem('tnb_competition_cache_v1');
      if (rawCache) {
        const parsedCache = JSON.parse(rawCache);
        if (parsedCache?.revenueCungKy && Array.isArray(parsedCache.revenueCungKy) && parsedCache.revenueCungKy.length > 0) {
          return parsedCache.revenueCungKy;
        }
      }
    } catch (e) {
      console.warn('Error reading revenueCungKy from localStorage fallback:', e);
    }
    return [];
  }, [revenueCungKy, idbCungKy]);

  // Extract Day, Month, Year: Realtime luôn lấy theo ngày hôm nay thực tế (new Date())
  const dateInfo = useMemo(() => {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const dStr = String(day).padStart(2, '0');
    const mStr = String(month).padStart(2, '0');
    const curYearStr = String(year);
    const prevYearStr = String(year - 1);

    const curDayMonthYear = `${dStr}/${mStr}/${curYearStr}`;
    const curMonthYear = `${mStr}/${curYearStr}`;
    const cungKyDayMonthYear = `${dStr}/${mStr}/${prevYearStr}`;
    const cungKyMonthYear = `${mStr}/${prevYearStr}`;

    return {
      day,
      month,
      year,
      dStr,
      mStr,
      curYearStr,
      prevYearStr,
      curDayMonthYear,
      curMonthYear,
      cungKyDayMonthYear,
      cungKyMonthYear,
    };
  }, []);

  // Index revenueCungKy for fast lookup by store code and date/month
  const cungKyIndex = useMemo(() => {
    const byStoreDate = new Map<string, RevenueCungKyRecord>();
    const byStoreMonth = new Map<string, number>();

    effectiveRevenueCungKy.forEach((row) => {
      const rawMaKho = String(row.maKho || '').trim();
      const numMaKho = String(parseInt(rawMaKho, 10) || rawMaKho);

      const p = (row.ngay || '').split(/[\/\-]/);
      if (p.length === 3) {
        const d = p[0].padStart(2, '0');
        const m = p[1].padStart(2, '0');
        let y = p[2].trim().split(/\s+/)[0];
        if (y.length === 2) {
          y = Number(y) < 50 ? `20${y}` : `19${y}`;
        }
        const shortY = y.slice(-2);

        const dateKey1 = `${d}/${m}/${y}`; // "04/09/2025"
        const dateKey2 = `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`; // "4/9/2025"
        const dateKey3 = `${d}/${m}/${shortY}`; // "04/09/25"
        const dateKey4 = `${parseInt(d, 10)}/${parseInt(m, 10)}/${shortY}`; // "4/9/25"

        const monthKey1 = `${m}/${y}`; // "09/2025"
        const monthKey2 = `${parseInt(m, 10)}/${y}`; // "9/2025"
        const monthKey3 = `${m}/${shortY}`; // "09/25"
        const monthKey4 = `${parseInt(m, 10)}/${shortY}`; // "9/25"

        // Collect all possible store identifiers
        const keysToStore = new Set<string>([rawMaKho, numMaKho]);
        const storeCodeFromSieuthi = extractStoreCode(row.sieuthi || '');
        if (storeCodeFromSieuthi) keysToStore.add(storeCodeFromSieuthi);
        const mstFromSieuthi = extractMst(row.sieuthi || '');
        if (mstFromSieuthi) {
          keysToStore.add(mstFromSieuthi);
          keysToStore.add(String(parseInt(mstFromSieuthi, 10) || mstFromSieuthi));
        }

        const allKeys = new Set<string>();
        keysToStore.forEach((k) => {
          if (!k) return;
          allKeys.add(k);
          allKeys.add(k.toLowerCase());
        });

        allKeys.forEach((k) => {
          byStoreDate.set(`${k}_${dateKey1}`, row);
          byStoreDate.set(`${k}_${dateKey2}`, row);
          byStoreDate.set(`${k}_${dateKey3}`, row);
          byStoreDate.set(`${k}_${dateKey4}`, row);
        });

        const dtQdVal = row.doanhThuQd || 0;
        const uniqueMonthKeys = Array.from(new Set([monthKey1, monthKey2, monthKey3, monthKey4]));

        allKeys.forEach((k) => {
          uniqueMonthKeys.forEach((mk) => {
            const compositeKey = `${k}_${mk}`;
            byStoreMonth.set(compositeKey, (byStoreMonth.get(compositeKey) || 0) + dtQdVal);
          });
        });
      }
    });

    return { byStoreDate, byStoreMonth };
  }, [effectiveRevenueCungKy]);

  // Combine DT and TC into unified Store Items
  const mergedItems = useMemo<RevenueRecordItem[]>(() => {
    const tcMap = new Map<string, StoreRecord>();
    activeTcStores.forEach((tc) => {
      const key = (tc.sieuthi || tc.tinh || '').trim().toLowerCase();
      tcMap.set(key, tc);
      const code = extractStoreCode(tc.sieuthi);
      if (code) tcMap.set(code.toLowerCase(), tc);
      const mst = extractMst(tc.sieuthi);
      if (mst) tcMap.set(mst.toLowerCase(), tc);
    });

    const items: RevenueRecordItem[] = [];
    const processedKeys = new Set<string>();

    activeDtStores.forEach((dt, idx) => {
      if (isExcludedStore(dt, bossAssignments)) return;

      const key = (dt.sieuthi || dt.tinh || '').trim().toLowerCase();
      processedKeys.add(key);

      const code = extractStoreCode(dt.sieuthi);
      const mst = extractMst(dt.sieuthi);
      const matchedTc =
        tcMap.get(key) ||
        (code ? tcMap.get(code.toLowerCase()) : undefined) ||
        (mst ? tcMap.get(mst.toLowerCase()) : undefined);

      const effectiveBoss = getBossForStore(dt.sieuthi, bossAssignments, dt.boss);
      const effectiveKenh = getChannelForStore(dt.sieuthi, bossAssignments, dt.kenh);
      const phanLoaiShop = getPhanLoaiShopForStore(dt.sieuthi, bossAssignments);
      const tinhMoi = getTinhMoiForStore(dt.sieuthi, bossAssignments);

      // Base Target computation: Mặc định vs Cùng Kỳ Năm
      const storeCode = mst || extractStoreCode(dt.sieuthi) || dt.id || '';
      const cleanMst = String(parseInt(storeCode, 10) || storeCode).trim();
      const rawMst = storeCode.trim();

      let baseTarget = dt.target || 0;

      if (targetConfig.mode === 'cung_ky') {
        if (timeMode === 'realtime') {
          // Realtime: lookup store on cungKyDayMonthYear (e.g. "04/09/2025")
          const dKey1 = dateInfo.cungKyDayMonthYear; // "04/09/2025"
          const dKey2 = `${parseInt(dateInfo.dStr, 10)}/${parseInt(dateInfo.mStr, 10)}/${dateInfo.prevYearStr}`; // "4/9/2025"
          const shortY = dateInfo.prevYearStr.slice(-2);
          const dKey3 = `${dateInfo.dStr}/${dateInfo.mStr}/${shortY}`; // "04/09/25"
          const dKey4 = `${parseInt(dateInfo.dStr, 10)}/${parseInt(dateInfo.mStr, 10)}/${shortY}`; // "4/9/25"

          const keysToTry = [
            `${rawMst}_${dKey1}`, `${cleanMst}_${dKey1}`,
            `${rawMst}_${dKey2}`, `${cleanMst}_${dKey2}`,
            `${rawMst}_${dKey3}`, `${cleanMst}_${dKey3}`,
            `${rawMst}_${dKey4}`, `${cleanMst}_${dKey4}`,
          ];
          if (code) {
            keysToTry.push(`${code}_${dKey1}`, `${code}_${dKey2}`, `${code}_${dKey3}`, `${code}_${dKey4}`);
          }

          let matchedRow: RevenueCungKyRecord | undefined;
          for (const k of keysToTry) {
            matchedRow = cungKyIndex.byStoreDate.get(k) || cungKyIndex.byStoreDate.get(k.toLowerCase());
            if (matchedRow && matchedRow.doanhThuQd > 0) break;
          }

          if (matchedRow && matchedRow.doanhThuQd > 0) {
            const rawVal = matchedRow.doanhThuQd;
            baseTarget = rawVal > 100_000 ? (rawVal / 1_000_000) : rawVal;
          }
        } else {
          // Luỹ kế: sum of all days in cungKyMonthYear (e.g. "09/2025")
          const mKey1 = dateInfo.cungKyMonthYear; // "09/2025"
          const mKey2 = `${parseInt(dateInfo.mStr, 10)}/${dateInfo.prevYearStr}`; // "9/2025"
          const shortY = dateInfo.prevYearStr.slice(-2);
          const mKey3 = `${dateInfo.mStr}/${shortY}`; // "09/25"
          const mKey4 = `${parseInt(dateInfo.mStr, 10)}/${shortY}`; // "9/25"

          const mKeysToTry = [
            `${rawMst}_${mKey1}`, `${cleanMst}_${mKey1}`,
            `${rawMst}_${mKey2}`, `${cleanMst}_${mKey2}`,
            `${rawMst}_${mKey3}`, `${cleanMst}_${mKey3}`,
            `${rawMst}_${mKey4}`, `${cleanMst}_${mKey4}`,
          ];
          if (code) {
            mKeysToTry.push(`${code}_${mKey1}`, `${code}_${mKey2}`, `${code}_${mKey3}`, `${code}_${mKey4}`);
          }

          let monthSum = 0;
          for (const k of mKeysToTry) {
            const val = cungKyIndex.byStoreMonth.get(k) || cungKyIndex.byStoreMonth.get(k.toLowerCase()) || 0;
            if (val > 0) {
              monthSum = val;
              break;
            }
          }

          if (monthSum > 0) {
            baseTarget = monthSum > 100_000 ? (monthSum / 1_000_000) : monthSum;
          }
        }
      }

      // Apply multiplier % (e.g. 140% -> x1.4)
      const multiplier = (targetConfig.heSo || 100) / 100;
      const targetDt = Math.round(baseTarget * multiplier);
      const achievedDt = dt.achieved || dt.dtQd || 0;
      // Recalculate completion rate based on active targetDt
      const rateDt = targetDt > 0 ? (achievedDt / targetDt) * 100 : (dt.rate || 0);
      const dtThuc = dt.dtThuc !== undefined ? dt.dtThuc : achievedDt;
      const dtQd = dt.dtQd !== undefined ? dt.dtQd : achievedDt;
      const qdEff = dtThuc > 0 ? ((dtQd - dtThuc) / dtThuc) * 100 : 0;

      const achievedTc = dt.dtTraGop !== undefined ? dt.dtTraGop : (matchedTc?.achieved || 0);
      const tcRatio = dt.tiTrongTraGop !== undefined
        ? dt.tiTrongTraGop
        : (matchedTc?.rate !== undefined && matchedTc.rate > 0
          ? matchedTc.rate
          : (achievedDt > 0 ? (achievedTc / achievedDt) * 100 : 0));
      const targetTc = dt.targetThang || matchedTc?.target || 0;
      const rateTc = tcRatio;

      items.push({
        stt: idx + 1,
        id: dt.id || `DT_${idx}`,
        tinh: dt.tinh || 'Khác',
        sieuthi: dt.sieuthi,
        boss: effectiveBoss,
        kenh: effectiveKenh,
        phanLoaiShop,
        tinhMoi,
        targetDt,
        achievedDt,
        rateDt: Number(rateDt.toFixed(1)),
        dtThuc,
        dtQd,
        qdEff: Number(qdEff.toFixed(1)),
        targetTc,
        achievedTc,
        rateTc: Number(rateTc.toFixed(1)),
        tcRatio: Number(tcRatio.toFixed(1)),
      });
    });

    // Also include stores in TC list if not yet added
    activeTcStores.forEach((tc) => {
      const key = (tc.sieuthi || tc.tinh || '').trim().toLowerCase();
      if (!processedKeys.has(key) && !isExcludedStore(tc, bossAssignments)) {
        const effectiveBoss = getBossForStore(tc.sieuthi, bossAssignments, tc.boss);
        const effectiveKenh = getChannelForStore(tc.sieuthi, bossAssignments, tc.kenh);
        const phanLoaiShop = getPhanLoaiShopForStore(tc.sieuthi, bossAssignments);
        const tinhMoi = getTinhMoiForStore(tc.sieuthi, bossAssignments);
        const targetTc = tc.target || 0;
        const achievedTc = tc.achieved || 0;
        const rateTc = tc.rate ?? (targetTc > 0 ? (achievedTc / targetTc) * 100 : 0);

        items.push({
          stt: items.length + 1,
          id: tc.id || `TC_${items.length}`,
          tinh: tc.tinh || 'Khác',
          sieuthi: tc.sieuthi,
          boss: effectiveBoss,
          kenh: effectiveKenh,
          phanLoaiShop,
          tinhMoi,
          targetDt: 0,
          achievedDt: 0,
          rateDt: 0,
          dtThuc: 0,
          dtQd: 0,
          qdEff: 0,
          targetTc,
          achievedTc,
          rateTc: Number(rateTc.toFixed(1)),
          tcRatio: 0,
        });
      }
    });

    return items;
  }, [activeDtStores, activeTcStores, bossAssignments, targetConfig, timeMode, cungKyIndex, dateInfo]);

  // Unique Filter Options
  const uniqueProvinces = useMemo(
    () => Array.from(new Set(mergedItems.map((i) => i.tinh).filter(Boolean))).sort(),
    [mergedItems]
  );
  const uniqueBosses = useMemo(
    () => Array.from(new Set(mergedItems.map((i) => i.boss).filter(Boolean))).sort(),
    [mergedItems]
  );
  const uniquePhanLoais = useMemo(
    () =>
      Array.from(
        new Set(
          mergedItems
            .map((i) => i.phanLoaiShop)
            .filter((s) => Boolean(s) && s !== '-' && s !== '--' && s !== 'N/A' && s?.trim() !== '')
        )
      ).sort(),
    [mergedItems]
  );
  const uniqueTinhMois = useMemo(
    () => Array.from(new Set(mergedItems.map((i) => i.tinhMoi).filter(Boolean))).sort(),
    [mergedItems]
  );

  // Khi mới mở ứng dụng hoặc khi uniqueProvinces sẵn sàng: Khôi phục Kênh & Tỉnh theo tab hiện tại
  useEffect(() => {
    if (uniqueProvinces.length === 0) return;
    if (!isInitialProvinceLoadedRef.current) {
      setSelectedChannels(getSavedChannelsForScope(entityScope));
      const savedProv = getSavedProvinceForScope(entityScope, uniqueProvinces);
      setSelectedProvince(savedProv);
      isInitialProvinceLoadedRef.current = true;
    }
  }, [uniqueProvinces, entityScope]);

  // Lắng nghe khi savedUserFilters từ Firebase / IndexedDB thay đổi
  const prevSavedFiltersJsonRef = useRef<string>('');
  useEffect(() => {
    if (!savedUserFilters) return;
    const currentJson = JSON.stringify(savedUserFilters);
    if (currentJson !== prevSavedFiltersJsonRef.current) {
      prevSavedFiltersJsonRef.current = currentJson;
      setSelectedChannels(getSavedChannelsForScope(entityScope));
      if (uniqueProvinces.length > 0) {
        let scopeSavedProv: string | undefined;
        if (entityScope === 'topbot') {
          scopeSavedProv = savedUserFilters.revenue_topbot_province;
        } else if (entityScope === 'sieuthimoi') {
          scopeSavedProv = savedUserFilters.revenue_sieuthimoi_province;
        } else if (entityScope === 'vung') {
          scopeSavedProv = savedUserFilters.revenue_sieuthi_province;
        }

        if (scopeSavedProv && (scopeSavedProv === 'ALL' || uniqueProvinces.includes(scopeSavedProv))) {
          setSelectedProvince(scopeSavedProv);
        } else if (!uniqueProvinces.includes(selectedProvince)) {
          setSelectedProvince(getSavedProvinceForScope(entityScope, uniqueProvinces));
        }
      }
      setSelectedPhanLoaiShop(getSavedSizeForScope(entityScope));
      setSelectedTinhMoi(getSavedTinhMoiForScope(entityScope));

      if (savedUserFilters.revenue_target_config) {
        setTargetConfig(savedUserFilters.revenue_target_config);
      }
    }
  }, [savedUserFilters, entityScope, uniqueProvinces, selectedProvince]);

  // Đồng bộ khi entityScope thay đổi (chuyển tab) để bộ lọc luôn độc lập giữa các tab
  const prevScopeRef = useRef<EntityScope>(entityScope);
  useEffect(() => {
    if (prevScopeRef.current !== entityScope) {
      prevScopeRef.current = entityScope;
      setSelectedChannels(getSavedChannelsForScope(entityScope));
      if (uniqueProvinces.length > 0) {
        setSelectedProvince(getSavedProvinceForScope(entityScope, uniqueProvinces));
      }
      setSelectedPhanLoaiShop(getSavedSizeForScope(entityScope));
      setSelectedTinhMoi(getSavedTinhMoiForScope(entityScope));
      setSearchTerm(getSavedSearchForScope(entityScope));
      // Tab SIÊU THỊ / SIÊU THỊ MỚI / TOP-BOT luôn mặc định "Bỏ Tag TOP" khi nhận xét
      setRemarkDisplayMode(
        (entityScope === 'vung' || entityScope === 'sieuthimoi' || entityScope === 'topbot') ? 'no_tag_top' : 'user'
      );
      setCurrentPage(1);
    }
  }, [entityScope, uniqueProvinces]);

  const handleChannelsChange = (newChannels: Channel[]) => {
    setSelectedChannels(newChannels);
    let key = '';
    if (entityScope === 'topbot') key = 'revenue_topbot_channels';
    else if (entityScope === 'tong') key = 'revenue_tong_channels';
    else if (entityScope === 'sieuthi') key = 'revenue_vung_channels'; // Tab VÙNG
    else if (entityScope === 'vung') key = 'revenue_sieuthi_channels'; // Tab SIÊU THỊ
    else if (entityScope === 'sieuthimoi') key = 'revenue_sieuthimoi_channels';

    if (key) {
      onSaveUserFilters?.({ [key]: newChannels });
      try {
        localStorage.setItem(key, JSON.stringify(newChannels));
        void idbSet(key, newChannels);
      } catch (e) {}
    }
  };

  const handleProvinceChange = (newProvince: string) => {
    setSelectedProvince(newProvince);
    let key = '';
    if (entityScope === 'vung') key = 'revenue_sieuthi_province'; // Tab SIÊU THỊ
    else if (entityScope === 'sieuthimoi') key = 'revenue_sieuthimoi_province';
    else if (entityScope === 'topbot') key = 'revenue_topbot_province';

    if (key) {
      onSaveUserFilters?.({ [key]: newProvince });
      try {
        localStorage.setItem(key, newProvince);
        void idbSet(key, newProvince);
      } catch (e) {}
    }
  };

  const handleSizeChange = (newSize: string) => {
    setSelectedPhanLoaiShop(newSize);
    let key = '';
    if (entityScope === 'vung') key = 'revenue_sieuthi_size';
    else if (entityScope === 'sieuthimoi') key = 'revenue_sieuthimoi_size';
    else if (entityScope === 'topbot') key = 'revenue_topbot_size';

    if (key) {
      onSaveUserFilters?.({ [key]: newSize });
      try {
        localStorage.setItem(key, newSize);
        void idbSet(key, newSize);
      } catch (e) {}
    }
  };

  const handleTinhMoiChange = (newTinhMoi: string) => {
    setSelectedTinhMoi(newTinhMoi);
    let key = '';
    if (entityScope === 'vung') key = 'revenue_sieuthi_tinhmoi';
    else if (entityScope === 'sieuthimoi') key = 'revenue_sieuthimoi_tinhmoi';
    else if (entityScope === 'topbot') key = 'revenue_topbot_tinhmoi';

    if (key) {
      onSaveUserFilters?.({ [key]: newTinhMoi });
      try {
        localStorage.setItem(key, newTinhMoi);
        void idbSet(key, newTinhMoi);
      } catch (e) {}
    }
  };

  const handleSearchChange = (newSearch: string) => {
    setSearchTerm(newSearch);
    if (entityScope === 'vung') {
      try {
        localStorage.setItem('revenue_sieuthi_search', newSearch);
      } catch (e) {}
    } else if (entityScope === 'sieuthimoi') {
      try {
        localStorage.setItem('revenue_sieuthimoi_search', newSearch);
      } catch (e) {}
    }
  };

  const handleTabSwitch = (newScope: EntityScope) => {
    setEntityScope(newScope);
    // Khôi phục 100% độc lập bộ lọc của tab mới
    setSelectedChannels(getSavedChannelsForScope(newScope));
    setSelectedProvince(getSavedProvinceForScope(newScope, uniqueProvinces));
    setSelectedPhanLoaiShop(getSavedSizeForScope(newScope));
    setSelectedTinhMoi(getSavedTinhMoiForScope(newScope));
    setSelectedBoss('ALL');
    setSearchTerm(getSavedSearchForScope(newScope));
    setCurrentPage(1);
  };

  // Filtered Store Items
  const filteredItems = useMemo(() => {
    // Khi đang tìm kiếm ở tab SIÊU THỊ hoặc SIÊU THỊ MỚI: bỏ qua bộ lọc Tỉnh
    // để rà soát tất cả siêu thị — người dùng thường gõ mã kho và muốn tìm nhanh
    // bất kể đang lọc tỉnh nào.
    const isSearchBypassProvince = !!(searchTerm && searchTerm.trim() && (entityScope === 'vung' || entityScope === 'sieuthimoi'));

    return mergedItems.filter((item) => {
      // 1. Kênh
      if (selectedChannels.length > 0 && !selectedChannels.includes(item.kenh as Channel)) return false;

      // 2. Tỉnh, Boss, Size, Tỉnh mới (chỉ áp dụng nếu scope không phải TỔNG hay VÙNG)
      //    Khi đang tìm kiếm ở tab SIÊU THỊ → bỏ qua bộ lọc tỉnh để rà soát ALL
      if (entityScope !== 'tong' && entityScope !== 'sieuthi' && !isSearchBypassProvince) {
        if (selectedProvince !== 'ALL' && item.tinh !== selectedProvince) return false;
        if (selectedBoss !== 'ALL' && item.boss !== selectedBoss) return false;
        if (selectedPhanLoaiShop !== 'ALL' && item.phanLoaiShop !== selectedPhanLoaiShop) return false;
        if (selectedTinhMoi !== 'ALL' && item.tinhMoi !== selectedTinhMoi) return false;
      }

      // 3. Tìm kiếm: chỉ áp dụng khi ở tab SIÊU THỊ hoặc SIÊU THỊ MỚI, KHÔNG áp dụng cho TOP/BOT, TỔNG hay VÙNG
      if (searchTerm && (entityScope === 'vung' || entityScope === 'sieuthimoi')) {
        const q = searchTerm.toLowerCase().trim();
        const match =
          item.sieuthi.toLowerCase().includes(q) ||
          item.tinh.toLowerCase().includes(q) ||
          item.boss.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [mergedItems, selectedChannels, selectedProvince, selectedBoss, selectedPhanLoaiShop, selectedTinhMoi, searchTerm, entityScope]);

  // Province-level Rollup
  const provinceSummaryRows = useMemo(() => {
    const map = new Map<
      string,
      {
        tinh: string;
        targetDt: number;
        achievedDt: number;
        dtThuc: number;
        dtQd: number;
        targetTc: number;
        achievedTc: number;
        storesCount: number;
        reachedStoresCount: number;
      }
    >();

    filteredItems.forEach((item) => {
      const tinh = item.tinh || 'Khác';
      const cur = map.get(tinh) || {
        tinh,
        targetDt: 0,
        achievedDt: 0,
        dtThuc: 0,
        dtQd: 0,
        targetTc: 0,
        achievedTc: 0,
        storesCount: 0,
        reachedStoresCount: 0,
      };

      cur.targetDt += item.targetDt;
      cur.achievedDt += item.achievedDt;
      cur.dtThuc += item.dtThuc || 0;
      cur.dtQd += item.dtQd || 0;
      cur.targetTc += item.targetTc || 0;
      cur.achievedTc += item.achievedTc;
      cur.storesCount += 1;
      if (item.rateDt >= 100) cur.reachedStoresCount += 1;

      map.set(tinh, cur);
    });

    return Array.from(map.values())
      .map((p, idx) => {
        const rateDt = p.targetDt > 0 ? Number(((p.achievedDt / p.targetDt) * 100).toFixed(1)) : 0;
        const rateTc = p.targetTc > 0 ? Number(((p.achievedTc / p.targetTc) * 100).toFixed(1)) : 0;
        const tcRatio = p.achievedDt > 0 ? Number(((p.achievedTc / p.achievedDt) * 100).toFixed(1)) : 0;
        const qdEff = p.dtThuc > 0 ? Number((((p.dtQd - p.dtThuc) / p.dtThuc) * 100).toFixed(1)) : 0;

        return {
          stt: idx + 1,
          tinh: p.tinh,
          targetDt: p.targetDt,
          achievedDt: p.achievedDt,
          rateDt,
          dtThuc: p.dtThuc,
          dtQd: p.dtQd,
          qdEff,
          targetTc: p.targetTc,
          achievedTc: p.achievedTc,
          rateTc,
          tcRatio,
          storesCount: p.storesCount,
          reachedStoresCount: p.reachedStoresCount,
        };
      })
      .sort((a, b) => b.rateDt - a.rateDt);
  }, [filteredItems]);

  // Overall Total Summary
  const totalSummary = useMemo(() => {
    const totalTargetDt = filteredItems.reduce((acc, i) => acc + i.targetDt, 0);
    const totalAchievedDt = filteredItems.reduce((acc, i) => acc + i.achievedDt, 0);
    const totalRateDt = totalTargetDt > 0 ? Number(((totalAchievedDt / totalTargetDt) * 100).toFixed(1)) : 0;

    const totalDtThuc = filteredItems.reduce((acc, i) => acc + (i.dtThuc || 0), 0);
    const totalDtQd = filteredItems.reduce((acc, i) => acc + (i.dtQd || 0), 0);
    const totalQdEff = totalDtThuc > 0 ? Number((((totalDtQd - totalDtThuc) / totalDtThuc) * 100).toFixed(1)) : 0;

    const totalTargetTc = filteredItems.reduce((acc, i) => acc + (i.targetTc || 0), 0);
    const totalAchievedTc = filteredItems.reduce((acc, i) => acc + i.achievedTc, 0);
    const totalRateTc = totalTargetTc > 0 ? Number(((totalAchievedTc / totalTargetTc) * 100).toFixed(1)) : 0;
    const totalTcRatio = totalAchievedDt > 0 ? Number(((totalAchievedTc / totalAchievedDt) * 100).toFixed(1)) : 0;

    const reachedStoresCount = filteredItems.filter((i) => i.rateDt >= 100).length;

    return {
      totalTargetDt,
      totalAchievedDt,
      totalRateDt,
      totalDtThuc,
      totalDtQd,
      totalQdEff,
      totalTargetTc,
      totalAchievedTc,
      totalRateTc,
      totalTcRatio,
      totalStores: filteredItems.length,
      reachedStoresCount,
      reachedPercentage: filteredItems.length > 0 ? Number(((reachedStoresCount / filteredItems.length) * 100).toFixed(1)) : 0,
    };
  }, [filteredItems]);

  // Channel Summary Rows for Tab "TỔNG"
  const channelSummaryRows = useMemo(() => {
    const channelOrder: Channel[] = ['DML', 'DMM', 'DMS', 'TGD', 'TopZone'];
    const map = new Map<
      string,
      {
        kenh: string;
        targetDt: number;
        achievedDt: number;
        dtThuc: number;
        dtQd: number;
        targetTc: number;
        achievedTc: number;
        storesCount: number;
      }
    >();

    filteredItems.forEach((item) => {
      const kenh = item.kenh || 'DML';
      const cur = map.get(kenh) || {
        kenh,
        targetDt: 0,
        achievedDt: 0,
        dtThuc: 0,
        dtQd: 0,
        targetTc: 0,
        achievedTc: 0,
        storesCount: 0,
      };
      cur.targetDt += item.targetDt;
      cur.achievedDt += item.achievedDt;
      cur.dtThuc += item.dtThuc || 0;
      cur.dtQd += item.dtQd || 0;
      cur.targetTc += item.targetTc || 0;
      cur.achievedTc += item.achievedTc;
      cur.storesCount += 1;
      map.set(kenh, cur);
    });

    return channelOrder
      .filter((ch) => map.has(ch))
      .map((ch) => {
        const p = map.get(ch)!;
        const rateDt = p.targetDt > 0 ? Number(((p.achievedDt / p.targetDt) * 100).toFixed(1)) : 0;
        const tcRatio = p.achievedDt > 0 ? Number(((p.achievedTc / p.achievedDt) * 100).toFixed(1)) : 0;
        const qdEff = p.dtThuc > 0 ? Number((((p.dtQd - p.dtThuc) / p.dtThuc) * 100).toFixed(1)) : 0;

        return {
          kenh: ch,
          targetDt: p.targetDt,
          achievedDt: p.achievedDt,
          rateDt,
          dtThuc: p.dtThuc,
          dtQd: p.dtQd,
          targetTc: p.targetTc,
          achievedTc: p.achievedTc,
          tcRatio,
          qdEff,
          storesCount: p.storesCount,
        };
      });
  }, [filteredItems]);

  const { infoTimeLabel, realtimeTimeStr, realtimeTimeAndDateStr, thoiGianSdPercent } = useMemo(() => {
    let day = new Date().getDate();
    let month = new Date().getMonth() + 1;
    let year = new Date().getFullYear();
    let hours = 12;
    let mins = 0;

    if (lastUpdatedTime) {
      const dateMatch = lastUpdatedTime.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dateMatch) {
        day = parseInt(dateMatch[1], 10);
        month = parseInt(dateMatch[2], 10);
        year = parseInt(dateMatch[3], 10);
      }
      const timeMatch = lastUpdatedTime.match(/(\d{1,2}):(\d{1,2})/);
      if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        mins = parseInt(timeMatch[2], 10);
      }
    }

    if (timeMode === 'luyke') {
      // Khi chọn Luỹ kế: Lấy thời gian dữ liệu cập nhật - 1 ngày
      const baseDate = new Date(year, month - 1, day);
      baseDate.setDate(baseDate.getDate() - 1);
      const lkDay = baseDate.getDate();
      const lkMonth = baseDate.getMonth() + 1;
      const lkYear = baseDate.getFullYear();
      const totalDays = new Date(lkYear, lkMonth, 0).getDate();
      const pct = Number(((lkDay / totalDays) * 100).toFixed(1));
      const lkDayStr = String(lkDay).padStart(2, '0');
      const lkMonthStr = String(lkMonth).padStart(2, '0');
      const formattedStr = `${lkDay}/${totalDays} NGÀY ${lkDayStr}/${lkMonthStr}`;

      return {
        infoTimeLabel: 'LUỸ KẾ :',
        realtimeTimeStr: formattedStr,
        realtimeTimeAndDateStr: formattedStr,
        thoiGianSdPercent: pct,
      };
    }

    // Realtime mode (Giờ mở cửa: 7h30 -> Giờ đóng cửa: 21h30, tổng 14 tiếng = 840 phút)
    const currentMins = hours * 60 + mins;
    const startMins = 7 * 60 + 30; // 07:30
    const endMins = 21 * 60 + 30; // 21:30
    const totalWorkingMins = endMins - startMins; // 840 mins
    const elapsed = Math.max(0, Math.min(totalWorkingMins, currentMins - startMins));
    const pct = Number(((elapsed / totalWorkingMins) * 100).toFixed(1));
    const timeDisplay = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');

    return {
      infoTimeLabel: 'REALTIME :',
      realtimeTimeStr: timeDisplay,
      realtimeTimeAndDateStr: `${timeDisplay} ${dayStr}/${monthStr}`,
      thoiGianSdPercent: pct > 0 ? pct : 30.9,
    };
  }, [lastUpdatedTime, timeMode]);

  // TOP & BOTTOM Data for Tab TOP/BOT
  const topBotData = useMemo(() => {
    // Loại bỏ siêu thị chưa phân công boss khỏi TOP/BOT
    const items = filteredItems.filter((item) => item.boss && item.boss !== 'Chưa phân công');

    // Sort by DTQĐ for Left Table (descending)
    const byDtQd = [...items].sort((a, b) => (b.dtQd || b.achievedDt || 0) - (a.dtQd || a.achievedDt || 0));
    const top20DtQd = byDtQd.slice(0, 20).map((item, idx) => ({ ...item, rank: idx + 1 }));
    const bot20DtQd =
      byDtQd.length > 20
        ? byDtQd.slice(-20).map((item, idx) => ({ ...item, rank: byDtQd.length - 20 + idx + 1 }))
        : [];

    // In Luỹ kế, right table sorts by Projected Rate (% Hoàn thành dự kiến)
    const getEffectiveRate = (item: RevenueRecordItem) => {
      if (timeMode === 'luyke' && thoiGianSdPercent > 0) {
        return item.rateDt / (thoiGianSdPercent / 100);
      }
      return item.rateDt || 0;
    };

    const byRate = [...items].sort((a, b) => getEffectiveRate(b) - getEffectiveRate(a));
    const top20Rate = byRate.slice(0, 20).map((item, idx) => ({
      ...item,
      rank: idx + 1,
      displayRate: getEffectiveRate(item),
    }));
    const bot20Rate =
      byRate.length > 20
        ? byRate.slice(-20).map((item, idx) => ({
            ...item,
            rank: byRate.length - 20 + idx + 1,
            displayRate: getEffectiveRate(item),
          }))
        : [];

    return {
      top20DtQd,
      bot20DtQd,
      top20Rate,
      bot20Rate,
    };
  }, [filteredItems, timeMode, thoiGianSdPercent]);

  const currentDayMonthYearStr = useMemo(() => {
    return dateInfo.curDayMonthYear;
  }, [dateInfo]);

  const currentMonthYearStr = useMemo(() => {
    return dateInfo.curMonthYear;
  }, [dateInfo]);

  const targetHeaderStr = useMemo(() => {
    const isCk = targetConfig.mode === 'cung_ky';
    const dateStr = isCk ? dateInfo.cungKyDayMonthYear : dateInfo.curDayMonthYear;
    const monthStr = isCk ? dateInfo.cungKyMonthYear : dateInfo.curMonthYear;
    const heSoStr = `x${targetConfig.heSo}%`;

    if (timeMode === 'realtime') {
      return `MỤC TIÊU HÔM NAY = DTQĐ ${dateStr} ${heSoStr}`;
    }
    return `MỤC TIÊU THÁNG = DTQĐ THÁNG ${monthStr} ${heSoStr}`;
  }, [timeMode, targetConfig, dateInfo]);

  const targetSubHeaderStr = useMemo(() => {
    const isCk = targetConfig.mode === 'cung_ky';
    const dateStr = isCk ? dateInfo.cungKyDayMonthYear : dateInfo.curDayMonthYear;
    const monthStr = isCk ? dateInfo.cungKyMonthYear : dateInfo.curMonthYear;
    const heSoStr = `x${targetConfig.heSo}%`;

    if (timeMode === 'realtime') {
      return `DTQĐ ${dateStr} ${heSoStr}`;
    }
    return `DTQĐ THÁNG ${monthStr} ${heSoStr}`;
  }, [timeMode, targetConfig, dateInfo]);

  const mainTitleStr = useMemo(() => {
    const hasDmx = selectedChannels.some((c) => ['DML', 'DMM', 'DMS'].includes(c));
    const hasTgd = selectedChannels.some((c) => ['TGD', 'TopZone'].includes(c));
    let channelLabel = 'TNB';
    if (hasDmx && !hasTgd) channelLabel = 'TNB';
    else if (!hasDmx && hasTgd) channelLabel = 'TNB_TGD';
    else channelLabel = 'TNB';

    const modeLabel = timeMode === 'realtime' ? 'DTQĐ NGÀY' : 'DTQĐ THÁNG';
    return `${channelLabel} - ${modeLabel}`;
  }, [selectedChannels, timeMode]);

  const summaryChannelLabel = useMemo(() => {
    const hasDmx = selectedChannels.some((c) => ['DML', 'DMM', 'DMS'].includes(c));
    const hasTgd = selectedChannels.some((c) => ['TGD', 'TopZone'].includes(c));
    if (hasDmx && !hasTgd) return 'TỔNG';
    if (!hasDmx && hasTgd) return 'KÊNH TGD';
    return 'TỔNG';
  }, [selectedChannels]);

  const currentProvinceTitle = useMemo(() => {
    if (selectedProvince && selectedProvince !== 'ALL') {
      return selectedProvince.toUpperCase();
    }
    if (selectedTinhMoi && selectedTinhMoi !== 'ALL') {
      return selectedTinhMoi.toUpperCase();
    }
    if (selectedBoss && selectedBoss !== 'ALL') {
      return `BOSS ${selectedBoss.toUpperCase()}`;
    }
    return 'TOÀN VÙNG TNB';
  }, [selectedProvince, selectedTinhMoi, selectedBoss]);

  // Grouped stores by Channel for "SIÊU THỊ MỚI"
  const storesByChannel = useMemo(() => {
    const channelOrder: Channel[] = ['DML', 'DMM', 'DMS', 'TGD', 'TopZone'];
    const groups: {
      channel: string;
      stores: RevenueRecordItem[];
      totalTargetDt: number;
      totalAchievedDt: number;
      totalRateDt: number;
      totalProjectedAchieved: number;
      totalProjectedRate: number;
      totalQdEff: number;
      totalTcRatio: number;
    }[] = [];

    channelOrder.forEach((ch) => {
      const channelStores = filteredItems
        .filter((item) => item.kenh === ch)
        .sort((a, b) => b.rateDt - a.rateDt);

      if (channelStores.length > 0) {
        const totalTargetDt = channelStores.reduce((acc, i) => acc + i.targetDt, 0);
        const totalAchievedDt = channelStores.reduce((acc, i) => acc + i.achievedDt, 0);
        const totalRateDt = totalTargetDt > 0 ? Number(((totalAchievedDt / totalTargetDt) * 100).toFixed(1)) : 0;
        const totalProjectedAchieved = thoiGianSdPercent > 0 ? Math.round(totalAchievedDt / (thoiGianSdPercent / 100)) : totalAchievedDt;
        const totalProjectedRate = thoiGianSdPercent > 0 ? Number(((totalRateDt / (thoiGianSdPercent / 100))).toFixed(1)) : totalRateDt;
        const totalDtThuc = channelStores.reduce((acc, i) => acc + (i.dtThuc || 0), 0);
        const totalDtQd = channelStores.reduce((acc, i) => acc + (i.dtQd || 0), 0);
        const totalQdEff = totalDtThuc > 0 ? Number((((totalDtQd - totalDtThuc) / totalDtThuc) * 100).toFixed(1)) : 0;

        const totalTargetTc = channelStores.reduce((acc, i) => acc + (i.targetTc || 0), 0);
        const totalAchievedTc = channelStores.reduce((acc, i) => acc + i.achievedTc, 0);
        const totalTcRatio = totalAchievedDt > 0 ? Number(((totalAchievedTc / totalAchievedDt) * 100).toFixed(1)) : 0;

        groups.push({
          channel: ch,
          stores: channelStores,
          totalTargetDt,
          totalAchievedDt,
          totalRateDt,
          totalProjectedAchieved,
          totalProjectedRate,
          totalQdEff,
          totalTcRatio,
        });
      }
    });

    return groups;
  }, [filteredItems, thoiGianSdPercent]);

  // Sorted Store Items
  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    return items.sort((a, b) => {
      let valA: any = a[sortField as keyof RevenueRecordItem] ?? 0;
      let valB: any = b[sortField as keyof RevenueRecordItem] ?? 0;

      if (sortField === 'projAchieved') {
        valA = thoiGianSdPercent > 0 ? a.achievedDt / (thoiGianSdPercent / 100) : a.achievedDt;
        valB = thoiGianSdPercent > 0 ? b.achievedDt / (thoiGianSdPercent / 100) : b.achievedDt;
      } else if (sortField === 'projRate') {
        valA = thoiGianSdPercent > 0 ? a.rateDt / (thoiGianSdPercent / 100) : a.rateDt;
        valB = thoiGianSdPercent > 0 ? b.rateDt / (thoiGianSdPercent / 100) : b.rateDt;
      }

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortField, sortDirection, thoiGianSdPercent]);

  // Paginated Stores
  const totalPages = Math.ceil(sortedItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    if (pageSize === -1) return sortedItems;
    const start = (currentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, currentPage, pageSize]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const toggleChannel = (channel: Channel) => {
    let nextChannels: Channel[] = [];
    if (entityScope === 'topbot') {
      nextChannels = [channel];
    } else if (selectedChannels.includes(channel)) {
      if (selectedChannels.length > 1) {
        nextChannels = selectedChannels.filter((c) => c !== channel);
      } else {
        return;
      }
    } else {
      nextChannels = [...selectedChannels, channel];
    }
    handleChannelsChange(nextChannels);
  };

  const removeVietnameseTones = (str: string) => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '');
  };

  const handleExport = async (mode: 'quick' | 'group' | 'all' | 'province' | 'tinhmoi' | 'size') => {
    const el = document.getElementById('revenue-report-export-root');
    if (!el) {
      alert('Không tìm thấy bảng báo cáo để xuất ảnh!');
      return;
    }
    setExportMode(mode);
    setIsExporting(true);
    const timePrefix = timeMode === 'realtime' ? 'Realtime' : 'LuyKe';

    try {
      if (mode === 'province') {
        const prevProv = selectedProvince;
        const prevTinhMoi = selectedTinhMoi;
        const provsToExport = uniqueProvinces.filter((p) => p && p !== 'ALL');
        let exportedCount = 0;

        for (const prov of provsToExport) {
          setSelectedProvince(prov);
          setSelectedTinhMoi('ALL');
          await new Promise((r) => setTimeout(r, 400));
          const targetEl = document.getElementById('revenue-report-export-root');
          if (targetEl) {
            const cleanProv = removeVietnameseTones(prov);
            const filename = `${timePrefix}_${cleanProv}.png`;
            const remarkText = generateRevenueRemarks('template_1', 'no_tag_top');
            const blob = await exportElementAsImage(targetEl, filename, {
              remarkTextToCopy: remarkText,
            });
            if (blob) exportedCount++;
          }
        }
        setSelectedProvince(prevProv);
        setSelectedTinhMoi(prevTinhMoi);
        if (exportedCount > 0) {
          confetti({ particleCount: 80, spread: 90, origin: { y: 0.6 } });
        }
      } else if (mode === 'tinhmoi') {
        const prevProv = selectedProvince;
        const prevTinhMoi = selectedTinhMoi;
        const tinhMoisToExport = uniqueTinhMois.filter((tm) => tm && tm !== 'ALL');
        let exportedCount = 0;

        for (const tm of tinhMoisToExport) {
          setSelectedTinhMoi(tm);
          setSelectedProvince('ALL');
          await new Promise((r) => setTimeout(r, 400));
          const targetEl = document.getElementById('revenue-report-export-root');
          if (targetEl) {
            const cleanTm = removeVietnameseTones(tm);
            const filename = `${timePrefix}_${cleanTm}.png`;
            const remarkText = generateRevenueRemarks('template_1', 'no_tag_top');
            const blob = await exportElementAsImage(targetEl, filename, {
              remarkTextToCopy: remarkText,
            });
            if (blob) exportedCount++;
          }
        }
        setSelectedProvince(prevProv);
        setSelectedTinhMoi(prevTinhMoi);
        if (exportedCount > 0) {
          confetti({ particleCount: 80, spread: 90, origin: { y: 0.6 } });
        }
      } else if (mode === 'size') {
        const prevPhanLoai = selectedPhanLoaiShop;
        const sizesToExport = uniquePhanLoais.filter((s) => s && s !== 'ALL' && s !== '-' && s !== '--' && s !== 'N/A' && s.trim() !== '');
        let exportedCount = 0;

        for (const sz of sizesToExport) {
          setSelectedPhanLoaiShop(sz);
          await new Promise((r) => setTimeout(r, 400));
          const targetEl = document.getElementById('revenue-report-export-root');
          if (targetEl) {
            const cleanSz = removeVietnameseTones(sz);
            const cleanProv = selectedProvince !== 'ALL' ? `_${removeVietnameseTones(selectedProvince)}` : '';
            const filename = `${timePrefix}_Size_${cleanSz}${cleanProv}.png`;
            const remarkText = generateRevenueRemarks('template_1', 'no_tag_top');
            const blob = await exportElementAsImage(targetEl, filename, {
              remarkTextToCopy: remarkText,
            });
            if (blob) exportedCount++;
          }
        }
        setSelectedPhanLoaiShop(prevPhanLoai);
        if (exportedCount > 0) {
          confetti({ particleCount: 80, spread: 90, origin: { y: 0.6 } });
        }
      } else {
        await new Promise((r) => setTimeout(r, 250));
        let filename = `${timePrefix}_Bao_Cao.png`;
        if (entityScope === 'tong') {
          filename = `${timePrefix}_Tong.png`;
        } else if (entityScope === 'topbot') {
          const chName = selectedChannels.length === 1 ? selectedChannels[0] : selectedChannels.length === 5 ? 'DMX' : selectedChannels.join('_');
          filename = `${timePrefix}_TopBot_${removeVietnameseTones(chName)}.png`;
        } else if (entityScope === 'sieuthi') {
          filename = mode === 'quick' ? `${timePrefix}_Nhanh_Vung.png` : `${timePrefix}_Vung.png`;
        } else {
          if (selectedProvince !== 'ALL') {
            filename = `${timePrefix}_${removeVietnameseTones(selectedProvince)}.png`;
          } else if (selectedTinhMoi !== 'ALL') {
            filename = `${timePrefix}_${removeVietnameseTones(selectedTinhMoi)}.png`;
          } else {
            filename = entityScope === 'sieuthimoi' ? `${timePrefix}_Sieu_Thi_Moi.png` : `${timePrefix}_Sieu_Thi.png`;
          }
        }

        const remarkText = generateRevenueRemarks('template_1', 'no_tag_top');
        const blob = await exportElementAsImage(el, filename, {
          remarkTextToCopy: remarkText,
          quickHideColumns: mode === 'quick',
        });
        if (blob) {
          confetti({ particleCount: 60, spread: 80, origin: { y: 0.6 } });
        }
      }
    } finally {
      setIsExporting(false);
      setExportMode('all');
    }
  };

  const generateRevenueRemarks = (
    template: 'template_1' | 'template_2' | 'template_3' = activeRemarkTemplate,
    mode: RemarkDisplayMode = remarkDisplayMode
  ): string => {
    const timeTitle = timeMode === 'realtime' ? 'REALTIME' : 'LUỸ KẾ';
    const scopeTitle =
      selectedProvince !== 'ALL'
        ? `TỈNH ${selectedProvince.toUpperCase()}`
        : selectedTinhMoi !== 'ALL'
        ? `TỈNH MỚI ${selectedTinhMoi.toUpperCase()}`
        : selectedBoss !== 'ALL'
        ? `BOSS ${selectedBoss}`
        : 'TOÀN VÙNG TNB';

    const getBossTag = (bossStr?: string) => {
      if (!bossStr) return '';
      const m = bossStr.match(/_(\d+)$/);
      return m ? `@${m[1]}` : (bossStr.startsWith('@') ? bossStr : `@${bossStr}`);
    };

    // ----------------------------------------------------------------------
    // KHI Ở TAB TỔNG HOẶC VÙNG: NHẬN XÉT XẾP HẠNG THEO TÊN TỈNH, TUYỆT ĐỐI KHÔNG TAG USER
    // ----------------------------------------------------------------------
    if (entityScope === 'tong' || entityScope === 'sieuthi') {
      const scopeTitleProvince = entityScope === 'tong' ? 'TỔNG TOÀN VÙNG TNB' : 'VÙNG TNB';
      const totalProvincesCount = provinceSummaryRows.length;

      if (template === 'template_2') {
        const warningProvinces = provinceSummaryRows.filter((p) => p.rateDt < 80 && p.targetDt > 0);
        const lines = warningProvinces
          .map((p, idx) => {
            const prefix = `⚠️ #${idx + 1}`;
            return `${prefix}. Tỉnh ${p.tinh}: ${formatVND(p.achievedDt)} / ${formatVND(p.targetDt)} (${p.rateDt}%) | TC: ${formatVND(p.achievedTc)} (${p.tcRatio}%)`;
          })
          .join('\n');

        return `📈 CẬP NHẬT DOANH THU & TRẢ CHẬM ${timeTitle} - ${scopeTitleProvince} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Toàn ${scopeTitleProvince}: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Doanh Thu Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (Tỷ trọng ${totalSummary.totalTcRatio}% tổng DT)
📊 Tiến độ: ${totalSummary.reachedStoresCount} / ${totalSummary.totalStores} Siêu thị đạt Target (≥ 100%)

🚨 CÁC TỈNH CẦN TĂNG TỐC DOANH THU (< 80%):
${lines || 'Tất cả các tỉnh đều đang đạt tiến độ rất tốt!'}

━━━━━━━━━━━━━━
👉 Đề nghị Ban Giám đốc các Tỉnh tập trung cao độ, đẩy mạnh số bán và bán trả góp để về đích! 💪🏼🔥`;
      }

      if (template === 'template_3') {
        const allProvinceLines = provinceSummaryRows
          .map((p, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx >= totalProvincesCount - 3 ? '🔻' : '🔹';
            return `${medal} #${idx + 1}. Tỉnh ${p.tinh}: ${formatVND(p.achievedDt)} / ${formatVND(p.targetDt)} (${p.rateDt}%) | TC: ${formatVND(p.achievedTc)} (${p.tcRatio}%) | ${p.reachedStoresCount}/${p.storesCount} ST đạt`;
          })
          .join('\n');

        return `📊 BẢNG XẾP HẠNG DOANH THU CÁC TỈNH - ${scopeTitleProvince} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Toàn ${scopeTitleProvince}: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (${totalSummary.totalTcRatio}% DT) | 🏆 ${totalSummary.reachedStoresCount}/${totalSummary.totalStores} ST đạt ≥ 100%

🏆 XẾP HẠNG DOANH THU ${totalProvincesCount} TỈNH:
${allProvinceLines || 'Đang cập nhật'}

━━━━━━━━━━━━━━
👉 Đề nghị Ban Giám đốc các Tỉnh tập trung tối đa nguồn lực hoàn thành xuất sắc chỉ tiêu! 💪🏼🔥`;
      }

      // Mẫu 1: TOP / BOT
      const topCount = Math.min(5, Math.ceil(totalProvincesCount / 2));
      const botCount = Math.min(5, totalProvincesCount - topCount);

      const topProvinces = provinceSummaryRows.slice(0, topCount);
      const botProvinces = provinceSummaryRows.slice(-botCount).reverse();

      const topLines = topProvinces
        .map((p, idx) => {
          const prefix = `${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹'} #${idx + 1}`;
          return `${prefix}. Tỉnh ${p.tinh}: ${formatVND(p.achievedDt)} / ${formatVND(p.targetDt)} (${p.rateDt}%) | TC: ${formatVND(p.achievedTc)} (${p.tcRatio}%)`;
        })
        .join('\n');

      const botLines = botProvinces
        .map((p, idx) => {
          const rank = totalProvincesCount - idx;
          const prefix = `🔻 #${rank}`;
          return `${prefix}. Tỉnh ${p.tinh}: ${formatVND(p.achievedDt)} / ${formatVND(p.targetDt)} (${p.rateDt}%) | TC: ${formatVND(p.achievedTc)} (${p.tcRatio}%)`;
        })
        .join('\n');

      return `📈 BẢNG XẾP HẠNG DOANH THU & TRẢ CHẬM ${timeTitle} - ${scopeTitleProvince} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Toàn ${scopeTitleProvince}: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Tổng Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (Tỷ trọng ${totalSummary.totalTcRatio}%)
🏆 Tiến độ: ${totalSummary.reachedStoresCount} / ${totalSummary.totalStores} Siêu thị đạt Target (≥ 100%)

🏆 TOP TỈNH DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT TỈNH CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}

━━━━━━━━━━━━━━
👉 Đề nghị Ban Giám đốc các Tỉnh bám sát, tăng tốc tư vấn trả chậm để bứt phá mục tiêu! 💪🏼🔥`;
    }

    const totalStoresCount = sortedItems.length;

    if (template === 'template_2') {
      const warningStores = sortedItems.filter((i) => i.rateDt < 80 && i.targetDt > 0).slice(0, 15);
      const lines = warningStores
        .map((s, idx) => {
          const prefix = `⚠️ #${idx + 1}`;
          const valPart = `${formatVND(s.achievedDt)} / ${formatVND(s.targetDt)}`;
          return formatStoreRemarkLine({
            prefix,
            storeName: formatStoreDisplayName(s.sieuthi),
            bossTag: getBossTag(s.boss),
            rawBoss: s.boss,
            valuePart: valPart,
            rate: s.rateDt,
            mode,
            group: 'bot',
          });
        })
        .join('\n');

      return `📈 CẬP NHẬT DOANH THU & TRẢ CHẬM ${timeTitle} - ${scopeTitle} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Toàn ${scopeTitle}: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Doanh Thu Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (Tỷ trọng ${totalSummary.totalTcRatio}% tổng DT)
📊 Tiến độ: ${totalSummary.reachedStoresCount} / ${totalSummary.totalStores} Siêu thị đạt Target (≥ 100%)

🚨 CÁC SIÊU THỊ CẦN TĂNG TỐC DOANH THU (< 80%):
${lines || 'Tất cả siêu thị đều đang đạt tiến độ rất tốt!'}

━━━━━━━━━━━━━━
👉 Đề nghị các Quản lý Siêu thị tập trung cao độ, đẩy mạnh số bán và bán trả góp để về đích! 💪🏼🔥`;
    }

    if (template === 'template_3') {
      const top3Count = Math.min(3, Math.ceil(totalStoresCount / 2));
      const bot3Count = Math.min(3, totalStoresCount - top3Count);
      const top3 = sortedItems.slice(0, top3Count);
      const bot3 = sortedItems.filter((i) => i.targetDt > 0).slice(-bot3Count).reverse();

      const topLines = top3
        .map((s, idx) => {
          const prefix = `${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} #${idx + 1}`;
          const valPart = `${formatVND(s.achievedDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`;
          return formatStoreRemarkLine({
            prefix,
            storeName: formatStoreDisplayName(s.sieuthi),
            bossTag: getBossTag(s.boss),
            rawBoss: s.boss,
            valuePart: valPart,
            rate: s.rateDt,
            mode,
            group: 'top',
          });
        })
        .join('\n');

      const botLines = bot3
        .map((s, idx) => {
          const prefix = `🔻 #${totalStoresCount - idx}`;
          const valPart = `${formatVND(s.achievedDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`;
          return formatStoreRemarkLine({
            prefix,
            storeName: formatStoreDisplayName(s.sieuthi),
            bossTag: getBossTag(s.boss),
            rawBoss: s.boss,
            valuePart: valPart,
            rate: s.rateDt,
            mode,
            group: 'bot',
          });
        })
        .join('\n');

      return `📊 TÓM TẮT DOANH THU & TRẢ CHẬM ${timeTitle} - ${scopeTitle} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Toàn ${scopeTitle}: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (${totalSummary.totalTcRatio}% DT) | 🏆 ${totalSummary.reachedStoresCount}/${totalSummary.totalStores} ST đạt ≥ 100%

🏆 TOP ${top3Count} DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

${bot3Count > 0 ? `⚠️ BOT ${bot3Count} CẦN BỨT PHÁ:\n${botLines || 'Đang cập nhật'}\n` : ''}
━━━━━━━━━━━━━━
👉 Đề nghị các Đội ngũ tập trung tối đa nguồn lực hoàn thành xuất sắc chỉ tiêu! 💪🏼🔥`;
    }

    // Default: Mẫu 1: TOP / BOT
    let topCount = Math.min(10, totalStoresCount);
    let botCount = Math.min(10, totalStoresCount);
    if (totalStoresCount <= 20) {
      topCount = Math.min(5, Math.ceil(totalStoresCount / 2));
      botCount = Math.min(5, totalStoresCount - topCount);
    }

    const topItems = sortedItems.slice(0, topCount);
    const botItems = sortedItems.filter((i) => i.targetDt > 0).slice(-botCount).reverse();

    const topLines = topItems
      .map((s, idx) => {
        const prefix = `${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹'} #${idx + 1}`;
        const valPart = `${formatVND(s.achievedDt)} / ${formatVND(s.targetDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`;
        return formatStoreRemarkLine({
          prefix,
          storeName: formatStoreDisplayName(s.sieuthi),
          bossTag: getBossTag(s.boss),
          rawBoss: s.boss,
          valuePart: valPart,
          rate: s.rateDt,
          mode,
          group: 'top',
        });
      })
      .join('\n');

    const botLines = botItems
      .map((s, idx) => {
        const prefix = `🔻 #${totalStoresCount - idx}`;
        const valPart = `${formatVND(s.achievedDt)} / ${formatVND(s.targetDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`;
        return formatStoreRemarkLine({
          prefix,
          storeName: formatStoreDisplayName(s.sieuthi),
          bossTag: getBossTag(s.boss),
          rawBoss: s.boss,
          valuePart: valPart,
          rate: s.rateDt,
          mode,
          group: 'bot',
        });
      })
      .join('\n');

    return `📈 BẢNG XẾP HẠNG DOANH THU & TRẢ CHẬM ${timeTitle} - ${scopeTitle} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Toàn ${scopeTitle}: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Tổng Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (Tỷ trọng ${totalSummary.totalTcRatio}%)
🏆 Tiến độ: ${totalSummary.reachedStoresCount} / ${totalSummary.totalStores} Siêu thị đạt Target (≥ 100%)

🏆 TOP ${topCount} SIÊU THỊ DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

${botCount > 0 ? `⚠️ BOT ${botCount} SIÊU THỊ CẦN TĂNG TỐC:\n${botLines || 'Đang cập nhật'}\n` : ''}
━━━━━━━━━━━━━━
👉 Đề nghị các Siêu thị bám sát, tăng tốc tư vấn trả chậm để bứt phá mục tiêu! 💪🏼🔥`;
  };

  const handleCopyRemarks = async () => {
    const txt = customRemarkText || generateRevenueRemarks(activeRemarkTemplate, remarkDisplayMode);
    const ok = await copyTextToClipboard(txt);
    if (ok) {
      setRemarkCopied(true);
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.7 } });
      setTimeout(() => setRemarkCopied(false), 2500);
    }
  };

  // Freshness check for header banner
  const freshness = checkDataFreshness(lastUpdatedTime, 60, timeMode);
  const formattedUpdateStr = freshness.displayText.replace(/\s*NGÀY\s*/i, ' - ');

  return (
    <div className="animate-fade-in">
      {/* 1. STICKY TOP HEADER BANNER with bottom divider separator (Matching Report HeaderBanner 1:1) */}
      <div className="sticky top-0 z-50 bg-slate-100/90 backdrop-blur-md px-4 md:px-6 pt-4 pb-2 border-b border-slate-200/60 shrink-0 shadow-2xs">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs relative space-y-3 transition-all">
          {/* Pink/Rose/Amber Accent Indicator Line */}
          <div className="absolute top-0 left-0 w-2 h-full rounded-l-2xl bg-gradient-to-b from-rose-300 via-pink-300 to-amber-300"></div>

          {/* ROW 1: Scope Tabs, Freshness Badge & Time Mode Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pl-2">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            {/* Scope Selector: TỔNG / VÙNG / SIÊU THỊ */}
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shrink-0">
              <button
                onClick={() => handleTabSwitch('tong')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  entityScope === 'tong'
                    ? 'bg-amber-50 text-amber-800 border-amber-300 ring-2 ring-amber-200/60 shadow-2xs'
                    : 'bg-white/80 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className={`w-3.5 h-3.5 ${entityScope === 'tong' ? 'text-amber-600' : 'text-slate-500'}`} />
                TỔNG
              </button>

              <button
                onClick={() => handleTabSwitch('sieuthi')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  entityScope === 'sieuthi'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200/60 shadow-2xs'
                    : 'bg-white/80 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Globe className={`w-3.5 h-3.5 ${entityScope === 'sieuthi' ? 'text-emerald-600' : 'text-slate-500'}`} />
                VÙNG
              </button>

              <button
                onClick={() => handleTabSwitch('vung')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  entityScope === 'vung'
                    ? 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-200/60 shadow-2xs'
                    : 'bg-white/80 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Store className={`w-3.5 h-3.5 ${entityScope === 'vung' ? 'text-blue-600' : 'text-slate-500'}`} />
                SIÊU THỊ
              </button>

              <button
                onClick={() => handleTabSwitch('sieuthimoi')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  entityScope === 'sieuthimoi'
                    ? 'bg-purple-50 text-purple-700 border-purple-300 ring-2 ring-purple-200/60 shadow-2xs'
                    : 'bg-white/80 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Sparkles className={`w-3.5 h-3.5 ${entityScope === 'sieuthimoi' ? 'text-purple-600' : 'text-slate-500'}`} />
                SIÊU THỊ MỚI
              </button>

              <button
                onClick={() => handleTabSwitch('topbot')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  entityScope === 'topbot'
                    ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-200/60 shadow-2xs'
                    : 'bg-white/80 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Flame className={`w-3.5 h-3.5 ${entityScope === 'topbot' ? 'text-rose-600' : 'text-slate-500'}`} />
                TOP/BOT
              </button>
            </div>

            {/* Freshness Badge */}
            <div className="export-hide min-w-0">
              {freshness.isOutdated ? (
                <div
                  title={timeMode === 'luyke' ? "Dữ liệu luỹ kế chưa được cập nhật sau 1 ngày!" : "Dữ liệu chưa được cập nhật trong hơn 1 giờ qua!"}
                  className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1 bg-rose-50 border border-rose-300 sm:border-2 sm:border-rose-400 text-rose-700 rounded-xl font-bold sm:font-black text-[11px] sm:text-xs shadow-xs animate-pulse whitespace-nowrap"
                >
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 animate-bounce shrink-0" />
                  <span className="tracking-tight">
                    Update: {formattedUpdateStr}
                  </span>
                  <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 bg-rose-600 text-white font-black rounded-md tracking-wider uppercase shrink-0">
                    Data cũ
                  </span>
                </div>
              ) : (
                <p className="text-[11px] sm:text-xs font-bold sm:font-extrabold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                  <span className="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1 bg-emerald-50/80 border border-emerald-200 text-emerald-800 rounded-xl shadow-2xs font-extrabold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                    <span>Update: {formattedUpdateStr}</span>
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Right Action Group: Realtime/Luỹ Kế, Cập nhật, Link BI */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Nút Cấu hình Target: HIỂN THỊ Ở TẤT CẢ CÁC TAB */}
            <button
              type="button"
              onClick={() => setIsTargetConfigModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all border cursor-pointer bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-xs border-amber-600"
              title="Cấu hình nguồn và hệ số Target cho tất cả các tab"
            >
              <Sliders className="w-3.5 h-3.5 text-white" />
              <span>Cấu hình Target</span>
              {targetConfig.mode === 'cung_ky' && (
                <span className="px-1.5 py-0.5 text-[9.5px] bg-white text-orange-800 font-black rounded-md uppercase tracking-tight">
                  CK
                </span>
              )}
              {targetConfig.heSo !== 100 && (
                <span className="px-1.5 py-0.5 text-[9.5px] bg-amber-950/40 text-amber-100 font-mono font-black rounded-md">
                  x{targetConfig.heSo}%
                </span>
              )}
            </button>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shrink-0">
              <button
                onClick={() => setTimeMode('realtime')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  timeMode === 'realtime'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200/60 shadow-2xs'
                    : 'bg-white/80 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${timeMode === 'realtime' ? 'text-emerald-600 fill-emerald-100' : 'text-slate-500'}`} />
                REALTIME
              </button>

              <button
                onClick={() => setTimeMode('luyke')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  timeMode === 'luyke'
                    ? 'bg-purple-50 text-purple-700 border-purple-300 ring-2 ring-purple-200/60 shadow-2xs'
                    : 'bg-white/80 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                }`}
              >
                <TrendingUp className={`w-3.5 h-3.5 ${timeMode === 'luyke' ? 'text-purple-600' : 'text-slate-500'}`} />
                LUỸ KẾ
              </button>

              {onNavigateToUpdate && (
                <button
                  onClick={onNavigateToUpdate}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 shadow-2xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                  Cập nhật
                </button>
              )}

              <a
                href="https://bi.thegioididong.com/khoi-ban-hang-sub?id=8126&tab=bcdtst&rt=1&dm=1"
                target="_blank"
                rel="noopener noreferrer"
                title="Mở Báo Cáo Doanh Thu Siêu Thị trên BI"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100 hover:border-sky-400 shadow-2xs"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
                <span>Link BI</span>
              </a>
            </div>
          </div>
        </div>

        {/* ROW 2: Filter Bar with Channels, Dropdowns and %HT / Doanh thu Toggle */}
        <div className="pt-2 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3 pl-2">
          {/* Left Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Channel Selection */}
            {entityScope === 'topbot' ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">KÊNH:</span>
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100/90 rounded-2xl border border-slate-200 shadow-2xs">
                  {(['DML', 'DMM', 'DMS', 'TGD', 'TopZone'] as Channel[]).map((ch) => {
                    const isSelected = selectedChannels.length === 1 && selectedChannels[0] === ch;
                    const displayLabel = ch === 'DML' ? 'ĐML' : ch === 'DMM' ? 'ĐMM' : ch === 'DMS' ? 'ĐMS' : ch;
                    return (
                      <button
                        key={ch}
                        onClick={() => handleChannelsChange([ch])}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-2xs font-black'
                            : 'text-slate-600 hover:text-slate-950 hover:bg-white/80'
                        }`}
                      >
                        {displayLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">KÊNH:</span>
                {(['DML', 'DMM', 'DMS', 'TGD', 'TopZone'] as Channel[]).map((ch) => {
                  const isChecked = selectedChannels.includes(ch);
                  return (
                    <button
                      key={ch}
                      onClick={() => toggleChannel(ch)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                        isChecked
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center transition-all ${
                          isChecked ? 'bg-white border-white text-blue-600' : 'border-slate-400 bg-white'
                        }`}
                      >
                        {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </span>
                      <span>{ch === 'DML' ? 'ĐML' : ch === 'DMM' ? 'ĐMM' : ch === 'DMS' ? 'ĐMS' : ch}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {entityScope !== 'tong' && entityScope !== 'sieuthi' && (
              <>
                <div className="h-4 w-px bg-slate-200 mx-0.5"></div>

                {/* Size / Phân loại Shop */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">SIZE:</span>
                  <select
                    value={selectedPhanLoaiShop}
                    onChange={(e) => handleSizeChange(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs hover:border-slate-300"
                  >
                    <option value="ALL">Tất cả</option>
                    {uniquePhanLoais.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Tỉnh Mới 2026 */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">TỈNH MỚI:</span>
                  <select
                    value={selectedTinhMoi}
                    onChange={(e) => handleTinhMoiChange(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs hover:border-slate-300"
                  >
                    <option value="ALL">Tất cả</option>
                    {uniqueTinhMois.map((tm) => (
                      <option key={tm} value={tm}>{tm}</option>
                    ))}
                  </select>
                </div>

                {/* Tỉnh */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">TỈNH:</span>
                  <select
                    value={selectedProvince}
                    onChange={(e) => handleProvinceChange(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs hover:border-slate-300"
                  >
                    <option value="ALL">Tất cả</option>
                    {uniqueProvinces.map((pr) => (
                      <option key={pr} value={pr}>{pr}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Main Content Area matching Report View padding and layout */}
      <div className="p-4 md:p-6 space-y-6">
        {/* 2. MAIN REPORT CARD CONTAINER & EXPORT ROOT */}
        <div
          id="revenue-report-export-root"
          className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4"
        >
        {/* Title Header Bar (Styled matching ReportView title header 1:1) */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 ${(entityScope === 'sieuthimoi' || entityScope === 'topbot') ? 'export-hide' : ''}`}>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
              {timeMode === 'realtime' ? 'REALTIME DOANH THU QUY ĐỔI' : 'LUỸ KẾ DOANH THU QUY ĐỔI'} - T{currentMonthYearStr}
            </h2>
            <p className="text-xs font-bold text-red-600 tracking-wide uppercase mt-0.5">
              CHỈ TÍNH KÊNH {selectedChannels.join(', ')}
            </p>
          </div>

          {/* Action Toolbar (Hidden during image export) */}
          <div className="flex items-center gap-2 flex-wrap export-hide">
            {/* Search Input (Only for TAB SIÊU THỊ & TAB SIÊU THỊ MỚI) */}
            {(entityScope === 'vung' || entityScope === 'sieuthimoi') && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Tìm Siêu thị, Tỉnh, Boss..."
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500 w-52 placeholder-slate-400"
                />
              </div>
            )}

            {/* Nhận xét Button */}
            <button
              onClick={() => setIsRemarksModalOpen(true)}
              className="px-3.5 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-800" />
              <span>Nhận xét</span>
            </button>

            {/* TAB SIÊU THỊ MỚI: Xuất Theo Size, Xuất Theo Tỉnh & Xuất Theo Tỉnh Mới */}
            {entityScope === 'sieuthimoi' && (
              <>
                <button
                  onClick={() => handleExport('size')}
                  disabled={isExporting}
                  className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap disabled:opacity-50"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Xuất theo size</span>
                </button>

                <button
                  onClick={() => handleExport('province')}
                  disabled={isExporting}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap disabled:opacity-50"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Xuất tỉnh cũ</span>
                </button>

                <button
                  onClick={() => handleExport('tinhmoi')}
                  disabled={isExporting}
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Xuất tỉnh mới</span>
                </button>
              </>
            )}

            {/* TAB SIÊU THỊ: Xuất Theo Nhóm */}
            {entityScope === 'vung' && (
              <button
                onClick={() => handleExport('group')}
                disabled={isExporting}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap disabled:opacity-50"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Xuất theo nhóm</span>
              </button>
            )}

            {/* TAB VÙNG: Xuất Nhanh Button */}
            {entityScope === 'sieuthi' && (
              <button
                onClick={() => handleExport('quick')}
                disabled={isExporting}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 fill-slate-950" />
                <span>Xuất nhanh</span>
              </button>
            )}

            {/* Xuất Hiển Thị Button */}
            <button
              onClick={() => handleExport('all')}
              disabled={isExporting}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap disabled:opacity-50"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Xuất hiển thị</span>
            </button>
          </div>
        </div>

        {/* 3. TABLE RENDERING: TỔNG vs VÙNG (TỈNH) vs SIÊU THỊ */}
        {entityScope === 'tong' ? (
          /* TAB TỔNG: EXACT MATCH DESIGN WITH THIN LIGHT GRAY BORDERS */
          <div className="max-w-xl mx-auto bg-white border border-slate-300 font-sans select-none overflow-hidden my-2 shadow-xs rounded-none sm:rounded-lg">
            {/* Header: Main Title */}
            <div className="py-4 px-4 text-center bg-white border-b border-slate-300">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase text-black font-sans">
                {mainTitleStr}
              </h1>
            </div>

            {/* Sub-Header Bar: REALTIME / LUỸ KẾ & THỜI GIAN SD */}
            <div className="grid grid-cols-4 border-b border-slate-300 bg-white text-center text-xs sm:text-sm divide-x divide-slate-300 font-sans font-black">
              <div className="py-2.5 px-2 uppercase text-black flex items-center justify-center font-black">
                {infoTimeLabel}
              </div>
              <div className="py-2.5 px-2 text-black flex items-center justify-center font-black font-mono">
                {realtimeTimeStr}
              </div>
              <div className="py-2.5 px-2 uppercase text-black flex items-center justify-center font-black">
                THỜI GIAN SD :
              </div>
              <div className="py-2.5 px-2 text-black flex items-center justify-center font-black font-mono">
                {timeMode === 'realtime' ? `${thoiGianSdPercent.toFixed(1)}%` : `${Math.round(thoiGianSdPercent)}%`}
              </div>
            </div>

            {/* TABLE 1: THEO KÊNH */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm font-sans border-b border-slate-300">
                <thead>
                  {/* Top Banner Row */}
                  <tr>
                    <th
                      colSpan={3}
                      className="bg-[#00b074] text-black font-black p-2.5 sm:p-3 text-center border-r border-b border-slate-300 text-xs sm:text-sm uppercase tracking-wide leading-tight"
                    >
                      {targetHeaderStr}
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fcd34d] text-black font-black p-2 text-center border-r border-b border-slate-300 text-xs sm:text-sm leading-tight w-24 sm:w-28 align-middle"
                    >
                      <div className="font-black text-black">HIỆU QUẢ</div>
                      <div className="font-black text-black">QUY ĐỔI</div>
                      <div className="text-[10px] sm:text-[11px] font-black mt-1 text-black uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] sm:text-[11px] font-black text-black">MIN = 50%</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fcd34d] text-black font-black p-2 text-center border-b border-slate-300 text-xs sm:text-sm leading-tight w-24 sm:w-28 align-middle"
                    >
                      <div className="font-black text-black">TỈ TRỌNG</div>
                      <div className="font-black text-black">TRẢ CHẬM</div>
                      <div className="text-[10px] sm:text-[11px] font-black mt-1 text-black uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] sm:text-[11px] font-black text-black">MIN = 50%</div>
                    </th>
                  </tr>

                  {/* Sub Header Row */}
                  <tr>
                    <th className="p-2 sm:p-2.5 border-r border-b border-slate-300 bg-[#00b074] text-left w-24 sm:w-28 pl-3 sm:pl-4 uppercase tracking-wider font-black text-black">
                      KÊNH
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-b border-slate-300 bg-[#00b074] text-center uppercase tracking-wider font-black text-black leading-tight">
                      <div>HOÀN THÀNH</div>
                      <div>HIỆN TẠI</div>
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-b border-slate-300 bg-[#00b074] text-center uppercase tracking-wider font-black text-black leading-tight">
                      <div>HOÀN THÀNH</div>
                      <div>DỰ KIẾN</div>
                    </th>
                  </tr>
                </thead>

                <tbody className="text-black font-sans">
                  {channelSummaryRows.map((ch) => {
                    const projected = thoiGianSdPercent > 0 ? (ch.rateDt / (thoiGianSdPercent / 100)) : 0;
                    const isProjectedGreen = projected >= 100.0;
                    const isUnderPerforming = projected < 80.0 && projected > 0;
                    const isQdRed = ch.qdEff < 50.0;
                    const isTcRed = ch.tcRatio < 50.0;

                    const fmt = (v: number) => (timeMode === 'realtime' ? `${v.toFixed(1)}%` : `${Math.round(v)}%`);

                    return (
                      <tr key={ch.kenh} className="font-bold">
                        <td className="p-2 sm:p-2.5 text-left pl-3 sm:pl-4 border-r border-b border-slate-300 text-black font-bold">
                          {ch.kenh}
                        </td>
                        <td
                          className={`p-2 sm:p-2.5 text-center border-r border-b border-slate-300 font-black font-mono ${
                            isUnderPerforming ? 'bg-[#fecdd3] text-[#b91c1c]' : 'bg-white text-black'
                          }`}
                        >
                          {fmt(ch.rateDt)}
                        </td>
                        <td
                          className={`p-2 sm:p-2.5 text-center border-r border-b border-slate-300 font-black font-mono ${
                            isProjectedGreen
                              ? 'bg-[#dcfce7] text-[#16a34a]'
                              : isUnderPerforming
                              ? 'bg-[#fecdd3] text-[#b91c1c]'
                              : 'bg-white text-black'
                          }`}
                        >
                          {fmt(projected)}
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center border-r border-b border-slate-300 font-black font-mono ${isQdRed ? 'text-[#dc2626]' : 'text-black'}`}>
                          {fmt(ch.qdEff)}
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center border-b border-slate-300 font-black font-mono ${isTcRed ? 'text-[#dc2626]' : 'text-black'}`}>
                          {fmt(ch.tcRatio)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Channel Summary Row */}
                  <tr className="font-black text-black">
                    <td className="p-2 sm:p-2.5 text-left pl-3 sm:pl-4 bg-[#00b074] text-black font-black uppercase tracking-wide border-r border-b border-slate-300">
                      {summaryChannelLabel}
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#00b074] text-black font-black border-r border-b border-slate-300 font-mono">
                      {timeMode === 'realtime' ? `${totalSummary.totalRateDt.toFixed(1)}%` : `${Math.round(totalSummary.totalRateDt)}%`}
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#00b074] text-black font-black border-r border-b border-slate-300 font-mono">
                      {timeMode === 'realtime'
                        ? `${(thoiGianSdPercent > 0 ? totalSummary.totalRateDt / (thoiGianSdPercent / 100) : 0).toFixed(1)}%`
                        : `${Math.round(thoiGianSdPercent > 0 ? totalSummary.totalRateDt / (thoiGianSdPercent / 100) : 0)}%`}
                    </td>
                    <td className={`p-2 sm:p-2.5 text-center bg-[#fcd34d] font-black border-r border-b border-slate-300 font-mono ${totalSummary.totalQdEff < 50 ? 'text-[#dc2626]' : 'text-black'}`}>
                      {timeMode === 'realtime' ? `${totalSummary.totalQdEff.toFixed(1)}%` : `${Math.round(totalSummary.totalQdEff)}%`}
                    </td>
                    <td className={`p-2 sm:p-2.5 text-center bg-[#fcd34d] font-black border-b border-slate-300 font-mono ${totalSummary.totalTcRatio < 50 ? 'text-[#dc2626]' : 'text-black'}`}>
                      {timeMode === 'realtime' ? `${totalSummary.totalTcRatio.toFixed(1)}%` : `${Math.round(totalSummary.totalTcRatio)}%`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* DIVIDER SPACE BETWEEN TABLES */}
            <div className="h-2 bg-slate-50 border-y border-slate-300" />

            {/* TABLE 2: THEO TỈNH */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm font-sans border-b border-slate-300">
                <thead>
                  {/* Top Banner Row */}
                  <tr>
                    <th
                      colSpan={3}
                      className="bg-[#00b074] text-black font-black p-2.5 sm:p-3 text-center border-r border-b border-slate-300 text-xs sm:text-sm uppercase tracking-wide leading-tight"
                    >
                      {targetHeaderStr}
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fcd34d] text-black font-black p-2 text-center border-r border-b border-slate-300 text-xs sm:text-sm leading-tight w-24 sm:w-28 align-middle"
                    >
                      <div className="font-black text-black">HIỆU QUẢ</div>
                      <div className="font-black text-black">QUY ĐỔI</div>
                      <div className="text-[10px] sm:text-[11px] font-black mt-1 text-black uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] sm:text-[11px] font-black text-black">MIN = 50%</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fcd34d] text-black font-black p-2 text-center border-b border-slate-300 text-xs sm:text-sm leading-tight w-24 sm:w-28 align-middle"
                    >
                      <div className="font-black text-black">TỈ TRỌNG</div>
                      <div className="font-black text-black">TRẢ CHẬM</div>
                      <div className="text-[10px] sm:text-[11px] font-black mt-1 text-black uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] sm:text-[11px] font-black text-black">MIN = 50%</div>
                    </th>
                  </tr>

                  {/* Sub Header Row */}
                  <tr>
                    <th className="p-2 sm:p-2.5 border-r border-b border-slate-300 bg-[#00b074] text-left w-24 sm:w-28 pl-3 sm:pl-4 uppercase tracking-wider font-black text-black">
                      TỈNH
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-b border-slate-300 bg-[#00b074] text-center uppercase tracking-wider font-black text-black leading-tight">
                      <div>HOÀN THÀNH</div>
                      <div>HIỆN TẠI</div>
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-b border-slate-300 bg-[#00b074] text-center uppercase tracking-wider font-black text-black leading-tight">
                      <div>HOÀN THÀNH</div>
                      <div>DỰ KIẾN</div>
                    </th>
                  </tr>
                </thead>

                <tbody className="text-black font-sans">
                  {provinceSummaryRows.map((p) => {
                    const projected = thoiGianSdPercent > 0 ? (p.rateDt / (thoiGianSdPercent / 100)) : 0;
                    const isProjectedGreen = projected >= 100.0;
                    const isUnderPerforming = projected < 80.0 && projected > 0;
                    const isQdRed = p.qdEff < 50.0;
                    const isTcRed = p.tcRatio < 50.0;

                    const fmt = (v: number) => (timeMode === 'realtime' ? `${v.toFixed(1)}%` : `${Math.round(v)}%`);

                    return (
                      <tr key={p.tinh} className="font-bold">
                        <td className="p-2 sm:p-2.5 text-left pl-3 sm:pl-4 border-r border-b border-slate-300 text-black font-bold">
                          {p.tinh}
                        </td>
                        <td
                          className={`p-2 sm:p-2.5 text-center border-r border-b border-slate-300 font-black font-mono ${
                            isUnderPerforming ? 'bg-[#fecdd3] text-[#b91c1c]' : 'bg-white text-black'
                          }`}
                        >
                          {fmt(p.rateDt)}
                        </td>
                        <td
                          className={`p-2 sm:p-2.5 text-center border-r border-b border-slate-300 font-black font-mono ${
                            isProjectedGreen
                              ? 'bg-[#dcfce7] text-[#16a34a]'
                              : isUnderPerforming
                              ? 'bg-[#fecdd3] text-[#b91c1c]'
                              : 'bg-white text-black'
                          }`}
                        >
                          {fmt(projected)}
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center border-r border-b border-slate-300 font-black font-mono ${isQdRed ? 'text-[#dc2626]' : 'text-black'}`}>
                          {fmt(p.qdEff)}
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center border-b border-slate-300 font-black font-mono ${isTcRed ? 'text-[#dc2626]' : 'text-black'}`}>
                          {fmt(p.tcRatio)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Province Summary Row at Bottom */}
                  <tr className="font-black text-black">
                    <td className="p-2 sm:p-2.5 text-left pl-3 sm:pl-4 bg-[#00b074] text-black font-black uppercase tracking-wide border-r border-b border-slate-300">
                      TOÀN VÙNG TNB
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#00b074] text-black font-black border-r border-b border-slate-300 font-mono">
                      {timeMode === 'realtime' ? `${totalSummary.totalRateDt.toFixed(1)}%` : `${Math.round(totalSummary.totalRateDt)}%`}
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#00b074] text-black font-black border-r border-b border-slate-300 font-mono">
                      {timeMode === 'realtime'
                        ? `${(thoiGianSdPercent > 0 ? totalSummary.totalRateDt / (thoiGianSdPercent / 100) : 0).toFixed(1)}%`
                        : `${Math.round(thoiGianSdPercent > 0 ? totalSummary.totalRateDt / (thoiGianSdPercent / 100) : 0)}%`}
                    </td>
                    <td className={`p-2 sm:p-2.5 text-center bg-[#fcd34d] font-black border-r border-b border-slate-300 font-mono ${totalSummary.totalQdEff < 50 ? 'text-[#dc2626]' : 'text-black'}`}>
                      {timeMode === 'realtime' ? `${totalSummary.totalQdEff.toFixed(1)}%` : `${Math.round(totalSummary.totalQdEff)}%`}
                    </td>
                    <td className={`p-2 sm:p-2.5 text-center bg-[#fcd34d] font-black border-b border-slate-300 font-mono ${totalSummary.totalTcRatio < 50 ? 'text-[#dc2626]' : 'text-black'}`}>
                      {timeMode === 'realtime' ? `${totalSummary.totalTcRatio.toFixed(1)}%` : `${Math.round(totalSummary.totalTcRatio)}%`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : entityScope === 'topbot' ? (
          /* TAB TOP/BOT: EXACT MATCH DESIGN WITH 2 SEPARATE COLUMNS (GAP IN BETWEEN) */
          <div id="topbot-report-container" className="w-full max-w-full xl:max-w-7xl 2xl:max-w-[1440px] mx-auto grid grid-cols-1 xl:grid-cols-2 gap-3.5 my-2 select-none">
            {/* LEFT COLUMN: CHANNEL HEADER & TOP/BOT D.THU TABLE */}
            <div className="bg-white border border-slate-300 rounded-none sm:rounded-lg overflow-hidden shadow-xs flex flex-col">
              {/* Channel Big Banner */}
              <div className="bg-[#1e40af] text-white flex items-center justify-center p-4 border-b border-slate-300 h-[132px] box-border">
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-wider uppercase text-white font-sans drop-shadow-sm text-center">
                  {selectedChannels.length === 1
                    ? (selectedChannels[0] === 'DML' ? 'ĐML' : selectedChannels[0] === 'DMM' ? 'ĐMM' : selectedChannels[0] === 'DMS' ? 'ĐMS' : selectedChannels[0] === 'TGD' ? 'TGD' : 'TOPZONE')
                    : selectedChannels.length === 5
                    ? 'TỔNG'
                    : selectedChannels.map((c) => (c === 'DML' ? 'ĐML' : c === 'DMM' ? 'ĐMM' : c === 'DMS' ? 'ĐMS' : c === 'TGD' ? 'TGD' : 'TOPZONE')).join(', ')}
                </h1>
              </div>

              {/* Table: Top & Bottom DTQD */}
              <div className="overflow-x-auto xl:overflow-x-visible grow flex flex-col justify-between">
                <div>
                  <div className="bg-[#00b074] text-black font-black h-10 flex items-center justify-center border-b border-slate-300 text-xs sm:text-sm md:text-base uppercase tracking-wide">
                    TOP &amp; BOTTOM D.THU QUY ĐỔI
                  </div>
                  <table className="w-full text-left border-collapse text-[11px] sm:text-xs font-sans">
                    <thead>
                      <tr className="bg-[#00b074] text-black font-black text-[11px] sm:text-xs h-9">
                        <th className="p-1 sm:p-1.5 border-r border-b border-slate-300 text-center w-8">STT</th>
                        <th className="p-1 sm:p-1.5 border-r border-b border-slate-300 text-center w-20 sm:w-24">BOSS</th>
                        <th className="p-1 sm:p-1.5 border-r border-b border-slate-300 text-center w-12">KÊNH</th>
                        <th className="p-1 sm:p-1.5 border-r border-b border-slate-300 text-left pl-2 sm:pl-3">SIÊU THỊ</th>
                        <th className="p-1 sm:p-1.5 border-b border-slate-300 text-center w-20 sm:w-24 leading-tight">
                          <div>D.THU</div>
                          <div className="text-[9.5px]">THỰC HIỆN</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-black font-sans">
                      {/* Top 20 D.Thu */}
                      {topBotData.top20DtQd.map((s) => (
                        <tr key={`top_dt_${s.id || s.sieuthi}`} className="font-bold">
                          <td className="p-1 sm:p-1.5 text-center bg-[#fef08a] font-black border-r border-b border-slate-300 text-xs">
                            {s.rank}
                          </td>
                          <td className="p-1 sm:p-1.5 text-left pl-2 border-r border-b border-slate-300 text-black font-bold whitespace-nowrap text-xs">
                            {s.boss || '-'}
                          </td>
                          <td className="p-1 sm:p-1.5 text-center bg-[#93c5fd] font-bold border-r border-b border-slate-300 text-black text-xs">
                            {s.kenh === 'DML' ? 'ĐML' : s.kenh === 'DMM' ? 'ĐMM' : s.kenh === 'DMS' ? 'ĐMS' : s.kenh || '-'}
                          </td>
                          <td className="p-1 sm:p-1.5 text-left pl-2 border-r border-b border-slate-300 text-black font-bold whitespace-nowrap text-xs">
                            {s.sieuthi}
                          </td>
                          <td className="p-1 sm:p-1.5 text-center font-black font-mono text-[#16a34a] border-b border-slate-300 text-xs">
                            {Math.round(s.dtQd || s.achievedDt || 0).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      ))}

                      {/* Bottom 20 D.Thu */}
                      {topBotData.bot20DtQd.map((s) => (
                        <tr key={`bot_dt_${s.id || s.sieuthi}`} className="font-bold">
                          <td className="p-1 sm:p-1.5 text-center bg-white font-bold border-r border-b border-slate-300 text-slate-800 text-xs">
                            {s.rank}
                          </td>
                          <td className="p-1 sm:p-1.5 text-left pl-2 border-r border-b border-slate-300 text-black font-bold whitespace-nowrap text-xs">
                            {s.boss || '-'}
                          </td>
                          <td className="p-1 sm:p-1.5 text-center bg-[#93c5fd] font-bold border-r border-b border-slate-300 text-black text-xs">
                            {s.kenh === 'DML' ? 'ĐML' : s.kenh === 'DMM' ? 'ĐMM' : s.kenh === 'DMS' ? 'ĐMS' : s.kenh || '-'}
                          </td>
                          <td className="p-1 sm:p-1.5 text-left pl-2 border-r border-b border-slate-300 text-black font-bold whitespace-nowrap text-xs">
                            {s.sieuthi}
                          </td>
                          <td className="p-1 sm:p-1.5 text-center bg-[#fecdd3] font-black font-mono text-[#dc2626] border-b border-slate-300 text-xs">
                            {Math.round(s.dtQd || s.achievedDt || 0).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#00b074] font-black text-black">
                        <td colSpan={4} className="p-2 text-center uppercase tracking-wide border-r border-t border-slate-300 font-black text-xs sm:text-sm">
                          {selectedChannels.length === 1
                            ? `KÊNH ${selectedChannels[0] === 'DML' ? 'ĐML' : selectedChannels[0] === 'DMM' ? 'ĐMM' : selectedChannels[0] === 'DMS' ? 'ĐMS' : selectedChannels[0]}`
                            : 'TỔNG CỘNG KÊNH'}
                        </td>
                        <td className="p-2 text-center font-black font-mono border-t border-slate-300 text-xs sm:text-sm">
                          {Math.round(totalSummary.totalAchievedDt || 0).toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: TIME INFO & TOP/BOT % HT TABLE */}
            <div className="bg-white border border-slate-300 rounded-none sm:rounded-lg overflow-hidden shadow-xs flex flex-col">
              {/* Right Time Info Block */}
              <div className="flex flex-col bg-white h-[132px] border-b border-slate-300 box-border">
                <div className="grid grid-cols-2 border-b border-slate-300 divide-x divide-slate-300 h-[44px]">
                  <div className="px-3 font-black text-black text-xs sm:text-sm uppercase flex items-center pl-4">
                    {timeMode === 'realtime' ? 'REALTIME' : 'LUỸ KẾ'}
                  </div>
                  <div className="px-3 font-black text-red-600 text-xs sm:text-sm font-mono flex items-center justify-center">
                    {realtimeTimeAndDateStr || realtimeTimeStr}
                  </div>
                </div>

                <div className="grid grid-cols-2 border-b border-slate-300 divide-x divide-slate-300 h-[44px]">
                  <div className="px-3 font-black text-black text-xs sm:text-sm uppercase flex items-center pl-4">
                    THỜI GIAN SỬ DỤNG
                  </div>
                  <div className="px-3 font-black text-red-600 text-xs sm:text-sm font-mono flex items-center justify-center">
                    {Math.round(thoiGianSdPercent)}%
                  </div>
                </div>

                <div className="px-3 flex items-center justify-center font-black text-black text-xs sm:text-sm uppercase tracking-wide h-[44px] text-center">
                  {targetHeaderStr}
                </div>
              </div>

              {/* Table: Top & Bottom % HT */}
              <div className="overflow-x-auto xl:overflow-x-visible grow flex flex-col justify-between">
                <div>
                  <div className="bg-[#fcd34d] text-black font-black h-10 flex items-center justify-center border-b border-slate-300 text-xs sm:text-sm md:text-base uppercase tracking-wide">
                    {timeMode === 'realtime' ? 'TOP & BOTTOM TỈ LỆ HOÀN THÀNH' : 'TOP & BOTTOM DK TỈ LỆ HOÀN THÀNH'}
                  </div>
                  <table className="w-full text-left border-collapse text-[11px] sm:text-xs font-sans">
                    <thead>
                      <tr className="bg-[#fcd34d] text-black font-black text-[11px] sm:text-xs h-9">
                        <th className="p-1 sm:p-1.5 border-r border-b border-slate-300 text-center w-8">STT</th>
                        <th className="p-1 sm:p-1.5 border-r border-b border-slate-300 text-center w-20 sm:w-24">BOSS</th>
                        <th className="p-1 sm:p-1.5 border-r border-b border-slate-300 text-center w-12">KÊNH</th>
                        <th className="p-1 sm:p-1.5 border-r border-b border-slate-300 text-left pl-2 sm:pl-3">SIÊU THỊ</th>
                        <th className="p-1 sm:p-1.5 border-b border-slate-300 text-center w-20 sm:w-24 leading-tight">
                          <div>{timeMode === 'realtime' ? 'TỈ LỆ' : 'DK TỈ LỆ'}</div>
                          <div className="text-[9.5px]">HOÀN THÀNH</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-black font-sans">
                      {/* Top 20 % HT */}
                      {topBotData.top20Rate.map((s) => (
                        <tr key={`top_rate_${s.id || s.sieuthi}`} className="font-bold">
                          <td className="p-1 sm:p-1.5 text-center bg-[#fef08a] font-black border-r border-b border-slate-300 text-xs">
                            {s.rank}
                          </td>
                          <td className="p-1 sm:p-1.5 text-left pl-2 border-r border-b border-slate-300 text-black font-bold whitespace-nowrap text-xs">
                            {s.boss || '-'}
                          </td>
                          <td className="p-1 sm:p-1.5 text-center border-r border-b border-slate-300 text-black font-bold text-xs">
                            {s.kenh === 'DML' ? 'ĐML' : s.kenh === 'DMM' ? 'ĐMM' : s.kenh === 'DMS' ? 'ĐMS' : s.kenh || '-'}
                          </td>
                          <td className="p-1 sm:p-1.5 text-left pl-2 border-r border-b border-slate-300 text-black font-bold whitespace-nowrap text-xs">
                            {s.sieuthi}
                          </td>
                          <td className="p-1 sm:p-1.5 text-center font-black font-mono text-[#16a34a] border-b border-slate-300 text-xs">
                            {Math.round((s as any).displayRate ?? s.rateDt)}%
                          </td>
                        </tr>
                      ))}

                      {/* Bottom 20 % HT */}
                      {topBotData.bot20Rate.map((s) => (
                        <tr key={`bot_rate_${s.id || s.sieuthi}`} className="font-bold">
                          <td className="p-1 sm:p-1.5 text-center bg-white font-bold border-r border-b border-slate-300 text-slate-800 text-xs">
                            {s.rank}
                          </td>
                          <td className="p-1 sm:p-1.5 text-left pl-2 border-r border-b border-slate-300 text-black font-bold whitespace-nowrap text-xs">
                            {s.boss || '-'}
                          </td>
                          <td className="p-1 sm:p-1.5 text-center border-r border-b border-slate-300 text-black font-bold text-xs">
                            {s.kenh === 'DML' ? 'ĐML' : s.kenh === 'DMM' ? 'ĐMM' : s.kenh === 'DMS' ? 'ĐMS' : s.kenh || '-'}
                          </td>
                          <td className="p-1 sm:p-1.5 text-left pl-2 border-r border-b border-slate-300 text-black font-bold whitespace-nowrap text-xs">
                            {s.sieuthi}
                          </td>
                          <td className="p-1 sm:p-1.5 text-center bg-[#fecdd3] font-black font-mono text-[#dc2626] border-b border-slate-300 text-xs">
                            {Math.round((s as any).displayRate ?? s.rateDt)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#fcd34d] font-black text-black">
                        <td colSpan={4} className="p-2 text-center uppercase tracking-wide border-r border-t border-slate-300 font-black text-xs sm:text-sm">
                          {selectedChannels.length === 1
                            ? `KÊNH ${selectedChannels[0] === 'DML' ? 'ĐML' : selectedChannels[0] === 'DMM' ? 'ĐMM' : selectedChannels[0] === 'DMS' ? 'ĐMS' : selectedChannels[0]}`
                            : 'TỔNG CỘNG KÊNH'}
                        </td>
                        <td className="p-2 text-center font-black font-mono border-t border-slate-300 text-xs sm:text-sm">
                          {Math.round(timeMode === 'luyke' && thoiGianSdPercent > 0 ? (totalSummary.totalRateDt / (thoiGianSdPercent / 100)) : totalSummary.totalRateDt)}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : entityScope === 'sieuthimoi' ? (
          /* TAB SIÊU THỊ MỚI (CHÍNH XÁC 100% THEO HÌNH ẢNH MẪU - VIỀN XÁM NHẠT - TỰ ĐỘNG XUỐNG DÒNG & FIX ĐỘ RỘNG CỘT) */
          <div className="w-full max-w-5xl mx-auto bg-white border border-slate-300 font-sans select-none overflow-hidden my-2 shadow-xs">
            {/* Header: DOANH THU QĐ NGÀY & TÊN TỈNH */}
            <div className="grid grid-cols-2 border-b border-slate-300 bg-white">
              <div className="py-2.5 px-4 border-r border-slate-300 flex items-center justify-start">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-950 tracking-tight uppercase whitespace-nowrap">
                  DOANH THU QĐ {timeMode === 'realtime' ? 'NGÀY' : 'THÁNG'}
                </h1>
              </div>
              <div className="py-2.5 px-4 flex items-center justify-start">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-red-600 tracking-tight uppercase whitespace-nowrap">
                  {currentProvinceTitle}
                </h2>
              </div>
            </div>

            {/* Sub-Header Bar: REALTIME / LUỸ KẾ & THỜI GIAN ĐÃ SỬ DỤNG */}
            <div className="grid grid-cols-4 border-b border-slate-300 bg-white text-center text-xs sm:text-sm divide-x divide-slate-300 font-sans font-black text-slate-900">
              <div className="py-2 px-3 uppercase flex items-center justify-start pl-4 whitespace-nowrap">
                {infoTimeLabel}
              </div>
              <div className="py-2 px-3 flex items-center justify-start pl-4 font-mono whitespace-nowrap">
                {realtimeTimeAndDateStr}
              </div>
              <div className="py-2 px-3 uppercase flex items-center justify-start pl-4 whitespace-nowrap">
                THỜI GIAN ĐÃ SỬ DỤNG :
              </div>
              <div className="py-2 px-3 flex items-center justify-start pl-4 font-mono whitespace-nowrap">
                {Math.round(thoiGianSdPercent)}%
              </div>
            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-left border-collapse text-xs border-t border-slate-300">
                <thead>
                  {/* Tier 1: Group Headers */}
                  <tr className="border-b border-slate-300">
                    <th
                      colSpan={2}
                      rowSpan={2}
                      className="bg-[#00c08b] text-slate-950 font-black p-2 text-center border-r border-slate-300 align-middle text-sm whitespace-nowrap"
                    >
                      BOSS
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#00c08b] text-slate-950 font-black p-2 text-left pl-3 border-r border-slate-300 align-middle text-sm whitespace-nowrap"
                    >
                      SIÊU THỊ
                    </th>
                    <th
                      colSpan={3}
                      className="bg-[#fbb040] text-slate-950 font-black p-1.5 text-center border-r border-slate-300 text-[11px] leading-snug"
                    >
                      <div>{timeMode === 'realtime' ? 'MỤC TIÊU HÔM NAY =' : 'MỤC TIÊU THÁNG ='}</div>
                      <div className="text-[10px] font-bold">
                        {targetSubHeaderStr}
                      </div>
                    </th>
                    <th
                      colSpan={2}
                      className="bg-[#fde047] text-slate-950 font-black p-1.5 text-center border-r border-slate-300 text-[11px] leading-snug"
                    >
                      <div>DỰ KIẾN HẾT {timeMode === 'realtime' ? 'NGÀY' : 'THÁNG'}</div>
                      <div className="text-[9.5px] font-bold uppercase opacity-90">THEO TỈ TRỌNG TỪNG GIỜ</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fbb040] text-slate-950 font-black p-1 text-center border-r border-slate-300 text-[10.5px] leading-tight w-[68px] align-middle"
                    >
                      <div>HIỆU QUẢ</div>
                      <div>QUY ĐỔI</div>
                      <div className="text-[9px] font-bold mt-0.5 uppercase opacity-90 leading-none">MỤC TIÊU</div>
                      <div className="text-[9px] font-bold opacity-90 leading-none">MIN = 50%</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fdbb84] text-slate-950 font-black p-1 text-center text-[10.5px] leading-tight w-[68px] align-middle"
                    >
                      <div>TỈ TRỌNG</div>
                      <div>TRẢ CHẬM</div>
                      <div className="text-[9px] font-bold mt-0.5 uppercase opacity-90 leading-none">MỤC TIÊU</div>
                      <div className="text-[9px] font-bold opacity-90 leading-none">MIN = 50%</div>
                    </th>
                  </tr>

                  {/* Tier 2: Sub-Header Row */}
                  <tr className="border-b border-slate-300 font-black text-[10.5px]">
                    <th className="p-1 border-r border-slate-300 text-center w-[54px] bg-[#fbb040] text-slate-950 whitespace-nowrap">
                      <div>MỤC</div>
                      <div>TIÊU</div>
                    </th>
                    <th className="p-1 border-r border-slate-300 text-center w-[50px] bg-[#fbb040] text-slate-950 whitespace-nowrap">
                      <div>THỰC</div>
                      <div>HIỆN</div>
                    </th>
                    <th className="p-1 border-r border-slate-300 text-center w-[58px] bg-[#fbb040] text-slate-950 whitespace-nowrap">
                      <div>HOÀN</div>
                      <div>THÀNH</div>
                    </th>
                    <th className="p-1 border-r border-slate-300 text-center w-[50px] bg-[#fde047] text-slate-950 whitespace-nowrap">
                      <div>THỰC</div>
                      <div>HIỆN</div>
                    </th>
                    <th className="p-1 border-r border-slate-300 text-center w-[58px] bg-[#fde047] text-slate-950 whitespace-nowrap">
                      <div>HOÀN</div>
                      <div>THÀNH</div>
                    </th>
                  </tr>
                </thead>

                <tbody className="text-slate-900 font-sans font-bold">
                  {storesByChannel.map((group) => (
                    <React.Fragment key={group.channel}>
                      {/* Channel Group Header Row */}
                      <tr className="border-b border-slate-300 font-black text-xs">
                        <td colSpan={3} className="p-1.5 bg-[#00c08b] text-center border-r border-slate-300 text-xs font-black text-slate-950 whitespace-nowrap align-middle">
                          {group.channel}
                        </td>
                        <td className="p-1.5 bg-[#fbb040] text-right pr-2 border-r border-slate-300 font-mono text-slate-950 whitespace-nowrap">
                          {group.totalTargetDt.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-1.5 bg-[#fbb040] text-right pr-2 border-r border-slate-300 font-mono text-slate-950 whitespace-nowrap">
                          {group.totalAchievedDt.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-1.5 bg-[#fbb040] text-center border-r border-slate-300 text-slate-950 whitespace-nowrap">
                          {Math.round(group.totalRateDt)}%
                        </td>
                        <td className="p-1.5 bg-[#fde047] text-right pr-2 border-r border-slate-300 font-mono text-slate-950 whitespace-nowrap">
                          {group.totalProjectedAchieved.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-1.5 bg-[#fde047] text-center border-r border-slate-300 text-slate-950 whitespace-nowrap">
                          {Math.round(group.totalProjectedRate)}%
                        </td>
                        <td className="p-1.5 bg-[#fbb040] text-center border-r border-slate-300 text-slate-950 whitespace-nowrap">
                          {Math.round(group.totalQdEff)}%
                        </td>
                        <td className="p-1.5 bg-[#fdbb84] text-center text-slate-950 whitespace-nowrap">
                          {Math.round(group.totalTcRatio)}%
                        </td>
                      </tr>

                      {/* Store Rows in Channel */}
                      {group.stores.map((s, idx) => {
                        const projAchieved = thoiGianSdPercent > 0 ? Math.round(s.achievedDt / (thoiGianSdPercent / 100)) : s.achievedDt;
                        const projRate = thoiGianSdPercent > 0 ? (s.rateDt / (thoiGianSdPercent / 100)) : s.rateDt;
                        const isCurrentPink = s.rateDt < 21.0 && s.rateDt > 0;
                        const isProjGreen = projRate >= 100.0;
                        const isProjPink = projRate < 80.0 && projRate > 0;
                        const isNegative = s.achievedDt < 0 || s.rateDt < 0;
                        const isQdRed = s.qdEff < 50.0;
                        const isTcRed = s.tcRatio < 50.0;

                        const sttBgClass =
                          idx === 0
                            ? 'bg-[#ffff00] text-slate-950 font-black'
                            : idx === 1
                            ? 'bg-[#eaecf0] text-slate-950 font-black'
                            : idx === 2
                            ? 'bg-[#f8cca6] text-slate-950 font-black'
                            : 'bg-white text-slate-950 font-bold';

                        return (
                          <tr
                            key={s.id || s.sieuthi}
                            className="bg-white hover:bg-slate-50 transition-colors border-b border-slate-300"
                          >
                            <td className={`p-1.5 text-center border-r border-slate-300 text-xs w-7 whitespace-nowrap ${sttBgClass}`}>
                              {idx + 1}
                            </td>
                            <td className="p-1.5 text-left pl-2 border-r border-slate-300 font-black text-slate-950 whitespace-nowrap" title={s.boss}>
                              {s.boss || '-'}
                            </td>
                            <td className="p-1.5 text-left pl-2 border-r border-slate-300 font-black text-slate-950 whitespace-nowrap" title={s.sieuthi}>
                              {s.sieuthi}
                            </td>
                            <td className="p-1.5 text-right pr-2 border-r border-slate-300 font-mono font-black text-slate-950 whitespace-nowrap">
                              {s.targetDt.toLocaleString('vi-VN')}
                            </td>
                            <td className="p-1.5 text-right pr-2 border-r border-slate-300 font-mono font-black text-slate-950 whitespace-nowrap">
                              {s.achievedDt.toLocaleString('vi-VN')}
                            </td>
                            <td className={`p-1.5 text-center border-r border-slate-300 font-black whitespace-nowrap ${
                              isNegative || isCurrentPink ? 'text-red-600' : 'text-slate-950'
                            }`}>
                              {Math.round(s.rateDt)}%
                            </td>
                            <td className="p-1.5 text-right pr-2 border-r border-slate-300 font-mono font-black text-slate-950 whitespace-nowrap">
                              {projAchieved.toLocaleString('vi-VN')}
                            </td>
                            <td className={`p-1.5 text-center border-r border-slate-300 font-black whitespace-nowrap ${
                              isProjGreen
                                ? 'bg-[#dcfce7] text-[#15803d]'
                                : isNegative || isProjPink
                                ? 'text-red-600'
                                : 'text-slate-950'
                            }`}>
                              {Math.round(projRate)}%
                            </td>
                            <td className={`p-1.5 text-center border-r border-slate-300 font-black whitespace-nowrap ${
                              isQdRed ? 'text-red-600' : 'text-slate-950'
                            }`}>
                              {Math.round(s.qdEff)}%
                            </td>
                            <td className={`p-1.5 text-center font-black whitespace-nowrap ${
                              isTcRed ? 'text-red-600' : 'text-slate-950'
                            }`}>
                              {Math.round(s.tcRatio)}%
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {/* BOTTOM TOTAL SUMMARY ROW */}
                  <tr className="font-black text-slate-950 border-t border-b border-slate-300 text-xs">
                    <td colSpan={3} className="p-2 bg-[#00c08b] text-center border-r border-slate-300 text-xs uppercase tracking-wide whitespace-nowrap align-middle">
                      {currentProvinceTitle}
                    </td>
                    <td className="p-2 bg-[#fbb040] text-right pr-2 font-mono border-r border-slate-300 whitespace-nowrap">
                      {totalSummary.totalTargetDt.toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2 bg-[#fbb040] text-right pr-2 font-mono border-r border-slate-300 whitespace-nowrap">
                      {totalSummary.totalAchievedDt.toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2 bg-[#fbb040] text-center border-r border-slate-300 whitespace-nowrap">
                      {Math.round(totalSummary.totalRateDt)}%
                    </td>
                    <td className="p-2 bg-[#fde047] text-right pr-2 font-mono border-r border-slate-300 whitespace-nowrap">
                      {(thoiGianSdPercent > 0 ? Math.round(totalSummary.totalAchievedDt / (thoiGianSdPercent / 100)) : totalSummary.totalAchievedDt).toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2 bg-[#fde047] text-center border-r border-slate-300 whitespace-nowrap">
                      {Math.round(thoiGianSdPercent > 0 ? (totalSummary.totalRateDt / (thoiGianSdPercent / 100)) : totalSummary.totalRateDt)}%
                    </td>
                    <td className="p-2 bg-[#fbb040] text-center border-r border-slate-300 whitespace-nowrap">
                      {Math.round(totalSummary.totalQdEff)}%
                    </td>
                    <td className="p-2 bg-[#fdbb84] text-center whitespace-nowrap">
                      {Math.round(totalSummary.totalTcRatio)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : entityScope === 'sieuthi' ? (
          /* PROVINCE LEVEL TABLE (TAB VÙNG) */
          <div className="overflow-x-auto select-none border border-slate-200 rounded-2xl shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                {/* Group Band Headers */}
                <tr>
                  <th colSpan={3} data-quick-colspan="2" className="bg-[#0284c7] text-white font-black text-xs text-center p-2.5 border-r border-sky-600 uppercase tracking-wide">
                    TỈNH
                  </th>
                  <th data-quick-hide="1" colSpan={2} className="bg-[#fbb040] text-slate-950 font-black text-xs text-center p-2.5 border-r border-amber-500/40 uppercase tracking-wide">
                    <div>{timeMode === 'realtime' ? 'MỤC TIÊU HÔM NAY =' : 'MỤC TIÊU THÁNG ='}</div>
                    <div className="text-[10px] font-bold">{targetSubHeaderStr}</div>
                  </th>
                  <th rowSpan={2} className="bg-[#fbb040] text-slate-950 font-black text-xs text-center p-2.5 border-r border-amber-500/40 uppercase tracking-wide align-middle">
                    <div>HOÀN</div>
                    <div>THÀNH</div>
                  </th>
                  <th data-quick-hide="1" className="bg-[#fde047] text-slate-950 font-black text-xs text-center p-2.5 border-r border-amber-300 uppercase tracking-wide">
                    <div>DỰ KIẾN HẾT {timeMode === 'realtime' ? 'NGÀY' : 'THÁNG'}</div>
                    <div className="text-[9.5px] font-bold">THEO TỈ TRỌNG TỪNG GIỜ</div>
                  </th>
                  <th rowSpan={2} className="bg-[#fde047] text-slate-950 font-black text-xs text-center p-2.5 border-r border-amber-300 uppercase tracking-wide align-middle">
                    <div>HOÀN THÀNH</div>
                    <div className="text-[9.5px] font-bold">DỰ KIẾN</div>
                  </th>
                  <th rowSpan={2} className="bg-[#fbb040] text-slate-950 font-black p-2 text-center border-r border-amber-500/40 text-xs leading-tight w-24 align-middle">
                    <div>HIỆU QUẢ</div>
                    <div>QUY ĐỔI</div>
                    <div className="text-[9px] font-bold mt-0.5">MIN = 50%</div>
                  </th>
                  <th rowSpan={2} className="bg-[#fdbb84] text-slate-950 font-black p-2 text-center border-r border-orange-300 text-xs leading-tight w-24 align-middle">
                    <div>TỈ TRỌNG</div>
                    <div>TRẢ CHẬM</div>
                    <div className="text-[9px] font-bold mt-0.5">MIN = 50%</div>
                  </th>
                  <th rowSpan={2} className="bg-[#6366f1] text-white font-black text-xs text-center p-2.5 uppercase tracking-wide align-middle w-28">
                    TIẾN ĐỘ
                  </th>
                </tr>

                {/* Sub Headers */}
                <tr className="text-center text-[11px] uppercase tracking-wider border-b border-slate-300">
                  <th className="p-2 border-r border-slate-300 w-12 text-slate-800 font-black bg-sky-50">STT</th>
                  <th className="p-2 border-r border-slate-300 text-left text-slate-800 font-black bg-sky-50">TỈNH</th>
                  <th data-quick-hide="1" className="p-2 border-r border-slate-300 text-slate-800 font-black bg-sky-50">SỐ ST</th>
                  <th data-quick-hide="1" className="p-2 border-r border-amber-200 text-right bg-amber-100 text-amber-950 font-black">MỤC TIÊU</th>
                  <th data-quick-hide="1" className="p-2 border-r border-amber-200 text-right bg-amber-100 text-amber-950 font-black">THỰC HIỆN</th>
                  <th data-quick-hide="1" className="p-2 border-r border-yellow-200 text-right bg-yellow-100 text-yellow-950 font-black">THỰC HIỆN</th>
                </tr>
              </thead>

              <tbody>
                {provinceSummaryRows.length > 0 ? (
                  provinceSummaryRows.map((row, idx) => {
                    const projAchieved = thoiGianSdPercent > 0 ? Math.round(row.achievedDt / (thoiGianSdPercent / 100)) : row.achievedDt;
                    const projRate = thoiGianSdPercent > 0 ? (row.rateDt / (thoiGianSdPercent / 100)) : row.rateDt;
                    const isQdRed = row.qdEff < 50.0;
                    const isTcRed = row.tcRatio < 50.0;

                    return (
                      <tr
                        key={row.tinh}
                        className={`border-b border-slate-200 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                        } hover:bg-amber-50/40`}
                      >
                        <td className="p-2.5 text-center font-bold text-slate-500 border-r border-slate-200">#{idx + 1}</td>
                        <td className="p-2.5 font-black text-slate-900 border-r border-slate-200">{row.tinh}</td>
                        <td data-quick-hide="1" className="p-2.5 text-center font-bold text-slate-700 border-r border-slate-200">{row.storesCount} ST</td>
                        <td data-quick-hide="1" className="p-2.5 text-right font-mono font-bold text-slate-700 border-r border-slate-200">{row.targetDt.toLocaleString('vi-VN')}</td>
                        <td data-quick-hide="1" className="p-2.5 text-right font-mono font-black text-emerald-700 border-r border-slate-200">{row.achievedDt.toLocaleString('vi-VN')}</td>
                        <td className="p-2.5 text-center border-r border-slate-200">
                          <span className={`px-2 py-0.5 rounded-md font-black text-xs inline-block ${row.rateDt >= 100 ? 'bg-emerald-100 text-emerald-900' : row.rateDt >= 80 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'}`}>
                            {Math.round(row.rateDt)}%
                          </span>
                        </td>
                        <td data-quick-hide="1" className="p-2.5 text-right font-mono font-bold text-slate-700 border-r border-slate-200">{projAchieved.toLocaleString('vi-VN')}</td>
                        <td className="p-2.5 text-center border-r border-slate-200">
                          <span className={`px-2 py-0.5 rounded-md font-black text-xs inline-block ${projRate >= 100 ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-900'}`}>
                            {Math.round(projRate)}%
                          </span>
                        </td>
                        <td className={`p-2.5 text-center border-r border-slate-200 font-mono font-bold ${isQdRed ? 'text-[#dc2626]' : 'text-slate-900'}`}>
                          {Math.round(row.qdEff)}%
                        </td>
                        <td className={`p-2.5 text-center border-r border-slate-200 font-mono font-bold ${isTcRed ? 'text-[#dc2626]' : 'text-slate-900'}`}>
                          {Math.round(row.tcRatio)}%
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-800">
                          {row.reachedStoresCount} / {row.storesCount}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400 font-bold text-xs">
                      Không tìm thấy dữ liệu nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* SUMMARY TOTAL ROW AT BOTTOM */}
              {provinceSummaryRows.length > 0 && (
                <tfoot className="border-t-2 border-slate-300">
                  <tr className="bg-slate-800 text-white font-black text-xs shadow-xs">
                    <td colSpan={2} className="p-3 text-center uppercase tracking-wider text-amber-400 border-r border-slate-700 font-black">TỔNG</td>
                    <td data-quick-hide="1" className="p-3 text-center border-r border-slate-700 text-slate-200 font-bold">{totalSummary.totalStores} ST</td>
                    <td data-quick-hide="1" className="p-3 text-right font-mono text-slate-200 border-r border-slate-700">{totalSummary.totalTargetDt.toLocaleString('vi-VN')}</td>
                    <td data-quick-hide="1" className="p-3 text-right font-mono text-emerald-400 font-black border-r border-slate-700">{totalSummary.totalAchievedDt.toLocaleString('vi-VN')}</td>
                    <td className="p-3 text-center border-r border-slate-700">
                      <span className={`px-2.5 py-0.5 rounded-md font-black ${totalSummary.totalRateDt >= 100 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-slate-950'}`}>
                        {Math.round(totalSummary.totalRateDt)}%
                      </span>
                    </td>
                    <td data-quick-hide="1" className="p-3 text-right font-mono text-slate-200 border-r border-slate-700">
                      {(thoiGianSdPercent > 0 ? Math.round(totalSummary.totalAchievedDt / (thoiGianSdPercent / 100)) : totalSummary.totalAchievedDt).toLocaleString('vi-VN')}
                    </td>
                    <td className="p-3 text-center border-r border-slate-700">
                      <span className="px-2.5 py-0.5 rounded-md font-black bg-blue-500 text-white">
                        {Math.round(thoiGianSdPercent > 0 ? (totalSummary.totalRateDt / (thoiGianSdPercent / 100)) : totalSummary.totalRateDt)}%
                      </span>
                    </td>
                    <td className={`p-3 text-center border-r border-slate-700 font-mono font-bold ${totalSummary.totalQdEff < 50 ? 'text-[#f87171]' : 'text-amber-300'}`}>
                      {Math.round(totalSummary.totalQdEff)}%
                    </td>
                    <td className={`p-3 text-center border-r border-slate-700 font-mono font-bold ${totalSummary.totalTcRatio < 50 ? 'text-[#f87171]' : 'text-amber-300'}`}>
                      {Math.round(totalSummary.totalTcRatio)}%
                    </td>
                    <td className="p-3 text-center text-amber-300 font-bold">{totalSummary.reachedStoresCount} / {totalSummary.totalStores}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          /* STORE LEVEL TABLE (TAB SIÊU THỊ) */
          <div className="space-y-3">
            <div className="overflow-x-auto select-none border border-slate-200 rounded-2xl shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  {/* Group Band Headers */}
                  <tr>
                    <th colSpan={6} className="bg-[#0284c7] text-white font-black text-xs text-center p-2.5 border-r border-sky-600 uppercase tracking-wide">
                      SIÊU THỊ
                    </th>
                    <th colSpan={3} className="bg-[#fbb040] text-slate-950 font-black text-xs text-center p-2.5 border-r border-amber-500/40 uppercase tracking-wide">
                      <div>{timeMode === 'realtime' ? 'MỤC TIÊU HÔM NAY =' : 'MỤC TIÊU THÁNG ='}</div>
                      <div className="text-[10px] font-bold">{targetSubHeaderStr}</div>
                    </th>
                    <th colSpan={2} className="bg-[#fde047] text-slate-950 font-black text-xs text-center p-2.5 border-r border-amber-300 uppercase tracking-wide">
                      <div>DỰ KIẾN HẾT {timeMode === 'realtime' ? 'NGÀY' : 'THÁNG'}</div>
                      <div className="text-[9.5px] font-bold">THEO TỈ TRỌNG TỪNG GIỜ</div>
                    </th>
                    <th rowSpan={2} className="bg-[#fbb040] text-slate-950 font-black p-2 text-center border-r border-amber-500/40 text-xs leading-tight w-24 align-middle">
                      <div>HIỆU QUẢ</div>
                      <div>QUY ĐỔI</div>
                      <div className="text-[9px] font-bold mt-0.5">MIN = 50%</div>
                    </th>
                    <th rowSpan={2} className="bg-[#fdbb84] text-slate-950 font-black p-2 text-center border-r border-orange-300 text-xs leading-tight w-24 align-middle">
                      <div>TỈ TRỌNG</div>
                      <div>TRẢ CHẬM</div>
                      <div className="text-[9px] font-bold mt-0.5">MIN = 50%</div>
                    </th>
                    <th rowSpan={2} className="bg-[#10b981] text-slate-950 font-black text-xs text-center p-2.5 uppercase tracking-wide align-middle w-28">
                      DT TRẢ GÓP
                    </th>
                  </tr>

                  {/* Sub Headers */}
                  <tr className="text-center text-[11px] uppercase tracking-wider border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300 w-12 text-slate-800 font-black bg-sky-50">STT</th>
                    <th className="p-2 border-r border-slate-300 text-left text-slate-800 font-black bg-sky-50">TỈNH</th>
                    <th className="p-2 border-r border-slate-300 text-left text-slate-800 font-black bg-sky-50">SIÊU THỊ</th>
                    <th className="p-2 border-r border-slate-300 text-slate-800 font-black bg-sky-50">BOSS</th>
                    <th className="p-2 border-r border-slate-300 w-16 text-slate-800 font-black bg-sky-50">KÊNH</th>
                    <th className="p-2 border-r border-slate-300 text-slate-800 font-black bg-sky-50">PHÂN LOẠI</th>
                    <th onClick={() => handleSort('targetDt')} className="p-2 border-r border-amber-200 text-right bg-amber-100 text-amber-950 font-black cursor-pointer hover:bg-amber-200">
                      MỤC TIÊU
                    </th>
                    <th onClick={() => handleSort('achievedDt')} className="p-2 border-r border-amber-200 text-right bg-amber-100 text-amber-950 font-black cursor-pointer hover:bg-amber-200">
                      THỰC HIỆN
                    </th>
                    <th onClick={() => handleSort('rateDt')} className="p-2 border-r border-amber-200 text-center bg-amber-100 text-amber-950 font-black cursor-pointer hover:bg-amber-200">
                      HOÀN THÀNH
                    </th>
                    <th onClick={() => handleSort('projAchieved')} className="p-2 border-r border-yellow-200 text-right bg-yellow-100 text-yellow-950 font-black cursor-pointer hover:bg-yellow-200">
                      THỰC HIỆN
                    </th>
                    <th onClick={() => handleSort('projRate')} className="p-2 border-r border-yellow-200 text-center bg-yellow-100 text-yellow-950 font-black cursor-pointer hover:bg-yellow-200">
                      HOÀN THÀNH
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedItems.length > 0 ? (
                    paginatedItems.map((s, idx) => {
                      const projAchieved = thoiGianSdPercent > 0 ? Math.round(s.achievedDt / (thoiGianSdPercent / 100)) : s.achievedDt;
                      const projRate = thoiGianSdPercent > 0 ? (s.rateDt / (thoiGianSdPercent / 100)) : s.rateDt;
                      const isQdRed = s.qdEff < 50.0;
                      const isTcRed = s.tcRatio < 50.0;

                      return (
                        <tr
                          key={s.id || s.sieuthi}
                          className={`border-b border-slate-200 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                          } hover:bg-amber-50/40`}
                        >
                          <td className="p-2 text-center font-bold text-slate-500 border-r border-slate-200">
                            {pageSize === -1 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td className="p-2 font-bold text-slate-800 border-r border-slate-200">{s.tinh}</td>
                          <td className="p-2 font-black text-slate-900 border-r border-slate-200">
                            {formatStoreDisplayName(s.sieuthi)}
                          </td>
                          <td className="p-2 font-bold text-slate-700 border-r border-slate-200 text-center">{s.boss}</td>
                          <td className="p-2 font-bold text-slate-700 border-r border-slate-200 text-center">{s.kenh}</td>
                          <td className="p-2 text-center text-[11px] font-bold text-slate-600 border-r border-slate-200">{s.phanLoaiShop}</td>
                          <td className="p-2 text-right font-mono font-bold text-slate-700 border-r border-slate-200">{s.targetDt.toLocaleString('vi-VN')}</td>
                          <td className="p-2 text-right font-mono font-black text-emerald-700 border-r border-slate-200">{s.achievedDt.toLocaleString('vi-VN')}</td>
                          <td className="p-2 text-center border-r border-slate-200">
                            <span className={`px-2 py-0.5 rounded-md font-black text-xs inline-block ${s.rateDt >= 100 ? 'bg-emerald-100 text-emerald-900' : s.rateDt >= 80 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'}`}>
                              {Math.round(s.rateDt)}%
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-700 border-r border-slate-200">{projAchieved.toLocaleString('vi-VN')}</td>
                          <td className="p-2 text-center border-r border-slate-200">
                            <span className={`px-2 py-0.5 rounded-md font-black text-xs inline-block ${projRate >= 100 ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-900'}`}>
                              {Math.round(projRate)}%
                            </span>
                          </td>
                          <td className={`p-2 text-center border-r border-slate-200 font-mono font-bold ${isQdRed ? 'text-[#dc2626]' : 'text-slate-900'}`}>
                            {Math.round(s.qdEff)}%
                          </td>
                          <td className={`p-2 text-center border-r border-slate-200 font-mono font-bold ${isTcRed ? 'text-[#dc2626]' : 'text-slate-900'}`}>
                            {Math.round(s.tcRatio)}%
                          </td>
                          <td className="p-2 text-right font-mono font-black text-amber-700">
                            {s.achievedTc.toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={14} className="p-8 text-center text-slate-400 font-bold text-xs">
                        Không tìm thấy siêu thị nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* SUMMARY TOTAL ROW AT BOTTOM */}
                <tfoot className="border-t-2 border-slate-300">
                  <tr className="bg-slate-800 text-white font-black text-xs shadow-xs">
                    <td colSpan={6} className="p-2.5 text-center text-amber-400 uppercase tracking-wider border-r border-slate-700 font-black">
                      TỔNG
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-200 border-r border-slate-700">{totalSummary.totalTargetDt.toLocaleString('vi-VN')}</td>
                    <td className="p-2.5 text-right font-mono text-emerald-400 font-black border-r border-slate-700">{totalSummary.totalAchievedDt.toLocaleString('vi-VN')}</td>
                    <td className="p-2.5 text-center border-r border-slate-700">
                      <span className={`px-2 py-0.5 rounded-md font-black ${totalSummary.totalRateDt >= 100 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-slate-950'}`}>
                        {Math.round(totalSummary.totalRateDt)}%
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-200 border-r border-slate-700">
                      {(thoiGianSdPercent > 0 ? Math.round(totalSummary.totalAchievedDt / (thoiGianSdPercent / 100)) : totalSummary.totalAchievedDt).toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2.5 text-center border-r border-slate-700">
                      <span className="px-2 py-0.5 rounded-md font-black bg-blue-500 text-white">
                        {Math.round(thoiGianSdPercent > 0 ? (totalSummary.totalRateDt / (thoiGianSdPercent / 100)) : totalSummary.totalRateDt)}%
                      </span>
                    </td>
                    <td className={`p-2.5 text-center border-r border-slate-700 font-mono font-bold ${totalSummary.totalQdEff < 50 ? 'text-[#f87171]' : 'text-amber-300'}`}>
                      {Math.round(totalSummary.totalQdEff)}%
                    </td>
                    <td className={`p-2.5 text-center border-r border-slate-700 font-mono font-bold ${totalSummary.totalTcRatio < 50 ? 'text-[#f87171]' : 'text-amber-300'}`}>
                      {Math.round(totalSummary.totalTcRatio)}%
                    </td>
                    <td className="p-2.5 text-right font-mono text-amber-300 font-black">
                      {totalSummary.totalAchievedTc.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination Controls (Hidden during image export) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 export-hide">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-bold">
                <span>Hiển thị:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <option value={20}>20 dòng / trang</option>
                  <option value={50}>50 dòng / trang</option>
                  <option value={100}>100 dòng / trang</option>
                  <option value={-1}>Tất cả ({sortedItems.length})</option>
                </select>
                <span>Tổng: {sortedItems.length} siêu thị</span>
              </div>

              {pageSize !== -1 && totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs font-black text-amber-900">
                    Trang {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. POPUP NHẬN XÉT DOANH THU & TRẢ CHẬM */}
      {isRemarksModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5 font-black text-base">
                <MessageSquare className="w-5 h-5 text-amber-200" />
                <span>
                  NHẬN XÉT DỮ LIỆU ĐANG LỌC ({entityScope === 'tong' ? 'TỔNG TOÀN VÙNG TNB' : entityScope === 'sieuthi' ? 'VÙNG TNB' : currentProvinceTitle ? (currentProvinceTitle.startsWith('TỈNH') ? currentProvinceTitle : `TỈNH ${currentProvinceTitle}`) : 'TOÀN VÙNG TNB'})
                </span>
              </div>
              <button
                onClick={() => setIsRemarksModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Template Selector Tabs & Remark Format Selector */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-extrabold text-slate-700">
                    Chọn mẫu nội dung nhận xét:
                  </label>

                  {/* Khi ở Tab TỔNG hoặc VÙNG: Nhận xét theo Tỉnh, không tag user */}
                  {entityScope === 'tong' || entityScope === 'sieuthi' ? (
                    <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200 text-xs font-bold text-amber-800">
                      <span>📍 Nhận xét theo Tên Tỉnh (Không Tag User)</span>
                    </div>
                  ) : (
                    /* Tùy chọn hiển thị nhận xét: User | Siêu thị | Siêu thị + User */
                    <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
                      {(
                        [
                          { id: 'user', label: 'User' },
                          { id: 'sieuthi', label: 'Siêu thị' },
                          { id: 'sieuthi_user', label: 'Siêu thị + User' },
                          { id: 'no_tag_top', label: 'Bỏ Tag TOP' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setRemarkDisplayMode(opt.id);
                            setCustomRemarkText('');
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            remarkDisplayMode === opt.id
                              ? 'bg-amber-500 text-white shadow-xs font-black'
                              : 'text-slate-600 hover:text-slate-950 hover:bg-white/80'
                          }`}
                        >
                          <span
                            className={`w-3 h-3 rounded-xs border flex items-center justify-center ${
                              remarkDisplayMode === opt.id ? 'border-white bg-white text-amber-600' : 'border-slate-400 bg-white'
                            }`}
                          >
                            {remarkDisplayMode === opt.id && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Template Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
                  <button
                    onClick={() => {
                      setActiveRemarkTemplate('template_1');
                      setCustomRemarkText('');
                    }}
                    className={`py-2 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeRemarkTemplate === 'template_1' && !customRemarkText
                        ? 'bg-white text-amber-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">Mẫu 1: TOP/BOT</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveRemarkTemplate('template_2');
                      setCustomRemarkText('');
                    }}
                    className={`py-2 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeRemarkTemplate === 'template_2' && !customRemarkText
                        ? 'bg-white text-rose-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span className="truncate">Mẫu 2: Cần tăng tốc</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveRemarkTemplate('template_3');
                      setCustomRemarkText('');
                    }}
                    className={`py-2 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeRemarkTemplate === 'template_3' && !customRemarkText
                        ? 'bg-white text-sky-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span className="truncate">Mẫu 3: Đầy đủ / Tóm tắt</span>
                  </button>
                </div>
              </div>

              {/* Text Area Content */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-extrabold text-slate-700">
                    Nội dung nhận xét (tự động theo bộ lọc):
                  </label>
                  {customRemarkText && (
                    <button
                      onClick={() => setCustomRemarkText('')}
                      className="text-[11px] font-bold text-amber-600 hover:underline cursor-pointer"
                    >
                      Khôi phục mẫu gốc
                    </button>
                  )}
                </div>
                <textarea
                  rows={13}
                  value={customRemarkText || generateRevenueRemarks(activeRemarkTemplate, remarkDisplayMode)}
                  onChange={(e) => setCustomRemarkText(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono rounded-2xl p-3.5 focus:outline-hidden focus:ring-2 focus:ring-amber-500 leading-relaxed select-all shadow-inner"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500 font-semibold">Sẵn sàng dán trực tiếp vào Zalo / Line / Teams</span>
              <button
                onClick={handleCopyRemarks}
                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs text-white transition-all shadow-md cursor-pointer ${
                  remarkCopied
                    ? 'bg-emerald-600'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
                }`}
              >
                {remarkCopied ? (
                  <>
                    <Check className="w-4 h-4" /> ĐÃ SAO CHÉP VÀO CLIPBOARD!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> SAO CHÉP NHẬN XÉT
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CẤU HÌNH TARGET DOANH THU */}
      {isTargetConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden transform transition-all animate-scale-in">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black shadow-inner">
                  <Sliders className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight uppercase">Cấu hình Target Doanh Thu</h3>
                  <p className="text-xs text-amber-100 font-medium">Tùy chỉnh nguồn tính Target & hệ số tăng trưởng cho toàn bộ báo cáo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTargetConfigModalOpen(false)}
                className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 text-slate-800 text-xs">
              {/* Option 1: Chọn Nguồn Target */}
              <div className="space-y-2">
                <label className="font-extrabold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  1. Chọn nguồn dữ liệu Target:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Card Mặc Định */}
                  <div
                    onClick={() => setTempTargetConfig((prev) => ({ ...prev, mode: 'default' }))}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      tempTargetConfig.mode === 'default'
                        ? 'border-orange-500 bg-orange-50/60 text-orange-950 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-xs uppercase">Mặc định (BI)</span>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        tempTargetConfig.mode === 'default' ? 'border-orange-600 bg-orange-600' : 'border-slate-300'
                      }`}>
                        {tempTargetConfig.mode === 'default' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Lấy Target chuẩn từ báo cáo BI (Realtime = Target/30, Luỹ kế = Target tháng).
                    </p>
                  </div>

                  {/* Card CK Năm */}
                  <div
                    onClick={() => setTempTargetConfig((prev) => ({ ...prev, mode: 'cung_ky' }))}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      tempTargetConfig.mode === 'cung_ky'
                        ? 'border-orange-500 bg-orange-50/60 text-orange-950 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-xs uppercase">CK Năm</span>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        tempTargetConfig.mode === 'cung_ky' ? 'border-orange-600 bg-orange-600' : 'border-slate-300'
                      }`}>
                        {tempTargetConfig.mode === 'cung_ky' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Lấy theo file Doanh thu cùng kỳ năm (Realtime = Ngày cùng kỳ, Luỹ kế = Cả tháng cùng kỳ).
                    </p>
                    {effectiveRevenueCungKy.length > 0 ? (
                      <span className="mt-2 text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md self-start">
                        ✓ Có sẵn {effectiveRevenueCungKy.length} dòng
                      </span>
                    ) : (
                      <span className="mt-2 text-[10px] text-rose-700 font-bold bg-rose-100/70 px-2 py-0.5 rounded-md self-start">
                        ⚠️ Chưa nạp file cùng kỳ
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Option 2: Hệ số điều chỉnh % */}
              <div className="space-y-2">
                <label className="font-extrabold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  2. Hệ số điều chỉnh Target (%):
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={10}
                      max={500}
                      step={1}
                      value={tempTargetConfig.heSo}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setTempTargetConfig((prev) => ({ ...prev, heSo: isNaN(val) ? 100 : val }));
                      }}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl font-mono text-sm font-black text-slate-900 focus:outline-hidden focus:border-orange-500 focus:bg-white transition-all shadow-inner"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm pointer-events-none">
                      %
                    </span>
                  </div>
                </div>

                {/* Quick select chips */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] text-slate-400 font-semibold mr-1">Gợi ý nhanh:</span>
                  {[100, 110, 120, 130, 150, 180].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setTempTargetConfig((prev) => ({ ...prev, heSo: rate }))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                        tempTargetConfig.heSo === rate
                          ? 'bg-orange-500 text-white border-orange-500 shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      {rate === 100 ? '100% (Gốc)' : `${rate}%`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 italic">
                  * Ví dụ: Nhập 120% thì target Realtime & Luỹ kế đều được x120% (nhân 1.2).
                </p>
              </div>

              {/* Preview Banner */}
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-1.5 text-[11px]">
                <div className="font-extrabold text-amber-900 flex items-center gap-1.5 uppercase">
                  <span>📌 Xem trước công thức hiển thị:</span>
                </div>
                <div className="font-mono text-slate-800 font-bold bg-white/80 p-2 rounded-xl border border-amber-200/80 space-y-1">
                  <div>
                    <span className="text-slate-500">Realtime: </span>
                    <span className="text-amber-800 font-black">
                      MỤC TIÊU HÔM NAY = DTQĐ {tempTargetConfig.mode === 'cung_ky' ? dateInfo.cungKyDayMonthYear : dateInfo.curDayMonthYear} x{tempTargetConfig.heSo}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Luỹ kế: </span>
                    <span className="text-amber-800 font-black">
                      MỤC TIÊU THÁNG = DTQĐ THÁNG {tempTargetConfig.mode === 'cung_ky' ? dateInfo.cungKyMonthYear : dateInfo.curMonthYear} x{tempTargetConfig.heSo}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setTempTargetConfig({ mode: 'default', heSo: 100 })}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục mặc định</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTargetConfigModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetConfig(tempTargetConfig);
                    setIsTargetConfigModalOpen(false);
                    onSaveUserFilters?.({ revenue_target_config: tempTargetConfig });
                  }}
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Lưu & Áp dụng</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
