import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { StoreRecord, TimeMode, Channel } from '../types';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  getBossForStore,
  getChannelForStore,
  getChannelLabel,
  getCategoryData,
  formatStoreDisplayName,
  getShortCategoryName,
  BossAssignmentRecord,
} from '../utils/parser';
import { exportElementAsImage } from '../services/imageExport';
import { ExportLoadingModal } from './ExportLoadingModal';
import { Camera, Layers, MessageSquare, ChevronDown, Plus, X } from 'lucide-react';

interface GroupReportViewProps {
  timeMode: TimeMode;
  lastUpdated?: string;
  stores: StoreRecord[];
  selectedChannels: Channel[];
  selectedProvince: string;
  selectedBoss: string;
  selectedCategory: string;
  selectedCategoryGroup: string;
  categoryGroupMap: Record<string, string>;
  bossAssignments?: BossAssignmentRecord[];
  onOpenTagBossModal?: () => void;
}

/** Distinct pastel colors per channel for headers & badges */
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

/** Reusable channel dropdown filter that pops over on click */
const ChannelDropdownFilter: React.FC<{
  selectedChannels: Channel[];
  onChange: (channels: Channel[]) => void;
  label?: string;
}> = ({ selectedChannels, onChange, label = 'Kênh' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allChannels: Channel[] = ['DML', 'DMM', 'DMS', 'TGD', 'TopZone'];

  const toggleChannel = (k: Channel) => {
    if (selectedChannels.includes(k)) {
      if (selectedChannels.length > 1) {
        onChange(selectedChannels.filter((c) => c !== k));
      }
    } else {
      onChange([...selectedChannels, k]);
    }
  };

  const selectAll = () => {
    onChange(allChannels);
  };

  const displayText = useMemo(() => {
    if (selectedChannels.length === allChannels.length) return 'Tất cả';
    if (selectedChannels.length === 0) return 'Chọn kênh';
    if (selectedChannels.length <= 2) return selectedChannels.join(', ');
    return `${selectedChannels.length} Kênh`;
  }, [selectedChannels]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-sky-500 flex items-center gap-1.5 cursor-pointer shadow-2xs"
      >
        <span className="text-[11px] text-slate-400 font-bold uppercase">{label}:</span>
        <span className="text-sky-700 font-extrabold">{displayText}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2.5 space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 px-1">
            <span className="text-[11px] font-extrabold text-slate-600 uppercase">Chọn kênh ({selectedChannels.length}/5)</span>
            <button
              type="button"
              onClick={selectAll}
              className="text-[10px] font-bold text-sky-600 hover:text-sky-800 cursor-pointer"
            >
              Chọn tất cả
            </button>
          </div>
          <div className="space-y-1">
            {allChannels.map((k) => {
              const checked = selectedChannels.includes(k);
              return (
                <label
                  key={k}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-bold text-slate-700 select-none transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleChannel(k)}
                    className="w-3.5 h-3.5 rounded text-sky-600 focus:ring-0 cursor-pointer"
                  />
                  <span>{getChannelLabel(k)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

interface SummaryCardConfig {
  id: string;
  channels: Channel[];
  category: string;
}

const ALL_CHANNELS: Channel[] = ['DML', 'DMM', 'DMS', 'TGD', 'TopZone'];

/** One repeatable "Tổng quan Tỉnh" card — each instance carries its own Kênh/Ngành hàng filters */
const ProvinceSummaryCard: React.FC<{
  config: SummaryCardConfig;
  onChangeChannels: (channels: Channel[]) => void;
  onChangeCategory: (category: string) => void;
  onRemove?: () => void;
  stores: StoreRecord[];
  bossAssignments: BossAssignmentRecord[];
  allCategoryNames: string[];
  timeMode: TimeMode;
  formattedTimeStr: string;
  isExcludedChannel: (k?: string) => boolean;
  exportingId: string | null;
  onExport: (elementId: string, filename: string) => void;
}> = ({
  config,
  onChangeChannels,
  onChangeCategory,
  onRemove,
  stores,
  bossAssignments,
  allCategoryNames,
  timeMode,
  formattedTimeStr,
  isExcludedChannel,
  exportingId,
  onExport,
}) => {
  const bannerBgClass = 'bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 border-sky-500';
  const tableHeaderBgClass = 'bg-sky-600 text-white';
  const tableHeaderBorderClass = 'border-sky-500';
  const tableFooterBgClass = 'bg-sky-600 text-white border-t-2 border-sky-700';

  const elementId = `nhom-card-province-summary-${config.id}`;

  // Cap the title bar's width to the table's own rendered width so a long
  // ngành hàng name wraps onto multiple lines instead of stretching the
  // card. useLayoutEffect (not useEffect) applies the cap before paint, so
  // there is no flash of the stretched layout first.
  const summaryTableRef = useRef<HTMLTableElement>(null);
  const [summaryTitleMaxWidth, setSummaryTitleMaxWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (summaryTableRef.current) {
      setSummaryTitleMaxWidth(summaryTableRef.current.offsetWidth);
    }
  });

  const channelLabel = useMemo(() => {
    const valid = config.channels.filter((c) => !isExcludedChannel(c));
    if (valid.length === 0 || valid.length >= ALL_CHANNELS.length) return 'All Kênh';
    return valid.map(getChannelLabel).join(', ');
  }, [config.channels, isExcludedChannel]);

  const provinceSummaryRows = useMemo(() => {
    const map = new Map<string, { target: number; achieved: number; rate: number }>();
    stores.forEach((s) => {
      const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
      if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return;
      if (config.channels.length > 0 && !config.channels.includes(effectiveKenh as Channel)) return;

      const data = getCategoryData(s, config.category);
      const cur = map.get(s.tinh) || { target: 0, achieved: 0, rate: 0 };
      cur.target += data.target;
      cur.achieved += data.achieved;
      map.set(s.tinh, cur);
    });

    const rawRows = Array.from(map.entries()).map(([tinh, d]) => {
      const rate = d.target > 0 ? (d.achieved / d.target) * 100 : 0;
      return {
        tinh,
        target: Math.round(d.target),
        achieved: Math.round(d.achieved),
        rate: Math.round(rate),
      };
    });

    rawRows.sort((a, b) => b.rate - a.rate);

    const totalRows = rawRows.length;
    return rawRows.map((row, idx) => {
      let tag = '';
      if (idx < 3) {
        tag = 'Top';
      } else if (idx >= totalRows - 3) {
        tag = 'Bot';
      }
      return { ...row, tag };
    });
  }, [stores, config.category, config.channels, bossAssignments, isExcludedChannel]);

  const totalSummary = useMemo(() => {
    const t = provinceSummaryRows.reduce((a, b) => a + b.target, 0);
    const r = provinceSummaryRows.reduce((a, b) => a + b.achieved, 0);
    const rate = t > 0 ? (r / t) * 100 : 0;
    return { target: t, achieved: r, rate: Math.round(rate) };
  }, [provinceSummaryRows]);

  return (
    <div className="w-full min-w-0 bg-white rounded-none border border-slate-200 shadow-2xs overflow-hidden pb-1" id={elementId}>
      {/* Control Bar with Channel Filter + Export/Remove Button — EXCLUDED FROM EXPORTED PNG */}
      <div className="export-hide p-1.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1.5 rounded-none">
        {/* BỘ LỌC KÊNH (Dropdown bấm vào mới show) */}
        <ChannelDropdownFilter selectedChannels={config.channels} onChange={onChangeChannels} />

        <div className="flex items-center gap-1 shrink-0">
          {onRemove && (
            <button
              onClick={onRemove}
              title="Xoá bảng này"
              className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded-xl shadow-2xs transition-all cursor-pointer flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onExport(elementId, `Tong_Quan_${config.category}.png`)}
            disabled={exportingId === elementId}
            title="Xuất ảnh"
            className="p-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-2xs transition-all cursor-pointer flex items-center justify-center"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content Captured in Image: Header Banner + Table */}
      <div className="w-full p-2">
        {/* Header Banner */}
        <div
          className={`mx-auto w-full mb-2 ${bannerBgClass} text-white py-2 px-2 text-center shadow-2xs border rounded-none`}
          style={summaryTitleMaxWidth ? { maxWidth: `${summaryTitleMaxWidth}px` } : undefined}
        >
          <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white text-center drop-shadow-xs break-words inline-flex flex-wrap items-center justify-center gap-1.5">
            <span className="relative inline-flex items-center gap-1 group cursor-pointer">
              <span className="text-amber-200 group-hover:text-yellow-100 transition-colors font-black">
                {getShortCategoryName(config.category).toUpperCase()}
              </span>
              <ChevronDown className="w-4 h-4 text-amber-200 opacity-80 group-hover:opacity-100 transition-opacity export-hide shrink-0 inline" />
              <select
                value={config.category}
                onChange={(e) => onChangeCategory(e.target.value)}
                title="Nhấn vào để đổi ngành hàng / nhóm"
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
              >
                {allCategoryNames.map((cat) => (
                  <option key={cat} value={cat} className="text-slate-900 bg-white font-bold py-1 text-sm">
                    {getShortCategoryName(cat)}
                  </option>
                ))}
              </select>
            </span>
          </h3>
          <div className="text-white/95 text-[11px] font-normal tracking-wide mt-1">
            {timeMode === 'realtime' ? '⚡ Realtime' : '📈 Luỹ Kế'}: {formattedTimeStr} || {channelLabel}
          </div>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto">
          <table ref={summaryTableRef} className="w-full text-xs font-sans border-separate border-spacing-0 border border-slate-200">
            <thead>
              <tr className={`${tableHeaderBgClass} font-bold uppercase text-[11px] rounded-none`}>
                <th className={`py-2 px-1.5 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap`}>STT</th>
                <th className={`py-2 px-2 text-left border-r ${tableHeaderBorderClass} whitespace-nowrap`}>TỈNH</th>
                <th className={`py-2 px-2 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap`}>TARGET</th>
                <th className={`py-2 px-2 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap`}>REAL</th>
                <th className={`py-2 px-2 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap`}>%HT</th>
                <th className="py-2 px-2 text-center whitespace-nowrap">T/B</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {provinceSummaryRows.map((row, idx) => (
                <tr key={row.tinh} className={idx % 2 === 0 ? 'bg-white' : 'bg-sky-50/20'}>
                  <td className="py-1.5 px-1.5 text-center font-bold text-slate-500 border-r border-b border-slate-200 whitespace-nowrap">#{idx + 1}</td>
                  <td className="py-1.5 px-2 font-bold text-sky-900 border-r border-b border-slate-200 whitespace-nowrap">{row.tinh}</td>
                  <td className="py-1.5 px-2 text-center font-bold text-slate-800 border-r border-b border-slate-200 whitespace-nowrap">{row.target.toLocaleString('vi-VN')}</td>
                  <td className="py-1.5 px-2 text-center font-bold text-red-600 border-r border-b border-slate-200 whitespace-nowrap">{row.achieved.toLocaleString('vi-VN')}</td>
                  <td
                    className={`py-1.5 px-2 text-center border-r border-b border-slate-200 whitespace-nowrap ${
                      row.tag === 'Top' ? 'text-sky-800 font-bold bg-sky-50/60' : row.tag === 'Bot' ? 'text-rose-600 bg-rose-50/50 font-bold' : 'text-slate-700 font-bold'
                    }`}
                  >
                    {Math.round(row.rate)}%
                  </td>
                  <td className="py-1.5 px-2 text-center font-bold border-b border-slate-200 whitespace-nowrap">
                    {row.tag === 'Top' && <span className="text-sky-700 font-bold text-[11px]">Top</span>}
                    {row.tag === 'Bot' && <span className="text-rose-600 font-bold text-[11px]">Bot</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`${tableFooterBgClass} font-bold text-xs rounded-none`}>
                <td className={`py-1.5 px-1.5 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap font-extrabold`}></td>
                <td className={`py-1.5 px-2 text-left border-r ${tableHeaderBorderClass} whitespace-nowrap font-extrabold`}>Tổng</td>
                <td className={`py-1.5 px-2 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap font-extrabold`}>{totalSummary.target.toLocaleString('vi-VN')}</td>
                <td className={`py-1.5 px-2 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap font-extrabold`}>{totalSummary.achieved.toLocaleString('vi-VN')}</td>
                <td className={`py-1.5 px-2 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap font-extrabold`}>{Math.round(totalSummary.rate)}%</td>
                <td className="py-1.5 px-2 text-center font-extrabold whitespace-nowrap"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export const GroupReportView: React.FC<GroupReportViewProps> = ({
  timeMode,
  lastUpdated,
  stores,
  selectedChannels,
  selectedProvince,
  selectedCategory,
  selectedCategoryGroup,
  bossAssignments = [],
  onOpenTagBossModal,
}) => {
  // Extract all category names dynamically from real uploaded/pasted store dataset
  const allCategoryNames = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => {
      if (s.categoryMap) {
        Object.keys(s.categoryMap).forEach((c) => set.add(c));
      }
    });
    const list = Array.from(set);
    if (list.length === 0) {
      list.push('TRẢ CHẬM HOMECREDIT');
      list.push('Điện thoại Flagship Samsung Galaxy S/Z Series');
      list.push('Laptop');
    }
    return list;
  }, [stores]);

  const [activeCategory, setActiveCategory] = useState<string>(
    selectedCategory !== 'ALL' && selectedCategory ? selectedCategory : (allCategoryNames[0] || 'TRẢ CHẬM HOMECREDIT')
  );

  // BẢNG TỔNG QUAN TỈNH (CARD 1) — CÓ THỂ THÊM NHIỀU BẢNG, MỖI BẢNG TỰ QUẢN LÝ BỘ LỌC RIÊNG
  const [summaryCards, setSummaryCards] = usePersistedState<SummaryCardConfig[]>(
    'tnb_summary_cards',
    [
      {
        id: 'card-1',
        channels: selectedChannels.length > 0 ? selectedChannels : ALL_CHANNELS,
        category: selectedCategory !== 'ALL' && selectedCategory ? selectedCategory : (allCategoryNames[0] || 'TRẢ CHẬM HOMECREDIT'),
      },
    ]
  );

  const addSummaryCard = () => {
    setSummaryCards((prev) => [
      ...prev,
      {
        id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        channels: ALL_CHANNELS,
        category: activeCategory,
      },
    ]);
  };

  const removeSummaryCard = (id: string) => {
    setSummaryCards((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  };

  const updateSummaryCard = (id: string, patch: Partial<SummaryCardConfig>) => {
    setSummaryCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const [selectedProvinceCard, setSelectedProvinceCard] = usePersistedState<string>(
    'tnb_card2_province',
    selectedProvince !== 'ALL' && selectedProvince ? selectedProvince : (stores[0]?.tinh || 'An Giang')
  );

  // BỘ LỌC TỈNH RIÊNG CHO BẢNG 3 (TOP/BOT)
  const [selectedProvinceCard3, setSelectedProvinceCard3] = usePersistedState<string>(
    'tnb_card3_province',
    'ALL'
  );

  // 2 INDEPENDENT CHANNEL FILTER STATES (Hoàn toàn riêng biệt, không liên kết nhau)
  const [channelsCard2, setChannelsCard2] = usePersistedState<Channel[]>(
    'tnb_card2_channels',
    selectedChannels.length > 0 ? selectedChannels : ['DML', 'DMM', 'DMS', 'TGD', 'TopZone']
  );

  const [channelsCard3, setChannelsCard3] = usePersistedState<Channel[]>(
    'tnb_card3_channels',
    selectedChannels.length > 0 ? selectedChannels : ['DML', 'DMM', 'DMS', 'TGD', 'TopZone']
  );

  // CUSTOM TOP/BOT CRITERIA OPTIONS (Phần trăm hoặc Số lượng)
  const [topBotMode, setTopBotMode] = usePersistedState<'percent' | 'count'>('tnb_topbot_mode', 'percent');
  const [topBotValue, setTopBotValue] = usePersistedState<number>('tnb_topbot_value', 20);

  const [exportingId, setExportingId] = useState<string | null>(null);

  const bannerBgClass = 'bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 border-sky-500';
  const tableHeaderBgClass = 'bg-sky-600 text-white';
  const tableHeaderBorderClass = 'border-sky-500';

  // NO useEffect sync from header filters — header bộ lọc KHÔNG tác dụng
  // xuống các bộ lọc bên dưới. Mỗi card tự quản lý state riêng.

  const isExcludedChannel = (k: string = ''): boolean => {
    const u = (k || '').toUpperCase();
    return u === 'OFF' || u.includes('OFFLINE') || u.includes('LƯU ĐỘNG') || u.includes('LUU DONG') || u === 'LUUDONG';
  };

  // Real timestamp string for banners
  const nowStr = lastUpdated || (timeMode === 'realtime' ? '19:10:51 NGÀY 12/8/2026' : '08:00:00 NGÀY 12/8/2026');

  // Formats "19:10:51 NGÀY 12/8/2026" => "19:10:51 - 12/8"
  const formattedTimeStr = useMemo(() => {
    if (!nowStr) return '19:10:51 - 12/8';
    let cleaned = nowStr.replace(/THỜI GIAN ĐẾN:\s*/i, '').trim();
    cleaned = cleaned.replace(/\s*NGÀY\s*/i, ' - ');
    cleaned = cleaned.replace(/\/20\d\d/, '');
    return cleaned;
  }, [nowStr]);

  const getChannelText = (channels: Channel[]) => {
    const valid = channels.filter((c) => !isExcludedChannel(c));
    if (valid.length === 0 || valid.length >= 5) return 'All Kênh';
    return valid.map(getChannelLabel).join(', ');
  };

  const channelLabelCard2 = useMemo(() => getChannelText(channelsCard2), [channelsCard2]);
  const channelLabelCard3 = useMemo(() => getChannelText(channelsCard3), [channelsCard3]);

  // 2. Province Detailed Breakout for Card 2 (Bottom Left)
  const provinceDetailedStores = useMemo(() => {
    return stores.filter((s) => {
      if (s.tinh !== selectedProvinceCard) return false;
      const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
      if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return false;
      if (channelsCard2.length > 0 && !channelsCard2.includes(effectiveKenh as Channel)) return false;
      return true;
    });
  }, [stores, selectedProvinceCard, channelsCard2, bossAssignments]);

  const channelGroups = useMemo(() => {
    const groups: { kenh: string; stores: StoreRecord[] }[] = [];
    const kenhOrder = ['DML', 'DMM', 'DMS', 'TGD', 'TopZone'];
    kenhOrder.forEach((k) => {
      const list = provinceDetailedStores.filter((s) => getChannelForStore(s.sieuthi, bossAssignments, s.kenh) === k);
      if (list.length > 0) {
        // Sắp xếp các siêu thị trong từng kênh giảm dần theo tỷ lệ %HT
        list.sort((a, b) => {
          const rateA = getCategoryData(a, activeCategory).rate;
          const rateB = getCategoryData(b, activeCategory).rate;
          return rateB - rateA;
        });
        groups.push({ kenh: k, stores: list });
      }
    });
    return groups;
  }, [provinceDetailedStores, activeCategory, bossAssignments]);

  // 3. Dynamic Top / Bot Leaderboard for Card 3 based on User Percent / Count & Province criteria
  const topBotLeaderboard = useMemo(() => {
    const valid = stores.filter((s) => {
      if (selectedProvinceCard3 !== 'ALL' && s.tinh !== selectedProvinceCard3) return false;
      const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
      if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return false;
      if (channelsCard3.length > 0 && !channelsCard3.includes(effectiveKenh as Channel)) return false;
      return true;
    });

    const sorted = [...valid].sort((a, b) => {
      const rateA = getCategoryData(a, activeCategory).rate;
      const rateB = getCategoryData(b, activeCategory).rate;
      return rateB - rateA;
    });

    const val = topBotValue > 0 ? topBotValue : 1;
    let count = 1;
    if (topBotMode === 'percent') {
      count = Math.max(1, Math.ceil(sorted.length * (val / 100)));
    } else {
      count = Math.max(1, Math.min(sorted.length, val));
    }

    const top20 = sorted.slice(0, count);
    const bot20 = sorted.slice(-count).reverse();

    return { top20, bot20 };
  }, [stores, activeCategory, channelsCard3, selectedProvinceCard3, bossAssignments, topBotMode, topBotValue]);

  const topBotLabelText = useMemo(() => {
    const val = topBotValue > 0 ? topBotValue : 1;
    return topBotMode === 'percent' ? `${val}%` : `${val} SIÊU THỊ`;
  }, [topBotMode, topBotValue]);

  const toggleChannelCard2 = (k: Channel) => {
    if (channelsCard2.includes(k)) {
      if (channelsCard2.length > 1) {
        setChannelsCard2(channelsCard2.filter((c) => c !== k));
      }
    } else {
      setChannelsCard2([...channelsCard2, k]);
    }
  };

  const toggleChannelCard3 = (k: Channel) => {
    if (channelsCard3.includes(k)) {
      if (channelsCard3.length > 1) {
        setChannelsCard3(channelsCard3.filter((c) => c !== k));
      }
    } else {
      setChannelsCard3([...channelsCard3, k]);
    }
  };

  const handleExportCard = async (elementId: string, filename: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    setExportingId(elementId);
    try {
      await exportElementAsImage(el, filename);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExportingId(null);
    }
  };

  const allAvailableProvinces = useMemo(() => {
    return Array.from(new Set(stores.map((s) => s.tinh))).sort();
  }, [stores]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header bar at top of Nhóm view */}
      <div className="p-4 bg-white rounded-none border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-none bg-sky-100 flex items-center justify-center text-sky-700 font-bold shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-800 tracking-wide uppercase">BÁO CÁO THEO NHÓM / NGÀNH HÀNG</h2>
              <p className="text-xs text-slate-500 font-normal">Báo cáo tổng quan Vùng, chi tiết Tỉnh và Top/Bot theo từng Ngành hàng</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Add another Tổng Quan Tỉnh card */}
            <button
              onClick={addSummaryCard}
              title="Thêm bảng tổng quan Tỉnh mới"
              className="px-3.5 py-2 bg-sky-100 hover:bg-sky-200 text-sky-700 font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm bảng</span>
            </button>

            {/* Quick Remarks / Nhận xét button */}
            {onOpenTagBossModal && (
              <button
                onClick={onOpenTagBossModal}
                className="px-3.5 py-2 bg-amber-200 hover:bg-amber-300 text-amber-900 font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Nhận xét</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CARD 1 (repeatable): Regional Province Summary — người dùng có thể bấm "+" để thêm nhiều bảng, mỗi bảng tự quản lý bộ lọc Kênh/Ngành hàng riêng. Grid 4 cột để luôn xếp 4 bảng/hàng trên màn hình lớn */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <ProvinceSummaryCard
            key={card.id}
            config={card}
            onChangeChannels={(channels) => updateSummaryCard(card.id, { channels })}
            onChangeCategory={(category) => updateSummaryCard(card.id, { category })}
            onRemove={summaryCards.length > 1 ? () => removeSummaryCard(card.id) : undefined}
            stores={stores}
            bossAssignments={bossAssignments}
            allCategoryNames={allCategoryNames}
            timeMode={timeMode}
            formattedTimeStr={formattedTimeStr}
            isExcludedChannel={isExcludedChannel}
            exportingId={exportingId}
            onExport={handleExportCard}
          />
        ))}
      </div>

      {/* BOTTOM SECTION: 2 Side-by-Side Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 2: Selected Province Detailed Breakdown (Bottom Left Card) */}
        <div className="w-full bg-white rounded-none border border-slate-200 shadow-2xs overflow-hidden pb-1" id="nhom-card-province-detail">
          {/* Controls Bar — BỘ LỌC TỈNH & KÊNH CHO BẢNG 2 */}
          <div className="export-hide p-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 rounded-none">
            <div className="flex flex-wrap items-center gap-2">
              {/* BỘ LỌC TỈNH */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Tỉnh:</span>
                <select
                  value={selectedProvinceCard}
                  onChange={(e) => setSelectedProvinceCard(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer shadow-2xs"
                >
                  {allAvailableProvinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* BỘ LỌC KÊNH (Dropdown bấm vào mới show) */}
              <ChannelDropdownFilter
                selectedChannels={channelsCard2}
                onChange={setChannelsCard2}
              />
            </div>

            <button
              onClick={() => handleExportCard('nhom-card-province-detail', `Chi_Tiet_${selectedProvinceCard}_${activeCategory}.png`)}
              disabled={exportingId === 'nhom-card-province-detail'}
              title="Xuất ảnh"
              className="p-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-2xs transition-all cursor-pointer flex items-center justify-center shrink-0"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          {/* Content Captured in Image: Header Banner + Unified Table */}
          <div className="w-full p-3">
            {/* Header Banner - Size chữ lớn (text-lg sm:text-xl), khe hở mb-3 sang trọng */}
            <div className={`w-full mb-3 ${bannerBgClass} text-white py-3 px-3 text-center shadow-2xs border rounded-none`}>
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white text-center drop-shadow-xs inline-flex flex-wrap items-center justify-center gap-1.5">
                <span>{selectedProvinceCard.toUpperCase()} •</span>
                <span className="relative inline-flex items-center gap-1 group cursor-pointer">
                  <span className="text-amber-200 group-hover:text-yellow-100 transition-colors font-black">
                    {getShortCategoryName(activeCategory).toUpperCase()}
                  </span>
                  <ChevronDown className="w-4 h-4 text-amber-200 opacity-80 group-hover:opacity-100 transition-opacity export-hide shrink-0 inline" />
                  <select
                    value={activeCategory}
                    onChange={(e) => setActiveCategory(e.target.value)}
                    title="Nhấn vào để đổi ngành hàng / nhóm"
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                  >
                    {allCategoryNames.map((cat) => (
                      <option key={cat} value={cat} className="text-slate-900 bg-white font-bold py-1 text-sm">
                        {getShortCategoryName(cat)}
                      </option>
                    ))}
                  </select>
                </span>
              </h3>
              <div className="text-white/95 text-xs font-normal tracking-wide mt-1">
                {timeMode === 'realtime' ? '⚡ Realtime' : '📈 Luỹ Kế'}: {formattedTimeStr} || {channelLabelCard2}
              </div>
            </div>

            {/* Single Unified Table - Tự động vừa vặn nội dung chữ từng cột */}
            <div className="w-full overflow-x-auto border-t border-slate-200">
              {channelGroups.length > 0 ? (
                <table className="w-full text-xs font-sans border-separate border-spacing-0 border border-slate-200 table-auto">
                  <tbody className="divide-y divide-slate-200">
                    {channelGroups.map((group) => (
                      <React.Fragment key={group.kenh}>
                        {/* Dòng Tiêu đề Kênh với màu riêng biệt */}
                        <tr className={`${getChannelHeaderBg(group.kenh)} font-bold uppercase text-[11px] rounded-none`}>
                          <th className="py-2 px-1 text-center border-r border-white/20 whitespace-nowrap">STT</th>
                          <th className="py-2 px-2 text-left border-r border-white/20 whitespace-nowrap">TỈNH</th>
                          <th className="py-2 px-2 text-left border-r border-white/20 whitespace-nowrap">BOSS</th>
                          <th className="py-2 px-1 text-center border-r border-white/20 whitespace-nowrap">KÊNH</th>
                          <th className="py-2 px-2 text-left border-r border-white/20 whitespace-nowrap">SIÊU THỊ</th>
                          <th className="py-2 px-1.5 text-center border-r border-white/20 whitespace-nowrap">TAR</th>
                          <th className="py-2 px-1.5 text-center border-r border-white/20 whitespace-nowrap">REAL</th>
                          <th className="py-2 px-1.5 text-center whitespace-nowrap">%HT</th>
                        </tr>
                        {group.stores.map((s, idx) => {
                          const data = getCategoryData(s, activeCategory);
                          const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
                          return (
                            <tr key={s.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="py-1.5 px-1 text-center font-bold text-slate-500 border-r border-b border-slate-200 whitespace-nowrap">#{idx + 1}</td>
                              <td className="py-1.5 px-2 font-bold text-slate-800 border-r border-b border-slate-200 whitespace-nowrap truncate">{s.tinh}</td>
                              <td className="py-1.5 px-2 font-extrabold text-orange-600 border-r border-b border-slate-200 whitespace-nowrap truncate">
                                {getBossForStore(s.sieuthi, bossAssignments, s.boss)}
                              </td>
                              <td className="py-1.5 px-1 text-center border-r border-b border-slate-200 whitespace-nowrap">
                                <span className={`inline-block px-1.5 py-0.5 rounded-none text-[9.5px] font-extrabold ${getChannelBadgeStyle(effectiveKenh)}`}>
                                  {getChannelLabel(effectiveKenh)}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 font-bold text-slate-900 border-r border-b border-slate-200 whitespace-nowrap truncate">
                                {formatStoreDisplayName(s.sieuthi)}
                              </td>
                              <td className="py-1.5 px-1.5 text-center font-bold text-amber-600 border-r border-b border-slate-200 whitespace-nowrap">{data.target}</td>
                              <td className="py-1.5 px-1.5 text-center font-bold text-slate-800 border-r border-b border-slate-200 whitespace-nowrap">{data.achieved}</td>
                              <td
                                className={`py-1.5 px-1.5 text-center font-bold border-b border-slate-200 whitespace-nowrap ${
                                  data.rate >= 100 ? 'text-sky-700' : data.rate >= 80 ? 'text-slate-700' : 'text-rose-600'
                                }`}
                              >
                                {Math.round(data.rate)}%
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-400 font-bold text-xs border border-slate-200">
                  Không tìm thấy dữ liệu siêu thị cho tỉnh {selectedProvinceCard} với kênh đã chọn.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CARD 3: Top / Bot Leaderboard (Bottom Right Card) */}
        <div className="w-full bg-white rounded-none border border-slate-200 shadow-2xs overflow-hidden pb-1" id="nhom-card-topbot-leaderboard">
          {/* Controls Bar — BỘ LỌC TỈNH, KÊNH & BỘ LỌC SỐ LƯỢNG / % CHO BẢNG 3 */}
          <div className="export-hide p-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 rounded-none">
            <div className="flex flex-wrap items-center gap-2">
              {/* BỘ LỌC TỈNH CHO BẢNG TOP/BOT */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Tỉnh:</span>
                <select
                  value={selectedProvinceCard3}
                  onChange={(e) => setSelectedProvinceCard3(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer shadow-2xs"
                >
                  <option value="ALL">Tất cả</option>
                  {allAvailableProvinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* BỘ LỌC KÊNH (Dropdown bấm vào mới show) */}
              <ChannelDropdownFilter
                selectedChannels={channelsCard3}
                onChange={setChannelsCard3}
              />
            </div>

            {/* BỘ LỌC TUỲ CHỌN SỐ LƯỢNG HOẶC % TOP/BOT */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Tiêu chí:</span>
                <select
                  value={topBotMode}
                  onChange={(e) => {
                    const newMode = e.target.value as 'percent' | 'count';
                    setTopBotMode(newMode);
                    if (newMode === 'percent' && topBotValue > 100) setTopBotValue(20);
                    else if (newMode === 'count' && topBotValue > 50) setTopBotValue(5);
                  }}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer shadow-2xs"
                >
                  <option value="percent">% (Phần trăm)</option>
                  <option value="count">Số lượng (Siêu thị)</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max={topBotMode === 'percent' ? 100 : 500}
                  value={topBotValue || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) {
                      setTopBotValue(val);
                    } else if (e.target.value === '') {
                      setTopBotValue(0);
                    }
                  }}
                  className="w-14 px-2 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-center focus:outline-hidden focus:ring-2 focus:ring-sky-500 shadow-2xs"
                  placeholder={topBotMode === 'percent' ? '20' : '5'}
                />
                <span className="text-xs font-bold text-slate-600">{topBotMode === 'percent' ? '%' : 'ST'}</span>
              </div>

              <button
                onClick={() => handleExportCard('nhom-card-topbot-leaderboard', `TopBot_${selectedProvinceCard3}_${topBotMode}_${topBotValue}_${activeCategory}.png`)}
                disabled={exportingId === 'nhom-card-topbot-leaderboard'}
                title="Xuất ảnh xếp hạng"
                className="p-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-2xs transition-all cursor-pointer flex items-center justify-center shrink-0 ml-1"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content Captured in Image: Header Banner + Top/Bot Tables */}
          <div className="w-full p-3">
            {/* Header Banner - Dynamic Title theo Tỉnh, % hoặc Số lượng */}
            <div className={`w-full mb-3 ${bannerBgClass} text-white py-3 px-3 text-center shadow-2xs border rounded-none`}>
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white text-center drop-shadow-xs inline-flex flex-wrap items-center justify-center gap-1.5">
                <span>BẢNG XẾP HẠNG TOP/BOT {topBotLabelText} %HT {selectedProvinceCard3 !== 'ALL' ? `• ${selectedProvinceCard3.toUpperCase()}` : ''} •</span>
                <span className="relative inline-flex items-center gap-1 group cursor-pointer">
                  <span className="text-amber-200 group-hover:text-yellow-100 transition-colors font-black">
                    {getShortCategoryName(activeCategory).toUpperCase()}
                  </span>
                  <ChevronDown className="w-4 h-4 text-amber-200 opacity-80 group-hover:opacity-100 transition-opacity export-hide shrink-0 inline" />
                  <select
                    value={activeCategory}
                    onChange={(e) => setActiveCategory(e.target.value)}
                    title="Nhấn vào để đổi ngành hàng / nhóm"
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                  >
                    {allCategoryNames.map((cat) => (
                      <option key={cat} value={cat} className="text-slate-900 bg-white font-bold py-1 text-sm">
                        {getShortCategoryName(cat)}
                      </option>
                    ))}
                  </select>
                </span>
              </h3>
              <div className="text-white/95 text-xs font-normal tracking-wide mt-1">
                {timeMode === 'realtime' ? '⚡ Realtime' : '📈 Luỹ Kế'}: {formattedTimeStr} || {channelLabelCard3}
              </div>
            </div>

            {/* Top Section */}
            <div className="w-full overflow-x-auto">
              {topBotLeaderboard.top20.length > 0 ? (
                <table className="w-full text-xs font-sans border-collapse border border-slate-200 table-auto">
                  <thead>
                    <tr className={`${tableHeaderBgClass} font-bold uppercase text-[11px] rounded-none`}>
                      <th className={`py-2 px-1 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap`}>STT</th>
                      <th className={`py-2 px-2 text-left border-r ${tableHeaderBorderClass} whitespace-nowrap`}>TỈNH</th>
                      <th className={`py-2 px-2 text-left border-r ${tableHeaderBorderClass} whitespace-nowrap`}>BOSS</th>
                      <th className={`py-2 px-1 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap`}>KÊNH</th>
                      <th className={`py-2 px-2 text-left border-r ${tableHeaderBorderClass} whitespace-nowrap`}>SIÊU THỊ</th>
                      <th className={`py-2 px-1.5 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap`}>TAR</th>
                      <th className={`py-2 px-1.5 text-center border-r ${tableHeaderBorderClass} whitespace-nowrap`}>REAL</th>
                      <th className="py-2 px-1.5 text-center whitespace-nowrap">%HT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {topBotLeaderboard.top20.map((s, idx) => {
                      const data = getCategoryData(s, activeCategory);
                      const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
                      return (
                        <tr key={s.id || idx} className="bg-white">
                          <td className="py-1.5 px-1 text-center font-bold text-slate-500 border-r border-b border-slate-200 whitespace-nowrap">#{idx + 1}</td>
                          <td className="py-1.5 px-2 font-bold text-slate-800 border-r border-b border-slate-200 whitespace-nowrap">{s.tinh}</td>
                          <td className="py-1.5 px-2 font-extrabold text-orange-600 border-r border-b border-slate-200 whitespace-nowrap">{getBossForStore(s.sieuthi, bossAssignments, s.boss)}</td>
                          <td className="py-1.5 px-1 text-center border-r border-b border-slate-200 whitespace-nowrap">
                            <span className={`inline-block px-1.5 py-0.5 rounded-none text-[9.5px] font-extrabold ${getChannelBadgeStyle(effectiveKenh)}`}>
                              {getChannelLabel(effectiveKenh)}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 font-bold text-slate-900 border-r border-b border-slate-200 whitespace-nowrap">{formatStoreDisplayName(s.sieuthi)}</td>
                          <td className="py-1.5 px-1.5 text-center font-bold text-amber-600 border-r border-b border-slate-200 whitespace-nowrap">{data.target}</td>
                          <td className="py-1.5 px-1.5 text-center font-bold text-slate-800 border-r border-b border-slate-200 whitespace-nowrap">{data.achieved}</td>
                          <td className="py-1.5 px-1.5 text-center font-bold text-sky-700 border-b border-slate-200 whitespace-nowrap">{Math.round(data.rate)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-6 text-center text-slate-400 font-bold text-xs border border-slate-200">
                  Không tìm thấy siêu thị TOP nào phù hợp với bộ lọc.
                </div>
              )}
            </div>

            {/* Bot Section Header */}
            <div className="bg-rose-200 text-rose-800 p-2 text-center font-bold text-xs uppercase rounded-none mt-3 border-x border-t border-rose-300">
              DANH SÁCH BOT {topBotLabelText} THẤP NHẤT
            </div>

            {/* Bot Section */}
            <div className="w-full overflow-x-auto">
              {topBotLeaderboard.bot20.length > 0 ? (
                <table className="w-full text-xs font-sans border-collapse border border-slate-200 table-auto">
                  <thead>
                    <tr className="bg-rose-100 text-rose-700 font-bold uppercase text-[11px] rounded-none">
                      <th className="py-2 px-1 text-center border-r border-rose-200 whitespace-nowrap">STT</th>
                      <th className="py-2 px-2 text-center border-r border-rose-200 whitespace-nowrap">TỈNH</th>
                      <th className="py-2 px-2 text-center border-r border-rose-200 whitespace-nowrap">BOSS</th>
                      <th className="py-2 px-1 text-center border-r border-rose-200 whitespace-nowrap">KÊNH</th>
                      <th className="py-2 px-2 text-center border-r border-rose-200 whitespace-nowrap">SIÊU THỊ</th>
                      <th className="py-2 px-1.5 text-center border-r border-rose-200 whitespace-nowrap">TAR</th>
                      <th className="py-2 px-1.5 text-center border-r border-rose-200 whitespace-nowrap">REAL</th>
                      <th className="py-2 px-1.5 text-center whitespace-nowrap">%HT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {topBotLeaderboard.bot20.map((s, idx) => {
                      const data = getCategoryData(s, activeCategory);
                      const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
                      return (
                        <tr key={s.id || idx} className="bg-slate-50">
                          <td className="py-1.5 px-1 text-center font-bold text-slate-500 border-r border-b border-slate-200 whitespace-nowrap">#{idx + 1}</td>
                          <td className="py-1.5 px-2 font-bold text-slate-800 border-r border-b border-slate-200 whitespace-nowrap">{s.tinh}</td>
                          <td className="py-1.5 px-2 font-extrabold text-orange-600 border-r border-b border-slate-200 whitespace-nowrap">{getBossForStore(s.sieuthi, bossAssignments, s.boss)}</td>
                          <td className="py-1.5 px-1 text-center border-r border-b border-slate-200 whitespace-nowrap">
                            <span className={`inline-block px-1.5 py-0.5 rounded-none text-[9.5px] font-extrabold ${getChannelBadgeStyle(effectiveKenh)}`}>
                              {getChannelLabel(effectiveKenh)}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 font-bold text-slate-900 border-r border-b border-slate-200 whitespace-nowrap">{formatStoreDisplayName(s.sieuthi)}</td>
                          <td className="py-1.5 px-1.5 text-center font-bold text-amber-600 border-r border-b border-slate-200 whitespace-nowrap">{data.target}</td>
                          <td className="py-1.5 px-1.5 text-center font-bold text-slate-800 border-r border-b border-slate-200 whitespace-nowrap">{data.achieved}</td>
                          <td className="py-1.5 px-1.5 text-center font-bold text-rose-600 border-b border-slate-200 whitespace-nowrap">{Math.round(data.rate)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-6 text-center text-slate-400 font-bold text-xs border border-slate-200">
                  Không tìm thấy siêu thị BOT nào phù hợp với bộ lọc.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Export Loading Overlay Modal */}
      <ExportLoadingModal
        isOpen={exportingId !== null}
        exportTitle="ĐANG CHỤP & XUẤT ÁNH THẺ BÁO CÁO (HD)"
        subText="Hệ thống đang tự động căn chỉnh khung cột vừa vặn nội dung & tạo file PNG sắc nét..."
      />
    </div>
  );
};
