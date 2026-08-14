import React, { useState, useMemo } from 'react';
import { StoreRecord } from '../types';
import { formatStoreDisplayName } from '../utils/parser';
import { X, Copy, Check, MessageSquare, Flame, AlertCircle, FileText, Zap, Award } from 'lucide-react';
import confetti from 'canvas-confetti';

function formatInt(n: number): string {
  return Math.round(n || 0).toLocaleString('vi-VN');
}

function formatBossTag(rawBoss: string): string {
  if (!rawBoss) return '';
  const trimmed = rawBoss.trim();
  if (trimmed.includes('_')) {
    const parts = trimmed.split('_');
    const idPart = parts[parts.length - 1]?.trim();
    if (idPart) return `@${idPart}`;
  }
  if (/^\d+$/.test(trimmed)) {
    return `@${trimmed}`;
  }
  return `@${trimmed}`;
}

interface TagBossModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreRecord[];
  timeModeName?: string;
  lastUpdated?: string;
}

export const TagBossModal: React.FC<TagBossModalProps> = ({
  isOpen,
  onClose,
  stores = [],
  timeModeName = 'Realtime',
  lastUpdated,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTemplateTab, setActiveTemplateTab] = useState<'stores_topbot' | 'bot_boss' | 'province_summary'>('stores_topbot');
  const [customText, setCustomText] = useState<string>('');

  const safeStores = stores || [];
  const modeIcon = timeModeName.toLowerCase().includes('real') ? '⚡' : '📈';
  const modeTitle = timeModeName.toLowerCase().includes('real') ? 'CẬP NHẬT REALTIME' : 'CẬP NHẬT LUỸ KẾ';
  const fullTime = lastUpdated || `19:53:30 NGÀY 13/8/2026`;

  // 1. Regional overall metrics (VÙNG)
  const totalTarget = useMemo(() => safeStores.reduce((acc, s) => acc + (s.target || 0), 0), [safeStores]);
  const totalAchieved = useMemo(() => safeStores.reduce((acc, s) => acc + (s.achieved || 0), 0), [safeStores]);
  const totalRate = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
  const remaining = totalTarget - totalAchieved;
  const isSurpassed = remaining <= 0 && totalTarget > 0;
  const totalSummaryLine = isSurpassed
    ? `🎉 ĐÃ VƯỢT: +${formatInt(Math.abs(remaining))} (${totalRate}%) - Hoàn thành xuất sắc mục tiêu!`
    : `📉 CÒN THIẾU: ${formatInt(remaining)} để hoàn thành 100% mục tiêu`;

  // 2. Boss Ranking calculation (for Template 2: Bot 20 Boss)
  const bossStats = useMemo(() => {
    const map = new Map<string, { totalTarget: number; totalAchieved: number; storesCount: number }>();
    safeStores.forEach((s) => {
      const boss = s.boss?.trim();
      if (!boss || boss === '-' || boss.includes('Chưa phân công')) return;
      const cur = map.get(boss) || { totalTarget: 0, totalAchieved: 0, storesCount: 0 };
      map.set(boss, {
        totalTarget: cur.totalTarget + (s.target || 0),
        totalAchieved: cur.totalAchieved + (s.achieved || 0),
        storesCount: cur.storesCount + 1,
      });
    });

    return Array.from(map.entries())
      .map(([boss, stat]) => ({
        boss,
        bossTag: formatBossTag(boss),
        target: stat.totalTarget,
        achieved: stat.totalAchieved,
        rate: stat.totalTarget > 0 ? (stat.totalAchieved / stat.totalTarget) * 100 : 0,
        storesCount: stat.storesCount,
      }))
      .filter((b) => b.target > 0)
      .sort((a, b) => a.rate - b.rate); // Ascending order: Lowest rate first
  }, [safeStores]);

  // 3. Store Ranking (for Template 1: Top 10 / Bot 10 Stores)
  const storeRanking = useMemo(() => {
    return [...safeStores]
      .map((s) => {
        const target = s.target || 0;
        const achieved = s.achieved || 0;
        const rate = s.rate !== undefined ? s.rate : target > 0 ? (achieved / target) * 100 : 0;
        return {
          tinh: s.tinh,
          storeName: formatStoreDisplayName(s.sieuthi),
          boss: s.boss,
          bossTag: formatBossTag(s.boss || ''),
          target,
          achieved,
          rate,
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [safeStores]);

  // 4. Province Ranking (for Template 3: Province Summary)
  const provinceRanking = useMemo(() => {
    const map = new Map<string, { target: number; achieved: number; storesCount: number }>();
    safeStores.forEach((s) => {
      const tinh = s.tinh || 'Khác';
      const cur = map.get(tinh) || { target: 0, achieved: 0, storesCount: 0 };
      map.set(tinh, {
        target: cur.target + (s.target || 0),
        achieved: cur.achieved + (s.achieved || 0),
        storesCount: cur.storesCount + 1,
      });
    });

    return Array.from(map.entries())
      .map(([tinh, stat]) => ({
        tinh,
        target: stat.target,
        achieved: stat.achieved,
        rate: stat.target > 0 ? (stat.achieved / stat.target) * 100 : 0,
        storesCount: stat.storesCount,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [safeStores]);

  // Top/Bot highlights for quick cards
  const top1Boss = bossStats[bossStats.length - 1];
  const low1Boss = bossStats[0];

  // ==========================================
  // TEMPLATE 1: Tag TOP/BOT Siêu thị (Max 20 ST)
  // ==========================================
  const template1StoresTopBot = useMemo(() => {
    const top10 = storeRanking.slice(0, 10);
    const storesWithTarget = storeRanking.filter((s) => s.target > 0);
    const bot10 = storesWithTarget.slice(-10).reverse();

    const topLines = top10
      .map((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
        const tagPart = s.bossTag ? ` (${s.bossTag})` : '';
        const targetStr = s.target > 0 ? ` ${formatInt(s.achieved)} / ${formatInt(s.target)}` : ` ${formatInt(s.achieved)}`;
        return `${medal} #${idx + 1} ${s.storeName}${tagPart}:${targetStr} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    const botLines = bot10
      .map((s) => {
        const rank = storeRanking.findIndex((item) => item.storeName === s.storeName) + 1;
        const tagPart = s.bossTag ? ` (${s.bossTag})` : '';
        return `🔻 #${rank} ${s.storeName}${tagPart}: ${formatInt(s.achieved)} / ${formatInt(s.target)} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    return `${modeIcon} ${modeTitle} - TOP/BOT SIÊU THỊ THI ĐUA TNB - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ VÙNG:
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)} (${totalRate}%)
${totalSummaryLine}

🏆 TOP 10 SIÊU THỊ DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 10 SIÊU THỊ CẦN TĂNG TỐC (Chỉ xét ST có Target):
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Boss bám sát, tập trung đẩy mạnh tư vấn để bứt phá mục tiêu! 💪🏼🔥`;
  }, [storeRanking, modeIcon, modeTitle, fullTime, totalTarget, totalAchieved, totalRate, totalSummaryLine]);

  // ==========================================
  // TEMPLATE 2: Chỉ tag 20 Boss có hiệu quả kém
  // ==========================================
  const template2Bot20Boss = useMemo(() => {
    // Take the 20 lowest bosses
    const bot20BossList = bossStats.slice(0, 20);

    const bossLines = bot20BossList
      .map((b, idx) => {
        return `🔻 #${idx + 1} ${b.bossTag} (${b.boss}): ${formatInt(b.achieved)} / ${formatInt(b.target)} (${Math.round(b.rate)}%)`;
      })
      .join('\n');

    return `⚠️ THÔNG BÁO DANH SÁCH 20 BOSS CẦN TĂNG TỐC KHẨN CẤP - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ VÙNG:
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)} (${totalRate}%)
${totalSummaryLine}

🚨 DANH SÁCH 20 BOSS CÓ HIỆU QUẢ CẦN CẢI THIỆN:
${bossLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Boss chủ động rà soát, chỉ đạo quyết liệt các siêu thị phụ trách để bứt phá chỉ tiêu! 💪🏼🔥`;
  }, [bossStats, fullTime, totalTarget, modeIcon, totalAchieved, totalRate, totalSummaryLine]);

  // ==========================================
  // TEMPLATE 3: Tóm tắt ngắn - Nhận xét kết quả Tỉnh
  // ==========================================
  const template3ProvinceSummary = useMemo(() => {
    const top3 = provinceRanking.slice(0, 3);
    const bot3 = provinceRanking.slice(-3).reverse();

    const topLines = top3
      .map((p, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
        return `${medal} #${idx + 1} ${p.tinh}: ${formatInt(p.achieved)} / ${formatInt(p.target)} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    const botLines = bot3
      .map((p) => {
        const rank = provinceRanking.findIndex((item) => item.tinh === p.tinh) + 1;
        return `🔻 #${rank} ${p.tinh}: ${formatInt(p.achieved)} / ${formatInt(p.target)} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    return `${modeIcon} TÓM TẮT KẾT QUẢ THI ĐUA TỈNH TNB - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ VÙNG:
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)} (${totalRate}%)
${totalSummaryLine}

🏆 TOP 3 TỈNH DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 3 TỈNH CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Tỉnh bám sát, tập trung đẩy mạnh các ngành hàng trọng điểm để về đích xuất sắc! 💪🏼🔥`;
  }, [provinceRanking, modeIcon, fullTime, totalTarget, totalAchieved, totalRate, totalSummaryLine]);

  if (!isOpen) return null;

  const activeMessage =
    customText ||
    (activeTemplateTab === 'stores_topbot'
      ? template1StoresTopBot
      : activeTemplateTab === 'bot_boss'
      ? template2Bot20Boss
      : template3ProvinceSummary);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeMessage);
    setCopied(true);
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.7 } });
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5 font-black text-base">
            <MessageSquare className="w-5 h-5 text-amber-200" />
            FORM NHẬN XÉT & THÔNG BÁO THI ĐUA
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Quick Highlight Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Flame className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-amber-700 uppercase">BOSS DẪN ĐẦU VÙNG</div>
                <div className="text-xs font-black text-slate-900 truncate">
                  {top1Boss ? top1Boss.bossTag || top1Boss.boss : '-'}
                </div>
                <div className="text-xs font-bold text-emerald-600">
                  {top1Boss ? `${Math.round(top1Boss.rate)}%` : '-'}
                </div>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-rose-700 uppercase">BOSS CẦN TĂNG TỐC</div>
                <div className="text-xs font-black text-slate-900 truncate">
                  {low1Boss ? low1Boss.bossTag || low1Boss.boss : '-'}
                </div>
                <div className="text-xs font-bold text-rose-600">
                  {low1Boss ? `${Math.round(low1Boss.rate)}%` : '-'}
                </div>
              </div>
            </div>
          </div>

          {/* Template Selector Tabs */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-2">
              Chọn mẫu nội dung nhận xét:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
              <button
                onClick={() => {
                  setActiveTemplateTab('stores_topbot');
                  setCustomText('');
                }}
                className={`py-2 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTemplateTab === 'stores_topbot' && !customText
                    ? 'bg-white text-amber-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">Mẫu 1: TOP/BOT ST</span>
              </button>

              <button
                onClick={() => {
                  setActiveTemplateTab('bot_boss');
                  setCustomText('');
                }}
                className={`py-2 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTemplateTab === 'bot_boss' && !customText
                    ? 'bg-white text-rose-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="truncate">Mẫu 2: Tag 20 Boss BOT</span>
              </button>

              <button
                onClick={() => {
                  setActiveTemplateTab('province_summary');
                  setCustomText('');
                }}
                className={`py-2 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTemplateTab === 'province_summary' && !customText
                    ? 'bg-white text-sky-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span className="truncate">Mẫu 3: Tóm tắt Tỉnh</span>
              </button>
            </div>
          </div>

          {/* Text Area Content */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-extrabold text-slate-700">
                Nội dung nhận xét (có thể chỉnh sửa trực tiếp):
              </label>
              {customText && (
                <button
                  onClick={() => setCustomText('')}
                  className="text-[11px] font-bold text-amber-600 hover:underline cursor-pointer"
                >
                  Khôi phục mẫu gốc
                </button>
              )}
            </div>
            <textarea
              rows={12}
              value={activeMessage}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono rounded-2xl p-3.5 focus:outline-hidden focus:ring-2 focus:ring-amber-500 leading-relaxed select-all shadow-inner"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-500 font-semibold">Sẵn sàng dán trực tiếp vào Zalo / Line / Teams</span>
          <button
            onClick={handleCopy}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs text-white transition-all shadow-md cursor-pointer ${
              copied ? 'bg-emerald-600' : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
            }`}
          >
            {copied ? (
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
  );
};
