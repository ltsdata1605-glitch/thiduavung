import React, { useState, useMemo } from 'react';
import { TimeMode, EntityScope, Channel } from '../types';
import { resolveCategoryDisplayName, checkDataFreshness } from '../utils/parser';
import {
  Zap,
  TrendingUp,
  RefreshCw,
  Globe,
  Store,
  MessageSquare,
  Download,
  Share2,
  Check,
  BarChart2,
  Settings2,
  Layers,
  Grid,
  ChevronDown,
  Camera,
  Smartphone,
  ShieldCheck,
  Tv,
  Trash2,
  Search,
  X,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';

const DEFAULT_CATEGORY_GROUP: Record<string, string> = {
  'Điện thoại Flagship Samsung Galaxy S/Z Series': 'ICT',
  'Điện thoại & Tablet Android': 'ICT',
  'Điện thoại Realme': 'ICT',
  'Điện thoại Vivo': 'ICT',
  'Laptop': 'ICT',
  'Phụ kiện - Đồng hồ': 'ICT',
  'Đồng hồ (DHTT + SMW)': 'ICT',
  'Camera': 'ICT',
  'Loa': 'ICT',
  'Sạc dự phòng': 'ICT',
  'Tai nghe Bluetooth': 'ICT',
  'Đèn năng lượng mặt trời': 'ICT',
  'Bảo hiểm': 'DỊCH VỤ',
  'Bảo hiểm thợ Điện Máy Xanh': 'DỊCH VỤ',
  'Sim Tổng': 'DỊCH VỤ',
  'Sim Vinaphone & Sim ĐMX': 'DỊCH VỤ',
  'Trả chậm HomeCredit': 'DỊCH VỤ',
  'Trả chậm FECredit, Shinhan, Samsung Finance+': 'DỊCH VỤ',
  'Trả chậm Điện máy và Gia dụng': 'DỊCH VỤ',
  'Dịch vụ VAS': 'DỊCH VỤ',
  'OTT Mango+, iCallMe': 'DỊCH VỤ',
  'Mở thẻ tín dụng TPBank EVO và VPBank MWG': 'DỊCH VỤ',
  'Vay tiền mặt': 'DỊCH VỤ',
  'Ví trả sau': 'DỊCH VỤ',
  'Nạp rút tiền tài khoản ngân hàng': 'DỊCH VỤ',
  'Điện tử Samsung': 'CE & GD',
  'Điện tử điện lạnh Aqua + Haier': 'CE & GD',
  'Tivi': 'CE & GD',
  'Điện tử toshiba': 'CE & GD',
  'Tăng cường Audio': 'CE & GD',
  'Tủ lạnh, Tủ đông, Tủ mát': 'CE & GD',
  'Máy giặt, Máy sấy, Máy rửa chén': 'CE & GD',
  'Máy lạnh Daikin': 'CE & GD',
  'Máy lạnh Casper': 'CE & GD',
  'Máy lọc nước': 'CE & GD',
  'Quạt gió': 'CE & GD',
  'Nồi cơm': 'CE & GD',
  'Máy lọc không khí - Hút bụi - Hút ẩm': 'CE & GD',
};

const getCategoryGroup = (catLabel: string, map?: Record<string, string>): string => {
  if (map && map[catLabel]) return map[catLabel];
  if (map) {
    const foundKey = Object.keys(map).find((k) => k.toLowerCase() === catLabel.toLowerCase());
    if (foundKey) return map[foundKey];
  }
  const defaultKey = Object.keys(DEFAULT_CATEGORY_GROUP).find((k) => k.toLowerCase() === catLabel.toLowerCase());
  if (defaultKey) return DEFAULT_CATEGORY_GROUP[defaultKey];
  return 'Chưa phân nhóm';
};

const CategoryGroupMultiSelectFilter: React.FC<{
  disabled?: boolean;
  selectedCategoryGroup: string;
  setSelectedCategoryGroup: (group: string) => void;
  categoryGroupList: string[];
  categoryGroupMap?: Record<string, string>;
}> = ({
  disabled,
  selectedCategoryGroup,
  setSelectedCategoryGroup,
  categoryGroupList,
  categoryGroupMap = {},
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Parse current selection
  const selectedList = React.useMemo(() => {
    if (!selectedCategoryGroup || selectedCategoryGroup === 'ALL') return [];
    return selectedCategoryGroup.split(',').map((s) => s.trim()).filter(Boolean);
  }, [selectedCategoryGroup]);

  const isAll = selectedList.length === 0 || selectedCategoryGroup === 'ALL';

  // Close when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleGroup = (groupName: string) => {
    if (isAll) {
      // If previously ALL, selecting one group now selects ONLY this group
      setSelectedCategoryGroup(groupName);
    } else {
      const exists = selectedList.includes(groupName);
      let nextList: string[];
      if (exists) {
        nextList = selectedList.filter((g) => g !== groupName);
      } else {
        nextList = [...selectedList, groupName];
      }

      if (nextList.length === 0 || nextList.length === categoryGroupList.length) {
        setSelectedCategoryGroup('ALL');
      } else {
        setSelectedCategoryGroup(nextList.join(','));
      }
    }
  };

  const handleSelectAll = () => {
    setSelectedCategoryGroup('ALL');
  };

  // Count categories in each group
  const groupCategoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    categoryGroupList.forEach((g) => {
      counts[g] = Object.values(categoryGroupMap).filter((mapped) => mapped === g).length;
    });
    return counts;
  }, [categoryGroupList, categoryGroupMap]);

  // Compute trigger button label
  const triggerLabel = React.useMemo(() => {
    if (isAll) return 'Tất cả';
    if (selectedList.length === 1) {
      return selectedList[0];
    }
    if (selectedList.length === categoryGroupList.length) {
      return 'Tất cả';
    }
    return selectedList.join(', ');
  }, [isAll, selectedList, categoryGroupList]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-auto min-w-[110px] max-w-[190px] bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 flex items-center justify-between gap-1.5 cursor-pointer shadow-2xs transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400' : 'hover:border-slate-300'
        } ${!isAll ? 'border-indigo-500 bg-indigo-50 text-indigo-900' : ''}`}
        title="Chọn một hoặc nhiều nhóm ngành hàng"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full mt-1.5 w-64 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-fade-in text-left">
          {/* Header Actions */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <button
              type="button"
              onClick={handleSelectAll}
              className={`hover:text-indigo-600 cursor-pointer flex items-center gap-1 ${isAll ? 'text-indigo-600 font-extrabold' : ''}`}
            >
              <Check className="w-3 h-3" /> Chọn tất cả
            </button>
            {!isAll && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="hover:text-rose-600 cursor-pointer text-slate-400"
              >
                Khôi phục tất cả
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-50">
            {/* "Tất cả" option */}
            <button
              type="button"
              onClick={handleSelectAll}
              className={`w-full px-3 py-2 text-xs font-bold text-left rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                isAll ? 'bg-indigo-50 text-indigo-900 font-black' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-all shrink-0 ${
                  isAll ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                }`}
              >
                {isAll && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
              </span>
              <span>Tất cả các nhóm</span>
            </button>

            {categoryGroupList.map((g) => {
              const isChecked = !isAll && selectedList.includes(g);
              const count = groupCategoryCounts[g] || 0;

              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGroup(g)}
                  className={`w-full px-3 py-2 text-xs font-bold text-left rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer ${
                    isChecked
                      ? 'bg-indigo-100 text-indigo-950 font-black'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-all ${
                        isChecked
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isChecked && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                    </div>
                    <span>{g}</span>
                  </div>
                  {count > 0 && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({count} ngành hàng)
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const CategoryMultiSelectFilter: React.FC<{
  disabled?: boolean;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  filteredCategoryOptions: Array<{ id: string; label: string }>;
  categoryDisplayNameMap: Record<string, string>;
}> = ({
  disabled,
  selectedCategory,
  setSelectedCategory,
  filteredCategoryOptions,
  categoryDisplayNameMap,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Parse current selection
  const selectedList = React.useMemo(() => {
    if (!selectedCategory || selectedCategory === 'ALL') return [];
    return selectedCategory.split(',').map((s) => s.trim()).filter(Boolean);
  }, [selectedCategory]);

  const isAll = selectedList.length === 0 || selectedCategory === 'ALL';

  // Close when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter options based on search query
  const searchableOptions = React.useMemo(() => {
    const realOptions = filteredCategoryOptions.filter((c) => c.id !== 'ALL');
    if (!searchTerm.trim()) return realOptions;
    const term = searchTerm.toLowerCase().trim();
    return realOptions.filter((c) => {
      const disp = resolveCategoryDisplayName(c.label || c.id, categoryDisplayNameMap).toLowerCase();
      return disp.includes(term) || c.id.toLowerCase().includes(term);
    });
  }, [filteredCategoryOptions, searchTerm, categoryDisplayNameMap]);

  const toggleCategory = (catId: string) => {
    if (isAll) {
      // If was ALL, and clicked a category, now select only this category
      setSelectedCategory(catId);
    } else {
      const exists = selectedList.includes(catId);
      let nextList: string[];
      if (exists) {
        nextList = selectedList.filter((id) => id !== catId);
      } else {
        nextList = [...selectedList, catId];
      }

      if (nextList.length === 0 || nextList.length === filteredCategoryOptions.filter((c) => c.id !== 'ALL').length) {
        setSelectedCategory('ALL');
      } else {
        setSelectedCategory(nextList.join(','));
      }
    }
  };

  const handleSelectAll = () => {
    setSelectedCategory('ALL');
  };

  const handleClearAll = () => {
    setSelectedCategory('ALL');
  };

  // Compute trigger button label
  const triggerLabel = React.useMemo(() => {
    if (isAll) return 'Tất cả';
    if (selectedList.length === 1) {
      return resolveCategoryDisplayName(selectedList[0], categoryDisplayNameMap);
    }
    return `${selectedList.length} ngành hàng`;
  }, [isAll, selectedList, categoryDisplayNameMap]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-auto min-w-[110px] max-w-[170px] bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 flex items-center justify-between gap-1.5 cursor-pointer shadow-2xs transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400' : 'hover:border-slate-300'
        } ${!isAll ? 'border-sky-500 bg-sky-50 text-sky-900' : ''}`}
        title="Chọn một hoặc nhiều ngành hàng"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full mt-1.5 w-72 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-fade-in text-left">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/90 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm ngành hàng..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pt-0.5 px-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className={`hover:text-sky-600 cursor-pointer flex items-center gap-1 ${isAll ? 'text-sky-600 font-extrabold' : ''}`}
              >
                <Check className="w-3 h-3" /> Chọn tất cả
              </button>
              {!isAll && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="hover:text-rose-600 cursor-pointer text-slate-400"
                >
                  Khôi phục tất cả
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-50">
            {/* "Tất cả" option */}
            <button
              type="button"
              onClick={handleSelectAll}
              className={`w-full px-3 py-1.5 text-xs font-bold text-left rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                isAll ? 'bg-sky-50 text-sky-900 font-black' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                  isAll ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 bg-white'
                }`}
              >
                {isAll && <Check className="w-3 h-3 stroke-[3]" />}
              </span>
              <span>Tất cả ngành hàng</span>
            </button>

            {searchableOptions.map((c) => {
              const displayName = resolveCategoryDisplayName(c.label || c.id, categoryDisplayNameMap);
              const isChecked = !isAll && selectedList.includes(c.id);

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={`w-full px-3 py-1.5 text-xs font-bold text-left rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                    isChecked
                      ? 'bg-sky-100 text-sky-950 font-black'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                      isChecked
                        ? 'bg-sky-600 border-sky-600 text-white'
                        : isAll
                        ? 'border-slate-200 bg-slate-100 text-slate-300'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </span>
                  <span className="truncate">{displayName}</span>
                </button>
              );
            })}

            {searchableOptions.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-400 font-semibold">
                Không tìm thấy ngành hàng phù hợp
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface HeaderBannerProps {
  timeMode: TimeMode;
  setTimeMode: (mode: TimeMode) => void;
  entityScope: EntityScope;
  setEntityScope: (scope: EntityScope) => void;
  selectedChannels: Channel[];
  setSelectedChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
  selectedProvince: string;
  setSelectedProvince: (province: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedCategoryGroup: string;
  setSelectedCategoryGroup: (group: string) => void;
  provinceList: string[];
  categoryList: { id: string; label: string }[];
  categoryGroupList: string[];
  categoryGroupMap?: Record<string, string>;
  categoryDisplayNameMap?: Record<string, string>;
  onOpenCategoryGroupModal: () => void;
  lastUpdated: string;
  onRefreshClick: () => void;
  onForceClearCache?: () => void;
  onOpenTagBossModal: () => void;
  onExportCompact: () => void;
  onExportFull: () => void;
  onExportGroup?: (target: 'ict' | 'dichvu' | 'ce' | 'all' | 'by_groups' | 'quick') => void;
  showSummarySection?: boolean;
  setShowSummarySection?: (show: boolean) => void;
  valueDisplayMode?: 'percent' | 'value';
  setValueDisplayMode?: (mode: 'percent' | 'value') => void;
  // Only Super Admin / Admin may switch to the DT Luỹ Kế/Realtime value view.
  canViewDtQdTb?: boolean;
  systemName?: string;
  subTitle?: string;
}

export const HeaderBanner: React.FC<HeaderBannerProps> = ({
  timeMode,
  setTimeMode,
  entityScope,
  setEntityScope,
  selectedChannels,
  setSelectedChannels,
  selectedProvince,
  setSelectedProvince,
  selectedCategory,
  setSelectedCategory,
  selectedCategoryGroup,
  setSelectedCategoryGroup,
  provinceList,
  categoryList,
  categoryGroupList,
  categoryGroupMap = {},
  categoryDisplayNameMap = {},
  onOpenCategoryGroupModal,
  lastUpdated,
  onRefreshClick,
  onForceClearCache,
  onOpenTagBossModal,
  onExportCompact,
  onExportFull,
  onExportGroup,
  showSummarySection = true,
  setShowSummarySection,
  valueDisplayMode = 'percent',
  setValueDisplayMode,
  canViewDtQdTb = true,
}) => {
  const allChannels: Channel[] = ['DML', 'DMM', 'DMS', 'TGD', 'TopZone'];

  const toggleChannel = (channel: Channel) => {
    if (selectedChannels.includes(channel)) {
      if (selectedChannels.length > 1) {
        setSelectedChannels(selectedChannels.filter((c) => c !== channel));
      }
    } else {
      setSelectedChannels([...selectedChannels, channel]);
    }
  };

  // Filter Ngành Hàng dropdown options depending on selected Nhóm N.Hàng (supports multi-group)
  const filteredCategoryOptions = React.useMemo(() => {
    const selectedGroups = !selectedCategoryGroup || selectedCategoryGroup === 'ALL'
      ? []
      : selectedCategoryGroup.split(',').map((s) => s.trim()).filter(Boolean);

    return categoryList.filter((c) => {
      if (c.id === 'ALL') return true;
      if (selectedGroups.length === 0) return true;
      const catGroup = getCategoryGroup(c.label || c.id, categoryGroupMap);
      return selectedGroups.includes(catGroup);
    });
  }, [selectedCategoryGroup, categoryList, categoryGroupMap]);

  // Reset selectedCategory to ALL if current selection is not in the filtered options.
  // selectedCategory can be a SINGLE id ('BH') or a MULTI-SELECT comma-joined
  // string ('BH,CAMERA') — CategoryMultiSelectFilter's toggleCategory() below
  // produces the latter as soon as a 2nd item is checked. This must check
  // each id individually; comparing the whole comma-string against a single
  // option's id never matches, so this effect used to fire on every 2nd+
  // selection and immediately reset back to 'ALL' — the multi-select dropdown
  // visually "kicking out" whatever the user had just picked.
  React.useEffect(() => {
    if (selectedCategory !== 'ALL') {
      const selectedIds = selectedCategory.split(',').map((s) => s.trim()).filter(Boolean);
      const stillValidIds = selectedIds.filter((id) => filteredCategoryOptions.some((c) => c.id === id));
      if (stillValidIds.length === 0) {
        if (entityScope === 'nhom') {
          const firstCat = filteredCategoryOptions[0]?.id || categoryList[0]?.id || 'TRẢ CHẬM HOMECREDIT';
          setSelectedCategory(firstCat);
        } else {
          setSelectedCategory('ALL');
        }
      } else if (stillValidIds.length !== selectedIds.length) {
        // Some (not all) previously-selected categories dropped out of the
        // filtered list (e.g. Nhóm N.Hàng filter changed) — keep just the
        // ones still valid instead of wiping the whole selection.
        setSelectedCategory(stillValidIds.join(','));
      }
    } else if (entityScope === 'nhom') {
      const firstCat = filteredCategoryOptions[0]?.id || categoryList[0]?.id || 'TRẢ CHẬM HOMECREDIT';
      if (firstCat && firstCat !== 'ALL') {
        setSelectedCategory(firstCat);
      }
    }
  }, [selectedCategoryGroup, filteredCategoryOptions, selectedCategory, entityScope, categoryList, setSelectedCategory]);

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm relative space-y-3 transition-all">
      {/* Accent Indicator Line — rounded on its own (rather than relying on
          overflow-hidden on the card) so it doesn't clip the Ngành hàng
          dropdown's popup list, which is absolutely positioned and needs to
          render outside this card's bounds. */}
      <div className="absolute top-0 left-0 w-2 h-full rounded-l-2xl bg-gradient-to-b from-rose-300 via-pink-300 to-amber-300"></div>

      {/* ROW 1: Header Brand, Dynamic Title & Scope / Time Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pl-2">
        {/* Title & Status */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Scope Selector: VÙNG / SIÊU THỊ (moved from title area) */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shrink-0">
            <button
              onClick={() => {
                setEntityScope('sieuthi');
                setSelectedProvince('ALL');
                setSelectedCategoryGroup('ALL');
                setSelectedCategory('ALL');
              }}
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
              onClick={() => {
                setEntityScope('vung');
                setSelectedCategoryGroup('ALL');
                setSelectedCategory('ALL');
              }}
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
                setEntityScope('nhom');
                if (selectedCategory === 'ALL') {
                  const firstCat = filteredCategoryOptions[0]?.id || categoryList[0]?.id || 'TRẢ CHẬM HOMECREDIT';
                  if (firstCat && firstCat !== 'ALL') {
                    setSelectedCategory(firstCat);
                  }
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                entityScope === 'nhom'
                  ? 'bg-purple-50 text-purple-700 border-purple-300 ring-2 ring-purple-200/60 shadow-2xs'
                  : 'bg-white/80 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
              }`}
            >
              <Layers className={`w-3.5 h-3.5 ${entityScope === 'nhom' ? 'text-purple-600' : 'text-slate-500'}`} />
              NHÓM
            </button>
          </div>

          {(() => {
            const freshness = checkDataFreshness(lastUpdated, 60, timeMode);
            const shortTimeStr = freshness.displayText.replace(/\s*NGÀY\s*/i, ' - ').replace(/\/20\d\d/, '');
            return (
              <div className="export-hide min-w-0">
                {freshness.isOutdated ? (
                  <div
                    title={timeMode === 'luyke' ? "Dữ liệu luỹ kế chưa được cập nhật sau 1 ngày!" : "Dữ liệu chưa được cập nhật trong hơn 1 giờ qua!"}
                    className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1 bg-rose-50 border border-rose-300 sm:border-2 sm:border-rose-400 text-rose-700 rounded-xl font-bold sm:font-black text-[11px] sm:text-xs shadow-xs animate-pulse whitespace-nowrap"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 animate-bounce shrink-0" />
                    <span className="tracking-tight uppercase hidden sm:inline">
                      THỜI GIAN ĐẾN: {freshness.displayText}
                    </span>
                    <span className="tracking-tight uppercase sm:hidden text-[10.5px]">
                      {shortTimeStr}
                    </span>
                    <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 bg-rose-600 text-white font-black rounded-md tracking-wider uppercase shrink-0">
                      <span className="hidden sm:inline">Chưa cập nhật mới</span>
                      <span className="sm:hidden">Chưa mới</span>
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] sm:text-xs font-bold sm:font-extrabold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1 bg-emerald-50/80 border border-emerald-200 text-emerald-800 rounded-xl shadow-2xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                      <span className="hidden sm:inline">THỜI GIAN ĐẾN: {freshness.displayText}</span>
                      <span className="sm:hidden text-[10.5px]">ĐẾN: {shortTimeStr}</span>
                    </span>
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Mode Control Button Group */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* TimeMode & Action Group */}
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

            <button
              onClick={onRefreshClick}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
              Cập nhật
            </button>

            <a
              href="https://bi.thegioididong.com/thi-dua?id=-1&tab=1&rt=1&dm=2&mt=2"
              target="_blank"
              rel="noopener noreferrer"
              title="Mở link cập nhật báo cáo BI Thế Giới Di Động"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100 hover:border-sky-400 shadow-2xs"
            >
              <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
              <span>Link BI</span>
            </a>
          </div>
        </div>
      </div>

      {/* ROW 2: Compact Filter Bar & Export Actions Integrated into Header (Disabled when in Tab NHÓM) */}
      <div
        className={`pt-2 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3 pl-2 transition-all ${
          entityScope === 'nhom'
            ? 'opacity-40 grayscale pointer-events-none select-none cursor-not-allowed'
            : ''
        }`}
        title={entityScope === 'nhom' ? 'Các bộ lọc này bị vô hiệu hoá trong tab Nhóm (vui lòng dùng bộ lọc riêng trên từng bảng bên dưới)' : undefined}
      >
        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Channel Checkboxes */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">Kênh:</span>
            {allChannels.map((ch) => {
              const isChecked = selectedChannels.includes(ch);
              return (
                <button
                  key={ch}
                  disabled={entityScope === 'nhom'}
                  onClick={() => toggleChannel(ch)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all border flex items-center gap-1 ${
                    entityScope === 'nhom'
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : isChecked
                      ? 'bg-blue-200 text-blue-900 border-blue-300 shadow-2xs cursor-pointer'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 cursor-pointer'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-xs border flex items-center justify-center ${
                    isChecked ? 'border-blue-400 bg-white text-blue-700' : 'border-slate-400 bg-white'
                  }`}>
                    {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                  <span>{ch}</span>
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

          {/* Select Province Dropdown */}
          <div className="flex items-center gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Tỉnh:</label>
            <select
              disabled={entityScope === 'nhom'}
              value={selectedProvince}
              onChange={(e) => setSelectedProvince(e.target.value)}
              className="w-[100px] bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer truncate disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="ALL">Tất cả</option>
              {provinceList.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Select Category Group Dropdown (Multi-Select Filter) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={entityScope === 'nhom'}
              onClick={onOpenCategoryGroupModal}
              title="Quản lý & Cấu hình Nhóm Ngành Hàng"
              className="text-[11px] font-bold text-slate-400 uppercase hover:text-indigo-600 flex items-center gap-0.5 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:hover:text-slate-400"
            >
              <span>Nhóm N.Hàng:</span>
              <Settings2 className="w-3 h-3 text-indigo-500 hover:text-indigo-700" />
            </button>
            <CategoryGroupMultiSelectFilter
              disabled={entityScope === 'nhom'}
              selectedCategoryGroup={selectedCategoryGroup}
              setSelectedCategoryGroup={setSelectedCategoryGroup}
              categoryGroupList={categoryGroupList}
              categoryGroupMap={categoryGroupMap}
            />
          </div>

          {/* Select Category Dropdown (Dynamically filtered by selected Nhóm N.Hàng with Multi-Select and Search) */}
          <div className="flex items-center gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Ngành hàng:</label>
            <CategoryMultiSelectFilter
              disabled={entityScope === 'nhom'}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              filteredCategoryOptions={filteredCategoryOptions}
              categoryDisplayNameMap={categoryDisplayNameMap}
            />
          </div>

          {/* View Mode Segmented Toggle: % vs Doanh Thu / Thực Đạt — Super Admin / Admin only */}
          {setValueDisplayMode && entityScope !== 'nhom' && canViewDtQdTb && (
            <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-xl shrink-0 shadow-2xs">
              <button
                type="button"
                onClick={() => setValueDisplayMode('percent')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                  valueDisplayMode === 'percent'
                    ? 'bg-white text-sky-800 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title={timeMode === 'realtime' ? 'Chế độ xem % HT Target Ngày' : 'Chế độ xem % HT Dự Kiến'}
              >
                <span>%</span>
              </button>
              <button
                type="button"
                onClick={() => setValueDisplayMode('value')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                  valueDisplayMode === 'value'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title={timeMode === 'realtime' ? 'Chế độ xem Doanh thu Realtime' : 'Chế độ xem Doanh thu Luỹ Kế'}
              >
                <span>{timeMode === 'realtime' ? 'DT Realtime' : 'DT Luỹ Kế'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
