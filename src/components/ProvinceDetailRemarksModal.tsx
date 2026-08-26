import React, { useState, useEffect } from 'react';
import { StoreRecord, TimeMode, Channel, RemarkDisplayMode } from '../types';
import {
  getBossForStore,
  getChannelForStore,
  getCategoryData,
  computeCompletionRate,
  formatStoreDisplayName,
  resolveCategoryDisplayName,
  isExcludedStore,
  formatBossTag,
  formatStoreRemarkLine,
  BossAssignmentRecord,
} from '../utils/parser';
import { X, Copy, Check, MessageSquare } from 'lucide-react';
import confetti from 'canvas-confetti';
import { copyTextToClipboard } from '../services/imageExport';

interface ProvinceDetailRemarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  province: string;
  category: string;
  categoryDisplayNameMap?: Record<string, string>;
  timeMode: TimeMode;
  lastUpdated?: string;
  formattedTimeStr: string;
  stores: StoreRecord[];
  selectedChannels: Channel[];
  bossAssignments: BossAssignmentRecord[];
  isExcludedChannel: (k?: string) => boolean;
  daysInMonth?: number;
  daysElapsed?: number;
}

export function generateProvinceDetailRemarksText(params: {
  province: string;
  category: string;
  categoryDisplayNameMap?: Record<string, string>;
  timeMode: TimeMode;
  lastUpdated?: string;
  formattedTimeStr: string;
  stores: StoreRecord[];
  selectedChannels: Channel[];
  bossAssignments: BossAssignmentRecord[];
  isExcludedChannel: (k?: string) => boolean;
  remarkDisplayMode?: RemarkDisplayMode;
  daysInMonth?: number;
  daysElapsed?: number;
}): string {
  const {
    province,
    category,
    categoryDisplayNameMap = {},
    timeMode,
    lastUpdated,
    formattedTimeStr,
    stores = [],
    selectedChannels = [],
    bossAssignments = [],
    isExcludedChannel,
    remarkDisplayMode = 'user',
    daysInMonth,
    daysElapsed,
  } = params;

  const catName = resolveCategoryDisplayName(category, categoryDisplayNameMap);
  const fullTime = lastUpdated || formattedTimeStr;
  const formatInt = (n: number) => Math.round(n || 0).toLocaleString('vi-VN');

  // 1. Filter stores in this province & selected channels
  const provStores = stores.filter((s) => {
    if (s.tinh !== province) return false;
    if (isExcludedStore(s, bossAssignments)) return false;
    const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
    if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) return false;
    return true;
  });

  // Compute metrics for each store
  const storeMetrics = provStores.map((s) => {
    const data = getCategoryData(s, category);
    const boss = getBossForStore(s.sieuthi, bossAssignments, s.boss);
    const bossTag = formatBossTag(boss);
    const target = data.target || 0;
    const achieved = data.achieved || 0;
    const rate = computeCompletionRate(target, achieved, timeMode, daysInMonth, daysElapsed);
    return {
      storeName: formatStoreDisplayName(s.sieuthi),
      boss,
      bossTag,
      target,
      achieved,
      rate,
    };
  });

  // Total province metrics
  const totalTarget = storeMetrics.reduce((a, b) => a + b.target, 0);
  const totalAchieved = storeMetrics.reduce((a, b) => a + b.achieved, 0);
  const totalRate = Math.round(computeCompletionRate(totalTarget, totalAchieved, timeMode, daysInMonth, daysElapsed));
  const remaining = totalTarget - totalAchieved;
  const isSurpassed = remaining <= 0 && totalTarget > 0;
  const totalSummaryLine = isSurpassed
    ? `🎉 ĐÃ VƯỢT: +${formatInt(Math.abs(remaining))} (${totalRate}%) - Hoàn thành xuất sắc mục tiêu!`
    : `📉 CÒN THIẾU: ${formatInt(remaining)} để hoàn thành 100% mục tiêu`;

  // Sort all stores descending by rate for overall ranking
  const sortedAll = [...storeMetrics].sort((a, b) => b.rate - a.rate);
  const totalCount = sortedAll.length;

  // Top 20% stores of the province (at least 1, max top 20%)
  const topCount = Math.max(1, Math.round(totalCount * 0.2));
  const topStores = sortedAll.slice(0, topCount);

  const topLines = topStores
    .map((s, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
      return formatStoreRemarkLine({
        prefix: `${medal} #${idx + 1}`,
        storeName: s.storeName,
        bossTag: s.bossTag,
        rawBoss: s.boss,
        valuePart: `${formatInt(s.achieved)} / ${formatInt(s.target)}`,
        rate: s.rate,
        mode: remarkDisplayMode,
        group: 'top',
      });
    })
    .join('\n');

  // BOT 20% (tối đa 30 Boss để tránh vượt giới hạn @mention của Zalo/Line)
  const storesWithTarget = sortedAll.filter((s) => s.target > 0);
  const botCount = Math.min(30, Math.max(1, Math.round(storesWithTarget.length * 0.2)));
  const botStores = storesWithTarget.slice(-botCount).reverse();

  const botLines = botStores
    .map((s) => {
      const rank = sortedAll.findIndex((item) => item.storeName === s.storeName) + 1;
      return formatStoreRemarkLine({
        prefix: `🔻 #${rank}`,
        storeName: s.storeName,
        bossTag: s.bossTag,
        rawBoss: s.boss,
        valuePart: `${formatInt(s.achieved)} / ${formatInt(s.target)}`,
        rate: s.rate,
        mode: remarkDisplayMode,
        group: 'bot',
      });
    })
    .join('\n');

  const modeIcon = timeMode === 'realtime' ? '⚡' : '📈';
  const modeTitle = timeMode === 'realtime' ? 'CẬP NHẬT REALTIME' : 'CẬP NHẬT LUỸ KẾ';
  const header = `${modeIcon} ${modeTitle} - ${province.toUpperCase()} • ${catName.toUpperCase()} - ${fullTime}`;

  return `${header}
━━━━━━━━━━━━━━
📊 KẾT QUẢ TỈNH ${province.toUpperCase()}:
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)} (${totalRate}%)
${totalSummaryLine}

🏆 TOP 20% SIÊU THỊ DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 20% SIÊU THỊ CẦN TĂNG TỐC (Chỉ xét ST có Target):
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━
👉 Đề nghị các Boss bám sát, tập trung đẩy mạnh tư vấn để bứt phá mục tiêu! 💪🏼🔥`;
}

