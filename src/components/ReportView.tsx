import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { StoreRecord, TimeMode, EntityScope, Channel } from '../types';
import { formatVND, formatDtQdTb, getChannelRank, getDtQdTbForProvince, parseChannelValue, parseDtQdTbNum, extractMst, formatStoreDisplayName, getStoreCodeOnly, getStoreShortName, resolveCategoryDisplayName, formatCategoryHeaderTitle, checkDataFreshness, BossAssignmentRecord } from '../utils/parser';
import { GroupReportView } from './GroupReportView';
import { 
  Trophy, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  ArrowUpDown, 
  Award, 
  ChevronDown,
  BarChart2,
  PieChart as PieChartIcon,
  MessageSquare,
  Download,
  Share2,
  Layers,
  Grid,
  Camera,
  Smartphone,
  ShieldCheck,
  Tv,
  Check,
  Eye,
  EyeOff,
  X,
  Scale
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Cell
} from 'recharts';

// The 38 hardcoded ngành hàng shown as columns in the default (no Nhóm
// selected) table view, in the same order as their <th>/<td> below. Reused
// by the "TỔNG CỘNG" row and the no-results colSpan so there's one source
// of truth instead of three copies of this list drifting apart.
const ALL_HARDCODED_CATEGORY_NAMES = [
  'Điện thoại Flagship Samsung Galaxy S/Z Series', 'Điện thoại & Tablet Android', 'Điện thoại Realme', 'Điện thoại Vivo', 'Laptop', 'Phụ kiện - Đồng hồ', 'Đồng hồ (DHTT + SMW)', 'Camera', 'Loa', 'Sạc dự phòng', 'Tai nghe Bluetooth', 'Đèn năng lượng mặt trời',
  'Bảo hiểm', 'Bảo hiểm thợ Điện Máy Xanh', 'Sim Tổng', 'Sim Vinaphone & Sim ĐMX', 'Trả chậm HomeCredit', 'Trả chậm FECredit, Shinhan, Samsung Finance+', 'Trả chậm Điện máy và Gia dụng', 'Dịch vụ VAS', 'OTT Mango+, iCallMe', 'Mở thẻ tín dụng TPBank EVO và VPBank MWG', 'Vay tiền mặt', 'Ví trả sau', 'Nạp rút tiền tài khoản ngân hàng',
  'Điện tử Samsung', 'Điện tử điện lạnh Aqua + Haier', 'Tivi', 'Điện tử toshiba', 'Tăng cường Audio', 'Tủ lạnh, Tủ đông, Tủ mát', 'Máy giặt, Máy sấy, Máy rửa chén', 'Máy lạnh Daikin', 'Máy lạnh Casper', 'Máy lọc nước', 'Quạt gió', 'Nồi cơm', 'Máy lọc không khí - Hút bụi - Hút ẩm'
];

// Every ngành hàng's *native* Nhóm (ICT / Dịch vụ / CE & Gia dụng) and that
// Nhóm's pastel color — fixed regardless of how the user groups categories
// via the Category Group modal. A custom Nhóm N.Hàng filter narrows *which*
// columns show, but each column keeps the color of the Nhóm it naturally
// belongs to (e.g. an ICT category stays amber even inside a custom filter),
// instead of the whole filtered selection being painted one arbitrary color.
type PresetGroupKey = 'ict' | 'dichvu' | 'cegd';
const PRESET_GROUP_STYLE: Record<PresetGroupKey, { label: string; band: string; bandBorder: string; cell: string; cellBorder: string }> = {
  ict: { label: 'NHÓM ICT', band: 'bg-amber-300 text-amber-900', bandBorder: 'border-amber-400/60', cell: 'bg-amber-200 text-amber-900', cellBorder: 'border-amber-300' },
  dichvu: { label: 'NHÓM DỊCH VỤ', band: 'bg-green-300 text-green-900', bandBorder: 'border-green-400/60', cell: 'bg-green-200 text-green-900', cellBorder: 'border-green-300' },
  cegd: { label: 'NHÓM CE & GIA DỤNG', band: 'bg-blue-300 text-blue-900', bandBorder: 'border-blue-400/60', cell: 'bg-blue-200 text-blue-900', cellBorder: 'border-blue-300' },
};
// Categories outside the known 38 (e.g. a future BI paste with new ngành
// hàng) fall back to this neutral pastel rather than crashing on a lookup miss.
const UNKNOWN_GROUP_STYLE = { label: 'KHÁC', band: 'bg-violet-300 text-violet-900', bandBorder: 'border-violet-400/60', cell: 'bg-violet-200 text-violet-900', cellBorder: 'border-violet-300' };

export const DEFAULT_CATEGORY_GROUP_MAP: Record<string, string> = {};
ALL_HARDCODED_CATEGORY_NAMES.forEach((name, idx) => {
  DEFAULT_CATEGORY_GROUP_MAP[name] = idx < 12 ? 'ICT' : idx < 25 ? 'DỊCH VỤ' : 'CE & GD';
});

export const getCategoryGroup = (cat: string, groupMap?: Record<string, string>): string => {
  if (!cat) return 'Chưa phân nhóm';

  // 1. Exact match in custom groupMap
  if (groupMap && groupMap[cat]) {
    return groupMap[cat];
  }

  // 2. Case-insensitive match in custom groupMap
  if (groupMap) {
    const catUpper = cat.trim().toUpperCase();
    const foundKey = Object.keys(groupMap).find((k) => k.trim().toUpperCase() === catUpper);
    if (foundKey && groupMap[foundKey]) {
      return groupMap[foundKey];
    }
  }

  // 3. Exact match in DEFAULT_CATEGORY_GROUP_MAP
  if (DEFAULT_CATEGORY_GROUP_MAP[cat]) {
    return DEFAULT_CATEGORY_GROUP_MAP[cat];
  }

  // 4. Case-insensitive match in DEFAULT_CATEGORY_GROUP_MAP
  const catUpper = cat.trim().toUpperCase();
  const defaultKey = Object.keys(DEFAULT_CATEGORY_GROUP_MAP).find((k) => k.trim().toUpperCase() === catUpper);
  if (defaultKey) {
    return DEFAULT_CATEGORY_GROUP_MAP[defaultKey];
  }

  return 'Chưa phân nhóm';
};

const resolveStyleByGroupName = (groupName: string) => {
  const upper = groupName.toUpperCase();
  if (upper.includes('ICT')) return PRESET_GROUP_STYLE.ict;
  if (upper.includes('DỊCH VỤ') || upper.includes('DICH VU')) return PRESET_GROUP_STYLE.dichvu;
  if (upper.includes('CE') || upper.includes('GIA DỤNG')) return PRESET_GROUP_STYLE.cegd;
  return {
    label: `NHÓM ${groupName.toUpperCase()}`,
    band: 'bg-indigo-300 text-indigo-900',
    bandBorder: 'border-indigo-400/60',
    cell: 'bg-indigo-200 text-indigo-900',
    cellBorder: 'border-indigo-300',
  };
};

const getPresetGroupStyle = (cat: string, groupMap?: Record<string, string>) =>
  resolveStyleByGroupName(getCategoryGroup(cat, groupMap));

export const getCategoryData = (s: StoreRecord, cName: string): { target: number; achieved: number; rate: number } => {
  if (s.categoryMap?.[cName]) {
    return s.categoryMap[cName];
  }
  const legacyMap: Record<string, { achieved: number; rate: number } | undefined> = {
    'Điện thoại Flagship Samsung Galaxy S/Z Series': s.flagship,
    'Điện thoại & Tablet Android': s.phoneTablet,
    'Điện thoại Realme': s.phone,
    'Điện thoại Vivo': s.phone,
    'Laptop': s.laptop,
    'Phụ kiện - Đồng hồ': s.phukien,
    'Đồng hồ (DHTT + SMW)': s.dongho,
    'Camera': s.camera,
    'Loa': s.loa,
    'Sạc dự phòng': s.sacduphong,
    'Tai nghe Bluetooth': s.tainghe,
    'Đèn năng lượng mặt trời': s.dennangluong,
    'Bảo hiểm': s.baohanh,
  };
  const legacy = legacyMap[cName];
  if (legacy) {
    return { target: 0, achieved: legacy.achieved || 0, rate: legacy.rate || 0 };
  }
  return { target: 0, achieved: 0, rate: 0 };
};

// Coarse ict/dichvu/ce tag stamped as data-group on every group-column
// element (col/th/td) — the image-export feature (exportGroupSpecificElement
// in imageExport.ts) removes every [data-group] element whose value doesn't
// match the group being exported, so ANY group-column element missing this
// attribute survives into every exported image regardless of which group
// was requested. Must be applied consistently everywhere, not just body cells.
const getGroupTag = (label: string): 'ict' | 'dichvu' | 'ce' => {
  const upper = label.toUpperCase();
  if (upper.includes('ICT')) return 'ict';
  if (upper.includes('DỊCH VỤ') || upper.includes('DICH VU')) return 'dichvu';
  return 'ce';
};

interface ReportViewProps {
  timeMode: TimeMode;
  lastUpdated?: string;
  entityScope: EntityScope;
  stores: StoreRecord[];
  selectedChannels: Channel[];
  selectedProvince: string;
  selectedBoss: string;
  selectedCategory: string;
  selectedCategoryGroup: string;
  categoryGroupMap: Record<string, string>;
  categoryOrderMap?: Record<string, number>;
  categoryDisplayNameMap?: Record<string, string>;
  bossAssignments?: BossAssignmentRecord[];
  showSummarySection?: boolean;
  onOpenTagBossModal?: () => void;
  onExportCompact?: () => void;
  onExportFull?: () => void;
  onExportGroup?: (target: 'ict' | 'dichvu' | 'ce' | 'all' | 'by_groups') => void;
  forceShowAllRows?: boolean;
  valueDisplayMode?: 'percent' | 'value';
  // Only Super Admin / Admin may see the DTQĐ TB column & values (a
  // revenue-per-sales-headcount figure sourced from the BOSS file) and the
  // "DT Luỹ Kế / DT Realtime" value-display toggle. Editor/Viewer accounts
  // never receive this data — defaults true so callers that don't pass it
  // (e.g. any not-yet-updated usage) keep the previous, unrestricted behavior.
  canViewDtQdTb?: boolean;
}

