import React, { useState, useEffect, useMemo } from 'react';
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  MessageSquare,
  Sparkles,
  X,
  CheckCircle2,
  Settings,
  SlidersHorizontal,
  Flame,
  Rocket,
  ListOrdered,
  ChevronDown,
  ChevronUp,
  Cloud,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { copyImageToClipboard, copyTextToClipboard, isMobileUserAgent } from '../services/imageExport';
import {
  RemarkTemplateConfig,
  RemarkDisplayMode,
  RemarkTemplateType,
  DEFAULT_REMARK_CONFIG,
  UserAccount,
} from '../types';
import {
  getLocalRemarkConfig,
  saveRemarkConfigToFirebaseAndLocal,
} from '../services/storeService';
import { generateReportRemarksText } from './TagBossModal';

export interface ExportSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  blob?: Blob | null;
  filename: string;
  remarkText?: string;
  remarkContext?: Record<string, any>;
  currentUser?: UserAccount | null;
  // Toàn bộ doc user_preferences hiện tại (theo accountId) — bắt buộc phải
  // truyền vào khi lưu mẫu nhận xét, nếu không saveRemarkConfigToFirebaseAndLocal
  // sẽ ghi đè (setDoc không merge) và xoá mất preference của các tài khoản khác.
  userPreferencesMap?: Record<string, any>;
}

