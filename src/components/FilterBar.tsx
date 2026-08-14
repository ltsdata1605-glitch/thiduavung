import React from 'react';
import { EntityScope, Channel } from '../types';
import { getShortCategoryName } from '../utils/parser';
import { Globe, Store, Filter, MessageSquare, Download, Share2 } from 'lucide-react';

interface FilterBarProps {
  entityScope: EntityScope;
  setEntityScope: (scope: EntityScope) => void;
  selectedChannels: Channel[];
  setSelectedChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
  selectedProvince: string;
  setSelectedProvince: (province: string) => void;
  selectedBoss: string;
  setSelectedBoss: (boss: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  provinceList: string[];
  bossList: string[];
  categoryList: { id: string; label: string }[];
  onTagBossClick: () => void;
  onExportCompactClick: () => void;
  onExportFullClick: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  entityScope,
  setEntityScope,
  selectedChannels,
  setSelectedChannels,
  selectedProvince,
  setSelectedProvince,
  selectedBoss,
  setSelectedBoss,
  selectedCategory,
  setSelectedCategory,
  provinceList,
  bossList,
  categoryList,
  onTagBossClick,
  onExportCompactClick,
  onExportFullClick,
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

  return (
    <div className="space-y-4">
      {/* Main Filter Panel Card */}
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200 shadow-sm space-y-4">
        {/* Channel Filters Checkboxes */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> BỘ LỌC KÊNH TỔNG
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {allChannels.map((channel) => {
              const isChecked = selectedChannels.includes(channel);
              return (
                <label
                  key={channel}
                  onClick={() => toggleChannel(channel)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all select-none ${
                    isChecked
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="w-3.5 h-3.5 rounded-xs border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{channel}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Dropdowns & Action Buttons Grid */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pt-2 border-t border-slate-100">
          {/* Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            {/* Province Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                BỘ LỌC TỈNH
              </label>
              <select
                value={selectedProvince}
                onChange={(e) => setSelectedProvince(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="ALL">Tất cả</option>
                {provinceList.map((prov) => (
                  <option key={prov} value={prov}>
                    {prov}
                  </option>
                ))}
              </select>
            </div>

            {/* Boss / Group Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                BỘ LỌC NHÓM
              </label>
              <select
                value={selectedBoss}
                onChange={(e) => setSelectedBoss(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="ALL">Tất cả</option>
                {bossList.map((boss) => (
                  <option key={boss} value={boss}>
                    {boss}
                  </option>
                ))}
              </select>
            </div>

            {/* Product Category Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                NGÀNH HÀNG HIỂN THỊ
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="ALL">Tất cả</option>
                {categoryList.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.id === 'ALL' ? cat.label : getShortCategoryName(cat.label || cat.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons: TAG BOSS, XUẤT ÁNH RÚT GỌN, XUẤT ẢNH TỔNG */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0">
            <button
              onClick={onTagBossClick}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              TAG TÊN BOSS
            </button>

            <button
              onClick={onExportCompactClick}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              XUẤT ẢNH RÚT GỌN
            </button>

            <button
              onClick={onExportFullClick}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              XUẤT ẢNH TỔNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
