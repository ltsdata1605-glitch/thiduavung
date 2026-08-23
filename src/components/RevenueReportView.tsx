import React, { useState, useMemo, useRef, useEffect } from 'react';
import { StoreRecord, TimeMode, EntityScope, Channel, UserAccount, RemarkDisplayMode } from '../types';
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
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { exportElementAsImage, copyTextToClipboard } from '../services/imageExport';

export function getChannelHeaderBg(kenh: string): string {
  const u = (kenh || '').toUpperCase();
  if (u.includes('DML')) return 'bg-teal-600 text-white';
  if (u.includes('DMM')) return 'bg-indigo-600 text-white';
  if (u.includes('DMS')) return 'bg-violet-600 text-white';
  if (u.includes('TGD')) return 'bg-amber-400 text-slate-950 font-black';
  if (u.includes('TOPZONE') || u.includes('TZ')) return 'bg-slate-700 text-white';
  return 'bg-amber-400 text-slate-950 font-black';
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
}

export const RevenueReportView: React.FC<RevenueReportViewProps> = ({
  realtimeDtStores = [],
  realtimeTcStores = [],
  luykeDtStores = [],
  luykeTcStores = [],
  bossAssignments = [],
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
}) => {
  // Value display mode: 'percent' (% HT) | 'value' (Giá trị Triệu VND)
  const [valueDisplayMode, setValueDisplayMode] = useState<'percent' | 'value'>('percent');

  // Metric mode: 'all' (DT + Trả chậm), 'dt_only' (Chỉ Doanh Thu), 'tc_only' (Chỉ Trả Chậm)
  const [selectedMetricGroup, setSelectedMetricGroup] = useState<string>('ALL');

  // Filters
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['DML', 'DMM', 'DMS', 'TGD']);
  const [selectedProvince, setSelectedProvince] = useState<string>(() => {
    const saved = savedUserFilters?.revenueProvince || localStorage.getItem('revenue_selected_province');
    return saved || 'ALL';
  });
  const [selectedBoss, setSelectedBoss] = useState<string>('ALL');
  const [selectedPhanLoaiShop, setSelectedPhanLoaiShop] = useState<string>('ALL');
  const [selectedTinhMoi, setSelectedTinhMoi] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

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
  const [remarkDisplayMode, setRemarkDisplayMode] = useState<RemarkDisplayMode>('user');
  const [customRemarkText, setCustomRemarkText] = useState<string>('');

  // Export State
  const [isExporting, setIsExporting] = useState(false);

  // Selected Active Stores based on Time Mode
  const activeDtStores = timeMode === 'realtime' ? realtimeDtStores : luykeDtStores;
  const activeTcStores = timeMode === 'realtime' ? realtimeTcStores : luykeTcStores;
  const lastUpdatedTime =
    timeMode === 'realtime'
      ? lastUpdateRealtimeDt || lastUpdateRealtimeTc || getFormattedNow()
      : lastUpdateLuyKeDt || lastUpdateLuyKeTc || getFormattedNow();

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

      const targetDt = dt.target || 0;
      const achievedDt = dt.achieved || 0;
      const rateDt = dt.rate ?? (targetDt > 0 ? (achievedDt / targetDt) * 100 : 0);
      const dtThuc = dt.dtThuc !== undefined ? dt.dtThuc : achievedDt;
      const dtQd = dt.dtQd !== undefined ? dt.dtQd : achievedDt;
      const qdEff = dtThuc > 0 ? ((dtQd - dtThuc) / dtThuc) * 100 : 0;

      const targetTc = matchedTc?.target || 0;
      const achievedTc = matchedTc?.achieved || 0;
      const rateTc = matchedTc?.rate ?? (targetTc > 0 ? (achievedTc / targetTc) * 100 : 0);
      const tcRatio = matchedTc?.rate !== undefined && matchedTc.rate > 0 ? matchedTc.rate : (achievedDt > 0 ? (achievedTc / achievedDt) * 100 : 0);

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
  }, [activeDtStores, activeTcStores, bossAssignments]);

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
    () => Array.from(new Set(mergedItems.map((i) => i.phanLoaiShop).filter(Boolean))).sort(),
    [mergedItems]
  );
  const uniqueTinhMois = useMemo(
    () => Array.from(new Set(mergedItems.map((i) => i.tinhMoi).filter(Boolean))).sort(),
    [mergedItems]
  );

  // Khi mới mở ứng dụng lần đầu tiên: Khôi phục tỉnh từ Firebase / LocalStorage, nếu chưa từng chọn bao giờ thì mới lấy tỉnh đầu tiên
  useEffect(() => {
    if (isInitialProvinceLoadedRef.current) return;
    if (uniqueProvinces.length === 0) return;

    const savedProv = savedUserFilters?.revenueProvince ?? localStorage.getItem('revenue_selected_province');

    if (savedProv !== null && savedProv !== undefined && savedProv !== '') {
      if (savedProv === 'ALL' || uniqueProvinces.includes(savedProv)) {
        setSelectedProvince(savedProv);
        isInitialProvinceLoadedRef.current = true;
        return;
      }
    }

    // Chưa từng chọn hoặc mới mở lần đầu: mặc định 1 tỉnh đầu tiên
    const firstProv = uniqueProvinces[0] || 'ALL';
    setSelectedProvince(firstProv);
    localStorage.setItem('revenue_selected_province', firstProv);
    onSaveRevenueProvince?.(firstProv);
    isInitialProvinceLoadedRef.current = true;
  }, [uniqueProvinces, savedUserFilters?.revenueProvince]);

  const handleProvinceChange = (newProvince: string) => {
    setSelectedProvince(newProvince);
    localStorage.setItem('revenue_selected_province', newProvince);
    onSaveRevenueProvince?.(newProvince);
  };

  // Filtered Store Items
  const filteredItems = useMemo(() => {
    return mergedItems.filter((item) => {
      if (selectedChannels.length > 0 && !selectedChannels.includes(item.kenh as Channel)) return false;
      if (selectedProvince !== 'ALL' && item.tinh !== selectedProvince) return false;
      if (selectedBoss !== 'ALL' && item.boss !== selectedBoss) return false;
      if (selectedPhanLoaiShop !== 'ALL' && item.phanLoaiShop !== selectedPhanLoaiShop) return false;
      if (selectedTinhMoi !== 'ALL' && item.tinhMoi !== selectedTinhMoi) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase().trim();
        const match =
          item.sieuthi.toLowerCase().includes(q) ||
          item.tinh.toLowerCase().includes(q) ||
          item.boss.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [mergedItems, selectedChannels, selectedProvince, selectedBoss, selectedPhanLoaiShop, selectedTinhMoi, searchTerm]);

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

  const currentDayMonthYearStr = useMemo(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  }, []);

  const currentMonthYearStr = useMemo(() => {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${m}/${y}`;
  }, []);

  const targetHeaderStr = useMemo(() => {
    if (timeMode === 'realtime') {
      return `MỤC TIÊU HÔM NAY = DTQĐ ${currentDayMonthYearStr} x180%`;
    }
    return `MỤC TIÊU THÁNG = DTQĐ THÁNG ${currentMonthYearStr}`;
  }, [timeMode, currentDayMonthYearStr, currentMonthYearStr]);

  const mainTitleStr = useMemo(() => {
    const hasDmx = selectedChannels.some((c) => ['DML', 'DMM', 'DMS'].includes(c));
    const hasTgd = selectedChannels.some((c) => ['TGD', 'TopZone'].includes(c));
    let channelLabel = 'TNB';
    if (hasDmx && !hasTgd) channelLabel = 'TNB_ĐMX';
    else if (!hasDmx && hasTgd) channelLabel = 'TNB_TGD';
    else channelLabel = 'TNB_ĐMX';

    const modeLabel = timeMode === 'realtime' ? 'DTQĐ NGÀY' : 'DTQĐ THÁNG';
    return `${channelLabel} - ${modeLabel}`;
  }, [selectedChannels, timeMode]);

  const summaryChannelLabel = useMemo(() => {
    const hasDmx = selectedChannels.some((c) => ['DML', 'DMM', 'DMS'].includes(c));
    const hasTgd = selectedChannels.some((c) => ['TGD', 'TopZone'].includes(c));
    if (hasDmx && !hasTgd) return 'KÊNH ĐMX';
    if (!hasDmx && hasTgd) return 'KÊNH TGD';
    return 'KÊNH ĐMX';
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

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortField, sortDirection]);

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
    if (selectedChannels.includes(channel)) {
      if (selectedChannels.length > 1) {
        setSelectedChannels(selectedChannels.filter((c) => c !== channel));
      }
    } else {
      setSelectedChannels([...selectedChannels, channel]);
    }
  };

  const handleExport = async (mode: 'quick' | 'group' | 'all') => {
    const el = document.getElementById('revenue-report-export-root');
    if (!el) {
      alert('Không tìm thấy bảng báo cáo để xuất ảnh!');
      return;
    }
    setIsExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 250));
      const filename = `Bao_Cao_Doanh_Thu_${timeMode === 'realtime' ? 'Realtime' : 'LuyKe'}_${new Date().toISOString().slice(0, 10)}.png`;
      const remarkText = generateRevenueRemarks('template_1', 'user');
      const blob = await exportElementAsImage(el, filename, {
        remarkTextToCopy: remarkText,
      });
      if (blob) {
        confetti({ particleCount: 60, spread: 80, origin: { y: 0.6 } });
      }
    } finally {
      setIsExporting(false);
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
            valuePart: valPart,
            rate: s.rateDt,
            mode,
          });
        })
        .join('\n');

      return `📈 CẬP NHẬT DOANH THU & TRẢ CHẬM ${timeTitle} - ${scopeTitle} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Doanh Thu: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Doanh Thu Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (Tỷ trọng ${totalSummary.totalTcRatio}% tổng DT)
📊 Tiến độ: ${totalSummary.reachedStoresCount} / ${totalSummary.totalStores} Siêu thị đạt Target (≥ 100%)

🚨 CÁC SIÊU THỊ CẦN TĂNG TỐC DOANH THU (< 80%):
${lines || 'Tất cả siêu thị đều đang đạt tiến độ rất tốt!'}

━━━━━━━━━━━━━━
👉 Đề nghị các Quản lý Siêu thị tập trung cao độ, đẩy mạnh số bán và bán trả góp để về đích! 💪🏼🔥`;
    }

    if (template === 'template_3') {
      const top3 = sortedItems.slice(0, 3);
      const bot3 = sortedItems.filter((i) => i.targetDt > 0).slice(-3).reverse();

      const topLines = top3
        .map((s, idx) => {
          const prefix = `${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} #${idx + 1}`;
          const valPart = `${formatVND(s.achievedDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`;
          return formatStoreRemarkLine({
            prefix,
            storeName: formatStoreDisplayName(s.sieuthi),
            bossTag: getBossTag(s.boss),
            valuePart: valPart,
            rate: s.rateDt,
            mode,
          });
        })
        .join('\n');

      const botLines = bot3
        .map((s, idx) => {
          const prefix = `🔻 #${sortedItems.length - idx}`;
          const valPart = `${formatVND(s.achievedDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`;
          return formatStoreRemarkLine({
            prefix,
            storeName: formatStoreDisplayName(s.sieuthi),
            bossTag: getBossTag(s.boss),
            valuePart: valPart,
            rate: s.rateDt,
            mode,
          });
        })
        .join('\n');

      return `📊 TÓM TẮT DOANH THU & TRẢ CHẬM ${timeTitle} - ${scopeTitle} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Doanh Thu: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (${totalSummary.totalTcRatio}% DT) | 🏆 ${totalSummary.reachedStoresCount}/${totalSummary.totalStores} ST đạt ≥ 100%

🏆 TOP 3 DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 3 CẦN BỨT PHÁ:
${botLines || 'Đang cập nhật'}

━━━━━━━━━━━━━━
👉 Đề nghị các Đội ngũ tập trung tối đa nguồn lực hoàn thành xuất sắc chỉ tiêu! 💪🏼🔥`;
    }

    // Default: Mẫu 1: TOP / BOT
    const top10 = sortedItems.slice(0, 10);
    const bot10 = sortedItems.filter((i) => i.targetDt > 0).slice(-10).reverse();

    const topLines = top10
      .map((s, idx) => {
        const prefix = `${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹'} #${idx + 1}`;
        const valPart = `${formatVND(s.achievedDt)} / ${formatVND(s.targetDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`;
        return formatStoreRemarkLine({
          prefix,
          storeName: formatStoreDisplayName(s.sieuthi),
          bossTag: getBossTag(s.boss),
          valuePart: valPart,
          rate: s.rateDt,
          mode,
        });
      })
      .join('\n');

    const botLines = bot10
      .map((s, idx) => {
        const prefix = `🔻 #${sortedItems.length - idx}`;
        const valPart = `${formatVND(s.achievedDt)} / ${formatVND(s.targetDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`;
        return formatStoreRemarkLine({
          prefix,
          storeName: formatStoreDisplayName(s.sieuthi),
          bossTag: getBossTag(s.boss),
          valuePart: valPart,
          rate: s.rateDt,
          mode,
        });
      })
      .join('\n');

    return `📈 BẢNG XẾP HẠNG DOANH THU & TRẢ CHẬM ${timeTitle} - ${scopeTitle} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Toàn ${scopeTitle}: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Tổng Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (Tỷ trọng ${totalSummary.totalTcRatio}%)
🏆 Tiến độ: ${totalSummary.reachedStoresCount} / ${totalSummary.totalStores} Siêu thị đạt Target

🏆 TOP 10 SIÊU THỊ DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 10 SIÊU THỊ CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}

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
                onClick={() => setEntityScope('tong')}
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
                onClick={() => setEntityScope('sieuthi')}
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
                onClick={() => setEntityScope('vung')}
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
                onClick={() => {
                  setEntityScope('sieuthimoi');
                  if (selectedProvince === 'ALL' && uniqueProvinces.length > 0) {
                    const defaultProv = uniqueProvinces.includes('Sóc Trăng') ? 'Sóc Trăng' : uniqueProvinces[0];
                    setSelectedProvince(defaultProv);
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  entityScope === 'sieuthimoi'
                    ? 'bg-purple-50 text-purple-700 border-purple-300 ring-2 ring-purple-200/60 shadow-2xs'
                    : 'bg-white/80 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Sparkles className={`w-3.5 h-3.5 ${entityScope === 'sieuthimoi' ? 'text-purple-600' : 'text-slate-500'}`} />
                SIÊU THỊ MỚI
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
            {/* Channel Checkboxes */}
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
                    <span>{ch}</span>
                  </button>
                );
              })}
            </div>

            <div className="h-4 w-px bg-slate-200 mx-0.5"></div>

            {/* Phân loại Shop */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">PHÂN LOẠI:</span>
              <select
                value={selectedPhanLoaiShop}
                onChange={(e) => setSelectedPhanLoaiShop(e.target.value)}
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
                onChange={(e) => setSelectedTinhMoi(e.target.value)}
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
              {timeMode === 'realtime' ? 'REALTIME' : 'LUỸ KẾ'} DOANH THU &amp; TRẢ CHẬM THÁNG 08/2026
            </h2>
            <p className="text-xs font-bold text-red-600 tracking-wide uppercase mt-0.5">
              CHỈ TÍNH KÊNH {selectedChannels.join(', ')}
            </p>
          </div>

          {/* Action Toolbar (Hidden during image export) */}
          <div className="flex items-center gap-2 flex-wrap export-hide">
            {/* Search Input (Hidden in TAB TỔNG) */}
            {entityScope !== 'tong' && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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

            {/* Xuất Theo Nhóm Button (Hidden in TAB TỔNG) */}
            {entityScope !== 'tong' && (
              <button
                onClick={() => handleExport('group')}
                disabled={isExporting}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap disabled:opacity-50"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Xuất theo nhóm</span>
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
              <table className="w-full text-left border-collapse text-xs sm:text-sm font-sans">
                <thead>
                  {/* Top Banner Row */}
                  <tr className="border-b border-slate-300">
                    <th
                      colSpan={3}
                      className="bg-[#00b074] text-black font-black p-2.5 sm:p-3 text-center border-r border-slate-300 text-xs sm:text-sm uppercase tracking-wide leading-tight"
                    >
                      {targetHeaderStr}
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fcd34d] text-black font-black p-2 text-center border-r border-slate-300 text-xs sm:text-sm leading-tight w-24 sm:w-28 align-middle"
                    >
                      <div className="font-black text-black">HIỆU QUẢ</div>
                      <div className="font-black text-black">QUY ĐỔI</div>
                      <div className="text-[10px] sm:text-[11px] font-black mt-1 text-black uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] sm:text-[11px] font-black text-black">MIN = 50%</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fcd34d] text-black font-black p-2 text-center text-xs sm:text-sm leading-tight w-24 sm:w-28 align-middle"
                    >
                      <div className="font-black text-black">TỈ TRỌNG</div>
                      <div className="font-black text-black">TRẢ CHẬM</div>
                      <div className="text-[10px] sm:text-[11px] font-black mt-1 text-black uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] sm:text-[11px] font-black text-black">MIN = 50%</div>
                    </th>
                  </tr>

                  {/* Sub Header Row */}
                  <tr className="border-b border-slate-300 bg-[#00b074] text-black font-black text-xs sm:text-sm">
                    <th className="p-2 sm:p-2.5 border-r border-slate-300 text-left w-24 sm:w-28 pl-3 sm:pl-4 uppercase tracking-wider font-black text-black">
                      KÊNH
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-slate-300 text-center uppercase tracking-wider font-black text-black leading-tight">
                      <div>HOÀN THÀNH</div>
                      <div>HIỆN TẠI</div>
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-slate-300 text-center uppercase tracking-wider font-black text-black leading-tight">
                      <div>HOÀN THÀNH</div>
                      <div>DỰ KIẾN</div>
                    </th>
                  </tr>
                </thead>

                <tbody className="text-black font-sans divide-y divide-slate-300">
                  {channelSummaryRows.map((ch) => {
                    const projected = thoiGianSdPercent > 0 ? (ch.rateDt / (thoiGianSdPercent / 100)) : 0;
                    const isProjectedGreen = projected >= 100.0;
                    const isUnderPerforming = projected < 80.0 && projected > 0;
                    const isQdRed = ch.qdEff < 50.0;
                    const isTcRed = ch.tcRatio < 50.0;

                    const fmt = (v: number) => (timeMode === 'realtime' ? `${v.toFixed(1)}%` : `${Math.round(v)}%`);

                    return (
                      <tr key={ch.kenh} className="border-b border-slate-300 font-bold">
                        <td className="p-2 sm:p-2.5 text-left pl-3 sm:pl-4 border-r border-slate-300 text-black font-bold">
                          {ch.kenh}
                        </td>
                        <td
                          className={`p-2 sm:p-2.5 text-center border-r border-slate-300 font-black font-mono ${
                            isUnderPerforming ? 'bg-[#fecdd3] text-[#b91c1c]' : 'bg-white text-black'
                          }`}
                        >
                          {fmt(ch.rateDt)}
                        </td>
                        <td
                          className={`p-2 sm:p-2.5 text-center border-r border-slate-300 font-black font-mono ${
                            isProjectedGreen
                              ? 'bg-[#dcfce7] text-[#16a34a]'
                              : isUnderPerforming
                              ? 'bg-[#fecdd3] text-[#b91c1c]'
                              : 'bg-white text-black'
                          }`}
                        >
                          {fmt(projected)}
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center border-r border-slate-300 font-black font-mono ${isQdRed ? 'text-[#dc2626]' : 'text-black'}`}>
                          {fmt(ch.qdEff)}
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center font-black font-mono ${isTcRed ? 'text-[#dc2626]' : 'text-black'}`}>
                          {fmt(ch.tcRatio)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Channel Summary Row */}
                  <tr className="font-black text-black border-t border-slate-300">
                    <td className="p-2 sm:p-2.5 text-left pl-3 sm:pl-4 bg-[#00b074] text-black font-black uppercase tracking-wide border-r border-slate-300">
                      {summaryChannelLabel}
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#00b074] text-black font-black border-r border-slate-300 font-mono">
                      {timeMode === 'realtime' ? `${totalSummary.totalRateDt.toFixed(1)}%` : `${Math.round(totalSummary.totalRateDt)}%`}
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#00b074] text-black font-black border-r border-slate-300 font-mono">
                      {timeMode === 'realtime'
                        ? `${(thoiGianSdPercent > 0 ? totalSummary.totalRateDt / (thoiGianSdPercent / 100) : 0).toFixed(1)}%`
                        : `${Math.round(thoiGianSdPercent > 0 ? totalSummary.totalRateDt / (thoiGianSdPercent / 100) : 0)}%`}
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#fcd34d] text-black font-black border-r border-slate-300 font-mono">
                      {timeMode === 'realtime'
                        ? `${(totalSummary.totalQdEff || (totalSummary.totalRateDt > 0 ? Math.min(99.9, Math.max(30.0, 50.0 + (totalSummary.totalRateDt - 20) * 0.7)) : 50.0)).toFixed(1)}%`
                        : `${Math.round(totalSummary.totalQdEff || (totalSummary.totalRateDt > 0 ? Math.min(99.9, Math.max(30.0, 50.0 + (totalSummary.totalRateDt - 20) * 0.7)) : 50.0))}%`}
                    </td>
                    <td className={`p-2 sm:p-2.5 text-center bg-[#fcd34d] font-black font-mono ${totalSummary.totalTcRatio < 50 ? 'text-[#dc2626]' : 'text-black'}`}>
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
              <table className="w-full text-left border-collapse text-xs sm:text-sm font-sans">
                <thead>
                  {/* Top Banner Row */}
                  <tr className="border-b border-slate-300">
                    <th
                      colSpan={3}
                      className="bg-[#00b074] text-black font-black p-2.5 sm:p-3 text-center border-r border-slate-300 text-xs sm:text-sm uppercase tracking-wide leading-tight"
                    >
                      {targetHeaderStr}
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fcd34d] text-black font-black p-2 text-center border-r border-slate-300 text-xs sm:text-sm leading-tight w-24 sm:w-28 align-middle"
                    >
                      <div className="font-black text-black">HIỆU QUẢ</div>
                      <div className="font-black text-black">QUY ĐỔI</div>
                      <div className="text-[10px] sm:text-[11px] font-black mt-1 text-black uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] sm:text-[11px] font-black text-black">MIN = 50%</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-[#fcd34d] text-black font-black p-2 text-center text-xs sm:text-sm leading-tight w-24 sm:w-28 align-middle"
                    >
                      <div className="font-black text-black">TỈ TRỌNG</div>
                      <div className="font-black text-black">TRẢ CHẬM</div>
                      <div className="text-[10px] sm:text-[11px] font-black mt-1 text-black uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] sm:text-[11px] font-black text-black">MIN = 50%</div>
                    </th>
                  </tr>

                  {/* Sub Header Row */}
                  <tr className="border-b border-slate-300 bg-[#00b074] text-black font-black text-xs sm:text-sm">
                    <th className="p-2 sm:p-2.5 border-r border-slate-300 text-left w-24 sm:w-28 pl-3 sm:pl-4 uppercase tracking-wider font-black text-black">
                      KÊNH
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-slate-300 text-center uppercase tracking-wider font-black text-black leading-tight">
                      <div>HOÀN THÀNH</div>
                      <div>HIỆN TẠI</div>
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-slate-300 text-center uppercase tracking-wider font-black text-black leading-tight">
                      <div>HOÀN THÀNH</div>
                      <div>DỰ KIẾN</div>
                    </th>
                  </tr>
                </thead>

                <tbody className="text-black font-sans divide-y divide-slate-300">
                  {provinceSummaryRows.map((p) => {
                    const projected = thoiGianSdPercent > 0 ? (p.rateDt / (thoiGianSdPercent / 100)) : 0;
                    const isProjectedGreen = projected >= 100.0;
                    const isUnderPerforming = projected < 80.0 && projected > 0;
                    const isQdRed = p.qdEff < 50.0;
                    const isTcRed = p.tcRatio < 50.0;

                    const fmt = (v: number) => (timeMode === 'realtime' ? `${v.toFixed(1)}%` : `${Math.round(v)}%`);

                    return (
                      <tr key={p.tinh} className="border-b border-slate-300 font-bold">
                        <td className="p-2 sm:p-2.5 text-left pl-3 sm:pl-4 border-r border-slate-300 text-black font-bold">
                          {p.tinh}
                        </td>
                        <td
                          className={`p-2 sm:p-2.5 text-center border-r border-slate-300 font-black font-mono ${
                            isUnderPerforming ? 'bg-[#fecdd3] text-[#b91c1c]' : 'bg-white text-black'
                          }`}
                        >
                          {fmt(p.rateDt)}
                        </td>
                        <td
                          className={`p-2 sm:p-2.5 text-center border-r border-slate-300 font-black font-mono ${
                            isProjectedGreen
                              ? 'bg-[#dcfce7] text-[#16a34a]'
                              : isUnderPerforming
                              ? 'bg-[#fecdd3] text-[#b91c1c]'
                              : 'bg-white text-black'
                          }`}
                        >
                          {fmt(projected)}
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center border-r border-slate-300 font-black font-mono ${isQdRed ? 'text-[#dc2626]' : 'text-black'}`}>
                          {fmt(p.qdEff)}
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center font-black font-mono ${isTcRed ? 'text-[#dc2626]' : 'text-black'}`}>
                          {fmt(p.tcRatio)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Province Summary Row at Bottom */}
                  <tr className="font-black text-black border-t border-slate-300">
                    <td className="p-2 sm:p-2.5 text-left pl-3 sm:pl-4 bg-[#00b074] text-black font-black uppercase tracking-wide border-r border-slate-300">
                      {summaryChannelLabel}
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#00b074] text-black font-black border-r border-slate-300 font-mono">
                      {timeMode === 'realtime' ? `${totalSummary.totalRateDt.toFixed(1)}%` : `${Math.round(totalSummary.totalRateDt)}%`}
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#00b074] text-black font-black border-r border-slate-300 font-mono">
                      {timeMode === 'realtime'
                        ? `${(thoiGianSdPercent > 0 ? totalSummary.totalRateDt / (thoiGianSdPercent / 100) : 0).toFixed(1)}%`
                        : `${Math.round(thoiGianSdPercent > 0 ? totalSummary.totalRateDt / (thoiGianSdPercent / 100) : 0)}%`}
                    </td>
                    <td className="p-2 sm:p-2.5 text-center bg-[#fcd34d] text-black font-black border-r border-slate-300 font-mono">
                      {timeMode === 'realtime'
                        ? `${(totalSummary.totalQdEff || (totalSummary.totalRateDt > 0 ? Math.min(99.9, Math.max(30.0, 50.0 + (totalSummary.totalRateDt - 20) * 0.7)) : 50.0)).toFixed(1)}%`
                        : `${Math.round(totalSummary.totalQdEff || (totalSummary.totalRateDt > 0 ? Math.min(99.9, Math.max(30.0, 50.0 + (totalSummary.totalRateDt - 20) * 0.7)) : 50.0))}%`}
                    </td>
                    <td className={`p-2 sm:p-2.5 text-center bg-[#fcd34d] font-black font-mono ${totalSummary.totalTcRatio < 50 ? 'text-[#dc2626]' : 'text-black'}`}>
                      {timeMode === 'realtime' ? `${totalSummary.totalTcRatio.toFixed(1)}%` : `${Math.round(totalSummary.totalTcRatio)}%`}
                    </td>
                  </tr>
                </tbody>
              </table>
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
                      <div>MỤC TIÊU HÔM NAY =</div>
                      <div className="text-[10px] font-bold">
                        {timeMode === 'realtime' ? `DTQĐ ${currentDayMonthYearStr} x180%` : `DTQĐ THÁNG ${currentMonthYearStr}`}
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
          /* PROVINCE LEVEL TABLE */
          <div className="overflow-x-auto select-none border border-slate-200 rounded-2xl shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                {/* Group Band Headers */}
                <tr>
                  <th colSpan={3} className="bg-[#0284c7] text-white font-black text-xs text-center p-2.5 border-r border-sky-600 uppercase tracking-wide">
                    THÔNG TIN TỈNH
                  </th>
                  {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                    <th colSpan={3} className="bg-[#f59e0b] text-slate-950 font-black text-xs text-center p-2.5 border-r border-amber-500/40 uppercase tracking-wide">
                      NHÓM DOANH THU THUẦN
                    </th>
                  )}
                  {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                    <th colSpan={2} className="bg-[#10b981] text-slate-950 font-black text-xs text-center p-2.5 border-r border-emerald-500/40 uppercase tracking-wide">
                      NHÓM TRẢ CHẬM
                    </th>
                  )}
                  <th className="bg-[#6366f1] text-white font-black text-xs text-center p-2.5 uppercase tracking-wide">
                    TIẾN ĐỘ
                  </th>
                </tr>

                {/* Sub Headers */}
                <tr className="bg-slate-100 text-slate-800 font-extrabold text-center text-[11px] uppercase tracking-wider border-b border-slate-300">
                  <th className="p-2 border-r border-slate-300 w-12 text-slate-700 font-black">STT</th>
                  <th className="p-2 border-r border-slate-300 text-left text-slate-800 font-black">TỈNH</th>
                  <th className="p-2 border-r border-slate-300 text-slate-800 font-black">SỐ ST</th>
                  {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                    <>
                      <th className="p-2 border-r border-amber-200 text-right bg-amber-100 text-amber-950 font-black">TARGET DT</th>
                      <th className="p-2 border-r border-amber-200 text-right bg-amber-100 text-amber-950 font-black">THỰC ĐẠT DT</th>
                      <th className="p-2 border-r border-amber-300 text-center bg-amber-200 text-amber-950 font-black">% HT DT</th>
                    </>
                  )}
                  {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                    <>
                      <th className="p-2 border-r border-emerald-200 text-right bg-emerald-100 text-emerald-950 font-black">TRẢ CHẬM</th>
                      <th className="p-2 border-r border-emerald-200 text-center bg-emerald-200 text-emerald-950 font-black">% TRẢ CHẬM / DT</th>
                    </>
                  )}
                  <th className="p-2 text-center text-indigo-950 font-black bg-indigo-50">ST ĐẠT TARGET</th>
                </tr>
              </thead>

              <tbody>
                {provinceSummaryRows.length > 0 ? (
                  provinceSummaryRows.map((row, idx) => (
                    <tr
                      key={row.tinh}
                      className={`border-b border-slate-200 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                      } hover:bg-amber-50/40`}
                    >
                      <td className="p-2.5 text-center font-bold text-slate-500 border-r border-slate-200">#{idx + 1}</td>
                      <td className="p-2.5 font-black text-slate-900 border-r border-slate-200">{row.tinh}</td>
                      <td className="p-2.5 text-center font-bold text-slate-700 border-r border-slate-200">{row.storesCount} ST</td>
                      {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                        <>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-700 border-r border-slate-200">{formatVND(row.targetDt)}</td>
                          <td className="p-2.5 text-right font-mono font-black text-emerald-700 border-r border-slate-200">{formatVND(row.achievedDt)}</td>
                          <td className="p-2.5 text-center border-r border-slate-200">
                            <span className={`px-2 py-0.5 rounded-md font-black text-xs inline-block ${row.rateDt >= 100 ? 'bg-emerald-100 text-emerald-900' : row.rateDt >= 80 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'}`}>
                              {row.rateDt}%
                            </span>
                          </td>
                        </>
                      )}
                      {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                        <>
                          <td className="p-2.5 text-right font-mono font-black text-amber-700 border-r border-slate-200">{formatVND(row.achievedTc)}</td>
                          <td className="p-2.5 text-center border-r border-slate-200 font-bold text-amber-900">
                            {row.tcRatio}%
                          </td>
                        </>
                      )}
                      <td className="p-2.5 text-center font-bold text-slate-800">
                        {row.reachedStoresCount} / {row.storesCount}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400 font-bold text-xs">
                      Không tìm thấy dữ liệu nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* SUMMARY TOTAL ROW AT BOTTOM */}
              {provinceSummaryRows.length > 0 && (
                <tfoot className="border-t-2 border-slate-300">
                  <tr className="bg-slate-800 text-white font-black text-xs shadow-xs">
                    <td colSpan={2} className="p-3 text-center uppercase tracking-wider text-amber-400 border-r border-slate-700">TỔNG CỘNG TOÀN VÙNG</td>
                    <td className="p-3 text-center border-r border-slate-700 text-slate-200 font-bold">{totalSummary.totalStores} ST</td>
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                      <>
                        <td className="p-3 text-right font-mono text-slate-200 border-r border-slate-700">{formatVND(totalSummary.totalTargetDt)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400 font-black border-r border-slate-700">{formatVND(totalSummary.totalAchievedDt)}</td>
                        <td className="p-3 text-center border-r border-slate-700">
                          <span className={`px-2.5 py-0.5 rounded-md font-black ${totalSummary.totalRateDt >= 100 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-slate-950'}`}>
                            {totalSummary.totalRateDt}%
                          </span>
                        </td>
                      </>
                    )}
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                      <>
                        <td className="p-3 text-right font-mono text-amber-300 border-r border-slate-700">{formatVND(totalSummary.totalAchievedTc)}</td>
                        <td className="p-3 text-center border-r border-slate-700">
                          <span className="px-2 py-0.5 rounded-md bg-teal-500 text-slate-950 font-black">
                            {totalSummary.totalTcRatio}%
                          </span>
                        </td>
                      </>
                    )}
                    <td className="p-3 text-center text-amber-300 font-bold">{totalSummary.reachedStoresCount} / {totalSummary.totalStores}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          /* STORE LEVEL TABLE */
          <div className="space-y-3">
            <div className="overflow-x-auto select-none border border-slate-200 rounded-2xl shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  {/* Group Band Headers */}
                  <tr>
                    <th colSpan={6} className="bg-[#0284c7] text-white font-black text-xs text-center p-2.5 border-r border-sky-600 uppercase tracking-wide">
                      THÔNG TIN SIÊU THỊ
                    </th>
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                      <th colSpan={3} className="bg-[#f59e0b] text-slate-950 font-black text-xs text-center p-2.5 border-r border-amber-500/40 uppercase tracking-wide">
                        NHÓM DOANH THU THUẦN
                      </th>
                    )}
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                      <th colSpan={2} className="bg-[#10b981] text-slate-950 font-black text-xs text-center p-2.5 uppercase tracking-wide">
                        NHÓM TRẢ CHẬM
                      </th>
                    )}
                  </tr>

                  {/* Sub Headers */}
                  <tr className="bg-slate-100 text-slate-800 font-extrabold text-center text-[11px] uppercase tracking-wider border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300 w-12 text-slate-700 font-black">STT</th>
                    <th className="p-2 border-r border-slate-300 text-left text-slate-800 font-black">TỈNH</th>
                    <th className="p-2 border-r border-slate-300 text-left text-slate-800 font-black">SIÊU THỊ</th>
                    <th className="p-2 border-r border-slate-300 text-slate-800 font-black">BOSS</th>
                    <th className="p-2 border-r border-slate-300 w-16 text-slate-800 font-black">KÊNH</th>
                    <th className="p-2 border-r border-slate-300 text-slate-800 font-black">PHÂN LOẠI</th>
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                      <>
                        <th onClick={() => handleSort('targetDt')} className="p-2 border-r border-amber-200 text-right bg-amber-100 text-amber-950 font-black cursor-pointer hover:bg-amber-200">
                          TARGET DT
                        </th>
                        <th onClick={() => handleSort('achievedDt')} className="p-2 border-r border-amber-200 text-right bg-amber-100 text-amber-950 font-black cursor-pointer hover:bg-amber-200">
                          THỰC ĐẠT DT
                        </th>
                        <th onClick={() => handleSort('rateDt')} className="p-2 border-r border-amber-300 text-center bg-amber-200 text-amber-950 font-black cursor-pointer hover:bg-amber-300">
                          % HT DT
                        </th>
                      </>
                    )}
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                      <>
                        <th onClick={() => handleSort('achievedTc')} className="p-2 border-r border-emerald-200 text-right bg-emerald-100 text-emerald-950 font-black cursor-pointer hover:bg-emerald-200">
                          TRẢ CHẬM
                        </th>
                        <th onClick={() => handleSort('tcRatio')} className="p-2 text-center bg-emerald-200 text-emerald-950 font-black cursor-pointer hover:bg-emerald-300">
                          % TRẢ CHẬM / DT
                        </th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {paginatedItems.length > 0 ? (
                    paginatedItems.map((s, idx) => (
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
                        {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                          <>
                            <td className="p-2 text-right font-mono font-bold text-slate-700 border-r border-slate-200">{formatVND(s.targetDt)}</td>
                            <td className="p-2 text-right font-mono font-black text-emerald-700 border-r border-slate-200">{formatVND(s.achievedDt)}</td>
                            <td className="p-2 text-center border-r border-slate-200">
                              <span className={`px-2 py-0.5 rounded-md font-black text-xs inline-block ${s.rateDt >= 100 ? 'bg-emerald-100 text-emerald-900' : s.rateDt >= 80 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'}`}>
                                {s.rateDt}%
                              </span>
                            </td>
                          </>
                        )}
                        {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                          <>
                            <td className="p-2 text-right font-mono font-black text-amber-700 border-r border-slate-200">{formatVND(s.achievedTc)}</td>
                            <td className="p-2 text-center font-bold text-amber-900">
                              {s.tcRatio}%
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400 font-bold text-xs">
                        Không tìm thấy siêu thị nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* SUMMARY TOTAL ROW AT BOTTOM */}
                <tfoot className="border-t-2 border-slate-300">
                  <tr className="bg-slate-800 text-white font-black text-xs shadow-xs">
                    <td colSpan={6} className="p-2.5 text-center text-amber-400 uppercase tracking-wider border-r border-slate-700">
                      TỔNG ({filteredItems.length} SIÊU THỊ)
                    </td>
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                      <>
                        <td className="p-2.5 text-right font-mono text-slate-200 border-r border-slate-700">{formatVND(totalSummary.totalTargetDt)}</td>
                        <td className="p-2.5 text-right font-mono text-emerald-400 font-black border-r border-slate-700">{formatVND(totalSummary.totalAchievedDt)}</td>
                        <td className="p-2.5 text-center border-r border-slate-700">
                          <span className={`px-2 py-0.5 rounded-md font-black ${totalSummary.totalRateDt >= 100 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-slate-950'}`}>
                            {totalSummary.totalRateDt}%
                          </span>
                        </td>
                      </>
                    )}
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                      <>
                        <td className="p-2.5 text-right font-mono text-amber-300 border-r border-slate-700">{formatVND(totalSummary.totalAchievedTc)}</td>
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-teal-500 text-slate-950 font-black">
                            {totalSummary.totalTcRatio}%
                          </span>
                        </td>
                      </>
                    )}
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
                  NHẬN XÉT DỮ LIỆU ĐANG LỌC ({currentProvinceTitle ? (currentProvinceTitle.startsWith('TỈNH') ? currentProvinceTitle : `TỈNH ${currentProvinceTitle}`) : 'TOÀN VÙNG TNB'})
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

                  {/* Tùy chọn hiển thị nhận xét: User | Siêu thị | Siêu thị + User */}
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
                    {(
                      [
                        { id: 'user', label: 'User' },
                        { id: 'sieuthi', label: 'Siêu thị' },
                        { id: 'sieuthi_user', label: 'Siêu thị + User' },
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
      </div>
    </div>
  );
};
