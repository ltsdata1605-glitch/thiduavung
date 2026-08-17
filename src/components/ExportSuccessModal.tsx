import React, { useState, useEffect } from 'react';
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  MessageSquare,
  Sparkles,
  X,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { copyImageToClipboard } from '../services/imageExport';

export interface ExportSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  blob?: Blob | null;
  filename: string;
  remarkText?: string;
}

export const ExportSuccessModal: React.FC<ExportSuccessModalProps> = ({
  isOpen,
  onClose,
  blob,
  filename,
  remarkText = '',
}) => {
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedRemark, setCopiedRemark] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
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

      setCopiedImage(true); // Default behavior is: image was auto-copied on export
      setCopiedRemark(false);

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
  }, [isOpen, blob]);

  if (!isOpen) return null;

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
    if (!remarkText) {
      alert('Báo cáo này không có nhận xét text kèm theo.');
      return;
    }
    try {
      await navigator.clipboard.writeText(remarkText);
      setCopiedRemark(true);
      setTimeout(() => setCopiedRemark(false), 2500);
      try {
        confetti({
          particleCount: 30,
          spread: 50,
          origin: { y: 0.7 },
        });
      } catch (e) {}
    } catch (err) {
      console.error('Failed to copy remark text:', err);
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
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in select-none">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col transform transition-all duration-300 scale-100 animate-scale-up">
        {/* Header with vibrant emerald gradient */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white flex items-center justify-between shadow-md">
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
        <div className="p-5 space-y-4">
          {/* Default notice: Image automatically copied & downloaded */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5">
            <span className="p-1 rounded-lg bg-emerald-500 text-white shrink-0 mt-0.5">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </span>
            <div className="text-xs text-emerald-950 font-bold leading-relaxed">
              <span>Đã tự động tải file ảnh về máy và </span>
              <span className="text-emerald-700 font-extrabold underline decoration-emerald-400 decoration-2">
                sao chép ẢNH vào Clipboard
              </span>
              . Bạn có thể nhấn <kbd className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-[11px] font-mono shadow-2xs">Ctrl + V</kbd> / <kbd className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-[11px] font-mono shadow-2xs">⌘ + V</kbd> để dán ảnh vào Zalo / Chat ngay!
            </div>
          </div>

          {/* Image Thumbnail Preview */}
          {previewUrl && (
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100/80 shadow-inner flex items-center justify-center max-h-56">
              <img
                src={previewUrl}
                alt="Báo cáo xuất ảnh preview"
                className="max-h-52 w-auto object-contain rounded-xl shadow-xs"
              />
            </div>
          )}

          {/* 2 Big Action Buttons: Copy Image & Copy Remark */}
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
                  <span>COPY LẠI ẢNH</span>
                </>
              )}
            </button>

            {/* Button 2: Copy Remark */}
            <button
              type="button"
              onClick={handleCopyRemark}
              disabled={!remarkText}
              className={`p-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                !remarkText
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : copiedRemark
                  ? 'bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-300'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-2 border-amber-300 hover:border-amber-400'
              }`}
            >
              {copiedRemark ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>ĐÃ COPY NHẬN XÉT!</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4 text-amber-600" />
                  <span>{remarkText ? 'COPY NHẬN XÉT' : 'KHÔNG CÓ NHẬN XÉT'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
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