interface VerticalComparisonTableProps {
  stores: StoreRecord[];
  displayedCategoryNames: string[];
  categoryDisplayNameMap: Record<string, string>;
  categoryGroupMap: Record<string, string>;
  timeMode: TimeMode;
  valueDisplayMode: 'percent' | 'value';
  canViewDtQdTb?: boolean;
  onRemoveStore: (storeKey: string) => void;
  resolveBoss: (sieuthi: string, fallbackBoss?: string) => string;
  resolveKenh: (sieuthi: string, fallbackKenh?: Channel | string) => Channel | string;
  resolveDtQd: (sieuthi: string) => string;
  totalCatCount: number;
}

const VerticalComparisonTable: React.FC<VerticalComparisonTableProps> = ({
  stores,
  displayedCategoryNames,
  categoryDisplayNameMap,
  categoryGroupMap,
  timeMode,
  valueDisplayMode,
  canViewDtQdTb = true,
  onRemoveStore,
  resolveBoss,
  resolveKenh,
  resolveDtQd,
  totalCatCount,
}) => {
  const groupedCategories = useMemo(() => {
    const map = new Map<string, { groupName: string; cats: string[]; style: ReturnType<typeof getPresetGroupStyle> }>();
    displayedCategoryNames.forEach((cat) => {
      const style = getPresetGroupStyle(cat, categoryGroupMap);
      const groupName = style.label;
      if (!map.has(groupName)) {
        map.set(groupName, { groupName, cats: [], style });
      }
      map.get(groupName)!.cats.push(cat);
    });
    return Array.from(map.values());
  }, [displayedCategoryNames, categoryGroupMap]);

  const isTwoStores = stores.length === 2;

  return (
    <div className="overflow-x-auto select-none border border-slate-200 shadow-xs bg-white">
      <table className="w-full text-left border-collapse text-xs table-auto">
        {/* Table Header: Stores Info */}
        <thead>
          <tr className="bg-slate-900 text-white divide-x divide-slate-800">
            <th className="p-2.5 font-black uppercase text-xs tracking-wider w-60 min-w-[240px] sticky left-0 z-20 bg-slate-900 shadow-md">
              <div className="flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-amber-400" />
                <span>CHỈ SỐ / NGÀNH HÀNG</span>
              </div>
            </th>
            {stores.map((s, idx) => {
              const storeKey = s.sieuthi;
              const boss = resolveBoss(s.sieuthi, s.boss);
              const kenh = resolveKenh(s.sieuthi, s.kenh);
              return (
                <th
                  key={storeKey || idx}
                  className="p-2.5 text-center min-w-[180px] max-w-[240px] bg-slate-900"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center justify-between w-full gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-4 h-4 rounded-full bg-sky-500 text-white font-black text-[10px] flex items-center justify-center shrink-0 shadow-xs">
                          #{idx + 1}
                        </span>
                        <span className="font-black text-xs sm:text-sm text-white truncate" title={s.sieuthi}>
                          {getStoreShortName(s.sieuthi)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveStore(storeKey)}
                        className="export-hide p-1 text-slate-400 hover:text-rose-400 hover:bg-white/10 rounded-md transition-colors cursor-pointer shrink-0"
                        title="Bỏ siêu thị này khỏi so sánh"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <span className="px-1.5 py-0.5 bg-slate-800 text-slate-200 rounded-md text-[10px] font-extrabold border border-slate-700">
                        {s.tinh}
                      </span>
                      <span className="px-1.5 py-0.5 bg-sky-950 text-sky-300 rounded-md text-[10px] font-extrabold border border-sky-800">
                        {kenh}
                      </span>
                      {boss && boss !== 'Chưa phân công' && (
                        <span className="px-1.5 py-0.5 bg-purple-950 text-purple-300 rounded-md text-[10px] font-extrabold border border-purple-800 truncate max-w-[120px]">
                          {boss}
                        </span>
                      )}
                    </div>
                  </div>
                </th>
              );
            })}
            {isTwoStores && (
              <th className="p-2.5 text-center min-w-[130px] max-w-[170px] bg-slate-950 text-amber-300 font-black text-xs uppercase tracking-wider">
                CHÊNH LỆCH
              </th>
            )}
          </tr>

          {/* Metric Row 1: Tổng Ngành Đạt (>= 100%) */}
          <tr className="bg-amber-50 font-black text-slate-900 border-b border-amber-200 divide-x divide-amber-200">
            <td className="p-2 font-black text-xs uppercase text-amber-950 sticky left-0 z-10 bg-amber-50 shadow-xs">
              <div className="flex items-center justify-between">
                <span>🎯 SỐ NGÀNH ĐẠT</span>
                <span className="text-[10px] text-amber-700 font-bold">(&ge; 100%)</span>
              </div>
            </td>
            {stores.map((s, idx) => {
              const count = s.achievedCategories || 0;
              const rate = totalCatCount > 0 ? Math.round((count / totalCatCount) * 100) : 0;
              return (
                <td key={idx} className="p-2 text-center font-black text-xs sm:text-sm text-slate-900">
                  <span className="text-emerald-700">{count}</span>
                  <span className="text-slate-400">/{totalCatCount}</span>
                  <span className="ml-1.5 px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {rate}%
                  </span>
                </td>
              );
            })}
            {isTwoStores && (() => {
              const count1 = stores[0].achievedCategories || 0;
              const count2 = stores[1].achievedCategories || 0;
              const diff = count1 - count2;
              const rate1 = totalCatCount > 0 ? Math.round((count1 / totalCatCount) * 100) : 0;
              const rate2 = totalCatCount > 0 ? Math.round((count2 / totalCatCount) * 100) : 0;
              const diffRate = rate1 - rate2;
              return (
                <td className="p-2 text-center font-black text-xs bg-amber-100/60">
                  {diff > 0 ? (
                    <span className="text-emerald-800 font-black">
                      #1 hơn +{diff} ngành ({diffRate > 0 ? `+${diffRate}%` : `${diffRate}%`})
                    </span>
                  ) : diff < 0 ? (
                    <span className="text-sky-800 font-black">
                      #2 hơn +{Math.abs(diff)} ngành ({diffRate < 0 ? `+${Math.abs(diffRate)}%` : `${diffRate}%`})
                    </span>
                  ) : (
                    <span className="text-slate-600 font-bold">Ngang nhau</span>
                  )}
                </td>
              );
            })()}
          </tr>

          {/* Metric Row 2: DTQĐ TB 5T2026 — Super Admin / Admin only */}
          {canViewDtQdTb && (
            <tr className="bg-slate-100 font-black text-slate-900 border-b border-slate-300 divide-x divide-slate-300">
              <td className="p-2 font-black text-xs uppercase text-slate-800 sticky left-0 z-10 bg-slate-100 shadow-xs">
                📊 DTQĐ TB 5T2026
              </td>
              {stores.map((s, idx) => {
                const dtQdNum = parseDtQdTbNum(resolveDtQd(s.sieuthi));
                return (
                  <td key={idx} className="p-2 text-center font-black text-xs text-slate-800">
                    {dtQdNum > 0 ? (
                      <span className="px-2 py-0.5 bg-white border border-slate-300 rounded-lg shadow-2xs font-extrabold text-slate-900">
                        {formatDtQdTb(dtQdNum)}
                      </span>
                    ) : '-'}
                  </td>
                );
              })}
              {isTwoStores && (() => {
                const dt1 = parseDtQdTbNum(resolveDtQd(stores[0].sieuthi));
                const dt2 = parseDtQdTbNum(resolveDtQd(stores[1].sieuthi));
                const diffDt = Math.round(dt1 - dt2);
                return (
                  <td className="p-2 text-center font-bold text-xs bg-slate-200/70">
                    {diffDt !== 0 ? (
                      <span className="font-extrabold text-slate-800">
                        {diffDt > 0 ? `#1 hơn +${Math.abs(diffDt).toLocaleString('vi-VN')} tỷ` : `#2 hơn +${Math.abs(diffDt).toLocaleString('vi-VN')} tỷ`}
                      </span>
                    ) : '-'}
                  </td>
                );
              })()}
            </tr>
          )}
        </thead>

        {/* Table Body: Category Rows Grouped by Nhóm */}
        <tbody className="divide-y divide-slate-200">
          {groupedCategories.map((group, gIdx) => {
            return (
              <React.Fragment key={group.groupName || gIdx}>
                {/* Group Banner Header */}
                <tr className={`${group.style.band} font-black border-y border-slate-300 shadow-2xs`}>
                  <td
                    colSpan={stores.length + (isTwoStores ? 2 : 1)}
                    className="py-1.5 px-3 font-black uppercase text-xs tracking-wider sticky left-0 z-10"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-900/30"></span>
                      <span>{group.groupName} ({group.cats.length} ngành hàng)</span>
                    </div>
                  </td>
                </tr>

                {/* Rows per Category */}
                {group.cats.map((cat, cIdx) => {
                  const catDisplayName = resolveCategoryDisplayName(cat, categoryDisplayNameMap);
                  const isEven = cIdx % 2 === 0;

                  const storeValues = stores.map((s) => {
                    const data = getCategoryData(s, cat);
                    return {
                      target: data.target || 0,
                      achieved: data.achieved || 0,
                      rate: data.rate || 0,
                    };
                  });

                  return (
                    <tr
                      key={cat}
                      className={`hover:bg-amber-50/60 transition-colors divide-x divide-slate-200 ${
                        isEven ? 'bg-white' : 'bg-slate-50/70'
                      }`}
                    >
                      {/* Column 1: Category Name */}
                      <td className={`py-1 px-3 font-bold text-xs text-slate-800 sticky left-0 z-10 shadow-xs ${isEven ? 'bg-white' : 'bg-slate-50'}`}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 font-mono w-4 shrink-0">#{cIdx + 1}</span>
                          <span className="font-extrabold text-slate-900 tracking-tight" title={catDisplayName}>
                            {catDisplayName}
                          </span>
                        </div>
                      </td>

                      {/* Store Columns */}
                      {storeValues.map((val, sIdx) => {
                        const isReached = val.rate >= 100;
                        const isZero = val.rate === 0 && val.achieved === 0;
                        const rateColorClass = isZero
                          ? 'text-slate-400 bg-slate-100/60 border border-slate-200'
                          : isReached
                          ? 'text-emerald-800 font-black bg-emerald-50 border border-emerald-300'
                          : 'text-rose-800 font-black bg-rose-50 border border-rose-300';

                        return (
                          <td key={sIdx} className="py-1 px-2.5 text-center">
                            {valueDisplayMode === 'percent' ? (
                              <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-black shadow-2xs ${rateColorClass}`}>
                                {Math.round(val.rate)}%
                              </span>
                            ) : (
                              <div className={`inline-flex flex-col items-center px-2.5 py-0.5 rounded-lg shadow-2xs min-w-[70px] ${rateColorClass}`}>
                                <span className="font-black text-xs leading-tight">
                                  {Math.round(val.achieved).toLocaleString('vi-VN')}
                                </span>
                                {val.target > 0 && (
                                  <span className={`text-[9.5px] font-bold leading-tight ${isReached ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    /{Math.round(val.target).toLocaleString('vi-VN')} ({Math.round(val.rate)}%)
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Diff Column for 2 stores */}
                      {isTwoStores && (() => {
                        if (valueDisplayMode === 'value') {
                          const a1 = Math.round(storeValues[0].achieved || 0);
                          const a2 = Math.round(storeValues[1].achieved || 0);
                          const diffVal = a1 - a2;
                          if (a1 === 0 && a2 === 0) {
                            return (
                              <td className="py-1 px-2.5 text-center text-slate-400 text-xs">
                                -
                              </td>
                            );
                          }
                          if (diffVal === 0) {
                            return (
                              <td className="py-1 px-2.5 text-center text-slate-500 font-bold text-xs">
                                Bằng nhau
                              </td>
                            );
                          }
                          const isStore1Better = diffVal > 0;
                          return (
                            <td className="py-1 px-2.5 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black shadow-2xs ${
                                  isStore1Better
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-sky-100 text-sky-800 border border-sky-300'
                                }`}
                              >
                                <span>{isStore1Better ? '#1 hơn' : '#2 hơn'}</span>
                                <span>+{Math.abs(diffVal).toLocaleString('vi-VN')}</span>
                              </span>
                            </td>
                          );
                        }

                        // Percent mode comparison
                        const r1 = storeValues[0].rate || 0;
                        const r2 = storeValues[1].rate || 0;
                        const diff = Math.round(r1 - r2);
                        if (r1 === 0 && r2 === 0) {
                          return (
                            <td className="py-1 px-2.5 text-center text-slate-400 text-xs">
                              -
                            </td>
                          );
                        }
                        if (diff === 0) {
                          return (
                            <td className="py-1 px-2.5 text-center text-slate-500 font-bold text-xs">
                              Bằng nhau
                            </td>
                          );
                        }
                        const isStore1Better = diff > 0;
                        return (
                          <td className="py-1 px-2.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black shadow-2xs ${
                                isStore1Better
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-sky-100 text-sky-800 border border-sky-300'
                              }`}
                            >
                              <span>{isStore1Better ? '#1 hơn' : '#2 hơn'}</span>
                              <span>+{Math.abs(diff)}%</span>
                            </span>
                          </td>
                        );
                      })()}
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const ReportView: React.FC<ReportViewProps> = ({
  timeMode,
  lastUpdated,
  entityScope,
  stores,
  selectedChannels,
  selectedProvince,
  selectedBoss,
  selectedCategory,
  selectedCategoryGroup,
  categoryGroupMap,
  categoryOrderMap = {},
  categoryDisplayNameMap = {},
  bossAssignments = [],
  showSummarySection = true,
  onOpenTagBossModal,
  onExportCompact,
  onExportFull,
  onExportGroup,
  forceShowAllRows = false,
  valueDisplayMode: rawValueDisplayMode = 'percent',
  canViewDtQdTb = true,
}) => {
  // Non-privileged accounts can never see the DT Luỹ Kế/Realtime value view
  // even if 'value' somehow ended up in their persisted preference (e.g. the
  // same browser was previously used by a privileged account).
  const valueDisplayMode = canViewDtQdTb ? rawValueDisplayMode : 'percent';
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showChartSection, setShowChartSection] = useState(true);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Selected stores for direct side-by-side comparison
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
  const [isFilterToSelected, setIsFilterToSelected] = useState(false);
  const [comparisonLayout, setComparisonLayout] = useState<'horizontal' | 'vertical'>('horizontal');

  const toggleStoreSelection = (storeKey: string) => {
    setSelectedStoreIds((prev) => {
      const next = new Set(prev);
      const isAdding = !next.has(storeKey);
      if (isAdding) {
        next.add(storeKey);
      } else {
        next.delete(storeKey);
      }

      // If user checks/selects a store while in compare mode or while searching:
      // Automatically clear the search input to instantly reveal the full comparison list!
      if (isAdding && (isFilterToSelected || searchTerm)) {
        setSearchTerm('');
        setIsFilterToSelected(true);
      }

      return next;
    });
  };

  // MST -> BossAssignmentRecord lookup, built once per bossAssignments change.
  // The Siêu Thị view renders/filters/sorts up to ~700+ store rows against a
  // BOSS file of similar size; doing that with a linear .find() per row (as
  // getBossForStore/getChannelForStore/getDtQdTbForStore do) means O(rows ×
  // bossAssignments) scans repeated on every render — the actual cause of the
  // freeze when switching into this view. A Map turns each row's lookup into O(1).
  const bossByMst = useMemo(() => {
    const map = new Map<string, BossAssignmentRecord>();
    bossAssignments.forEach((b) => {
      const mst = extractMst(b.sieuthi);
      if (mst) map.set(mst, b);
    });
    return map;
  }, [bossAssignments]);

  const resolveBoss = useCallback((sieuthi: string, fallbackBoss: string = 'Chưa phân công'): string => {
    const rawFallback = (fallbackBoss || '').replace(/^Boss\s+/i, '').trim();
    const mst = extractMst(sieuthi);
    const match = mst ? bossByMst.get(mst) : undefined;
    if (match && match.boss) {
      const cleaned = match.boss.replace(/^Boss\s+/i, '').trim();
      if (cleaned) return cleaned;
    }
    return rawFallback || 'Chưa phân công';
  }, [bossByMst]);

  const resolveKenh = useCallback((sieuthi: string, fallbackKenh: Channel | string = 'DML'): Channel | string => {
    const mst = extractMst(sieuthi);
    const match = mst ? bossByMst.get(mst) : undefined;
    if (match && match.kenh) return parseChannelValue(match.kenh);
    return fallbackKenh;
  }, [bossByMst]);

  const resolveDtQd = useCallback((sieuthi: string): string => {
    const mst = extractMst(sieuthi);
    const match = mst ? bossByMst.get(mst) : undefined;
    if (match && match.dtQdTb !== undefined && match.dtQdTb !== null && match.dtQdTb !== '') {
      return String(match.dtQdTb);
    }
    return '-';
  }, [bossByMst]);

  // Filter stores according to active user filters
  const hasSearch = Boolean(searchTerm.trim());

  const filteredStores = stores.filter((s) => {
    // Exclude stores with channel "OFF" or "LƯU ĐỘNG"
    const effectiveKenh = resolveKenh(s.sieuthi, s.kenh);
    const upperEffectiveKenh = (effectiveKenh || '').toString().toUpperCase().trim();
    const upperRawKenh = (s.kenh || '').toString().toUpperCase().trim();

    if (
      upperEffectiveKenh === 'OFF' ||
      upperEffectiveKenh.includes('OFFLINE') ||
      upperEffectiveKenh.includes('LƯU ĐỘNG') ||
      upperEffectiveKenh.includes('LUU DONG') ||
      upperRawKenh === 'OFF' ||
      upperRawKenh.includes('OFFLINE') ||
      upperRawKenh.includes('LƯU ĐỘNG') ||
      upperRawKenh.includes('LUU DONG')
    ) {
      return false;
    }

    const storeKey = s.id || s.sieuthi;

    // Search filter: When user types a search keyword, ALWAYS search across ALL stores & provinces
    // (allows user to search and select store #3, #4... even while currently in comparison mode)
    if (hasSearch) {
      const term = searchTerm.toLowerCase().trim();
      const matchSieuThi = s.sieuthi.toLowerCase().includes(term);
      const matchTinh = s.tinh.toLowerCase().includes(term);
      const matchBoss = s.boss.toLowerCase().includes(term);
      const matchEffectiveBoss = resolveBoss(s.sieuthi, s.boss).toLowerCase().includes(term);
      if (!matchSieuThi && !matchTinh && !matchBoss && !matchEffectiveBoss) return false;
      return true;
    }

    // When NOT searching:
    // If user activated comparison mode, only show the selected stores
    if (isFilterToSelected && selectedStoreIds.size > 0) {
      return selectedStoreIds.has(storeKey) || selectedStoreIds.has(s.sieuthi);
    }

    // Channel filter (derived from BOSS file assignments)
    if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) {
      return false;
    }

    // Province filter: ONLY applied when NOT searching
    // ("khi gõ tìm kiếm sẽ tìm kiếm all dữ liệu tỉnh, không bị giới hạn bởi bộ lọc tỉnh")
    if (!hasSearch && selectedProvince !== 'ALL' && s.tinh !== selectedProvince) {
      return false;
    }

    // Boss filter
    if (selectedBoss !== 'ALL') {
      const effectiveBoss = resolveBoss(s.sieuthi, s.boss);
      if (effectiveBoss !== selectedBoss && s.boss !== selectedBoss) {
        return false;
      }
    }

    return true;
  });

  // "VÙNG" scope shows one compact row per Tỉnh (rolling up every store in
  // that province) instead of one row per store — matches the BI region-level
  // report format. Rates are rounded to whole numbers at this rollup level
  // (no decimals), same as that report. The VÙNG button sets entityScope to
  // 'sieuthi' (see HeaderBanner) — the two buttons were swapped there per a
  // later request, so this check follows that swap rather than the literal
  // 'vung' string.
  const isProvinceView = entityScope === 'sieuthi';

  const baseRows: StoreRecord[] = isProvinceView
    ? (() => {
        const byTinh = new Map<string, {
          target: number;
          achieved: number;
          dtQdTbVal: number;
          rateSum: number;
          rateCount: number;
          catTotals: Record<string, { target: number; achieved: number; rateSum: number; count: number }>
        }>();
        filteredStores.forEach((s) => {
          const cur = byTinh.get(s.tinh) || { target: 0, achieved: 0, dtQdTbVal: 0, rateSum: 0, rateCount: 0, catTotals: {} };
          cur.target += s.target;
          cur.achieved += s.achieved;
          cur.dtQdTbVal += parseDtQdTbNum(resolveDtQd(s.sieuthi));
          // Store-level rate is parsed straight from the BI sheet's own %
          // column (prioritizing "% HT Dự Kiến" over "% HT Target Tháng" —
          // see updateHeaderMappings in parser.ts), so the province rollup
          // should average that already-correct number, not recompute a
          // different achieved/target ratio that ignores "dự kiến" entirely.
          cur.rateSum += (s.rate || 0);
          cur.rateCount += 1;
          const catKeys = new Set([
            ...Object.keys(s.categoryMap || {}),
            ...ALL_HARDCODED_CATEGORY_NAMES,
          ]);
          catKeys.forEach((cat) => {
            const data = getCategoryData(s, cat);
            if (data.target > 0 || data.achieved > 0 || data.rate > 0) {
              const c = cur.catTotals[cat] || { target: 0, achieved: 0, rateSum: 0, count: 0 };
              c.target += data.target;
              c.achieved += data.achieved;
              c.rateSum += (data.rate || 0);
              c.count += 1;
              cur.catTotals[cat] = c;
            }
          });
          byTinh.set(s.tinh, cur);
        });

        const zeroMetric = { achieved: 0, rate: 0 };
        return Array.from(byTinh.entries()).map(([tinh, agg], idx) => {
          const categoryMap: Record<string, { target: number; achieved: number; rate: number }> = {};
          Object.entries(agg.catTotals).forEach(([cat, c]) => {
            // For Realtime: calculate % from daily target vs realtime achieved (or average per-store rate)
            // For Luỹ Kế: average the per-store rates (sourced from % HT Dự Kiến)
            const rate = timeMode === 'realtime'
              ? (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : (c.count > 0 ? Math.round(c.rateSum / c.count) : 0))
              : (c.count > 0 ? Math.round(c.rateSum / c.count) : (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : 0));

            categoryMap[cat] = {
              target: Number(c.target.toFixed(2)),
              achieved: Number(c.achieved.toFixed(2)),
              rate,
            };
          });

          const dtQdTbVal = agg.dtQdTbVal > 0 ? agg.dtQdTbVal : getDtQdTbForProvince(tinh, bossAssignments);

          return {
            stt: idx + 1,
            id: `tinh_${tinh}`,
            tinh,
            boss: '',
            kenh: 'DML',
            sieuthi: tinh,
            target: Number(agg.target.toFixed(2)),
            achieved: Number(agg.achieved.toFixed(2)),
            dtQdTbVal,
            rate: timeMode === 'realtime'
              ? (agg.target > 0 ? Math.round((agg.achieved / agg.target) * 100) : (agg.rateCount > 0 ? Math.round(agg.rateSum / agg.rateCount) : 0))
              : (agg.rateCount > 0 ? Math.round(agg.rateSum / agg.rateCount) : (agg.target > 0 ? Math.round((agg.achieved / agg.target) * 100) : 0)),
            rank: 0,
            categoryMap,
            ict: zeroMetric,
            flagship: zeroMetric,
            phoneTablet: zeroMetric,
            phone: zeroMetric,
            laptop: zeroMetric,
            phukien: zeroMetric,
            dongho: zeroMetric,
            camera: zeroMetric,
            loa: zeroMetric,
            sacduphong: zeroMetric,
            tainghe: zeroMetric,
            dennangluong: zeroMetric,
            baohanh: zeroMetric,
          };
        });
      })()
    : filteredStores;

  // Ordered list of 38 categories grouped by categoryGroupMap (falling back to DEFAULT_CATEGORY_GROUP) and ordered by categoryOrderMap
  const orderedHardcodedCategoryNames = (() => {
    const grouped = new Map<string, string[]>();
    ALL_HARDCODED_CATEGORY_NAMES.forEach((cat) => {
      const groupName = getCategoryGroup(cat, categoryGroupMap);
      const list = grouped.get(groupName) || [];
      list.push(cat);
      grouped.set(groupName, list);
    });

    const result: string[] = [];
    Array.from(grouped.keys()).forEach((groupName) => {
      const catsInGroup = grouped.get(groupName) || [];
      catsInGroup.sort((a, b) => (categoryOrderMap[a] ?? 999) - (categoryOrderMap[b] ?? 999));
      result.push(...catsInGroup);
    });
    return result;
  })();

  // Ngành hàng belonging to the selected Nhóm (Category Group) — ordered by custom position ordering
  const categoriesInSelectedGroup =
    selectedCategoryGroup !== 'ALL'
      ? (() => {
          const selected = new Set(
            Object.keys(categoryGroupMap).filter((cat) => categoryGroupMap[cat] === selectedCategoryGroup)
          );
          const list = ALL_HARDCODED_CATEGORY_NAMES.filter((cat) => selected.has(cat));
          const unknown = Array.from(selected).filter((cat) => !ALL_HARDCODED_CATEGORY_NAMES.includes(cat));
          return [...list, ...unknown].sort(
            (a, b) => (categoryOrderMap?.[a] ?? 999) - (categoryOrderMap?.[b] ?? 999)
          );
        })()
      : [];

  // Whichever category columns are actually shown in the table right now
  const baseDisplayedCategoryNames = selectedCategoryGroup !== 'ALL' ? categoriesInSelectedGroup : orderedHardcodedCategoryNames;

  const selectedCategoriesList = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'ALL') return [];
    return selectedCategory.split(',').map((c) => c.trim()).filter(Boolean);
  }, [selectedCategory]);

  const displayedCategoryNames = selectedCategoriesList.length > 0
    ? baseDisplayedCategoryNames.filter((catName) => {
        const catLower = catName.toLowerCase().trim();
        return selectedCategoriesList.some((sel) => {
          const selLower = sel.toLowerCase().trim();
          return catLower === selLower || catLower.includes(selLower) || selLower.includes(catLower);
        });
      })
    : baseDisplayedCategoryNames;

  // Number of category columns actually rendered right now
  const categoryColumnCount = Math.max(displayedCategoryNames.length, 1);

  // When a specific custom Nhóm N.Hàng is filtered, every column shown
  // belongs to that ONE group by definition — color the whole selection as a
  // single band matching that group's own identity (ICT/Dịch vụ/CE&GD if the
  // name matches a known preset, else a neutral fallback), instead of
  // re-deriving each category's *native* preset group. Re-deriving natively
  // is what fragmented a category the user explicitly reassigned (e.g. "Sim
  // Tổng" moved into a custom "ICT" group) back into its old "Dịch vụ" color.
  const unifiedFilterStyle = selectedCategoryGroup !== 'ALL' ? resolveStyleByGroupName(selectedCategoryGroup) : null;

  // Contiguous same-preset-Nhóm runs within the active selection (only used
  // for the unfiltered "ALL" view, which can span multiple native Nhóm).
  const groupBandRuns: { style: ReturnType<typeof getPresetGroupStyle>; count: number }[] = unifiedFilterStyle
    ? (displayedCategoryNames.length > 0 ? [{ style: unifiedFilterStyle, count: displayedCategoryNames.length }] : [])
    : (() => {
        const runs: { style: ReturnType<typeof getPresetGroupStyle>; count: number }[] = [];
        displayedCategoryNames.forEach((cat) => {
          const style = getPresetGroupStyle(cat, categoryGroupMap);
          const last = runs[runs.length - 1];
          if (last && last.style.label === style.label) {
            last.count += 1;
          } else {
            runs.push({ style, count: 1 });
          }
        });
        return runs;
      })();

  // Cumulative left offsets (px) for the frozen info columns — must match the
  // <colgroup> widths below exactly, since sticky positioning needs a fixed
  // pixel left value per column, not a relative one. `total` (where the
  // first scrollable column starts) shrinks by the DTQĐ TB column's own
  // width (80px) when that column isn't rendered at all for this account.
  const FROZEN_LEFT = isProvinceView
    ? { stt: 0, tinh: 40, dat: 120, tyLe: 180, dtQdTb: 234, total: canViewDtQdTb ? 314 : 234 }
    : { stt: 0, tinh: 56, boss: 136, kenh: 236, sieuthi: 290, dat: 570, tyLe: 630, dtQdTb: 684, total: canViewDtQdTb ? 764 : 684 };

  // Map store metrics if a specific category or category group is selected.
  // A Nhóm selection takes precedence over a single Ngành hàng selection —
  // they're two different granularities of the same filter, not meant to combine.
  const storesToDisplay = baseRows.map((s) => {
    if (selectedCategoryGroup !== 'ALL') {
      let target = 0;
      let achieved = 0;
      let rateSum = 0;
      let count = 0;
      categoriesInSelectedGroup.forEach((cat) => {
        const catData = getCategoryData(s, cat);
        if (catData.target > 0 || catData.achieved > 0 || catData.rate > 0) {
          target += catData.target;
          achieved += catData.achieved;
          rateSum += (catData.rate || 0);
          count += 1;
        }
      });
      const rate = (target > 0 && achieved > 0)
        ? (isProvinceView ? Math.round((achieved / target) * 100) : Number(((achieved / target) * 100).toFixed(1)))
        : (count > 0 ? Math.round(rateSum / count) : 0);
      return { ...s, target, achieved, rate };
    }
    if (selectedCategoriesList.length === 1) {
      const catData = getCategoryData(s, selectedCategoriesList[0]);
      return {
        ...s,
        target: catData.target,
        achieved: catData.achieved,
        rate: catData.rate,
      };
    }
    if (selectedCategoriesList.length > 1) {
      let target = 0;
      let achieved = 0;
      let rateSum = 0;
      let count = 0;
      selectedCategoriesList.forEach((cat) => {
        const catData = getCategoryData(s, cat);
        if (catData.target > 0 || catData.achieved > 0 || catData.rate > 0) {
          target += catData.target;
          achieved += catData.achieved;
          rateSum += (catData.rate || 0);
          count += 1;
        }
      });
      const rate = (target > 0 && achieved > 0)
        ? (isProvinceView ? Math.round((achieved / target) * 100) : Number(((achieved / target) * 100).toFixed(1)))
        : (count > 0 ? Math.round(rateSum / count) : 0);
      return { ...s, target, achieved, rate };
    }
    return s;
  }).map((s) => {
    const achievedCount = displayedCategoryNames.filter((cat) => (getCategoryData(s, cat).rate ?? 0) >= 100).length;
    // TỶ LỆ % is (Số ngành hàng đạt >= 100%) / (Tổng số ngành hàng hiển thị) * 100
    // e.g. 18/38 đạt => Tỷ lệ = 18/38 * 100 = 47%
    const rate = selectedCategoriesList.length === 1
      ? Math.round(s.rate || 0)
      : (displayedCategoryNames.length > 0 ? Math.round((achievedCount / displayedCategoryNames.length) * 100) : 0);
    return { ...s, rate, achievedCategories: achievedCount };
  });

  // Sort stores
  const sortedStores = [...storesToDisplay].sort((a, b) => {
    // 1. Sort by CỘT ĐẠT (achieved count or achieved revenue)
    if (sortField === 'achieved') {
      const aAchievedCount = displayedCategoryNames.length > 0
        ? displayedCategoryNames.filter((cat) => (getCategoryData(a, cat).rate ?? 0) >= 100).length
        : (a.achieved || 0);
      const bAchievedCount = displayedCategoryNames.length > 0
        ? displayedCategoryNames.filter((cat) => (getCategoryData(b, cat).rate ?? 0) >= 100).length
        : (b.achieved || 0);
      const diff = aAchievedCount - bAchievedCount;
      if (diff !== 0) return sortOrder === 'asc' ? diff : -diff;
      // Secondary sort: % rate
      return sortOrder === 'asc' ? (a.rate || 0) - (b.rate || 0) : (b.rate || 0) - (a.rate || 0);
    }

    // 2. Sort by TỶ LỆ % (rate)
    if (sortField === 'rate') {
      const diff = (a.rate || 0) - (b.rate || 0);
      if (diff !== 0) return sortOrder === 'asc' ? diff : -diff;
      // Secondary sort: achieved count
      const aAchievedCount = displayedCategoryNames.length > 0
        ? displayedCategoryNames.filter((cat) => (getCategoryData(a, cat).rate ?? 0) >= 100).length
        : (a.achieved || 0);
      const bAchievedCount = displayedCategoryNames.length > 0
        ? displayedCategoryNames.filter((cat) => (getCategoryData(b, cat).rate ?? 0) >= 100).length
        : (b.achieved || 0);
      return sortOrder === 'asc' ? aAchievedCount - bAchievedCount : bAchievedCount - aAchievedCount;
    }

    // 3. Sort by KÊNH
    if (sortField === 'kenh') {
      const aKenh = resolveKenh(a.sieuthi, a.kenh);
      const bKenh = resolveKenh(b.sieuthi, b.kenh);
      const channelDiff = getChannelRank(aKenh) - getChannelRank(bKenh);
      if (channelDiff !== 0) return sortOrder === 'asc' ? channelDiff : -channelDiff;
      // Secondary sort: achieved count descending
      const aAchievedCount = displayedCategoryNames.filter((cat) => (getCategoryData(a, cat).rate ?? 0) >= 100).length;
      const bAchievedCount = displayedCategoryNames.filter((cat) => (getCategoryData(b, cat).rate ?? 0) >= 100).length;
      return bAchievedCount - aAchievedCount;
    }

    // 4. Sort by STT / Rank
    if (sortField === 'rank' || sortField === 'stt') {
      const aVal = a.stt;
      const bVal = b.stt;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // 5. Sort by TỈNH
    if (sortField === 'tinh') {
      return sortOrder === 'asc' ? a.tinh.localeCompare(b.tinh, 'vi') : b.tinh.localeCompare(a.tinh, 'vi');
    }

    // 6. Sort by BOSS
    if (sortField === 'boss') {
      const aVal = resolveBoss(a.sieuthi, a.boss);
      const bVal = resolveBoss(b.sieuthi, b.boss);
      return sortOrder === 'asc' ? aVal.localeCompare(bVal, 'vi') : bVal.localeCompare(aVal, 'vi');
    }

    // 7. Sort by SIÊU THỊ
    if (sortField === 'sieuthi') {
      return sortOrder === 'asc' ? a.sieuthi.localeCompare(b.sieuthi, 'vi') : b.sieuthi.localeCompare(a.sieuthi, 'vi');
    }

    // 8. Sort by DTQĐ TB
    if (sortField === 'dtQdTb') {
      const aVal = isProvinceView
        ? (a as any).dtQdTbVal || 0
        : parseDtQdTbNum(resolveDtQd(a.sieuthi));
      const bVal = isProvinceView
        ? (b as any).dtQdTbVal || 0
        : parseDtQdTbNum(resolveDtQd(b.sieuthi));
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // 9. Sort by a specific category column (e.g. CAMERA, LAPTOP)
    if (sortField !== 'default') {
      const aCat = a.categoryMap?.[sortField];
      const bCat = b.categoryMap?.[sortField];
      const aVal = aCat ? aCat.rate : -999;
      const bVal = bCat ? bCat.rate : -999;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // 10. DEFAULT TABLE SORTING (Tab Siêu thị & Vùng):
    // 1. Kênh theo thứ tự: ĐML > ĐMM > ĐMS > TGD > TopZone
    const aKenh = resolveKenh(a.sieuthi, a.kenh);
    const bKenh = resolveKenh(b.sieuthi, b.kenh);
    const channelDiff = getChannelRank(aKenh) - getChannelRank(bKenh);
    if (channelDiff !== 0) return channelDiff;

    // 2. Cột ĐẠT giảm dần (18/38 > 16/38 > 12/38 > 11/38...)
    const aAchievedCount = displayedCategoryNames.filter((cat) => (getCategoryData(a, cat).rate ?? 0) >= 100).length;
    const bAchievedCount = displayedCategoryNames.filter((cat) => (getCategoryData(b, cat).rate ?? 0) >= 100).length;
    const achievedDiff = bAchievedCount - aAchievedCount;
    if (achievedDiff !== 0) return achievedDiff;

    // 3. Tỷ lệ % giảm dần
    return (b.rate || 0) - (a.rate || 0);
  });

  // Paginate the Siêu Thị (per-store) view — Vùng rollup is already short
  // (one row per tỉnh) and never needs it. forceShowAllRows overrides this
  // for image export, which needs every row present in the DOM to capture.
  const showAllRows = isProvinceView || forceShowAllRows;
  const totalPages = showAllRows ? 1 : Math.max(1, Math.ceil(sortedStores.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = showAllRows ? 0 : (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedStores = showAllRows
    ? sortedStores
    : sortedStores.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);

  // Any change that reshuffles or re-filters the list should land back on
  // page 1 — otherwise switching tỉnh/kênh/search could leave the view on a
  // now out-of-range page showing nothing.
  useEffect(() => {
    setCurrentPage(1);
  }, [entityScope, selectedProvince, selectedBoss, selectedChannels, selectedCategory, selectedCategoryGroup, searchTerm, sortField, sortOrder, timeMode]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const isLuyke = timeMode === 'luyke';
  const frozenHeaderThClass = 'border-r border-teal-900 bg-teal-800 text-white cursor-pointer hover:bg-teal-700';

  const activeChannelsText =
    selectedChannels.length === 5 || selectedChannels.length === 0
      ? 'TẤT CẢ KÊNH'
      : selectedChannels.join(', ');

  // Dynamic Header Titles
  const mainHeaderTitle = (() => {
    const modeStr = isLuyke ? 'LUỸ KẾ' : 'REALTIME';
    if (selectedCategoryGroup && selectedCategoryGroup !== 'ALL') {
      return `${modeStr} THI ĐUA NHÓM ${selectedCategoryGroup.toUpperCase()}`;
    }
    if (selectedCategoriesList.length === 1) {
      const catName = resolveCategoryDisplayName(selectedCategoriesList[0], categoryDisplayNameMap).toUpperCase();
      return `${modeStr} THI ĐUA NGÀNH HÀNG ${catName}`;
    }
    if (selectedCategoriesList.length > 1) {
      return `${modeStr} THI ĐUA ${selectedCategoriesList.length} NGÀNH HÀNG ĐÃ CHỌN`;
    }
    return `${modeStr} THI ĐUA NGÀNH HÀNG THÁNG 08/2026`;
  })();

  const subHeaderTitle = (() => {
    if (selectedCategoriesList.length === 1) {
      const catName = resolveCategoryDisplayName(selectedCategoriesList[0], categoryDisplayNameMap).toUpperCase();
      return `CHỈ TÍNH THI ĐUA ${catName}`;
    }
    if (selectedCategoriesList.length > 1) {
      return `CHỈ TÍNH ${selectedCategoriesList.length} NGÀNH HÀNG ĐÃ CHỌN`;
    }
    if (selectedCategoryGroup && selectedCategoryGroup !== 'ALL') {
      return `CHỈ TÍNH THI ĐUA NHÓM ${selectedCategoryGroup.toUpperCase()}`;
    }
    const cleanChannels = selectedChannels.filter((c) => {
      const u = String(c).toUpperCase();
      return u !== 'LUUDONG' && !u.includes('LƯU ĐỘNG') && !u.includes('LUU DONG') && u !== 'OFF' && u !== 'OFFLINE';
    });
    if (cleanChannels.length === 5 || cleanChannels.length === 0) {
      return `CHỈ TÍNH 5 KÊNH CHÍNH (DML, DMM, DMS, TGD, TOPZONE)`;
    }
    return `CHỈ TÍNH KÊNH ${cleanChannels.join(', ')}`;
  })();

  const totalDtQdTb = isProvinceView
    ? sortedStores.reduce((acc, s) => acc + ((s as any).dtQdTbVal || 0), 0)
    : sortedStores.reduce((acc, s) => acc + parseDtQdTbNum(resolveDtQd(s.sieuthi)), 0);

  // Region-wide average rate per displayed ngành hàng — feeds the TỔNG CỘNG
  // row's per-category cells AND (for Vùng view) the region's overall ĐẠT/TỶ
  // LỆ, so the KPI card and the table's total row always agree.
  const categoryAverages = displayedCategoryNames.map((cName) => {
    let totalT = 0, totalA = 0, rateSum = 0, count = 0;
    storesToDisplay.forEach((s) => {
      const catData = getCategoryData(s, cName);
      if (catData.target > 0 || catData.achieved > 0 || catData.rate > 0) {
        totalT += catData.target;
        totalA += catData.achieved;
        rateSum += (catData.rate || 0);
        count += 1;
      }
    });
    // Average the already-correct per-store/per-province rates (sourced from
    // "% HT Dự Kiến") instead of recomputing from achieved/target — see the
    // province rollup above for the same fix and reasoning.
    const avgRate = count > 0
      ? Math.round(rateSum / count)
      : (totalT > 0 ? Math.round((totalA / totalT) * 100) : 0);
    return { cName, totalT, totalA, avgRate };
  });

  // TỔNG CỘNG row's "ĐẠT" cell counts Nhóm thi đua (ICT / Dịch vụ / CE & Gia
  // dụng — or the single filtered Nhóm N.Hàng) that reached >= 100% overall,
  // out of the total Nhóm shown — a coarser, group-level version of each
  // Tỉnh row's own ngành-hàng-level "ĐẠT" count.
  const nhomTotalsForFooter = (() => {
    const buckets = new Map<string, { catRates: number[]; targetSum: number; achievedSum: number }>();
    categoryAverages.forEach(({ cName, totalT, totalA, avgRate }) => {
      const label = selectedCategoryGroup !== 'ALL' ? selectedCategoryGroup : getPresetGroupStyle(cName).label;
      const b = buckets.get(label) || { catRates: [], targetSum: 0, achievedSum: 0 };
      b.catRates.push(avgRate);
      b.targetSum += totalT;
      b.achievedSum += totalA;
      buckets.set(label, b);
    });
    return Array.from(buckets.entries()).map(([label, b]) => {
      const avgOfCatRates = b.catRates.length > 0 ? b.catRates.reduce((acc, curr) => acc + curr, 0) / b.catRates.length : 0;
      const weightedRate = b.targetSum > 0 ? (b.achievedSum / b.targetSum) * 100 : 0;
      const rate = Math.max(avgOfCatRates, weightedRate);
      return {
        label,
        rate,
      };
    });
  })();

  // Calculate Region Totals
  const totalTarget = storesToDisplay.reduce((acc, s) => acc + s.target, 0);
  const totalAchieved = storesToDisplay.reduce((acc, s) => acc + s.achieved, 0);
  const overallRate = categoryAverages.length > 0
    ? Math.round((categoryAverages.filter((c) => c.avgRate >= 100).length / categoryAverages.length) * 100)
    : 0;

  const top1Store = sortedStores.length > 0 ? sortedStores[0] : null;
  const reachedCount = storesToDisplay.filter((s) => s.rate >= 100).length;
  const warningCount = storesToDisplay.filter((s) => s.rate < 80).length;

  // Prepare data for Recharts top 8 stores
  const chartTopStores = sortedStores.slice(0, 8).map((s) => ({
    name: s.tinh + ' - ' + s.sieuthi.split('(')[0],
    rate: s.rate,
    achieved: s.achieved,
    target: s.target,
  }));

  // Group performance by Province
  const provinceMap = new Map<string, { target: number; achieved: number }>();
  storesToDisplay.forEach((s) => {
    const cur = provinceMap.get(s.tinh) || { target: 0, achieved: 0 };
    provinceMap.set(s.tinh, {
      target: cur.target + s.target,
      achieved: cur.achieved + s.achieved,
    });
  });

  const exportMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  const provinceChartData = Array.from(provinceMap.entries()).map(([tinh, stat]) => ({
    tinh,
    rate: stat.target > 0 ? Number(((stat.achieved / stat.target) * 100).toFixed(1)) : 0,
    achieved: stat.achieved,
  })).sort((a, b) => b.rate - a.rate);

  if (entityScope === 'nhom') {
    return (
      <GroupReportView
        timeMode={timeMode}
        lastUpdated={lastUpdated}
        stores={stores}
        selectedChannels={selectedChannels}
        selectedProvince={selectedProvince}
        selectedBoss={selectedBoss}
        selectedCategory={selectedCategory}
        selectedCategoryGroup={selectedCategoryGroup}
        categoryGroupMap={categoryGroupMap}
        categoryOrderMap={categoryOrderMap}
        categoryDisplayNameMap={categoryDisplayNameMap}
        bossAssignments={bossAssignments}
        onOpenTagBossModal={onOpenTagBossModal}
      />
    );
  }

  return (
    <div id="report-export-root" className="space-y-4 animate-fade-in">
      {/* Main Leaderboard Table Section */}
      <div id="report-table-export-root" className="bg-white rounded-none border border-slate-200 shadow-xs overflow-hidden space-y-4">
        {/* Table Controls Top Bar */}
        <div className="p-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 text-lg sm:text-2xl tracking-tight uppercase truncate">
                {mainHeaderTitle}
              </h3>
              <p className="text-xs sm:text-sm font-extrabold text-slate-600 flex flex-wrap items-center gap-2 mt-1">
                <span className="text-red-600 font-black">{subHeaderTitle}</span>
                {lastUpdated && (() => {
                  const freshness = checkDataFreshness(lastUpdated, 60);
                  const updateTimeStr = freshness.displayText.replace(/\s*NGÀY\s*/i, ' - ').replace(/\/20\d\d/, '');
                  return (
                    <>
                      {/* Trạng thái trên màn hình web: Có cảnh báo đỏ nếu dữ liệu cũ */}
                      <span className="export-hide inline-flex items-center gap-2">
                        <span className="text-slate-300">|</span>
                        {freshness.isOutdated ? (
                          <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-300 font-black animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-bounce" />
                            Update: {updateTimeStr}
                            <span className="text-[9px] px-1 bg-rose-600 text-white rounded-sm font-black uppercase">Cũ &gt; 1h</span>
                          </span>
                        ) : (
                          <span className="text-sky-700 font-black">
                            Update: {updateTimeStr}
                          </span>
                        )}
                      </span>

                      {/* Trạng thái khi xuất ảnh: Luôn hiển thị chữ màu bình thường, không khung đỏ, không icon cảnh báo */}
                      <span className="export-show hidden text-slate-500 font-bold text-xs sm:text-sm items-center gap-1.5">
                        <span className="text-slate-300">|</span>
                        <span>Update: {updateTimeStr}</span>
                      </span>
                    </>
                  );
                })()}
              </p>
            </div>
          </div>

          {/* Quick Search Field & Action Buttons — forced onto 1 single horizontal line */}
          <div className="export-hide flex flex-nowrap items-center gap-2 overflow-x-auto max-w-full shrink-0 ml-auto">
            <div className="relative w-48 xl:w-56 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm Siêu thị, Tỉnh, Boss..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0 focus:border-slate-300 shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  title="Xóa tìm kiếm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Nhận xét Button */}
            {onOpenTagBossModal && (
              <button
                onClick={onOpenTagBossModal}
                className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap shrink-0"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Nhận xét</span>
              </button>
            )}

            {/* Export 3 Groups (3 Tấm) */}
            <button
              onClick={() => (onExportGroup ? onExportGroup('by_groups') : onExportCompact?.())}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap shrink-0"
              title="Tự động xuất 3 tấm ảnh theo 3 nhóm ngành hàng riêng lẻ (ICT, DỊCH VỤ, CE & GIA DỤNG)"
            >
              <Layers className="w-3.5 h-3.5 text-white" />
              <span>Xuất 3 Nhóm (3 Tấm)</span>
            </button>

            {/* Combined Export All (1 Tấm) + Dropdown button group */}
            <div ref={exportMenuRef} className="relative inline-flex shadow-2xs shrink-0">
              <button
                type="button"
                onClick={() => (onExportGroup ? onExportGroup('all') : onExportFull?.())}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap rounded-l-xl"
                title="Xuất 1 tấm ảnh đầy đủ bảng xếp hạng tất cả 38 ngành hàng"
              >
                <Grid className="w-3.5 h-3.5 text-white" />
                <span>Xuất Tất Cả (1 Tấm)</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExportMenuOpen(!isExportMenuOpen);
                }}
                className="px-2 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs flex items-center justify-center cursor-pointer transition-all border-l border-blue-500 rounded-r-xl"
                title="Tùy chọn xuất từng nhóm"
              >
                <ChevronDown className={`w-3.5 h-3.5 text-white transition-transform duration-200 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100] py-1.5 font-sans text-xs animate-scale-up">
                  <button
                    onClick={() => {
                      if (onExportGroup) onExportGroup('ict');
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-amber-50 hover:text-amber-900 font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Xuất Nhóm ICT (12 ngành hàng)</span>
                  </button>

                  <button
                    onClick={() => {
                      if (onExportGroup) onExportGroup('dichvu');
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Xuất Nhóm Dịch Vụ (13 ngành hàng)</span>
                  </button>

                  <button
                    onClick={() => {
                      if (onExportGroup) onExportGroup('ce');
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-900 font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Tv className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Xuất Nhóm CE & GD (13 ngành hàng)</span>
                  </button>

                  <div className="border-t border-slate-100 my-1"></div>

                  <button
                    onClick={() => {
                      if (onExportGroup) onExportGroup('all');
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-800 hover:bg-indigo-50 hover:text-indigo-900 font-extrabold flex items-center gap-2 cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Xuất Tất Cả (1 Tấm)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Comparison Floating / Highlight Bar (when 1 or more stores are selected) */}
        {!isProvinceView && selectedStoreIds.size > 0 && (
          <div className="export-hide mx-3.5 mb-3 p-2.5 bg-gradient-to-r from-slate-900 via-sky-900 to-indigo-950 text-white rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-3 animate-fade-in border border-sky-600/50">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-slate-950 font-black text-xs shadow-xs">
                {selectedStoreIds.size}
              </span>
              <span className="font-extrabold text-xs text-amber-200">
                Đã chọn {selectedStoreIds.size} siêu thị để so sánh hiệu quả thi đua
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFilterToSelected(!isFilterToSelected)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 ${
                  isFilterToSelected
                    ? 'bg-amber-400 text-slate-950 hover:bg-amber-300 ring-2 ring-amber-300'
                    : 'bg-sky-500 hover:bg-sky-400 text-white'
                }`}
              >
                {isFilterToSelected ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hiện tất cả siêu thị</span>
                  </>
                ) : (
                  <>
                    <Scale className="w-3.5 h-3.5" />
                    <span>Chỉ so sánh {selectedStoreIds.size} siêu thị này</span>
                  </>
                )}
              </button>

              {/* Chuyển Bảng Dọc / Bảng Ngang */}
              <button
                type="button"
                onClick={() => {
                  if (!isFilterToSelected) setIsFilterToSelected(true);
                  setComparisonLayout(comparisonLayout === 'vertical' ? 'horizontal' : 'vertical');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 border ${
                  comparisonLayout === 'vertical' && isFilterToSelected
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300 ring-2 ring-emerald-300'
                    : 'bg-indigo-600/90 hover:bg-indigo-500 text-white border-indigo-400/50'
                }`}
                title="Chuyển đổi giữa Chế độ Bảng Dọc (so sánh từng dòng ngành hàng) và Bảng Ngang"
              >
                {comparisonLayout === 'vertical' && isFilterToSelected ? (
                  <>
                    <Grid className="w-3.5 h-3.5" />
                    <span>Xem Bảng ngang</span>
                  </>
                ) : (
                  <>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>Xem Bảng dọc</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedStoreIds(new Set());
                  setIsFilterToSelected(false);
                  setComparisonLayout('horizontal');
                }}
                className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                title="Bỏ chọn tất cả siêu thị"
              >
                <X className="w-3.5 h-3.5" />
                <span>Bỏ chọn</span>
              </button>
            </div>
          </div>
        )}

        {/* If in Vertical Comparison Mode, render VerticalComparisonTable */}
        {!isProvinceView && isFilterToSelected && comparisonLayout === 'vertical' && sortedStores.length > 0 ? (
          <VerticalComparisonTable
            stores={sortedStores}
            displayedCategoryNames={displayedCategoryNames}
            categoryDisplayNameMap={categoryDisplayNameMap}
            categoryGroupMap={categoryGroupMap}
            timeMode={timeMode}
            valueDisplayMode={valueDisplayMode}
            canViewDtQdTb={canViewDtQdTb}
            onRemoveStore={(storeKey) => toggleStoreSelection(storeKey)}
            resolveBoss={resolveBoss}
            resolveKenh={resolveKenh}
            resolveDtQd={resolveDtQd}
            totalCatCount={displayedCategoryNames.length}
          />
        ) : (
          /* Scrollable Data Table matching user screenshot #4 header design */
          <div className="overflow-x-auto overflow-y-visible select-none border border-slate-200 rounded-none">
          <table className="w-full text-left border-separate border-spacing-0 text-xs whitespace-nowrap table-fixed">
            {/* table-fixed makes the <col> widths below authoritative instead of
                merely a hint — without it, browsers just widen a column to fit
                a header's unbroken text rather than wrapping it. */}
            <colgroup>
              {isProvinceView ? (
                <>
                  <col style={{ width: 40 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 54 }} />
                  {canViewDtQdTb && <col className="export-hide" style={{ width: 80 }} />}
                </>
              ) : (
                <>
                  <col style={{ width: 56 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 54 }} />
                  <col className="col-sieuthi" data-col="sieuthi" style={{ width: 280 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 54 }} />
                  {canViewDtQdTb && <col className="export-hide" style={{ width: 80 }} />}
                </>
              )}
              {(displayedCategoryNames.length > 0 ? displayedCategoryNames : Array.from({ length: categoryColumnCount })).map((cat, i) => (
                <col
                  key={i}
                  data-group={typeof cat === 'string' ? getGroupTag((unifiedFilterStyle || getPresetGroupStyle(cat, categoryGroupMap)).label) : undefined}
                  style={{ width: 54 }}
                />
              ))}
            </colgroup>
            {/* Table Header — each Nhóm gets its own pastel hue; the group
                band (row 1, "tiêu đề chính") uses a deeper pastel shade than
                the individual column headers below it (row 2, "tiêu đề phụ") */}
            <thead className="sticky top-0 z-30 shadow-xs">
              {/* Category Group Header Line */}
              <tr className="font-extrabold text-xs uppercase tracking-wider text-center">
                {/* Frozen Information & Rollup Columns — Span 2 rows directly, removing 'THÔNG TIN CƠ BẢN' & 'TỔNG CỘNG' row 1 headers */}
                <th
                  rowSpan={2}
                  onClick={() => handleSort('rank')}
                  style={{ left: FROZEN_LEFT.stt, top: 0 }}
                  className={`sticky z-40 py-1.5 px-1 ${frozenHeaderThClass} align-middle text-center ${isProvinceView ? 'w-[40px]' : 'w-[56px]'} select-none`}
                  title="Click để sắp xếp theo STT (Click vào STT từng dòng để chọn so sánh)"
                >
                  STT {(sortField === 'rank' || sortField === 'stt') ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th
                  rowSpan={2}
                  onClick={() => handleSort('tinh')}
                  style={{ left: FROZEN_LEFT.tinh, top: 0 }}
                  className={`sticky z-40 py-1.5 px-2 ${frozenHeaderThClass} align-middle text-center w-[80px] whitespace-normal break-words leading-[1.1] select-none`}
                  title="Click để sắp xếp theo Tỉnh"
                >
                  TỈNH {sortField === 'tinh' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>

                {!isProvinceView && (
                  <>
                    <th
                      rowSpan={2}
                      onClick={() => handleSort('boss')}
                      style={{ left: FROZEN_LEFT.boss, top: 0 }}
                      className={`sticky z-40 py-1.5 px-2 ${frozenHeaderThClass} align-middle text-center w-[100px] select-none`}
                      title="Click để sắp xếp theo Boss"
                    >
                      BOSS {sortField === 'boss' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>

                    <th
                      rowSpan={2}
                      onClick={() => handleSort('kenh')}
                      style={{ left: FROZEN_LEFT.kenh, top: 0 }}
                      className={`sticky z-40 py-1.5 px-1 ${frozenHeaderThClass} align-middle text-center w-[60px] select-none`}
                      title="Click để sắp xếp theo Kênh"
                    >
                      KÊNH {sortField === 'kenh' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>

                    <th
                      rowSpan={2}
                      onClick={() => handleSort('sieuthi')}
                      style={{ left: FROZEN_LEFT.sieuthi, top: 0 }}
                      className={`sticky z-40 py-1.5 px-2.5 ${frozenHeaderThClass} align-middle text-center w-[280px] whitespace-normal break-words leading-[1.1] select-none`}
                      title="Click để sắp xếp theo Siêu Thị"
                    >
                      SIÊU THỊ {sortField === 'sieuthi' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  </>
                )}

                <th
                  rowSpan={2}
                  onClick={() => handleSort('achieved')}
                  style={{ left: FROZEN_LEFT.dat, top: 0 }}
                  className={`sticky z-40 py-1.5 px-1 ${frozenHeaderThClass} align-middle text-center w-[60px] whitespace-normal break-words leading-[1.1] font-extrabold select-none`}
                  title="Click để sắp xếp theo Đạt"
                >
                  ĐẠT {sortField === 'achieved' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>

                <th
                  rowSpan={2}
                  onClick={() => handleSort('rate')}
                  style={{ left: FROZEN_LEFT.tyLe, top: 0 }}
                  className={`sticky z-40 py-1.5 px-1 ${frozenHeaderThClass} align-middle text-center w-[54px] whitespace-normal break-words leading-[1.1] font-extrabold select-none`}
                  title="Click để sắp xếp theo Tỷ lệ %"
                >
                  TỶ LỆ % {sortField === 'rate' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>

                {canViewDtQdTb && (
                  <th
                    rowSpan={2}
                    onClick={() => handleSort('dtQdTb')}
                    style={{ left: FROZEN_LEFT.dtQdTb, top: 0 }}
                    className={`export-hide sticky z-40 py-1.5 px-1 ${frozenHeaderThClass} align-middle text-center w-[80px] whitespace-normal break-words leading-[1.1] font-extrabold select-none text-[10px]`}
                    title="Click để sắp xếp theo DTQĐ TB 5T2026"
                  >
                    DTQĐ TB 5T2026 {sortField === 'dtQdTb' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                )}

                {groupBandRuns.length > 0 ? (
                  groupBandRuns.map((run, i) => (
                    <th
                      key={i}
                      data-group={getGroupTag(run.style.label)}
                      colSpan={run.count}
                      className={`py-1.5 ${run.style.band} ${i < groupBandRuns.length - 1 ? `border-r ${run.style.bandBorder}` : ''}`}
                    >
                      {run.style.label} ({run.count} NGÀNH HÀNG)
                    </th>
                  ))
                ) : (
                  <th className={`py-1.5 ${UNKNOWN_GROUP_STYLE.band}`}>
                    {selectedCategoryGroup !== 'ALL' ? selectedCategoryGroup.toUpperCase() : 'KHÔNG CÓ NGÀNH HÀNG'} (0 NGÀNH HÀNG)
                  </th>
                )}
              </tr>

              {/* Specific Category Column Headers (Row 2 — frozen info columns spanned from Row 1 above) */}
              <tr className="font-bold text-[10px] uppercase border-b border-slate-200">

                {displayedCategoryNames.length > 0 ? (
                  displayedCategoryNames.map((cat) => {
                    const style = unifiedFilterStyle || getPresetGroupStyle(cat, categoryGroupMap);
                    const groupTag = getGroupTag(style.label);
                    const isSorted = sortField === cat;
                    return (
                      <th
                        key={cat}
                        data-group={groupTag}
                        onClick={() => handleSort(cat)}
                        title={`Ngành hàng: ${cat} (Click để sắp xếp)`}
                        className={`py-1 px-1 border-r ${style.cellBorder} ${style.cell} text-center w-[54px] max-w-[65px] align-middle font-bold text-[10px] uppercase cursor-pointer hover:brightness-95 transition-all select-none`}
                      >
                        <div className="max-w-[52px] mx-auto break-words whitespace-pre-line leading-[1.1] text-center flex flex-col items-center justify-center">
                          <span>{formatCategoryHeaderTitle(resolveCategoryDisplayName(cat, categoryDisplayNameMap), 6)}</span>
                          {isSorted && (
                            <span className="text-[9px] text-indigo-900 font-black mt-0.5">
                              {sortOrder === 'asc' ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })
                ) : (
                  <th className={`py-2 px-1.5 ${UNKNOWN_GROUP_STYLE.cell} text-center w-[54px] whitespace-normal break-words leading-[1.1] align-middle`}>
                    NHÓM CHƯA CÓ NGÀNH HÀNG
                  </th>
                )}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200 bg-white font-mono text-xs">
              {paginatedStores.map((store, i) => {
                const index = pageStartIndex + i; // global rank, not the on-page position
                const isTop1 = index === 0;
                const isTop2 = index === 1;
                const isTop3 = index === 2;

                const renderCatRate = (catName: string, fallbackMetric?: { rate: number; achieved?: number }) => {
                  const catData = getCategoryData(store, catName);
                  const rateVal = catData ? catData.rate : fallbackMetric ? fallbackMetric.rate : 0;
                  const achievedVal = catData ? catData.achieved : fallbackMetric?.achieved ? fallbackMetric.achieved : 0;

                  if (valueDisplayMode === 'value') {
                    if (achievedVal === 0) {
                      return <span className="font-bold text-slate-400">0</span>;
                    }
                    return (
                      <span
                        className={
                          rateVal >= 100
                            ? 'font-black text-emerald-600 bg-emerald-50 px-1 rounded'
                            : rateVal >= 80
                            ? 'font-extrabold text-slate-800'
                            : 'font-extrabold text-slate-700'
                        }
                      >
                        {achievedVal >= 1000
                          ? Math.round(achievedVal).toLocaleString('vi-VN')
                          : achievedVal % 1 !== 0
                          ? Number(achievedVal.toFixed(1)).toLocaleString('vi-VN')
                          : achievedVal.toLocaleString('vi-VN')}
                      </span>
                    );
                  }

                  if (rateVal === 0) {
                    return <span className="font-extrabold text-rose-600">0%</span>;
                  }

                  return (
                    <span
                      className={
                        rateVal >= 100
                          ? 'font-black text-emerald-500 bg-emerald-50 px-1 rounded'
                          : rateVal >= 80
                          ? 'font-extrabold text-slate-800'
                          : 'font-extrabold text-rose-600'
                      }
                    >
                      {Math.round(rateVal)}%
                    </span>
                  );
                };

                const storeKey = store.id || store.sieuthi;
                const isSelected = selectedStoreIds.has(storeKey) || selectedStoreIds.has(store.sieuthi);

                const rowBgClass = isSelected
                  ? 'bg-sky-100 font-medium'
                  : index % 2 === 0
                  ? 'bg-white'
                  : 'bg-slate-50';

                return (
                  <tr
                    key={store.id}
                    className={`hover:bg-indigo-100 transition-colors ${rowBgClass}`}
                  >
                    {/* Rank STT — sticky (frozen) column with Compare Checkbox */}
                    <td
                      style={{ left: FROZEN_LEFT.stt }}
                      className={`sticky z-10 py-2 px-1 text-center border-r border-b border-slate-200 font-sans ${rowBgClass}`}
                    >
                      {!isProvinceView ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStoreSelection(storeKey);
                          }}
                          title={isSelected ? "Bỏ chọn so sánh siêu thị này" : "Chọn siêu thị này để so sánh"}
                          className="group/btn flex items-center justify-center gap-1 mx-auto cursor-pointer focus:outline-none"
                        >
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                            isSelected 
                              ? 'bg-sky-600 border-sky-600 text-white shadow-xs' 
                              : 'border-slate-300 bg-white group-hover/btn:border-sky-400'
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </span>
                          <span className={`font-bold text-xs ${isSelected ? 'text-sky-800' : 'text-slate-600'}`}>
                            #{index + 1}
                          </span>
                        </button>
                      ) : (
                        <span className="font-bold text-slate-600 text-xs">#{index + 1}</span>
                      )}
                    </td>

                    {/* Tỉnh — sticky (frozen) column */}
                    <td style={{ left: FROZEN_LEFT.tinh }} className={`sticky z-10 py-2 px-2.5 font-bold text-slate-900 border-r border-b border-slate-200 font-sans ${rowBgClass}`}>
                      {store.tinh}
                    </td>

                    {!isProvinceView && (
                      <>
                        {/* Boss — sticky (frozen) column */}
                        <td style={{ left: FROZEN_LEFT.boss }} className={`sticky z-10 py-2 px-2 text-center border-r border-b border-slate-200 font-sans ${rowBgClass}`}>
                          <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-extrabold text-[11px] whitespace-nowrap">
                            {resolveBoss(store.sieuthi, store.boss)}
                          </span>
                        </td>

                        {/* Kênh — sticky (frozen) column derived from BOSS file */}
                        <td style={{ left: FROZEN_LEFT.kenh }} className={`sticky z-10 py-2 px-1 text-center border-r border-b border-slate-200 font-sans text-xs ${rowBgClass}`}>
                          {(() => {
                            const effectiveKenh = resolveKenh(store.sieuthi, store.kenh);
                            return (
                              <span
                                className={`inline-block px-1 py-0.5 rounded text-[9.5px] font-extrabold ${
                                  effectiveKenh === 'DML'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : effectiveKenh === 'TGD'
                                    ? 'bg-amber-100 text-amber-800'
                                    : effectiveKenh === 'DMM'
                                    ? 'bg-blue-100 text-blue-800'
                                    : effectiveKenh === 'TopZone'
                                    ? 'bg-sky-100 text-sky-800 border border-sky-300'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {effectiveKenh}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Siêu thị — sticky (frozen) column */}
                        <td style={{ left: FROZEN_LEFT.sieuthi }} className={`sticky z-10 py-2 px-2.5 font-bold text-slate-900 border-r border-b border-slate-200 font-sans whitespace-nowrap min-w-[280px] ${rowBgClass}`}>
                          <span data-store-name={store.sieuthi} className="store-name-cell">
                            {formatStoreDisplayName(store.sieuthi)}
                          </span>
                        </td>
                      </>
                    )}

                    {/* Đạt: Count of ngành hàng that reached >= 100% out of displayed ngành hàng */}
                    <td style={{ left: FROZEN_LEFT.dat }} className={`sticky z-10 py-2 px-2.5 border-r border-b border-slate-200 font-extrabold text-slate-900 text-center ${rowBgClass}`}>
                      {`${displayedCategoryNames.filter((cat) => (getCategoryData(store, cat).rate ?? 0) >= 100).length}/${displayedCategoryNames.length}`}
                    </td>

                    {/* Tỷ lệ % Completion — whole cell filled with the status
                        color, no inner bordered pill; sticky (frozen) column */}
                    <td
                      style={{ left: FROZEN_LEFT.tyLe }}
                      className={`sticky z-10 py-2 px-2.5 text-center border-r border-b border-slate-200 font-sans font-black ${
                        store.rate >= 120
                          ? 'bg-emerald-300 text-emerald-950'
                          : store.rate >= 100
                          ? 'bg-emerald-200 text-emerald-900'
                          : store.rate >= 80
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-rose-200 text-rose-900'
                      }`}
                    >
                      {Math.round(store.rate)}%
                    </td>

                    {/* Cột phụ: DTQĐ TB 5T2026 — đặt phía sau Tỷ lệ %, lấy từ File BOSS; KHÔNG XUẤT ẢNH (export-hide); Super Admin/Admin only */}
                    {canViewDtQdTb && (
                      <td
                        style={{ left: FROZEN_LEFT.dtQdTb }}
                        className={`export-hide sticky z-10 py-2 px-1.5 text-center border-r border-b border-slate-200 font-sans font-extrabold text-[11px] text-slate-700 whitespace-nowrap ${rowBgClass}`}
                      >
                        {isProvinceView
                          ? formatDtQdTb((store as any).dtQdTbVal || 0)
                          : formatDtQdTb(parseDtQdTbNum(resolveDtQd(store.sieuthi)))}
                      </td>
                    )}

                    {displayedCategoryNames.length > 0 ? (
                      displayedCategoryNames.map((cat) => {
                        const style = unifiedFilterStyle || getPresetGroupStyle(cat, categoryGroupMap);
                        const groupTag = getGroupTag(style.label);
                        return (
                          <td key={cat} data-group={groupTag} className="py-2 px-1.5 text-center border-r border-b border-slate-200">
                            {renderCatRate(cat)}
                          </td>
                        );
                      })
                    ) : (
                      <td className="py-2.5 px-1.5 text-center border-b border-slate-200 text-slate-300">-</td>
                    )}
                  </tr>
                );
              })}

              {/* TỔNG CỘNG Row */}
              <tr className="bg-slate-900 text-white font-extrabold font-mono text-xs sticky bottom-0 z-10 shadow-md">
                <td colSpan={isProvinceView ? 2 : 5} style={{ left: FROZEN_LEFT.stt }} className="sticky z-20 py-3 px-3 border-r border-slate-700 text-center uppercase tracking-wider font-sans bg-slate-950">
                  Tổng
                </td>
                <td style={{ left: FROZEN_LEFT.dat }} className="sticky z-20 py-3 px-2.5 text-center border-r border-slate-700 bg-slate-950 text-amber-300 font-extrabold">
                  {`${categoryAverages.filter((c) => c.avgRate >= 100).length}/${categoryAverages.length}`}
                </td>
                <td style={{ left: FROZEN_LEFT.tyLe }} className="sticky z-20 py-3 px-2.5 text-center border-r border-slate-700 bg-slate-950 text-amber-300 font-extrabold">
                  {overallRate}%
                </td>
                {canViewDtQdTb && (
                  <td style={{ left: FROZEN_LEFT.dtQdTb }} className="export-hide sticky z-20 py-3 px-1 text-center border-r border-slate-700 bg-slate-950 text-amber-200 font-extrabold text-xs whitespace-nowrap">
                    {formatDtQdTb(totalDtQdTb)}
                  </td>
                )}

                {/* Overall Category Averages */}
                {categoryAverages.length === 0 ? (
                  <td className="py-3 px-1 text-center border-r border-slate-800 bg-slate-900 text-amber-300 font-extrabold">
                    -
                  </td>
                ) : (
                  categoryAverages.map(({ avgRate, totalA, cName }, cIdx) => {
                    const groupName = getCategoryGroup(cName, categoryGroupMap);
                    const groupTag = getGroupTag(groupName);

                    const isOver100 = avgRate >= 100;
                    const textClass = isOver100
                      ? 'text-yellow-300 font-black tracking-tight drop-shadow-[0_0_2px_rgba(253,224,71,0.7)]'
                      : avgRate > 0
                      ? 'text-slate-300 font-bold'
                      : 'text-rose-500 font-bold';

                    const displayFooterVal = valueDisplayMode === 'value'
                      ? (totalA >= 1000
                          ? Math.round(totalA).toLocaleString('vi-VN')
                          : totalA > 0
                          ? Number(totalA.toFixed(1)).toLocaleString('vi-VN')
                          : '0')
                      : (avgRate > 0 ? `${avgRate}%` : '0%');

                    return (
                      <td key={`tot-${cIdx}`} data-group={groupTag} className={`py-3 px-1 text-center border-r border-slate-800 bg-slate-900 ${textClass}`}>
                        {displayFooterVal}
                      </td>
                    );
                  })
                )}
              </tr>

              {sortedStores.length === 0 && (
                <tr>
                  <td
                    colSpan={(isProvinceView ? 5 : 8) + (selectedCategoryGroup !== 'ALL' ? Math.max(categoriesInSelectedGroup.length, 1) : ALL_HARDCODED_CATEGORY_NAMES.length)}
                    className="py-8 text-center text-slate-400 font-semibold font-sans"
                  >
                    Không tìm thấy siêu thị nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}

        {!showAllRows && totalPages > 1 && !(isFilterToSelected && comparisonLayout === 'vertical') && (
          <div className="export-hide flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/80">
            <span className="text-xs font-bold text-slate-500">
              {`Hiển thị ${pageStartIndex + 1}–${Math.min(pageStartIndex + PAGE_SIZE, sortedStores.length)} / ${sortedStores.length} siêu thị`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
              >
                ← Trước
              </button>
              <span className="text-xs font-bold text-slate-700 min-w-[80px] text-center">
                Trang {safeCurrentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
              >
                Sau →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
