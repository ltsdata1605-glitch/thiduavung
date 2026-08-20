import React, { useState, useEffect } from 'react';
import { TimeMode } from '../types';
import { X, Copy, Check, MessageSquare, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { copyTextToClipboard } from '../services/imageExport';

interface ProvinceRemarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName: string;
  timeMode: TimeMode;
  lastUpdated?: string;
  formattedTimeStr: string;
  rows: { tinh: string; target: number; achieved: number; rate: number }[];
  totalSummary: { target: number; achieved: number; rate: number };
  channelLabel: string;
}

// Helper: format integer numbers without decimals
const formatInt = (n: number) => Math.round(n || 0).toLocaleString('vi-VN');

export function generateProvinceRemarksText(params: {
  categoryName: string;
  timeMode: TimeMode;
  lastUpdated?: string;
  formattedTimeStr: string;
  rows: { tinh: string; target: number; achieved: number; rate: number }[];
  totalSummary: { target: number; achieved: number; rate: number };
  channelLabel: string;
}): string {
  const { categoryName, timeMode, lastUpdated, formattedTimeStr, rows = [], totalSummary = { target: 0, achieved: 0, rate: 0 }, channelLabel = '' } = params;

  const fullTime = lastUpdated || formattedTimeStr;
  const modeIcon = timeMode === 'realtime' ? '⚡' : '📈';
  const modeTitle = timeMode === 'realtime' ? 'CẬP NHẬT REALTIME' : 'CẬP NHẬT LUỸ KẾ';
  const header = `${modeIcon} ${modeTitle} - ${categoryName.toUpperCase()} - ${fullTime}`;

  const remaining = totalSummary.target - totalSummary.achieved;
  const isSurpassed = remaining <= 0 && totalSummary.target > 0;
  const totalSummaryLine = isSurpassed
    ? `🎉 ĐÃ VƯỢT: +${formatInt(Math.abs(remaining))} (${Math.round(totalSummary.rate)}%) - Hoàn thành xuất sắc mục tiêu! 🚀`
    : `📉 CÒN THIẾU: ${formatInt(remaining)} để hoàn thành 100% mục tiêu`;

  // Top 3 provinces
  const top3 = rows.slice(0, 3);
  const topLines = top3
    .map((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      return `${medal} #${i + 1} ${r.tinh}: ${formatInt(r.achieved)} / ${formatInt(r.target)} (${Math.round(r.rate)}%)`;
    })
    .join('\n');

  // Bot 3 provinces
  const bot3 = rows.slice(-3).reverse();
  const botLines = bot3
    .map((r) => {
      const rank = rows.findIndex((item) => item.tinh === r.tinh) + 1;
      return `🔻 #${rank} ${r.tinh}: ${formatInt(r.achieved)} / ${formatInt(r.target)} (${Math.round(r.rate)}%)`;
    })
    .join('\n');

  const channelInfo = channelLabel && channelLabel !== 'All Kênh' ? `📡 Kênh: ${channelLabel}\n` : '';

  return `${header}
${channelInfo}━━━━━━━━━━━━━━
📊 KẾT QUẢ VÙNG:
🎯 Target: ${formatInt(totalSummary.target)} | ${modeIcon} Thực đạt: ${formatInt(totalSummary.achieved)} (${Math.round(totalSummary.rate)}%)
${totalSummaryLine}

🏆 TOP 3 TỈNH DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 3 TỈNH CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━
💪🏼 Quyết tâm bứt phá mục tiêu hôm nay! 🔥`;
}

export const ProvinceRemarksModal: React.FC<ProvinceRemarksModalProps> = ({
  isOpen,
  onClose,
  categoryName,
  timeMode,
  lastUpdated,
  formattedTimeStr,
  rows = [],
  totalSummary = { target: 0, achieved: 0, rate: 0 },
  channelLabel = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const text = generateProvinceRemarksText({
      categoryName,
      timeMode,
      lastUpdated,
      formattedTimeStr,
      rows,
      totalSummary,
      channelLabel,
    });
    setCustomText(text);
    setCopied(false);
  }, [isOpen, categoryName, timeMode, lastUpdated, formattedTimeStr, rows, totalSummary, channelLabel]);

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
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-extrabold text-base">
            <MessageSquare className="w-5 h-5 text-amber-200" />
            <span>NHẬN XÉT THI ĐUA: {categoryName.toUpperCase()}</span>
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
            <span>Nội dung nhận xét (Có thể chỉnh sửa trực tiếp trước khi gửi):</span>
            <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-bold">
              {timeMode === 'realtime' ? '⚡ Realtime' : '📈 Luỹ Kế'}
            </span>
          </div>

          <textarea
            rows={14}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:bg-white leading-relaxed resize-none transition-all shadow-inner"
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
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white'
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
                <span>Sao chép nhận xét (Zalo / Telegram)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
