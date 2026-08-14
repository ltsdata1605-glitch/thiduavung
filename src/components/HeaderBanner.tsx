import React, { useState } from 'react';
import { TimeMode, EntityScope, Channel } from '../types';
import { getShortCategoryName } from '../utils/parser';
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
  Trash2
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
  onOpenCategoryGroupModal: () => void;
  lastUpdated: string;
  onRefreshClick: () => void;
  onForceClearCache?: () => void;
  onOpenTagBossModal: () => void;
  onExportCompact: () => void;
  onExportFull: () => void;
  onExportGroup?: (target: 'ict' | 'dichvu' | 'ce' | 'all' | 'by_groups') => void;
  showSummarySection?: boolean;
  setShowSummarySection?: (show: boolean) => void;
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

  // Filter Ngành Hàng dropdown options depending on selected Nhóm N.Hàng
  const filteredCategoryOptions = categoryList.filter((c) => {
    if (selectedCategoryGroup === 'ALL') return true;
    const catGroup = getCategoryGroup(c.label, categoryGroupMap);
    return catGroup === selectedCategoryGroup;
  });

  // Reset selectedCategory to ALL if current selection is not in the filtered options
  React.useEffect(() => {
    if (selectedCategory !== 'ALL') {
      const exists = filteredCategoryOptions.some((c) => c.id === selectedCategory);
      if (!exists) {
        if (entityScope === 'nhom') {
          const firstCat = filteredCategoryOptions[0]?.id || categoryList[0]?.id || 'TRẢ CHẬM HOMECREDIT';
          setSelectedCategory(firstCat);
        } else {
          setSelectedCategory('ALL');
        }
      }
    } else if (entityScope === 'nhom') {
      const firstCat = filteredCategoryOptions[0]?.id || categoryList[0]?.id || 'TRẢ CHẬM HOMECREDIT';
      if (firstCat && firstCat !== 'ALL') {
        setSelectedCategory(firstCat);
      }
    }
  }, [selectedCategoryGroup, filteredCategoryOptions, selectedCategory, entityScope, categoryList, setSelectedCategory]);

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm relative overflow-hidden space-y-3 transition-all">
      {/* Accent Indicator Line */}
      <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-rose-300 via-pink-300 to-amber-300"></div>

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

          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-slate-600 flex flex-wrap items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                THỜI GIAN ĐẾN: {lastUpdated}
              </span>
            </p>
          </div>
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

            {onForceClearCache && (
              <button
                onClick={onForceClearCache}
                title="Ép xoá bộ nhớ cache trình duyệt và tải lại dữ liệu mới"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 hover:border-amber-400 shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5 text-amber-700" />
                Xoá Cache
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ROW 2: Compact Filter Bar & Export Actions Integrated into Header (Only active for VÙNG & SIÊU THỊ) */}
      {entityScope !== 'group' && (
        <div className="pt-2 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3 pl-2">
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
                    onClick={() => toggleChannel(ch)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all border cursor-pointer flex items-center gap-1 ${
                      isChecked
                        ? 'bg-blue-200 text-blue-900 border-blue-300 shadow-2xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
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
                value={selectedProvince}
                onChange={(e) => setSelectedProvince(e.target.value)}
                className="w-[100px] bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer truncate"
              >
                <option value="ALL">Tất cả</option>
                {provinceList.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Select Category Group Dropdown (Clickable Label Opens Modal) */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onOpenCategoryGroupModal}
                title="Quản lý & Cấu hình Nhóm Ngành Hàng"
                className="text-[11px] font-bold text-slate-400 uppercase hover:text-indigo-600 flex items-center gap-0.5 cursor-pointer transition-colors"
              >
                <span>Nhóm N.Hàng:</span>
                <Settings2 className="w-3 h-3 text-indigo-500 hover:text-indigo-700" />
              </button>
              <select
                value={selectedCategoryGroup}
                onChange={(e) => setSelectedCategoryGroup(e.target.value)}
                className="w-[110px] bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer truncate"
              >
                <option value="ALL">Tất cả</option>
                {categoryGroupList.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Select Category Dropdown (Dynamically filtered by selected Nhóm N.Hàng) */}
            <div className="flex items-center gap-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase">Ngành hàng:</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-[110px] bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer truncate"
              >
                <option value="ALL">Tất cả</option>
                {filteredCategoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id === 'ALL' ? c.label : getShortCategoryName(c.label || c.id)}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggle KPI Cards & Charts Section Button */}
            {setShowSummarySection && (
              <button
                onClick={() => setShowSummarySection(!showSummarySection)}
                className={`px-3 py-1 font-extrabold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 ${
                  showSummarySection
                    ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                    : 'bg-violet-200 text-violet-900 border-violet-300 hover:bg-violet-300'
                }`}
                title={showSummarySection ? 'Thu gọn Biểu đồ' : 'Hiện Biểu đồ'}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>{showSummarySection ? 'Thu gọn Biểu đồ' : 'Biểu đồ'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
