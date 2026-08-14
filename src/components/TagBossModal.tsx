import React, { useState } from 'react';
import { StoreRecord } from '../types';
import { X, Copy, Check, MessageSquare, Flame, AlertCircle, FileText, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';

interface TagBossModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreRecord[];
  timeModeName: string;
}

export const TagBossModal: React.FC<TagBossModalProps> = ({
  isOpen,
  onClose,
  stores = [],
  timeModeName = 'Realtime',
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTemplateTab, setActiveTemplateTab] = useState<'boss' | 'detailed' | 'quick'>('boss');
  const [customText, setCustomText] = useState<string>('');

  if (!isOpen) return null;

  const safeStores = stores || [];

  // Group stores by Boss to calculate overall Boss rate
  const bossStatsMap = new Map<string, { totalTarget: number; totalAchieved: number; storesCount: number }>();

  safeStores.forEach((s) => {
    const bossName = s.boss || 'Chưa phân công';
    const current = bossStatsMap.get(bossName) || { totalTarget: 0, totalAchieved: 0, storesCount: 0 };
    bossStatsMap.set(bossName, {
      totalTarget: current.totalTarget + s.target,
      totalAchieved: current.totalAchieved + s.achieved,
      storesCount: current.storesCount + 1,
    });
  });

  const bossRanking = Array.from(bossStatsMap.entries())
    .map(([boss, stat]) => ({
      boss,
      rate: stat.totalTarget > 0 ? Number(((stat.totalAchieved / stat.totalTarget) * 100).toFixed(1)) : 0,
      achieved: stat.totalAchieved,
      target: stat.totalTarget,
      storesCount: stat.storesCount,
    }))
    .sort((a, b) => b.rate - a.rate);

  const topBoss = bossRanking[0];
  const lowBoss = bossRanking[bossRanking.length - 1];

  // Store ranking for detailed remarks
  const sortedStores = [...safeStores].sort((a, b) => (b.rate || 0) - (a.rate || 0));
  const top1Store = sortedStores[0];
  const top2Store = sortedStores[1];
  const top3Store = sortedStores[2];
  const low1Store = sortedStores[sortedStores.length - 1];
  const low2Store = sortedStores[sortedStores.length - 2];

  // Template 1: Tag Boss & Đánh giá Boss
  const templateBoss = `🔥 THÔNG BÁO BẢNG XẾP HẠNG & NHẬN XÉT KẾT QUẢ THI ĐUA ${timeModeName.toUpperCase()} - VÙNG TNB 🔥
------------------------------------------------
🏆 TOP DẪN ĐẦU KHU VỰC:
🥇 Top 1: @${topBoss?.boss || 'Boss'} - Đạt ${topBoss?.rate || 0}% chỉ tiêu
${bossRanking[1] ? `🥈 Top 2: @${bossRanking[1].boss} - Đạt ${bossRanking[1].rate}%` : ''}
${bossRanking[2] ? `🥉 Top 3: @${bossRanking[2].boss} - Đạt ${bossRanking[2].rate}%` : ''}

⚠️ CẦN TĂNG TỐC KHẨN CẤP:
🔻 @${lowBoss?.boss || 'Boss'} (Đạt ${lowBoss?.rate || 0}%)

📊 BẢNG TIẾN ĐỘ TẤT CẢ CÁC BOSS:
${bossRanking
  .map(
    (b, idx) =>
      `${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹'} Top ${idx + 1}: @${b.boss} - ${b.rate}%`
  )
  .join('\n')}

👉 Đề nghị các Boss bám sát từng đơn vị, đẩy mạnh tư vấn để bứt phá mục tiêu! 💪🏼🔥`;

  // Template 2: Nhận xét Chi tiết Đơn vị / Tỉnh
  const templateDetailed = `📊 NHẬN XÉT KẾT QUẢ THI ĐUA ${timeModeName.toUpperCase()} - VÙNG TNB
------------------------------------------------
🌟 ĐƠN VỊ XUẤT SẮC DẪN ĐẦU:
1. 🥇 ${top1Store?.sieuthi || top1Store?.tinh || '-'} - Tỷ lệ % Đạt: ${Math.round(top1Store?.rate || 0)}%
2. 🥈 ${top2Store?.sieuthi || top2Store?.tinh || '-'} - Tỷ lệ % Đạt: ${Math.round(top2Store?.rate || 0)}%
3. 🥉 ${top3Store?.sieuthi || top3Store?.tinh || '-'} - Tỷ lệ % Đạt: ${Math.round(top3Store?.rate || 0)}%

