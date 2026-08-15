import React, { useMemo, useState } from 'react';
import { StoreRecord, TimeMode } from '../types';
import {
  getChannelForStore,
  getCategoryData,
  resolveCategoryDisplayName,
  isExcludedStore,
  BossAssignmentRecord,
  getFormattedNow,
} from '../utils/parser';
import { getCategoryGroup } from './ReportView';
import { exportElementAsImage } from '../services/imageExport';
import { ExportLoadingModal } from './ExportLoadingModal';
import { Camera, Download, Layers, ShieldCheck, Sparkles, Check } from 'lucide-react';

interface TongReportViewProps {
  timeMode: TimeMode;
  lastUpdated?: string;
  stores: StoreRecord[];
  categoryGroupMap?: Record<string, string>;
  categoryDisplayNameMap?: Record<string, string>;
  bossAssignments?: BossAssignmentRecord[];
}

interface CategoryItemMetric {
  catName: string;
  displayName: string;
  group: string;
  totalTarget: number;
  totalAchieved: number;
  rate: number;
  hasActivity: boolean;
}

interface GroupSectionMetric {
  groupName: string;
  items: CategoryItemMetric[];
  achievedCount: number; // Count of categories >= 100%
  totalCount: number; // Active or total count
  ratePercent: number; // (achievedCount / totalCount) * 100
}