export const ExportSuccessModal: React.FC<ExportSuccessModalProps> = ({
  isOpen,
  onClose,
  blob,
  filename,
  remarkText = '',
  remarkContext,
  currentUser,
  userPreferencesMap = {},
}) => {
  const isMobile = useMemo(() => isMobileUserAgent(), []);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedRemark, setCopiedRemark] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Template configuration state
  const [config, setConfig] = useState<RemarkTemplateConfig>(() => getLocalRemarkConfig(currentUser?.accountId));

  // Compute active remark text based on config & context
  const activeRemarkText = useMemo(() => {
    // Cùng lý do như TagBossModal: modal luôn được mount, `if (!isOpen) return
    // null` nằm bên dưới nhưng useMemo thì chạy trước — nên trước đây mỗi lần
    // đổi tab đều dựng lại toàn bộ văn bản nhận xét cho một modal đang đóng.
    if (!isOpen) return '';
    if (remarkContext && remarkContext.stores && remarkContext.stores.length > 0) {
      try {
        return generateReportRemarksText({
          stores: remarkContext.stores,
          selectedProvince: remarkContext.selectedProvince,
          selectedChannels: remarkContext.selectedChannels,
          selectedBoss: remarkContext.selectedBoss,
          selectedPhanLoaiShop: remarkContext.selectedPhanLoaiShop,
          selectedTinhMoi: remarkContext.selectedTinhMoi,
          selectedCategory: remarkContext.selectedCategory,
          selectedCategoryGroup: remarkContext.selectedCategoryGroup,
          categoryGroupMap: remarkContext.categoryGroupMap,
          bossAssignments: remarkContext.bossAssignments,
          categoryDisplayNameMap: remarkContext.categoryDisplayNameMap,
          timeModeName: remarkContext.timeModeName,
          lastUpdated: remarkContext.lastUpdated,
          entityScope: remarkContext.entityScope,
          remarkDisplayMode: config.displayMode,
          templateType: config.templateType,
          includeEmoji: config.includeEmoji,
          includeCallToAction: config.includeCallToAction,
          botCount: config.botCount,
        });
      } catch (err) {
        console.error('Error generating contextual remark text:', err);
      }
    }
    return remarkText;
  }, [isOpen, remarkContext, remarkText, config]);

  useEffect(() => {
    if (isOpen) {
      // Load saved config on open
      const savedConfig = getLocalRemarkConfig(currentUser?.accountId);
      setConfig(savedConfig);
      setIsSettingsOpen(false);
      setSaveFeedback(null);

      // Fire subtle celebratory confetti
      try {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // ignore
      }

      if (isMobile) {
        setCopiedImage(false);
        setCopiedRemark(true); // Default behavior on mobile is: remark was auto-copied on export
      } else {
        setCopiedImage(true); // Default behavior on desktop is: image was auto-copied on export
        setCopiedRemark(false);
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        return () => {
          URL.revokeObjectURL(url);
        };
      }
    } else {
      setPreviewUrl(null);
    }
  }, [isOpen, blob, isMobile, currentUser?.accountId]);

  if (!isOpen) return null;

  const handleUpdateConfig = async (newConfig: Partial<RemarkTemplateConfig>) => {
    const updated: RemarkTemplateConfig = {
      ...config,
      ...newConfig,
    };
    setConfig(updated);

    // Save to Firebase and LocalStorage
    try {
      const accountId = currentUser?.accountId || 'global';
      const userName = currentUser?.name || currentUser?.accountId || 'User';
      await saveRemarkConfigToFirebaseAndLocal(updated, userPreferencesMap, accountId, userName);
      setSaveFeedback('✅ Đã lưu & ghi nhớ mẫu vào Firebase');
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch (e) {
      console.error('Failed to persist remark template config:', e);
    }
  };

  const handleCopyImage = async () => {
    if (!blob) return;
    const success = await copyImageToClipboard(blob);
    if (success) {
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2500);
      try {
        confetti({
          particleCount: 30,
          spread: 50,
          origin: { y: 0.7 },
        });
      } catch (e) {}
    } else {
      alert('Trình duyệt chưa hỗ trợ sao chép ảnh trực tiếp. Bạn có thể sử dụng file ảnh vừa tải xuống!');
    }
  };

  const handleCopyRemark = async () => {
    const textToCopy = activeRemarkText || remarkText;
    if (!textToCopy) {
      alert('Báo cáo này không có nhận xét text kèm theo.');
      return;
    }
    const ok = await copyTextToClipboard(textToCopy);
    if (ok) {
      setCopiedRemark(true);
      setTimeout(() => setCopiedRemark(false), 2500);
      try {
        confetti({
          particleCount: 30,
          spread: 50,
          origin: { y: 0.7 },
        });
      } catch (e) {}
    } else {
      alert('Không thể sao chép văn bản vào clipboard.');
    }
  };

  const handleReDownload = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        if (link.parentNode) link.parentNode.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {}
    }, 60000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in select-none">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col transform transition-all duration-300 scale-100 animate-scale-up max-h-[92vh]">
        {/* Header with vibrant emerald gradient */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-inner">
              <CheckCircle2 className="w-6 h-6 text-emerald-200 stroke-[2.5]" />
            </div>
            <div className="truncate">
              <h3 className="font-black text-base uppercase tracking-tight text-white flex items-center gap-1.5">
                <span>XUẤT ẢNH THÀNH CÔNG!</span>
                <Sparkles className="w-4 h-4 text-amber-300" />
              </h3>
              <p className="text-xs text-emerald-100 font-semibold truncate mt-0.5" title={filename}>
                📁 {filename}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Default notice: Image automatically copied on desktop / Remark automatically copied on mobile */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5">
            <span className="p-1 rounded-lg bg-emerald-500 text-white shrink-0 mt-0.5">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </span>
            <div className="text-xs text-emerald-950 font-bold leading-relaxed">
              {isMobile ? (
                <>
                  <span>Đã tải/lưu ảnh về máy và tự động </span>
                  <span className="text-emerald-700 font-extrabold underline decoration-emerald-400 decoration-2">
                    sao chép NHẬN XÉT vào Clipboard
                  </span>
                  . Bạn có thể dán ngay nhận xét vào Zalo / Chat!
                </>
              ) : (
                <>
                  <span>Đã tự động tải file ảnh về máy và </span>
                  <span className="text-emerald-700 font-extrabold underline decoration-emerald-400 decoration-2">
                    sao chép ẢNH vào Clipboard
                  </span>
                  . Bạn có thể nhấn <kbd className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-[11px] font-mono shadow-2xs">Ctrl + V</kbd> / <kbd className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-[11px] font-mono shadow-2xs">⌘ + V</kbd> để dán ảnh vào Zalo / Chat ngay!
                </>
              )}
            </div>
          </div>

          {/* Image Thumbnail Preview */}
          {previewUrl && (
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100/80 shadow-inner flex items-center justify-center max-h-52">
              <img
                src={previewUrl}
                alt="Báo cáo xuất ảnh preview"
                className="max-h-48 w-auto object-contain rounded-xl shadow-xs"
              />
            </div>
          )}

          {/* 2 Big Action Buttons: Copy Image & Copy Remark with Settings Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {/* Button 1: Copy Image */}
            <button
              type="button"
              onClick={handleCopyImage}
              className={`p-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                copiedImage
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
              }`}
            >
              {copiedImage ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>ĐÃ COPY ẢNH!</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  <span>{isMobile ? 'COPY ẢNH' : 'COPY LẠI ẢNH'}</span>
                </>
              )}
            </button>

            {/* Button 2: Split Button - Copy Remark + Settings */}
            <div className={`flex items-stretch rounded-2xl overflow-hidden shadow-sm border-2 transition-all ${
              copiedRemark ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300' : 'border-amber-300 bg-amber-50 hover:border-amber-400'
            }`}>
              <button
                type="button"
                onClick={handleCopyRemark}
                disabled={!activeRemarkText && !remarkText}
                className={`flex-1 p-3 font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  !activeRemarkText && !remarkText
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-none'
                    : copiedRemark
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'text-amber-900 hover:bg-amber-100/80'
                }`}
              >
                {copiedRemark ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>ĐÃ COPY NHẬN XÉT!</span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="truncate">
                      {activeRemarkText || remarkText ? 'COPY NHẬN XÉT' : 'KHÔNG CÓ NHẬN XÉT'}
                    </span>
                  </>
                )}
              </button>

              {/* Settings Toggle Button with Lucide Setting Icon */}
              <button
                type="button"
                onClick={() => setIsSettingsOpen((prev) => !prev)}
                title="Tùy chọn & Lưu mẫu nhận xét mặc định (Firebase)"
                className={`px-3 flex items-center justify-center border-l transition-all cursor-pointer ${
                  copiedRemark ? 'border-emerald-300/80' : 'border-amber-300/80'
                } ${
                  isSettingsOpen
                    ? 'bg-amber-500 text-white'
                    : copiedRemark
                    ? 'text-emerald-800 hover:bg-emerald-200/70'
                    : 'text-amber-800 hover:bg-amber-200/70'
                }`}
              >
                <Settings className={`w-4 h-4 transition-transform duration-200 ${isSettingsOpen ? 'rotate-90' : ''}`} />
              </button>
            </div>
          </div>

          {/* Feedback badge for saving to Firebase */}
          {saveFeedback && (
            <div className="p-2 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-[11px] font-bold flex items-center justify-between animate-fade-in">
              <span className="flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                {saveFeedback}
              </span>
              <span className="text-[10px] text-indigo-500 font-normal">Tự động áp dụng</span>
            </div>
          )}

          {/* Remark Template Settings Dropdown / Panel */}
          {isSettingsOpen && (
            <div className="p-4 bg-slate-50 border-2 border-amber-300 rounded-2xl space-y-3.5 animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                  CÀI ĐẶT MẪU NHẬN XÉT (GHI NHỚ FIREBASE)
                </h4>
                <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Cloud className="w-3 h-3" />
                  Auto-sync
                </span>
              </div>

              {/* 1. Kiểu hiển thị dòng Siêu Thị / Boss */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-700 block">
                  1. Kiểu hiển thị dòng Siêu thị / Quản lý:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'user', label: 'User ID (@Tag)', desc: '🥇 #1. @53136' },
                      { id: 'sieuthi', label: 'Tên Siêu Thị', desc: '🥇 #1. TGD_AGI_CNO' },
                      { id: 'sieuthi_user', label: 'Siêu Thị + User', desc: '🥇 #1. TGD_AGI @53136' },
                      { id: 'no_tag_top', label: 'Bỏ Tag TOP', desc: 'TOP: Luân_55810 | BOT: @55810' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleUpdateConfig({ displayMode: opt.id as RemarkDisplayMode })}
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col ${
                        config.displayMode === opt.id
                          ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-2xs font-extrabold ring-1 ring-amber-300'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>{opt.label}</span>
                        {config.displayMode === opt.id && <Check className="w-3.5 h-3.5 text-amber-700 stroke-[3]" />}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Cấu trúc mẫu nội dung */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-700 block">
                  2. Cấu trúc mẫu nhận xét:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'template_1', label: 'Mẫu 1: TOP / BOT', icon: Flame, desc: 'Top 10 & Bot 10 tiêu chuẩn' },
                      { id: 'template_2', label: 'Mẫu 2: Cần tăng tốc', icon: Rocket, desc: 'Tập trung nhóm < 80%' },
                      { id: 'template_3', label: 'Mẫu 3: Toàn bộ DS', icon: ListOrdered, desc: 'Toàn bộ danh sách ST' },
                    ] as const
                  ).map((opt) => {
                    const IconComp = opt.icon;
                    const isSelected = config.templateType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleUpdateConfig({ templateType: opt.id as RemarkTemplateType })}
                        className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col ${
                          isSelected
                            ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-2xs font-extrabold ring-1 ring-amber-300'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="flex items-center gap-1">
                            <IconComp className="w-3.5 h-3.5 text-amber-600" />
                            {opt.label}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-700 stroke-[3]" />}
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Tùy chọn thêm */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.includeEmoji}
                    onChange={(e) => handleUpdateConfig({ includeEmoji: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                  />
                  <span>✨ Emoji biểu tượng sinh động</span>
                </label>

                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.includeCallToAction}
                    onChange={(e) => handleUpdateConfig({ includeCallToAction: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                  />
                  <span>🎯 Kèm lời chúc &amp; kêu gọi thi đua</span>
                </label>
              </div>

              {/* 4. Live Preview */}
              {activeRemarkText && (
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-500 flex items-center justify-between">
                    <span>Xem trước nội dung sẽ copy:</span>
                    <span className="text-[10px] text-amber-800 font-mono">
                      {activeRemarkText.split('\n').length} dòng
                    </span>
                  </label>
                  <pre className="p-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-mono text-slate-700 max-h-28 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {activeRemarkText}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReDownload}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải lại file ảnh</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl transition-all cursor-pointer shadow-xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
