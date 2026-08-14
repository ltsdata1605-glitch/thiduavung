import React, { useState, useEffect } from 'react';
import { StoreRecord, TimeMode, Channel } from '../types';
import {
  getBossForStore,
  getChannelForStore,
  getCategoryData,
  formatStoreDisplayName,
  resolveCategoryDisplayName,
  BossAssignmentRecord,
} from '../utils/parser';
import { formatBossTag } from './ProvinceDetailRemarksModal';
import { X, Copy, Check, MessageSquare } from 'lucide-react';
import confetti from 'canvas-confetti';

interface TopBotRemarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  provinceScope: string;
  category: string;
  categoryDisplayNameMap?: Record<string, string>;
  timeMode: TimeMode;
  lastUpdated?: string;
  formattedTimeStr: string;
  stores: StoreRecord[];
  selectedChannels: Channel[];
  bossAssignments: BossAssignmentRecord[];
  isExcludedChannel: (k?: string) => boolean;
}

export const TopBotRemarksModal: React.FC<TopBotRemarksModalProps> = ({
  isOpen,
  onClose,
  provinceScope,
  category,
  categoryDisplayNameMap = {},
  timeMode,
  lastUpdated,
  formattedTimeStr,
  stores = [],
  selectedChannels = [],
  bossAssignments = [],
  isExcludedChannel,
}) => {
  const [copied, setCopied] = useState(false);
  const [customText, setCustomText] = useState('');

  const catName = resolveCategoryDisplayName(category, categoryDisplayNameMap);
  const fullTime = lastUpdated || `${formattedTimeStr} NGÀY 13/8/2026`;

  useEffect(() => {
    if (!isOpen) return;

    const formatInt = (n: number) => Math.round(n || 0).toLocaleString('vi-VN');

    // Filter stores according to provinceScope & selectedChannels
    const eligibleStores = stores.filter((s) => {
      if (provinceScope !== 'ALL' && s.tinh !== provinceScope) return false;
      const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
      if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return false;
      if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) return false;
      return true;
    });

    const storeMetrics = eligibleStores.map((s) => {
      const data = getCategoryData(s, category);
      const boss = getBossForStore(s.sieuthi, bossAssignments, s.boss);
      const bossTag = formatBossTag(boss);
      const target = data.target || 0;
      const achieved = data.achieved || 0;
      const rate = target > 0 ? (achieved / target) * 100 : 0;
      return {
        tinh: s.tinh,
        storeName: formatStoreDisplayName(s.sieuthi),
        boss,
        bossTag,
        target,
        achieved,
        rate,
      };
    });

    // Sort descending by rate
    const sortedAll = [...storeMetrics].sort((a, b) => b.rate - a.rate);

    // Max 10 stores for TOP group (to strictly stay within Line 20-tag limit)
    const top10 = sortedAll.slice(0, 10);
    const topLines = top10
      .map((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
        const tagPart = s.bossTag ? ` (${s.bossTag})` : '';
        return `${medal} #${idx + 1} ${s.storeName}${tagPart}: ${formatInt(s.achieved)} / ${formatInt(s.target)} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    // Max 10 stores for BOT group — only considering stores with Target > 0
    const storesWithTarget = sortedAll.filter((s) => s.target > 0);
    const bot10 = storesWithTarget.slice(-10).reverse();
    const botLines = bot10
      .map((s) => {
        const rank = sortedAll.findIndex((item) => item.storeName === s.storeName) + 1;
        const tagPart = s.bossTag ? ` (${s.bossTag})` : '';
        return `🔻 #${rank} ${s.storeName}${tagPart}: ${formatInt(s.achieved)} / ${formatInt(s.target)} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    const modeIcon = timeMode === 'realtime' ? '⚡' : '📈';
    const modeTitle = timeMode === 'realtime' ? 'CẬP NHẬT REALTIME' : 'CẬP NHẬT LUỸ KẾ';
    const scopeLabel = provinceScope !== 'ALL' ? `TỈNH ${provinceScope.toUpperCase()} • ` : '';
    const header = `${modeIcon} ${modeTitle} - TOP/BOT ${scopeLabel}${catName.toUpperCase()} - ${fullTime}`;

    const text = `${header}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌟 TOP SIÊU THỊ DẪN ĐẦU (Tối đa 10 ST):
${topLines || 'Đang cập nhật'}

⚠️ BOT SIÊU THỊ CẦN TĂNG TỐC (Tối đa 10 ST có Target):
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Boss chỉ đạo quyết liệt, tư vấn kèm gói giải pháp để bứt phá mục tiêu! 💪🏼🔥`;

    setCustomText(text);
    setCopied(false);
  }, [
    isOpen,
    provinceScope,
    category,
    catName,
    timeMode,
    fullTime,
    stores,
    selectedChannels,
    bossAssignments,
    isExcludedChannel,
  ]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(customText);
    setCopied(true);
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.8 },
    });
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-extrabold text-base">
            <MessageSquare className="w-5 h-5 text-amber-200" />
            <span>NHẬN XÉT: TOP/BOT {catName.toUpperCase()}</span>
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
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
            <span>Nội dung nhận xét (Tối đa 10 Top / 10 Bot cho Line & Zalo):</span>
            <span className="text-[11px] text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200 font-bold">
              Line/Zalo Tag Limit: 20
            </span>
          </div>

          <textarea
            rows={15}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-violet-500 focus:bg-white leading-relaxed resize-none transition-all shadow-inner"
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
                : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white'
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
