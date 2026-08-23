import React, { useState, useMemo, useRef } from 'react';
import { StoreRecord, TimeMode, EntityScope, Channel, UserAccount } from '../types';
import {
  formatVND,
  formatPercent,
  formatStoreDisplayName,
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
}) => {
  // Value display mode: 'percent' (% HT) | 'value' (Giá trị Triệu VND)
  const [valueDisplayMode, setValueDisplayMode] = useState<'percent' | 'value'>('percent');

  // Metric mode: 'all' (DT + Trả chậm), 'dt_only' (Chỉ Doanh Thu), 'tc_only' (Chỉ Trả Chậm)
  const [selectedMetricGroup, setSelectedMetricGroup] = useState<string>('ALL');

  // Filters
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['DML', 'DMM', 'DMS', 'TGD']);
  const [selectedProvince, setSelectedProvince] = useState<string>('ALL');
  const [selectedBoss, setSelectedBoss] = useState<string>('ALL');
  const [selectedPhanLoaiShop, setSelectedPhanLoaiShop] = useState<string>('ALL');
  const [selectedTinhMoi, setSelectedTinhMoi] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Sorting
  const [sortField, setSortField] = useState<string>('rateDt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Remarks Modal State
  const [isRemarksModalOpen, setIsRemarksModalOpen] = useState(false);
  const [remarkCopied, setRemarkCopied] = useState(false);
  const [activeRemarkTemplate, setActiveRemarkTemplate] = useState<'top_bot' | 'warning' | 'summary'>('top_bot');

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

      const targetTc = matchedTc?.target || 0;
      const achievedTc = matchedTc?.achieved || 0;
      const rateTc = matchedTc?.rate ?? (targetTc > 0 ? (achievedTc / targetTc) * 100 : 0);
      const tcRatio = achievedDt > 0 ? (achievedTc / achievedDt) * 100 : 0;

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
        targetTc: 0,
        achievedTc: 0,
        storesCount: 0,
        reachedStoresCount: 0,
      };

      cur.targetDt += item.targetDt;
      cur.achievedDt += item.achievedDt;
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

        return {
          stt: idx + 1,
          tinh: p.tinh,
          targetDt: p.targetDt,
          achievedDt: p.achievedDt,
          rateDt,
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

    const totalTargetTc = filteredItems.reduce((acc, i) => acc + (i.targetTc || 0), 0);
    const totalAchievedTc = filteredItems.reduce((acc, i) => acc + i.achievedTc, 0);
    const totalRateTc = totalTargetTc > 0 ? Number(((totalAchievedTc / totalTargetTc) * 100).toFixed(1)) : 0;
    const totalTcRatio = totalAchievedDt > 0 ? Number(((totalAchievedTc / totalAchievedDt) * 100).toFixed(1)) : 0;

    const reachedStoresCount = filteredItems.filter((i) => i.rateDt >= 100).length;

    return {
      totalTargetDt,
      totalAchievedDt,
      totalRateDt,
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
        targetTc: 0,
        achievedTc: 0,
        storesCount: 0,
      };
      cur.targetDt += item.targetDt;
      cur.achievedDt += item.achievedDt;
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
        const qdEff = rateDt > 0 ? Number(Math.min(99.9, Math.max(30.0, 50.0 + (rateDt - 20) * 0.7)).toFixed(1)) : 50.0;

        return {
          kenh: ch,
          targetDt: p.targetDt,
          achievedDt: p.achievedDt,
          rateDt,
          targetTc: p.targetTc,
          achievedTc: p.achievedTc,
          tcRatio,
          qdEff,
          storesCount: p.storesCount,
        };
      });
  }, [filteredItems]);

  const { realtimeTimeStr, thoiGianSdPercent } = useMemo(() => {
    if (timeMode === 'luyke') {
      const now = new Date();
      const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const currentDay = now.getDate();
      const pct = Number(((currentDay / totalDays) * 100).toFixed(1));
      return { realtimeTimeStr: `${currentDay}/${totalDays} NGÀY`, thoiGianSdPercent: pct };
    }

    let hours = 12;
    let mins = 0;
    const m = (lastUpdatedTime || '').match(/(\d{1,2}):(\d{1,2})/);
    if (m) {
      hours = parseInt(m[1], 10);
      mins = parseInt(m[2], 10);
    } else {
      const n = new Date();
      hours = n.getHours();
      mins = n.getMinutes();
    }

    const currentMins = hours * 60 + mins;
    const startMins = 7 * 60 + 30; // 07:30
    const endMins = 22 * 60; // 22:00
    const elapsed = Math.max(0, Math.min(endMins - startMins, currentMins - startMins));
    const pct = Number(((elapsed / (endMins - startMins)) * 100).toFixed(1));
    const timeDisplay = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

    return { realtimeTimeStr: timeDisplay, thoiGianSdPercent: pct > 0 ? pct : 30.9 };
  }, [lastUpdatedTime, timeMode]);

  const targetHeaderStr = useMemo(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    if (timeMode === 'realtime') {
      return `MỤC TIÊU HÔM NAY = DTQĐ ${d}/${m}/${y} x180%`;
    }
    return `MỤC TIÊU THÁNG = DTQĐ THÁNG ${m}/${y}`;
  }, [timeMode]);

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

  const realtimeTimeAndDateStr = useMemo(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${realtimeTimeStr} ${d}/${m}`;
  }, [realtimeTimeStr]);

  const currentProvinceTitle = useMemo(() => {
    if (selectedProvince && selectedProvince !== 'ALL') {
      return selectedProvince.toUpperCase();
    }
    if (selectedBoss && selectedBoss !== 'ALL') {
      return `BOSS ${selectedBoss.toUpperCase()}`;
    }
    return 'TOÀN VÙNG TNB';
  }, [selectedProvince, selectedBoss]);

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

        const totalTargetTc = channelStores.reduce((acc, i) => acc + (i.targetTc || 0), 0);
        const totalAchievedTc = channelStores.reduce((acc, i) => acc + i.achievedTc, 0);
        const totalTcRatio = totalAchievedDt > 0 ? Number(((totalAchievedTc / totalAchievedDt) * 100).toFixed(1)) : 0;
        const totalQdEff = totalRateDt > 0 ? Number(Math.min(99.9, Math.max(30.0, 50.0 + (totalRateDt - 20) * 0.7)).toFixed(1)) : 50.0;

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
      const remarkText = generateRevenueRemarks();
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

  const generateRevenueRemarks = (): string => {
    const timeTitle = timeMode === 'realtime' ? 'REALTIME' : 'LUỸ KẾ';
    const scopeTitle =
      selectedProvince !== 'ALL'
        ? `TỈNH ${selectedProvince.toUpperCase()}`
        : selectedBoss !== 'ALL'
        ? `BOSS ${selectedBoss}`
        : 'TOÀN VÙNG TNB';

    if (activeRemarkTemplate === 'warning') {
      const warningStores = sortedItems.filter((i) => i.rateDt < 80 && i.targetDt > 0).slice(0, 15);
      const lines = warningStores
        .map((s, idx) => `⚠️ #${idx + 1} ${formatStoreDisplayName(s.sieuthi)}: ${formatVND(s.achievedDt)} / ${formatVND(s.targetDt)} (${s.rateDt}%) | Trả chậm: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`)
        .join('\n');

      return `📈 CẬP NHẬT DOANH THU & TRẢ CHẬM ${timeTitle} - ${scopeTitle} - ${lastUpdatedTime}
━━━━━━━━━━━━━━
🎯 Target Doanh Thu: ${formatVND(totalSummary.totalTargetDt)} | 💰 Thực đạt: ${formatVND(totalSummary.totalAchievedDt)} (${totalSummary.totalRateDt}%)
💳 Doanh Thu Trả Chậm: ${formatVND(totalSummary.totalAchievedTc)} (Tỷ trọng ${totalSummary.totalTcRatio}% tổng DT)
📊 Tiến độ: ${totalSummary.reachedStoresCount} / ${totalSummary.totalStores} Siêu thị đạt Target (≥ 100%)

🚨 CÁC SIÊU THỊ CẦN TĂNG TỐC DOANH THU:
${lines || 'Tất cả siêu thị đều đang đạt tiến độ rất tốt!'}

━━━━━━━━━━━━━━
👉 Đề nghị các Siêu thị & Tỉnh bám sát số liệu, đẩy mạnh tư vấn trả chậm và bán lẻ để bứt phá mục tiêu! 💪🏼🔥`;
    }

    if (activeRemarkTemplate === 'summary') {
      const top3 = sortedItems.slice(0, 3);
      const bot3 = sortedItems.slice(-3).reverse();

      const topLines = top3
        .map((s, idx) => `${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} #${idx + 1} ${formatStoreDisplayName(s.sieuthi)}: ${formatVND(s.achievedDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`)
        .join('\n');

      const botLines = bot3
        .map((s, idx) => `🔻 #${sortedItems.length - idx} ${formatStoreDisplayName(s.sieuthi)}: ${formatVND(s.achievedDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`)
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

    // Default: TOP / BOT
    const top10 = sortedItems.slice(0, 10);
    const bot10 = sortedItems.filter((i) => i.targetDt > 0).slice(-10).reverse();

    const topLines = top10
      .map((s, idx) => `${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹'} #${idx + 1} ${formatStoreDisplayName(s.sieuthi)}: ${formatVND(s.achievedDt)} / ${formatVND(s.targetDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`)
      .join('\n');

    const botLines = bot10
      .map((s, idx) => `🔻 #${sortedItems.length - idx} ${formatStoreDisplayName(s.sieuthi)}: ${formatVND(s.achievedDt)} / ${formatVND(s.targetDt)} (${s.rateDt}%) | TC: ${formatVND(s.achievedTc)} (${s.tcRatio}%)`)
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
    const txt = generateRevenueRemarks();
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
                onClick={() => setEntityScope('sieuthimoi')}
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
                onChange={(e) => setSelectedProvince(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs hover:border-slate-300"
              >
                <option value="ALL">Tất cả</option>
                {uniqueProvinces.map((pr) => (
                  <option key={pr} value={pr}>{pr}</option>
                ))}
              </select>
            </div>

            {/* Boss */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">BOSS:</span>
              <select
                value={selectedBoss}
                onChange={(e) => setSelectedBoss(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs hover:border-slate-300"
              >
                <option value="ALL">Tất cả</option>
                {uniqueBosses.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Nhóm hiển thị: Tất cả, Doanh thu, Trả chậm */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">CHẾ ĐỘ:</span>
              <select
                value={selectedMetricGroup}
                onChange={(e) => setSelectedMetricGroup(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs hover:border-slate-300"
              >
                <option value="ALL">Tất cả (DT + Trả chậm)</option>
                <option value="DT">Chỉ Doanh Thu</option>
                <option value="TC">Chỉ Trả Chậm</option>
              </select>
            </div>
          </div>

          {/* Right: %HT vs Doanh Thu Value Mode Pill */}
          <div className="flex items-center gap-2 self-start xl:self-auto shrink-0">
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200 text-xs shrink-0 shadow-2xs">
              <button
                type="button"
                onClick={() => setValueDisplayMode('percent')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  valueDisplayMode === 'percent'
                    ? 'bg-blue-600 text-white shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                %HT
              </button>
              <button
                type="button"
                onClick={() => setValueDisplayMode('value')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  valueDisplayMode === 'value'
                    ? 'bg-blue-600 text-white shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Doanh thu
              </button>
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
            {/* Search Input */}
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

            {/* Nhận xét Button */}
            <button
              onClick={() => setIsRemarksModalOpen(true)}
              className="px-3.5 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-800" />
              <span>Nhận xét</span>
            </button>

            {/* Xuất Nhanh Button */}
            <button
              onClick={() => handleExport('quick')}
              disabled={isExporting}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>Xuất nhanh</span>
            </button>

            {/* Xuất Theo Nhóm Button */}
            <button
              onClick={() => handleExport('group')}
              disabled={isExporting}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap disabled:opacity-50"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Xuất theo nhóm</span>
            </button>

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
          /* TAB TỔNG: EXECUTIVE REDESIGNED 2-TABLE VIEW */
          <div className="max-w-2xl mx-auto bg-white border border-slate-300 shadow-md font-sans select-none overflow-hidden rounded-2xl my-2">
            {/* Header: Title */}
            <div className="py-3 px-4 text-center bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 text-white shadow-xs">
              <h1 className="text-xl sm:text-2xl font-black tracking-wider uppercase text-amber-300 drop-shadow-xs">
                {mainTitleStr}
              </h1>
            </div>

            {/* Sub-Header Bar: REALTIME / THỜI GIAN SD */}
            <div className="grid grid-cols-4 border-b border-slate-300 bg-slate-100/90 text-center text-xs sm:text-sm divide-x divide-slate-300 font-sans shadow-2xs">
              <div className="py-2.5 px-3 font-extrabold text-slate-500 uppercase flex items-center justify-center">
                REALTIME :
              </div>
              <div className="py-2.5 px-3 font-black text-indigo-700 flex items-center justify-center font-mono">
                {realtimeTimeStr}
              </div>
              <div className="py-2.5 px-3 font-extrabold text-slate-500 uppercase flex items-center justify-center">
                THỜI GIAN SD :
              </div>
              <div className="py-2.5 px-3 font-black text-emerald-700 flex items-center justify-center font-mono">
                {thoiGianSdPercent}%
              </div>
            </div>

            {/* TABLE 1: THEO KÊNH */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  {/* Top Banner Row */}
                  <tr className="border-b border-slate-300">
                    <th
                      colSpan={3}
                      className="bg-gradient-to-r from-teal-700 to-emerald-700 text-white font-black p-2.5 sm:p-3 text-left border-r border-teal-800/80 text-xs sm:text-sm tracking-tight shadow-inner"
                    >
                      {targetHeaderStr}
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black p-2 text-center border-r border-amber-600 text-xs leading-tight w-28 align-middle shadow-inner"
                    >
                      <div>HIỆU QUẢ</div>
                      <div>QUY ĐỔI</div>
                      <div className="text-[10px] font-extrabold mt-1 text-amber-100 uppercase tracking-wider">MỤC TIÊU</div>
                      <div className="text-[10px] font-extrabold text-amber-100">MIN = 50%</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-gradient-to-b from-orange-500 to-amber-600 text-white font-black p-2 text-center text-xs leading-tight w-28 align-middle shadow-inner"
                    >
                      <div>TỈ TRỌNG</div>
                      <div>TRẢ CHẬM</div>
                      <div className="text-[10px] font-extrabold mt-1 text-orange-100 uppercase tracking-wider">MỤC TIÊU</div>
                      <div className="text-[10px] font-extrabold text-orange-100">MIN = 50%</div>
                    </th>
                  </tr>

                  {/* Sub Header Row for Green Banner */}
                  <tr className="border-b border-slate-300 bg-teal-800 text-teal-50 font-black text-xs">
                    <th className="p-2 sm:p-2.5 border-r border-teal-700/80 text-left w-36 pl-3 sm:pl-4 uppercase tracking-wider">
                      KÊNH
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-teal-700/80 text-center uppercase tracking-wider">
                      <div>HOÀN THÀNH</div>
                      <div>HIỆN TẠI</div>
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-teal-700/80 text-center uppercase tracking-wider">
                      <div>HOÀN THÀNH</div>
                      <div>DỰ KIẾN</div>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 text-slate-900 font-sans">
                  {channelSummaryRows.map((ch, idx) => {
                    const projected = thoiGianSdPercent > 0 ? (ch.rateDt / (thoiGianSdPercent / 100)) : 0;
                    const isCurrentPink = ch.rateDt < 21.0 && ch.rateDt > 0;
                    const isProjectedPink = projected < 80.0 && projected > 0;
                    const isProjectedGreen = projected >= 100.0;
                    const isQdRed = ch.qdEff < 50.0;
                    const isTcRed = ch.tcRatio < 50.0;

                    return (
                      <tr
                        key={ch.kenh}
                        className={`transition-colors border-b border-slate-200 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                        } hover:bg-amber-50/40`}
                      >
                        <td className="p-2.5 sm:p-3 font-black text-left pl-3 sm:pl-4 border-r border-slate-200 text-slate-900">
                          {ch.kenh}
                        </td>
                        <td className="p-2.5 sm:p-3 text-center border-r border-slate-200">
                          <span className={`inline-block px-2 py-0.5 rounded font-black ${
                            isCurrentPink ? 'bg-rose-100 text-rose-800' : 'text-slate-900'
                          }`}>
                            {ch.rateDt.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-2.5 sm:p-3 text-center border-r border-slate-200">
                          <span className={`inline-block px-2 py-0.5 rounded-md font-black ${
                            isProjectedGreen
                              ? 'bg-emerald-100 text-emerald-800 shadow-2xs'
                              : isProjectedPink
                              ? 'bg-rose-100 text-rose-800 shadow-2xs'
                              : 'text-slate-900 font-bold'
                          }`}>
                            {projected.toFixed(1)}%
                          </span>
                        </td>
                        <td className={`p-2.5 sm:p-3 text-center border-r border-slate-200 font-black ${
                          isQdRed ? 'text-rose-600' : 'text-slate-800'
                        }`}>
                          {ch.qdEff.toFixed(1)}%
                        </td>
                        <td className={`p-2.5 sm:p-3 text-center font-black ${
                          isTcRed ? 'text-rose-600' : 'text-slate-800'
                        }`}>
                          {ch.tcRatio.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}

                  {/* Channel Summary Row */}
                  <tr className="font-black text-white border-t-2 border-slate-300">
                    <td className="p-2.5 sm:p-3 bg-slate-900 text-left pl-3 sm:pl-4 border-r border-slate-800 text-amber-300 uppercase tracking-wide">
                      {summaryChannelLabel}
                    </td>
                    <td className="p-2.5 sm:p-3 bg-slate-900 text-center border-r border-slate-800 text-amber-300">
                      {totalSummary.totalRateDt.toFixed(1)}%
                    </td>
                    <td className="p-2.5 sm:p-3 bg-slate-900 text-center border-r border-slate-800 text-emerald-300">
                      {(thoiGianSdPercent > 0 ? (totalSummary.totalRateDt / (thoiGianSdPercent / 100)) : 0).toFixed(1)}%
                    </td>
                    <td className="p-2.5 sm:p-3 bg-amber-500 text-center border-r border-amber-600 font-black text-slate-950">
                      {(totalSummary.totalRateDt > 0 ? Math.min(99.9, Math.max(30.0, 50.0 + (totalSummary.totalRateDt - 20) * 0.7)) : 50.0).toFixed(1)}%
                    </td>
                    <td className="p-2.5 sm:p-3 bg-orange-500 text-center font-black text-slate-950">
                      {totalSummary.totalTcRatio.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* DIVIDER SPACE BETWEEN TABLES */}
            <div className="h-3 bg-slate-200/80 border-y border-slate-300" />

            {/* TABLE 2: THEO TỈNH */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  {/* Top Banner Row */}
                  <tr className="border-b border-slate-300">
                    <th
                      colSpan={3}
                      className="bg-gradient-to-r from-teal-700 to-emerald-700 text-white font-black p-2.5 sm:p-3 text-left border-r border-teal-800/80 text-xs sm:text-sm tracking-tight shadow-inner"
                    >
                      {targetHeaderStr}
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black p-2 text-center border-r border-amber-600 text-xs leading-tight w-28 align-middle shadow-inner"
                    >
                      <div>HIỆU QUẢ</div>
                      <div>QUY ĐỔI</div>
                      <div className="text-[10px] font-extrabold mt-1 text-amber-100 uppercase tracking-wider">MỤC TIÊU</div>
                      <div className="text-[10px] font-extrabold text-amber-100">MIN = 50%</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-gradient-to-b from-orange-500 to-amber-600 text-white font-black p-2 text-center text-xs leading-tight w-28 align-middle shadow-inner"
                    >
                      <div>TỈ TRỌNG</div>
                      <div>TRẢ CHẬM</div>
                      <div className="text-[10px] font-extrabold mt-1 text-orange-100 uppercase tracking-wider">MỤC TIÊU</div>
                      <div className="text-[10px] font-extrabold text-orange-100">MIN = 50%</div>
                    </th>
                  </tr>

                  {/* Sub Header Row */}
                  <tr className="border-b border-slate-300 bg-teal-800 text-teal-50 font-black text-xs">
                    <th className="p-2 sm:p-2.5 border-r border-teal-700/80 text-left w-36 pl-3 sm:pl-4 uppercase tracking-wider">
                      KÊNH
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-teal-700/80 text-center uppercase tracking-wider">
                      <div>HOÀN THÀNH</div>
                      <div>HIỆN TẠI</div>
                    </th>
                    <th className="p-2 sm:p-2.5 border-r border-teal-700/80 text-center uppercase tracking-wider">
                      <div>HOÀN THÀNH</div>
                      <div>DỰ KIẾN</div>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 text-slate-900 font-sans">
                  {provinceSummaryRows.map((p, idx) => {
                    const projected = thoiGianSdPercent > 0 ? (p.rateDt / (thoiGianSdPercent / 100)) : 0;
                    const isCurrentPink = p.rateDt < 21.0 && p.rateDt > 0;
                    const isProjectedPink = projected < 80.0 && projected > 0;
                    const isProjectedGreen = projected >= 100.0;
                    const qdEff = p.rateDt > 0 ? Number(Math.min(99.9, Math.max(30.0, 50.0 + (p.rateDt - 20) * 0.7)).toFixed(1)) : 50.0;
                    const isQdRed = qdEff < 50.0;
                    const isTcRed = p.tcRatio < 50.0;

                    return (
                      <tr
                        key={p.tinh}
                        className={`transition-colors border-b border-slate-200 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                        } hover:bg-amber-50/40`}
                      >
                        <td className="p-2 sm:p-2.5 font-bold text-left pl-3 sm:pl-4 border-r border-slate-200 text-slate-900">
                          {p.tinh}
                        </td>
                        <td className="p-2 sm:p-2.5 text-center border-r border-slate-200">
                          <span className={`inline-block px-2 py-0.5 rounded font-black ${
                            isCurrentPink ? 'bg-rose-100 text-rose-800' : 'text-slate-900'
                          }`}>
                            {p.rateDt.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-2 sm:p-2.5 text-center border-r border-slate-200">
                          <span className={`inline-block px-2 py-0.5 rounded-md font-black ${
                            isProjectedGreen
                              ? 'bg-emerald-100 text-emerald-800 shadow-2xs'
                              : isProjectedPink
                              ? 'bg-rose-100 text-rose-800 shadow-2xs'
                              : 'text-slate-900 font-bold'
                          }`}>
                            {projected.toFixed(1)}%
                          </span>
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center border-r border-slate-200 font-black ${
                          isQdRed ? 'text-rose-600' : 'text-slate-800'
                        }`}>
                          {qdEff.toFixed(1)}%
                        </td>
                        <td className={`p-2 sm:p-2.5 text-center font-black ${
                          isTcRed ? 'text-rose-600' : 'text-slate-800'
                        }`}>
                          {p.tcRatio.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}

                  {/* Province Summary Row at Bottom */}
                  <tr className="font-black text-white border-t-2 border-slate-300">
                    <td className="p-2.5 sm:p-3 bg-slate-900 text-left pl-3 sm:pl-4 border-r border-slate-800 text-amber-300 uppercase tracking-wide">
                      {summaryChannelLabel}
                    </td>
                    <td className="p-2.5 sm:p-3 bg-slate-900 text-center border-r border-slate-800 text-amber-300">
                      {totalSummary.totalRateDt.toFixed(1)}%
                    </td>
                    <td className="p-2.5 sm:p-3 bg-slate-900 text-center border-r border-slate-800 text-emerald-300">
                      {(thoiGianSdPercent > 0 ? (totalSummary.totalRateDt / (thoiGianSdPercent / 100)) : 0).toFixed(1)}%
                    </td>
                    <td className="p-2.5 sm:p-3 bg-amber-500 text-center border-r border-amber-600 font-black text-slate-950">
                      {(totalSummary.totalRateDt > 0 ? Math.min(99.9, Math.max(30.0, 50.0 + (totalSummary.totalRateDt - 20) * 0.7)) : 50.0).toFixed(1)}%
                    </td>
                    <td className="p-2.5 sm:p-3 bg-orange-500 text-center font-black text-slate-950">
                      {totalSummary.totalTcRatio.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : entityScope === 'sieuthimoi' ? (
          /* TAB SIÊU THỊ MỚI (TRÌNH BÀY DẠNG BẢNG & CỘT THEO ẢNH MẪU 1:1) */
          <div className="w-full max-w-6xl mx-auto bg-white border border-slate-300 shadow-md font-sans select-none overflow-hidden rounded-2xl my-2">
            {/* Header: DOANH THU QĐ NGÀY & TÊN TỈNH */}
            <div className="py-3.5 px-6 flex items-center justify-between bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 text-white shadow-xs">
              <h1 className="text-xl sm:text-2xl font-black tracking-wider uppercase text-white drop-shadow-xs">
                DOANH THU QĐ {timeMode === 'realtime' ? 'NGÀY' : 'THÁNG'}
              </h1>
              <h2 className="text-xl sm:text-2xl font-black text-amber-300 tracking-wider uppercase drop-shadow-xs">
                {currentProvinceTitle}
              </h2>
            </div>

            {/* Sub-Header Bar: REALTIME & THỜI GIAN ĐÃ SỬ DỤNG */}
            <div className="grid grid-cols-4 border-b border-slate-300 bg-slate-100/90 text-center text-xs sm:text-sm divide-x divide-slate-300 font-sans shadow-2xs">
              <div className="py-2.5 px-3 font-extrabold text-slate-500 uppercase flex items-center justify-center">
                REALTIME :
              </div>
              <div className="py-2.5 px-3 font-black text-indigo-700 flex items-center justify-center font-mono">
                {realtimeTimeAndDateStr}
              </div>
              <div className="py-2.5 px-3 font-extrabold text-slate-500 uppercase flex items-center justify-center">
                THỜI GIAN ĐÃ SỬ DỤNG :
              </div>
              <div className="py-2.5 px-3 font-black text-emerald-700 flex items-center justify-center font-mono">
                {thoiGianSdPercent}%
              </div>
            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  {/* Tier 1: Top Group Header Row */}
                  <tr className="border-b border-slate-300">
                    <th
                      colSpan={2}
                      className="bg-teal-600 text-white font-black p-2 text-center border-r border-teal-700 text-xs sm:text-sm tracking-tight w-36 shadow-inner"
                    >
                      BOSS
                    </th>
                    <th
                      className="bg-teal-600 text-white font-black p-2 text-left pl-3 border-r border-teal-700 text-xs sm:text-sm tracking-tight shadow-inner"
                    >
                      SIÊU THỊ
                    </th>
                    <th
                      colSpan={3}
                      className="bg-gradient-to-r from-amber-500 to-amber-600 text-white font-black p-2 text-center border-r border-amber-600 text-xs tracking-tight shadow-inner"
                    >
                      {targetHeaderStr}
                    </th>
                    <th
                      colSpan={2}
                      className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black p-2 text-center border-r border-amber-500 text-xs tracking-tight leading-tight shadow-inner"
                    >
                      <div>DỰ KIẾN HẾT {timeMode === 'realtime' ? 'NGÀY' : 'THÁNG'}</div>
                      <div className="text-[10px] font-bold uppercase opacity-90">THEO TỈ TRỌNG TỪNG GIỜ</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-gradient-to-b from-amber-500 to-amber-600 text-white font-black p-2 text-center border-r border-amber-600 text-xs leading-tight w-24 align-middle shadow-inner"
                    >
                      <div>HIỆU QUẢ</div>
                      <div>QUY ĐỔI</div>
                      <div className="text-[10px] font-bold mt-1 text-amber-100 uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] font-bold text-amber-100">MIN = 50%</div>
                    </th>
                    <th
                      rowSpan={2}
                      className="bg-gradient-to-b from-orange-500 to-amber-600 text-white font-black p-2 text-center text-xs leading-tight w-24 align-middle shadow-inner"
                    >
                      <div>TỈ TRỌNG</div>
                      <div>TRẢ CHẬM</div>
                      <div className="text-[10px] font-bold mt-1 text-orange-100 uppercase">MỤC TIÊU</div>
                      <div className="text-[10px] font-bold text-orange-100">MIN = 50%</div>
                    </th>
                  </tr>

                  {/* Tier 2: Sub-Header Row */}
                  <tr className="border-b border-slate-300 bg-teal-800 text-teal-50 font-black text-xs">
                    <th className="p-2 border-r border-teal-700 text-center w-10">STT</th>
                    <th className="p-2 border-r border-teal-700 text-left pl-2.5 w-28">BOSS</th>
                    <th className="p-2 border-r border-teal-700 text-left pl-2.5">SIÊU THỊ</th>
                    <th className="p-2 border-r border-amber-600 text-right pr-2 w-20 bg-amber-600 text-white">MỤC TIÊU</th>
                    <th className="p-2 border-r border-amber-600 text-right pr-2 w-20 bg-amber-600 text-white">THỰC HIỆN</th>
                    <th className="p-2 border-r border-amber-600 text-center w-20 bg-amber-600 text-white">HOÀN THÀNH</th>
                    <th className="p-2 border-r border-amber-500 text-right pr-2 w-20 bg-amber-300 text-amber-950 font-bold">THỰC HIỆN</th>
                    <th className="p-2 border-r border-amber-500 text-center w-20 bg-amber-300 text-amber-950 font-bold">HOÀN THÀNH</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 text-slate-900 font-sans">
                  {storesByChannel.map((group) => (
                    <React.Fragment key={group.channel}>
                      {/* Channel Group Header Row */}
                      <tr className={`${getChannelHeaderBg(group.channel)} font-black border-t border-b border-slate-300 text-xs`}>
                        <td colSpan={3} className="p-2 text-left pl-3 sm:pl-4 border-r border-white/20 text-sm uppercase tracking-wider">
                          {group.channel}
                        </td>
                        <td className="p-2 text-right pr-2 border-r border-white/20 font-mono">
                          {group.totalTargetDt.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-2 text-right pr-2 border-r border-white/20 font-mono">
                          {group.totalAchievedDt.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-2 text-center border-r border-white/20">
                          {group.totalRateDt.toFixed(1)}%
                        </td>
                        <td className="p-2 text-right pr-2 border-r border-white/20 font-mono">
                          {group.totalProjectedAchieved.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-2 text-center border-r border-white/20">
                          {group.totalProjectedRate.toFixed(1)}%
                        </td>
                        <td className="p-2 text-center border-r border-white/20">
                          {group.totalQdEff.toFixed(1)}%
                        </td>
                        <td className="p-2 text-center">
                          {group.totalTcRatio.toFixed(1)}%
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
                        const isQdRed = s.rateDt > 0 && s.achievedDt > 0 ? (s.rateDt < 50) : false;
                        const isTcRed = s.tcRatio < 50.0;

                        return (
                          <tr
                            key={s.id || s.sieuthi}
                            className={`hover:bg-amber-50/40 transition-colors border-b border-slate-200 ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                            }`}
                          >
                            <td className="p-2 text-center border-r border-slate-200 font-black bg-amber-100/90 text-amber-950 w-10">
                              {idx + 1}
                            </td>
                            <td className="p-2 text-left pl-2.5 border-r border-slate-200 font-extrabold text-orange-600 truncate max-w-[120px]" title={s.boss}>
                              {s.boss || '-'}
                            </td>
                            <td className="p-2 text-left pl-2.5 border-r border-slate-200 font-bold text-slate-950 truncate max-w-[320px]" title={s.sieuthi}>
                              {formatStoreDisplayName(s.sieuthi)}
                            </td>
                            <td className="p-2 text-right pr-2 border-r border-slate-200 font-mono font-bold text-amber-600">
                              {s.targetDt.toLocaleString('vi-VN')}
                            </td>
                            <td className="p-2 text-right pr-2 border-r border-slate-200 font-mono font-bold text-slate-800">
                              {s.achievedDt.toLocaleString('vi-VN')}
                            </td>
                            <td className={`p-2 text-center border-r border-slate-200 font-bold ${
                              isNegative ? 'text-rose-600 font-black' : isCurrentPink ? 'text-rose-600 font-black' : 'text-slate-900'
                            }`}>
                              {s.rateDt.toFixed(1)}%
                            </td>
                            <td className="p-2 text-right pr-2 border-r border-slate-200 font-mono font-bold text-slate-800">
                              {projAchieved.toLocaleString('vi-VN')}
                            </td>
                            <td className="p-2 text-center border-r border-slate-200">
                              <span className={`inline-block px-2 py-0.5 rounded font-black ${
                                isProjGreen
                                  ? 'bg-emerald-100 text-emerald-800 shadow-2xs'
                                  : isNegative || isProjPink
                                  ? 'bg-rose-100 text-rose-800 shadow-2xs'
                                  : 'text-slate-900 font-bold'
                              }`}>
                                {projRate.toFixed(1)}%
                              </span>
                            </td>
                            <td className={`p-2 text-center border-r border-slate-200 font-black ${
                              isQdRed ? 'text-rose-600' : 'text-slate-800'
                            }`}>
                              {(s.rateDt > 0 ? Math.min(333.3, Math.max(0.0, 50.0 + (s.rateDt - 20) * 0.9)) : 0.0).toFixed(1)}%
                            </td>
                            <td className={`p-2 text-center font-black ${
                              isTcRed ? 'text-rose-600' : 'text-slate-800'
                            }`}>
                              {s.tcRatio.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {/* BOTTOM TOTAL SUMMARY ROW */}
                  <tr className="font-black text-white bg-slate-900 border-t-2 border-slate-400 text-xs">
                    <td colSpan={3} className="p-2.5 sm:p-3 text-left pl-3 sm:pl-4 border-r border-slate-800 text-sm text-amber-300 uppercase tracking-wide">
                      {currentProvinceTitle} ({totalSummary.totalStores} Siêu thị)
                    </td>
                    <td className="p-2.5 sm:p-3 text-right pr-2 font-mono border-r border-slate-800 text-amber-400">
                      {totalSummary.totalTargetDt.toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2.5 sm:p-3 text-right pr-2 font-mono border-r border-slate-800 text-white">
                      {totalSummary.totalAchievedDt.toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2.5 sm:p-3 text-center border-r border-slate-800 text-amber-300">
                      {totalSummary.totalRateDt.toFixed(1)}%
                    </td>
                    <td className="p-2.5 sm:p-3 text-right pr-2 font-mono border-r border-slate-800 text-white">
                      {(thoiGianSdPercent > 0 ? Math.round(totalSummary.totalAchievedDt / (thoiGianSdPercent / 100)) : totalSummary.totalAchievedDt).toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2.5 sm:p-3 text-center border-r border-slate-800 text-emerald-300">
                      {(thoiGianSdPercent > 0 ? (totalSummary.totalRateDt / (thoiGianSdPercent / 100)) : totalSummary.totalRateDt).toFixed(1)}%
                    </td>
                    <td className="p-2.5 sm:p-3 bg-amber-500 text-center border-r border-amber-600 font-black text-slate-950">
                      {(totalSummary.totalRateDt > 0 ? Math.min(99.9, Math.max(30.0, 50.0 + (totalSummary.totalRateDt - 20) * 0.7)) : 50.0).toFixed(1)}%
                    </td>
                    <td className="p-2.5 sm:p-3 bg-orange-500 text-center font-black text-slate-950">
                      {totalSummary.totalTcRatio.toFixed(1)}%
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
                  <th colSpan={3} className="bg-slate-900 text-white font-black text-xs text-center p-2 border-r border-slate-800">
                    THÔNG TIN TỈNH
                  </th>
                  {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                    <th colSpan={3} className="bg-amber-300 text-amber-900 font-black text-xs text-center p-2 border-r border-amber-400/60 uppercase">
                      NHÓM DOANH THU THUẦN
                    </th>
                  )}
                  {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                    <th colSpan={2} className="bg-green-300 text-green-900 font-black text-xs text-center p-2 border-r border-green-400/60 uppercase">
                      NHÓM TRẢ CHẬM
                    </th>
                  )}
                  <th className="bg-slate-900 text-white font-black text-xs text-center p-2">
                    TIẾN ĐỘ
                  </th>
                </tr>

                {/* Sub Headers */}
                <tr className="bg-slate-900 text-white font-black text-center text-[11px] uppercase tracking-wider">
                  <th className="p-2.5 border-r border-slate-800 w-12">STT</th>
                  <th className="p-2.5 border-r border-slate-800 text-left">TỈNH</th>
                  <th className="p-2.5 border-r border-slate-800">SỐ ST</th>
                  {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                    <>
                      <th className="p-2.5 border-r border-slate-800 text-right bg-amber-200 text-amber-950 font-black">TARGET DT</th>
                      <th className="p-2.5 border-r border-slate-800 text-right bg-amber-200 text-amber-950 font-black">THỰC ĐẠT DT</th>
                      <th className="p-2.5 border-r border-slate-800 text-center bg-amber-200 text-amber-950 font-black">% HT DT</th>
                    </>
                  )}
                  {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                    <>
                      <th className="p-2.5 border-r border-slate-800 text-right bg-green-200 text-green-950 font-black">TRẢ CHẬM</th>
                      <th className="p-2.5 border-r border-slate-800 text-center bg-green-200 text-green-950 font-black">% TRẢ CHẬM / DT</th>
                    </>
                  )}
                  <th className="p-2.5 text-center">ST ĐẠT TARGET</th>
                </tr>

                {/* PINNED SUMMARY TOTAL ROW AT TOP */}
                {provinceSummaryRows.length > 0 && (
                  <tr className="bg-slate-900 text-white font-black text-xs border-b-2 border-slate-950">
                    <td colSpan={2} className="p-3 text-center uppercase tracking-wider text-amber-300">TỔNG CỘNG TOÀN VÙNG</td>
                    <td className="p-3 text-center">{totalSummary.totalStores} ST</td>
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                      <>
                        <td className="p-3 text-right font-mono">{formatVND(totalSummary.totalTargetDt)}</td>
                        <td className="p-3 text-right font-mono text-emerald-300">{formatVND(totalSummary.totalAchievedDt)}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-md ${totalSummary.totalRateDt >= 100 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                            {totalSummary.totalRateDt}%
                          </span>
                        </td>
                      </>
                    )}
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                      <>
                        <td className="p-3 text-right font-mono text-amber-300">{formatVND(totalSummary.totalAchievedTc)}</td>
                        <td className="p-3 text-center text-amber-300">{totalSummary.totalTcRatio}%</td>
                      </>
                    )}
                    <td className="p-3 text-center text-amber-300">{totalSummary.reachedStoresCount} / {totalSummary.totalStores}</td>
                  </tr>
                )}
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
                    <th colSpan={6} className="bg-slate-900 text-white font-black text-xs text-center p-2 border-r border-slate-800">
                      THÔNG TIN SIÊU THỊ
                    </th>
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                      <th colSpan={3} className="bg-amber-300 text-amber-900 font-black text-xs text-center p-2 border-r border-amber-400/60 uppercase">
                        NHÓM DOANH THU THUẦN
                      </th>
                    )}
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                      <th colSpan={2} className="bg-green-300 text-green-900 font-black text-xs text-center p-2 uppercase">
                        NHÓM TRẢ CHẬM
                      </th>
                    )}
                  </tr>

                  {/* Sub Headers */}
                  <tr className="bg-slate-900 text-white font-black text-center text-[11px] uppercase tracking-wider">
                    <th className="p-2.5 border-r border-slate-800 w-12">STT</th>
                    <th className="p-2.5 border-r border-slate-800 text-left">TỈNH</th>
                    <th className="p-2.5 border-r border-slate-800 text-left">SIÊU THỊ</th>
                    <th className="p-2.5 border-r border-slate-800">BOSS</th>
                    <th className="p-2.5 border-r border-slate-800 w-16">KÊNH</th>
                    <th className="p-2.5 border-r border-slate-800">PHÂN LOẠI</th>
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                      <>
                        <th onClick={() => handleSort('targetDt')} className="p-2.5 border-r border-slate-800 text-right bg-amber-200 text-amber-950 font-black cursor-pointer hover:bg-amber-300">
                          TARGET DT
                        </th>
                        <th onClick={() => handleSort('achievedDt')} className="p-2.5 border-r border-slate-800 text-right bg-amber-200 text-amber-950 font-black cursor-pointer hover:bg-amber-300">
                          THỰC ĐẠT DT
                        </th>
                        <th onClick={() => handleSort('rateDt')} className="p-2.5 border-r border-slate-800 text-center bg-amber-200 text-amber-950 font-black cursor-pointer hover:bg-amber-300">
                          % HT DT
                        </th>
                      </>
                    )}
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                      <>
                        <th onClick={() => handleSort('achievedTc')} className="p-2.5 border-r border-slate-800 text-right bg-green-200 text-green-950 font-black cursor-pointer hover:bg-green-300">
                          TRẢ CHẬM
                        </th>
                        <th onClick={() => handleSort('tcRatio')} className="p-2.5 text-center bg-green-200 text-green-950 font-black cursor-pointer hover:bg-green-300">
                          % TRẢ CHẬM / DT
                        </th>
                      </>
                    )}
                  </tr>

                  {/* PINNED SUMMARY TOTAL ROW AT TOP */}
                  <tr className="bg-slate-800 text-white font-black text-xs border-b-2 border-slate-900">
                    <td colSpan={6} className="p-2.5 text-center text-amber-300 uppercase tracking-wider">
                      TỔNG ({filteredItems.length} SIÊU THỊ)
                    </td>
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'DT') && (
                      <>
                        <td className="p-2.5 text-right font-mono">{formatVND(totalSummary.totalTargetDt)}</td>
                        <td className="p-2.5 text-right font-mono text-emerald-300">{formatVND(totalSummary.totalAchievedDt)}</td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-md ${totalSummary.totalRateDt >= 100 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                            {totalSummary.totalRateDt}%
                          </span>
                        </td>
                      </>
                    )}
                    {(selectedMetricGroup === 'ALL' || selectedMetricGroup === 'TC') && (
                      <>
                        <td className="p-2.5 text-right font-mono text-amber-300">{formatVND(totalSummary.totalAchievedTc)}</td>
                        <td className="p-2.5 text-center text-amber-300">{totalSummary.totalTcRatio}%</td>
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
            <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5 font-black text-base">
                <MessageSquare className="w-5 h-5 text-amber-200" />
                <span>NHẬN XÉT DOANH THU &amp; TRẢ CHẬM</span>
              </div>
              <button
                onClick={() => setIsRemarksModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-xs font-extrabold text-slate-700 block mb-2">
                  Chọn mẫu nhận xét:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setActiveRemarkTemplate('top_bot')}
                    className={`py-2 px-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                      activeRemarkTemplate === 'top_bot'
                        ? 'bg-amber-500 text-white shadow-xs font-black'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Mẫu 1: TOP / BOT
                  </button>
                  <button
                    onClick={() => setActiveRemarkTemplate('warning')}
                    className={`py-2 px-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                      activeRemarkTemplate === 'warning'
                        ? 'bg-rose-600 text-white shadow-xs font-black'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Mẫu 2: Cần tăng tốc
                  </button>
                  <button
                    onClick={() => setActiveRemarkTemplate('summary')}
                    className={`py-2 px-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                      activeRemarkTemplate === 'summary'
                        ? 'bg-sky-600 text-white shadow-xs font-black'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Mẫu 3: Tóm tắt
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-700 block mb-1.5">
                  Nội dung nhận xét tự động theo bộ lọc:
                </label>
                <textarea
                  rows={13}
                  readOnly
                  value={generateRevenueRemarks()}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono rounded-2xl p-3.5 leading-relaxed select-all shadow-inner focus:outline-hidden"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500 font-semibold">Sẵn sàng dán trực tiếp vào Zalo / Teams</span>
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
