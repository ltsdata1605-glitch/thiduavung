import React, { useState, useEffect } from 'react';
import { TimeMode } from '../types';
import { X, Copy, Check, MessageSquare, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export interface TongRemarksSection {
  groupName: string;
  items: {
    catName: string;
    displayName: string;
    group: string;
    rate: number;
  }[];
  achievedCount: number;
  totalCount: number;
  ratePercent: number;
}

interface TongRemarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelTitle: 'TGD' | 'ĐMX';
  channelSubText: string;
  timeMode: TimeMode;
  lastUpdated?: string;
  formattedHeaderTime: string;
  sections: TongRemarksSection[];
}

export function generateTongRemarksText(params: {
  channelTitle: 'TGD' | 'ĐMX';
  channelSubText: string;
  timeMode: TimeMode;
  lastUpdated?: string;
  formattedHeaderTime: string;
  sections: TongRemarksSection[];
}): string {
  const { channelTitle, channelSubText, timeMode, formattedHeaderTime, sections = [] } = params;

  const modeIcon = timeMode === 'realtime' ? '⚡' : '📈';
  const modeTitle = timeMode === 'realtime' ? 'CẬP NHẬT REALTIME' : 'CẬP NHẬT LUỸ KẾ';

  const totalAchievedCount = sections.reduce((acc, s) => acc + s.achievedCount, 0);
  const totalItemsCount = sections.reduce((acc, s) => acc + s.totalCount, 0);
  const overallRate = totalItemsCount > 0 ? Math.round((totalAchievedCount / totalItemsCount) * 100) : 0;

  let content = `${modeIcon} ${modeTitle} - TỔNG QUAN KÊNH ${channelTitle}\n`;
  content += `📡 ${channelSubText}\n`;
  content += `⏰ ${formattedHeaderTime}\n`;
  content += `━━━━━━━━━━━━━━━━━━━━\n`;
  content += `📊 TỔNG HỢP TOÀN KÊNH: ${totalAchievedCount}/${totalItemsCount} nhóm ngành hàng đạt ≥100% (${overallRate}%)\n\n`;

  sections.forEach((sec) => {
    const groupRate = sec.totalCount > 0 ? Math.round((sec.achievedCount / sec.totalCount) * 100) : 0;
    const groupUpper = sec.groupName.toUpperCase();
    const groupIcon = groupUpper.includes('ICT')
      ? '📱'
      : groupUpper.includes('DỊCH VỤ') || groupUpper.includes('DICH VU')
      ? '💳'
      : '📺';

    content += `${groupIcon} NHÓM ${groupUpper}: ${sec.achievedCount}/${sec.totalCount} nhóm đạt ≥100% (${groupRate}%)\n`;

    const sorted = [...sec.items].sort((a, b) => b.rate - a.rate);
    const achievedItems = sorted.filter((i) => i.rate >= 100);
    const underItems = sorted.filter((i) => i.rate < 100);

    if (achievedItems.length > 0) {
      content += `  ✅ Đạt chuẩn (≥100%):\n`;
      achievedItems.forEach((it, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
        content += `    ${medal} ${it.displayName}: ${it.rate}%\n`;
      });
    }

    if (underItems.length > 0) {
      content += `  ⚠️ Cần tăng tốc (<100%):\n`;
      underItems.forEach((it) => {
        content += `    🔻 ${it.displayName}: ${it.rate}%\n`;
      });
    }
    content += `\n`;
  });

  content += `━━━━━━━━━━━━━━━━━━━━\n`;
  content += `💪🏼 Quyết tâm bứt phá mục tiêu hôm nay! 🔥`;

  return content.trim();
}

export const TongRemarksModal: React.FC<TongRemarksModalProps> = ({
  isOpen,
  onClose,
  channelTitle,
  channelSubText,
  timeMode,
  lastUpdated,
  formattedHeaderTime,
  sections = [],
}) => {
  const [copied, setCopied] = useState(false);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const text = generateTongRemarksText({
      channelTitle,
      channelSubText,
      timeMode,
      lastUpdated,
      formattedHeaderTime,
      sections,
    });
    setCustomText(text);
    setCopied(false);
  }, [isOpen, channelTitle, channelSubText, timeMode, lastUpdated, formattedHeaderTime, sections]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(customText);
      setCopied(true);
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.7 },
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const isTgd = channelTitle === 'TGD';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col overflow-hidden animate-scale-up">
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isTgd ? 'bg-amber-50/80 border-amber-200' : 'bg-sky-50/80 border-sky-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl text-white shadow-xs ${
              isTgd ? 'bg-amber-500' : 'bg-sky-600'
            }`}>
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm md:text-base flex items-center gap-1.5">
                Nhận xét Tổng quan Kênh {channelTitle}
                <Sparkles className={`w-4 h-4 ${isTgd ? 'text-amber-500' : 'text-sky-500'}`} />
              </h3>
              <p className="text-xs text-slate-500">
                Tự động tổng hợp kết quả thi đua theo từng nhóm ngành hàng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white/80 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Textarea */}
        <div className="p-4 flex-1 flex flex-col gap-3">
          <label className="text-xs font-bold text-slate-700">
            Nội dung nhận xét (có thể chỉnh sửa trực tiếp trước khi sao chép):
          </label>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={14}
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono leading-relaxed text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none shadow-inner"
          />
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400 font-medium italic">
            💡 Sao chép nhanh để gửi vào Zalo / Telegram
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className={`px-5 py-2 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                copied
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : isTgd
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-sky-600 hover:bg-sky-700'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Đã sao chép!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Sao chép nhận xét
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