⚠️ ĐƠN VỊ CẦN TẬP TRUNG TĂNG TỐC:
- ${low1Store?.sieuthi || low1Store?.tinh || '-'}: ${Math.round(low1Store?.rate || 0)}%
- ${low2Store?.sieuthi || low2Store?.tinh || '-'}: ${Math.round(low2Store?.rate || 0)}%

💡 ĐÁNH GIÁ CHUNG: Toàn khu vực có ${sortedStores.filter(s => s.rate >= 100).length}/${sortedStores.length} đơn vị đã xuất sắc cán mốc 100% chỉ tiêu. Đề nghị các đơn vị còn lại tập trung đẩy mạnh các ngành hàng trọng điểm! 🔥`;

  // Template 3: Tóm tắt Nhanh Zalo
  const templateQuick = `⚡ CẬP NHẬT NHANH KẾT QUẢ THI ĐUA TNB (${timeModeName.toUpperCase()})
- Top 1: ${top1Store?.sieuthi || top1Store?.tinh || '-'} (${Math.round(top1Store?.rate || 0)}%)
- Top 2: ${top2Store?.sieuthi || top2Store?.tinh || '-'} (${Math.round(top2Store?.rate || 0)}%)
- Top 3: ${top3Store?.sieuthi || top3Store?.tinh || '-'} (${Math.round(top3Store?.rate || 0)}%)
- Cần cố gắng: ${low1Store?.sieuthi || low1Store?.tinh || '-'} (${Math.round(low1Store?.rate || 0)}%)
🔥 Quyết tâm hoàn thành 100% chỉ tiêu toàn đội TNB! 💪`;

  const activeMessage = customText || (activeTemplateTab === 'boss' ? templateBoss : activeTemplateTab === 'detailed' ? templateDetailed : templateQuick);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeMessage);
    setCopied(true);
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5 font-black text-base">
            <MessageSquare className="w-5 h-5 text-amber-200" />
            FORM NHẬN XÉT NHANH & THÔNG BÁO TAG BOSS
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
              <div>
                <div className="text-[10px] font-bold text-amber-700 uppercase">DẪN ĐẦU KHU VỰC</div>
                <div className="text-xs font-black text-slate-900 truncate max-w-[170px]">
                  {topBoss ? `@${topBoss.boss}` : (top1Store?.sieuthi || top1Store?.tinh)}
                </div>
                <div className="text-xs font-bold text-emerald-600">
                  {topBoss ? `${topBoss.rate}%` : `${Math.round(top1Store?.rate || 0)}%`}
                </div>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-rose-700 uppercase">CẦN TĂNG TỐC KHẨN CẤP</div>
                <div className="text-xs font-black text-slate-900 truncate max-w-[170px]">
                  {lowBoss ? `@${lowBoss.boss}` : (low1Store?.sieuthi || low1Store?.tinh)}
                </div>
                <div className="text-xs font-bold text-rose-600">
                  {lowBoss ? `${lowBoss.rate}%` : `${Math.round(low1Store?.rate || 0)}%`}
                </div>
              </div>
            </div>
          </div>

          {/* Template Selector Tabs */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-2">
              Chọn mẫu nội dung nhận xét:
            </label>
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                onClick={() => {
                  setActiveTemplateTab('boss');
                  setCustomText('');
                }}
                className={`flex-1 py-1.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTemplateTab === 'boss' && !customText
                    ? 'bg-white text-amber-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>Mẫu Tag Boss</span>
              </button>

              <button
                onClick={() => {
                  setActiveTemplateTab('detailed');
                  setCustomText('');
                }}
                className={`flex-1 py-1.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTemplateTab === 'detailed' && !customText
                    ? 'bg-white text-emerald-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                <span>Nhận xét Chi tiết</span>
              </button>

              <button
                onClick={() => {
                  setActiveTemplateTab('quick');
                  setCustomText('');
                }}
                className={`flex-1 py-1.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTemplateTab === 'quick' && !customText
                    ? 'bg-white text-blue-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-blue-500" />
                <span>Tóm tắt Ngắn</span>
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
              rows={11}
              value={activeMessage}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-sans rounded-2xl p-3.5 focus:outline-hidden focus:ring-2 focus:ring-amber-500 leading-relaxed select-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-500 font-semibold">Sẵn sàng dán trực tiếp vào Zalo / Teams / Telegram</span>
          <button
            onClick={handleCopy}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs text-white transition-all shadow-md cursor-pointer ${
              copied ? 'bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" /> ĐÃ COPY VÀO BỘ NHỚ TẠM!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> COPY NỘI DUNG NHẬN XÉT
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