export const TongReportView: React.FC<TongReportViewProps> = ({
  timeMode,
  lastUpdated,
  stores,
  categoryGroupMap = {},
  categoryDisplayNameMap = {},
  bossAssignments = [],
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  // 1. Format Time String matching the image:
  // "REALTIME ĐẾN THỜI GIAN : 15:03:43 || NGÀY 15/08/2026"
  const formattedHeaderTime = useMemo(() => {
    const raw = (lastUpdated || '').replace(/THỜI GIAN ĐẾN:\s*/i, '').trim();
    if (raw) {
      // Extract time and date
      const timeMatch = raw.match(/(\d{1,2}:\d{1,2}(?::\d{1,2})?)/);
      const dateMatch = raw.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
      if (timeMatch && dateMatch) {
        return `${timeMatch[1]} || NGÀY ${dateMatch[1]}`;
      }
      return raw.replace(/\s*NGÀY\s*/i, ' || NGÀY ');
    }
    const now = getFormattedNow();
    return now.replace(/\s*NGÀY\s*/i, ' || NGÀY ');
  }, [lastUpdated]);

  const modePrefix = timeMode === 'realtime' ? 'REALTIME' : 'LUỸ KẾ';

  // 2. Separate stores into TGD vs ĐMX
  const tgdStores = useMemo(() => {
    return stores.filter((s) => {
      if (isExcludedStore(s, bossAssignments)) return false;
      const kenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
      const kUpper = String(kenh || '').toUpperCase();
      return kUpper.includes('TGD') || kUpper.includes('TOPZONE') || kUpper.includes('TZ');
    });
  }, [stores, bossAssignments]);

  const dmxStores = useMemo(() => {
    return stores.filter((s) => {
      if (isExcludedStore(s, bossAssignments)) return false;
      const kenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
      const kUpper = String(kenh || '').toUpperCase();
      return (
        kUpper.includes('DML') ||
        kUpper.includes('DMM') ||
        kUpper.includes('DMS') ||
        kUpper.includes('LƯU ĐỘNG') ||
        kUpper.includes('LUU DONG') ||
        kUpper.includes('LUUDONG') ||
        (!kUpper.includes('TGD') && !kUpper.includes('TOPZONE') && !kUpper.includes('TZ'))
      );
    });
  }, [stores, bossAssignments]);

  // 3. Extract all unique category names
  const allCategoryNames = useMemo(() => {
    const set = new Set<string>();
    Object.keys(categoryGroupMap).forEach((c) => set.add(c));
    stores.forEach((s) => {
      if (s.categoryMap) {
        Object.keys(s.categoryMap).forEach((c) => set.add(c));
      }
    });
    return Array.from(set);
  }, [categoryGroupMap, stores]);

  // 4. Compute metrics for a specific channel dataset
  const buildGroupSections = (
    targetStores: StoreRecord[],
    includeCeGroup: boolean
  ): {
    sections: GroupSectionMetric[];
    totalAchieved: number;
    totalCategories: number;
    totalRate: number;
  } => {
    // Determine ordered group names
    // Preferred: ICT -> DỊCH VỤ -> CE & GD (or C.E & GD)
    const rawGroups = Array.from(
      new Set(allCategoryNames.map((cat) => getCategoryGroup(cat, categoryGroupMap)))
    );

    const isCe = (g: string) => {
      const u = g.toUpperCase().trim();
      return u === 'CE & GD' || u === 'CE & GIA DỤNG' || u === 'C.E & GD' || u.includes('CE');
    };

    const orderedGroups = rawGroups
      .filter((g) => (includeCeGroup ? true : !isCe(g)))
      .sort((a, b) => {
        const order = (g: string) => {
          const u = g.toUpperCase();
          if (u.includes('ICT')) return 1;
          if (u.includes('DỊCH VỤ') || u.includes('DICH VU')) return 2;
          if (isCe(g)) return 3;
          return 4;
        };
        return order(a) - order(b);
      });

    const sections: GroupSectionMetric[] = [];
    let grandAchieved = 0;
    let grandTotal = 0;

    orderedGroups.forEach((groupName) => {
      // Find all categories in this group
      const catsInGroup = allCategoryNames.filter(
        (cat) => getCategoryGroup(cat, categoryGroupMap) === groupName
      );

      const items: CategoryItemMetric[] = catsInGroup.map((catName) => {
        let totalTarget = 0;
        let totalAchieved = 0;
        let rateSum = 0;
        let count = 0;

        targetStores.forEach((s) => {
          const data = getCategoryData(s, catName);
          if (data.target > 0 || data.achieved > 0 || data.rate > 0) {
            totalTarget += data.target;
            totalAchieved += data.achieved;
            rateSum += data.rate || 0;
            count += 1;
          }
        });

        const rate =
          totalTarget > 0
            ? Math.round((totalAchieved / totalTarget) * 100)
            : count > 0
            ? Math.round(rateSum / count)
            : 0;

        const hasActivity = totalTarget > 0 || totalAchieved > 0 || count > 0 || rate > 0;
        const displayName = resolveCategoryDisplayName(catName, categoryDisplayNameMap);

        return {
          catName,
          displayName,
          group: groupName,
          totalTarget,
          totalAchieved,
          rate,
          hasActivity,
        };
      });

      // Sort items within group strictly descending by rate
      items.sort((a, b) => {
        if (b.rate !== a.rate) return b.rate - a.rate;
        return a.displayName.localeCompare(b.displayName, 'vi');
      });

      // Achieved count: items with rate >= 100%
      const achievedCount = items.filter((item) => item.rate >= 100).length;

      // Active items count (denominator)
      const activeCount = items.filter((item) => item.hasActivity).length;
      const totalCount = activeCount > 0 ? activeCount : items.length;
      const ratePercent = totalCount > 0 ? Math.round((achievedCount / totalCount) * 100) : 0;

      grandAchieved += achievedCount;
      grandTotal += totalCount;

      sections.push({
        groupName: isCe(groupName) ? 'C.E & GD' : groupName,
        items,
        achievedCount,
        totalCount,
        ratePercent,
      });
    });

    const totalRate = grandTotal > 0 ? Math.round((grandAchieved / grandTotal) * 100) : 0;

    return {
      sections,
      totalAchieved: grandAchieved,
      totalCategories: grandTotal,
      totalRate,
    };
  };

  // Build metrics for TGD (no CE & GD group) and ĐMX (with CE & GD group)
  const tgdData = useMemo(() => buildGroupSections(tgdStores, false), [tgdStores, allCategoryNames, categoryGroupMap, categoryDisplayNameMap]);
  const dmxData = useMemo(() => buildGroupSections(dmxStores, true), [dmxStores, allCategoryNames, categoryGroupMap, categoryDisplayNameMap]);

  // Export handlers
  const handleExportCard = async (elementId: string, filename: string, titleMsg: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    setIsExporting(true);
    setExportMessage(titleMsg);
    try {
      await new Promise((r) => setTimeout(r, 150));
      await exportElementAsImage(el, filename, {
        scale: 2.5,
      });
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Action Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
              Bảng Tổng Quan Kênh TGD &amp; ĐMX
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              Tỷ lệ hoàn thành theo nhóm ngành hàng ({modePrefix} đến {formattedHeaderTime})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              handleExportCard(
                'tong-export-both-root',
                `Tong_Quan_TGD_DMX_${timeMode}_${Date.now()}.png`,
                'Đang xuất ảnh toàn bộ 2 bảng TGD & ĐMX...'
              )
            }
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>Xuất ảnh cả 2 bảng</span>
          </button>
        </div>
      </div>

      {/* Grid of 2 Cards: TGD (Left) & ĐMX (Right) */}
      <div id="tong-export-both-root" className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start bg-white/50 p-2 sm:p-4">
        
        {/* =======================================================================
            CARD 1: TGD (KÊNH TGD + TZ) — soft amber pastel, professional grid
           ======================================================================= */}
        <div
          id="tong-card-tgd"
          className="bg-white border border-amber-200 shadow-sm overflow-hidden flex flex-col"
        >
          {/* Header Banner */}
          <div className="bg-amber-50 p-4 sm:p-5 flex items-start justify-between gap-3 border-b border-amber-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase leading-none text-amber-700">
                  TGD
                </h1>
              </div>
              <div className="mt-2 text-[11px] font-bold uppercase text-slate-500 space-y-1 tracking-wide">
                <div>Kênh : TGD + TZ</div>
                <div className="text-slate-600">
                  {modePrefix} đến thời gian :{' '}
                  <span className="text-rose-600 font-black">{formattedHeaderTime}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                handleExportCard(
                  'tong-card-tgd',
                  `Bang_TGD_${timeMode}_${Date.now()}.png`,
                  'Đang xuất ảnh bảng TGD...'
                )
              }
              title="Xuất ảnh bảng TGD"
              className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-700 rounded-lg text-[11px] font-extrabold transition-all flex items-center gap-1.5 border border-amber-300 cursor-pointer shadow-xs shrink-0 export-hide"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Xuất ảnh TGD</span>
            </button>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-amber-50/70 text-slate-600 font-bold text-center border-b border-amber-200">
                  <th className="py-2.5 px-2 w-[40px] text-center uppercase text-[10.5px] tracking-wider">STT</th>
                  <th className="py-2.5 px-2 w-[95px] text-center uppercase text-[10.5px] tracking-wider">Ngành hàng</th>
                  <th className="py-2.5 px-3 text-left uppercase text-[10.5px] tracking-wider">Nhóm hàng</th>
                  <th className="py-2.5 px-2 w-[100px] text-center uppercase text-[10.5px] tracking-wider">% Hoàn thành</th>
                  <th className="py-2.5 px-2 w-[130px] text-center uppercase text-[10.5px] tracking-wider" colSpan={2}>
                    Tỉ lệ hoàn thành trên 100%
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  let runningStt = 0;
                  return tgdData.sections.map((sec, secIdx) => {
                    const groupRowCount = sec.items.length;

                    return sec.items.map((item, itemIdx) => {
                      runningStt += 1;
                      const isFirstInGroup = itemIdx === 0;
                      const isAchieved = item.rate >= 100;

                      return (
                        <tr
                          key={`${sec.groupName}-${item.catName}-${itemIdx}`}
                          className={`hover:bg-amber-50/60 transition-colors ${
                            isAchieved ? 'bg-emerald-50/40' : ''
                          }`}
                        >
                          {/* STT */}
                          <td className="py-1.5 px-2 text-center font-semibold text-slate-500 border-r border-slate-100">
                            {runningStt}
                          </td>

                          {/* NGÀNH HÀNG (Group name merged per group) */}
                          {isFirstInGroup && (
                            <td
                              rowSpan={groupRowCount}
                              className="py-2 px-2 text-center align-middle border-r border-slate-100"
                            >
                              <span className="inline-block px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-700 font-bold uppercase text-[10.5px] tracking-wide">
                                {sec.groupName}
                              </span>
                            </td>
                          )}

                          {/* NHÓM HÀNG (Category Display Name) */}
                          <td className="py-1.5 px-3 font-semibold text-slate-700 uppercase truncate max-w-[240px] border-r border-slate-100">
                            {item.displayName}
                          </td>

                          {/* % HOÀN THÀNH */}
                          <td
                            className={`py-1.5 px-2 text-center font-bold border-r border-slate-100 ${
                              isAchieved
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'text-rose-500'
                            }`}
                          >
                            {item.rate}%
                          </td>

                          {/* TỈ LỆ HOÀN THÀNH TRÊN 100% (Merged Count & Rate) */}
                          {isFirstInGroup && (
                            <>
                              <td
                                rowSpan={groupRowCount}
                                className="py-2 px-2 text-center font-bold text-slate-600 align-middle border-r border-slate-100"
                              >
                                {sec.achievedCount}/{sec.totalCount}
                              </td>
                              <td
                                rowSpan={groupRowCount}
                                className={`py-2 px-2 text-center font-black align-middle ${
                                  sec.ratePercent >= 100
                                    ? 'text-emerald-600'
                                    : 'text-rose-500'
                                }`}
                              >
                                {sec.ratePercent}%
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    });
                  });
                })()}

                {/* FOOTER ROW: TỔNG CỘNG */}
                <tr className="bg-amber-100/70 text-slate-800 font-black text-sm border-t border-amber-200">
                  <td colSpan={4} className="py-2.5 px-4 text-center uppercase tracking-wider">
                    Tổng cộng
                  </td>
                  <td className="py-2.5 px-2 text-center font-black w-[65px]">
                    {tgdData.totalAchieved}/{tgdData.totalCategories}
                  </td>
                  <td
                    className={`py-2.5 px-2 text-center font-black w-[65px] ${
                      tgdData.totalRate >= 100 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {tgdData.totalRate}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* =======================================================================
            CARD 2: ĐMX (KÊNH DML + DMM + DMS + LƯU ĐỘNG) — soft sky pastel
           ======================================================================= */}
        <div
          id="tong-card-dmx"
          className="bg-white border border-sky-200 shadow-sm overflow-hidden flex flex-col"
        >
          {/* Header Banner */}
          <div className="bg-sky-50 p-4 sm:p-5 flex items-start justify-between gap-3 border-b border-sky-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0"></span>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase leading-none text-sky-700">
                  ĐMX
                </h1>
              </div>
              <div className="mt-2 text-[11px] font-bold uppercase text-slate-500 space-y-1 tracking-wide">
                <div>Kênh : DML + DMM + DMS + Lưu động</div>
                <div className="text-slate-600">
                  {modePrefix} đến thời gian :{' '}
                  <span className="text-rose-600 font-black">{formattedHeaderTime}</span>
                </div>
                <div className="text-[10px] sm:text-[10.5px] font-bold text-slate-400 normal-case pt-0.5 tracking-normal">
                  D.thu C.E + GD do TGD + TZ bán sẽ tính cho Vùng, không cộng cho ĐMX
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                handleExportCard(
                  'tong-card-dmx',
                  `Bang_DMX_${timeMode}_${Date.now()}.png`,
                  'Đang xuất ảnh bảng ĐMX...'
                )
              }
              title="Xuất ảnh bảng ĐMX"
              className="px-3 py-1.5 bg-white hover:bg-sky-100 text-sky-700 rounded-lg text-[11px] font-extrabold transition-all flex items-center gap-1.5 border border-sky-300 cursor-pointer shadow-xs shrink-0 export-hide"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Xuất ảnh ĐMX</span>
            </button>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-sky-50/70 text-slate-600 font-bold text-center border-b border-sky-200">
                  <th className="py-2.5 px-2 w-[40px] text-center uppercase text-[10.5px] tracking-wider">STT</th>
                  <th className="py-2.5 px-2 w-[95px] text-center uppercase text-[10.5px] tracking-wider">Ngành hàng</th>
                  <th className="py-2.5 px-3 text-left uppercase text-[10.5px] tracking-wider">Nhóm hàng</th>
                  <th className="py-2.5 px-2 w-[100px] text-center uppercase text-[10.5px] tracking-wider">% Hoàn thành</th>
                  <th className="py-2.5 px-2 w-[130px] text-center uppercase text-[10.5px] tracking-wider" colSpan={2}>
                    Tỉ lệ hoàn thành trên 100%
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  let runningStt = 0;
                  return dmxData.sections.map((sec, secIdx) => {
                    const groupRowCount = sec.items.length;

                    return sec.items.map((item, itemIdx) => {
                      runningStt += 1;
                      const isFirstInGroup = itemIdx === 0;
                      const isAchieved = item.rate >= 100;

                      return (
                        <tr
                          key={`${sec.groupName}-${item.catName}-${itemIdx}`}
                          className={`hover:bg-sky-50/60 transition-colors ${
                            isAchieved ? 'bg-emerald-50/40' : ''
                          }`}
                        >
                          {/* STT */}
                          <td className="py-1.5 px-2 text-center font-semibold text-slate-500 border-r border-slate-100">
                            {runningStt}
                          </td>

                          {/* NGÀNH HÀNG (Group name merged per group) */}
                          {isFirstInGroup && (
                            <td
                              rowSpan={groupRowCount}
                              className="py-2 px-2 text-center align-middle border-r border-slate-100"
                            >
                              <span className="inline-block px-2 py-1 rounded-md border border-sky-200 bg-sky-50 text-sky-700 font-bold uppercase text-[10.5px] tracking-wide">
                                {sec.groupName}
                              </span>
                            </td>
                          )}

                          {/* NHÓM HÀNG (Category Display Name) */}
                          <td className="py-1.5 px-3 font-semibold text-slate-700 uppercase truncate max-w-[240px] border-r border-slate-100">
                            {item.displayName}
                          </td>

                          {/* % HOÀN THÀNH */}
                          <td
                            className={`py-1.5 px-2 text-center font-bold border-r border-slate-100 ${
                              isAchieved
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'text-rose-500'
                            }`}
                          >
                            {item.rate}%
                          </td>

                          {/* TỈ LỆ HOÀN THÀNH TRÊN 100% (Merged Count & Rate) */}
                          {isFirstInGroup && (
                            <>
                              <td
                                rowSpan={groupRowCount}
                                className="py-2 px-2 text-center font-bold text-slate-600 align-middle border-r border-slate-100"
                              >
                                {sec.achievedCount}/{sec.totalCount}
                              </td>
                              <td
                                rowSpan={groupRowCount}
                                className={`py-2 px-2 text-center font-black align-middle ${
                                  sec.ratePercent >= 100
                                    ? 'text-emerald-600'
                                    : 'text-rose-500'
                                }`}
                              >
                                {sec.ratePercent}%
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    });
                  });
                })()}

                {/* FOOTER ROW: TỔNG CỘNG */}
                <tr className="bg-sky-100/70 text-slate-800 font-black text-sm border-t border-sky-200">
                  <td colSpan={4} className="py-2.5 px-4 text-center uppercase tracking-wider">
                    Tổng cộng
                  </td>
                  <td className="py-2.5 px-2 text-center font-black w-[65px]">
                    {dmxData.totalAchieved}/{dmxData.totalCategories}
                  </td>
                  <td
                    className={`py-2.5 px-2 text-center font-black w-[65px] ${
                      dmxData.totalRate >= 100 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {dmxData.totalRate}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Export loading modal */}
      <ExportLoadingModal isOpen={isExporting} exportTitle={exportMessage} />
    </div>
  );
};