export const ProvinceDetailRemarksModal: React.FC<ProvinceDetailRemarksModalProps> = ({
  isOpen,
  onClose,
  province,
  category,
  categoryDisplayNameMap = {},
  timeMode,
  lastUpdated,
  formattedTimeStr,
  stores = [],
  selectedChannels = [],
  bossAssignments = [],
  isExcludedChannel,
  daysInMonth,
  daysElapsed,
}) => {
  const [copied, setCopied] = useState(false);
  const [remarkDisplayMode, setRemarkDisplayMode] = useState<RemarkDisplayMode>('user');
  const [customText, setCustomText] = useState('');
  const catName = resolveCategoryDisplayName(category, categoryDisplayNameMap);

  useEffect(() => {
    if (!isOpen) return;
    const text = generateProvinceDetailRemarksText({
      province,
      category,
      categoryDisplayNameMap,
      timeMode,
      lastUpdated,
      formattedTimeStr,
      stores,
      selectedChannels,
      bossAssignments,
      isExcludedChannel,
      remarkDisplayMode,
      daysInMonth,
      daysElapsed,
    });
    setCustomText(text);
    setCopied(false);
  }, [
    isOpen,
    province,
    category,
    categoryDisplayNameMap,
    timeMode,
    lastUpdated,
    formattedTimeStr,
    stores,
    selectedChannels,
    bossAssignments,
    isExcludedChannel,
    remarkDisplayMode,
    daysInMonth,
    daysElapsed,
  ]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(customText);
    if (ok) {
      setCopied(true);
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 },
      });
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-extrabold text-base">
            <MessageSquare className="w-5 h-5 text-amber-200" />
            <span>NHẬN XÉT: {province.toUpperCase()} • {catName.toUpperCase()}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-semibold px-1">
            <span>Nội dung nhận xét:</span>

            {/* Checkbox Options */}
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
                  onClick={() => setRemarkDisplayMode(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    remarkDisplayMode === opt.id
                      ? 'bg-sky-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-white/80'
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-xs border flex items-center justify-center ${
                      remarkDisplayMode === opt.id ? 'border-white bg-white text-sky-600' : 'border-slate-400 bg-white'
                    }`}
                  >
                    {remarkDisplayMode === opt.id && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            <span className="text-[11px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200 font-bold">
              {province} • TOP/BOT 20%
            </span>
          </div>

          <textarea
            rows={15}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:bg-white leading-relaxed resize-none transition-all shadow-inner"
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 cursor-pointer transition-colors"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className={`px-5 py-2.5 rounded-xl font-extrabold text-xs shadow-md flex items-center gap-2 cursor-pointer transition-all ${
              copied
                ? 'bg-emerald-600 text-white scale-105 shadow-emerald-200'
                : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Đã sao chép vào Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Sao chép nhận xét (Zalo / Line)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
