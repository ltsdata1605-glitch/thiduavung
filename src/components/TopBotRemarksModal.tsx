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
import { getLocalRemarkConfig, saveRemarkConfigToFirebaseAndLocal } from '../services/storeService';

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
  daysInMonth?: number;
  daysElapsed?: number;
  // Danh tính tài khoản hiện tại — để lưu mẫu nhận xét (displayMode/botCount)
  // riêng theo từng người dùng, đồng bộ qua Firebase.
  accountId?: string;
  updatedBy?: string;
  // Toàn bộ doc user_preferences hiện tại — bắt buộc truyền vào để merge khi
  // lưu, tránh setDoc (không merge) ghi đè mất preference tài khoản khác.
  userPreferencesMap?: Record<string, any>;
}

export function generateTopBotRemarksText(params: {
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
  remarkDisplayMode?: RemarkDisplayMode;
  daysInMonth?: number;
  daysElapsed?: number;
  botCount?: number; // Số lượng Siêu thị BOT được tag, mặc định 30
}): string {
  const {
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
    remarkDisplayMode = 'no_tag_top',
    daysInMonth,
    daysElapsed,
    botCount = 30,
  } = params;

  const catName = resolveCategoryDisplayName(category, categoryDisplayNameMap);
  const fullTime = lastUpdated || formattedTimeStr;
  const formatInt = (n: number) => Math.round(n || 0).toLocaleString('vi-VN');

  // Filter stores according to provinceScope & selectedChannels
  const eligibleStores = stores.filter((s) => {
    if (provinceScope !== 'ALL' && s.tinh !== provinceScope) return false;
    if (isExcludedStore(s, bossAssignments)) return false;
    const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
    if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) return false;
    return true;
  });

  const storeMetrics = eligibleStores.map((s) => {
    const data = getCategoryData(s, category);
    const boss = getBossForStore(s.sieuthi, bossAssignments, s.boss);
    const bossTag = formatBossTag(boss);
    const target = data.target || 0;
    const achieved = data.achieved || 0;
    const rate = computeCompletionRate(target, achieved, timeMode, daysInMonth, daysElapsed);
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

  // BOT group (số lượng tuỳ chỉnh, mặc định 30) — chỉ xét ST có Target > 0
  const storesWithTarget = sortedAll.filter((s) => s.target > 0);
  const botStores = storesWithTarget.slice(-Math.max(1, botCount)).reverse();
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
  const scopeLabel = provinceScope !== 'ALL' ? `TỈNH ${provinceScope.toUpperCase()} • ` : '';
  const header = `${modeIcon} ${modeTitle} - TOP/BOT ${scopeLabel}${catName.toUpperCase()} - ${fullTime}`;

  return `${header}
━━━━━━━━━━━━━━
🌟 TOP SIÊU THỊ DẪN ĐẦU (Tối đa 10 ST):
${topLines || 'Đang cập nhật'}

⚠️ BOT ${botStores.length} SIÊU THỊ CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━
👉 Đề nghị các Boss chỉ đạo quyết liệt, tư vấn kèm gói giải pháp để bứt phá mục tiêu! 💪🏼🔥`;
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
  daysInMonth,
  daysElapsed,
  accountId = 'global',
  updatedBy = 'User',
  userPreferencesMap = {},
}) => {
  const [copied, setCopied] = useState(false);
  const [remarkDisplayMode, setRemarkDisplayMode] = useState<RemarkDisplayMode>(() => getLocalRemarkConfig(accountId).displayMode);
  const [botCount, setBotCount] = useState<number>(() => getLocalRemarkConfig(accountId).botCount);
  const [customText, setCustomText] = useState('');
  const catName = resolveCategoryDisplayName(category, categoryDisplayNameMap);

  // Đổi tài khoản khi modal đang mở sẵn trong cây component (không unmount) —
  // nạp lại mẫu nhận xét đã lưu riêng của tài khoản mới thay vì giữ giá trị cũ.
  useEffect(() => {
    const cfg = getLocalRemarkConfig(accountId);
    setRemarkDisplayMode(cfg.displayMode);
    setBotCount(cfg.botCount);
  }, [accountId]);

  // Lưu displayMode/botCount vào Firebase + localStorage riêng theo accountId,
  // giữ nguyên các field khác (templateType, emoji, cta) đã lưu trước đó.
  const persistRemarkConfig = (patch: Partial<{ displayMode: RemarkDisplayMode; botCount: number }>) => {
    const updated = { ...getLocalRemarkConfig(accountId), ...patch };
    saveRemarkConfigToFirebaseAndLocal(updated, userPreferencesMap, accountId, updatedBy).catch((e) => {
      console.error('Failed to persist TOP/BOT remark config:', e);
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const text = generateTopBotRemarksText({
      provinceScope,
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
      botCount,
    });
    setCustomText(text);
    setCopied(false);
  }, [
    isOpen,
    provinceScope,
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
    botCount,
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
                  onClick={() => {
                    setRemarkDisplayMode(opt.id);
                    persistRemarkConfig({ displayMode: opt.id });
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    remarkDisplayMode === opt.id
                      ? 'bg-violet-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-white/80'
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-xs border flex items-center justify-center ${
                      remarkDisplayMode === opt.id ? 'border-white bg-white text-violet-600' : 'border-slate-400 bg-white'
                    }`}
                  >
                    {remarkDisplayMode === opt.id && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="topbot-bot-count-input" className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                Số lượng BOT:
              </label>
              <input
                id="topbot-bot-count-input"
                type="number"
                min={1}
                max={999}
                value={botCount}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setBotCount(Number.isFinite(n) && n > 0 ? Math.min(999, n) : 1);
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  persistRemarkConfig({ botCount: Number.isFinite(n) && n > 0 ? Math.min(999, n) : 1 });
                }}
                className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-[11px] font-bold text-center focus:outline-hidden focus:ring-2 focus:ring-violet-500"
              />
            </div>
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
