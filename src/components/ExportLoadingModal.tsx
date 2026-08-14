import React from 'react';
import { Camera, Sparkles, Image as ImageIcon } from 'lucide-react';

interface ExportLoadingModalProps {
  isOpen: boolean;
  exportTitle?: string;
  subText?: string;
}

export const ExportLoadingModal: React.FC<ExportLoadingModalProps> = ({
  isOpen,
  exportTitle = 'ĐANG TẠO & CHỤP ẢNH BÁO CÁO (HD)',
  subText = 'Hệ thống đang tự động căn chỉnh khung cột vừa văn nội dung & xuất file ảnh sắc nét...',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col transform transition-all duration-300 scale-100">
        {/* Header Gradient */}
        <div className="px-6 py-5 bg-gradient-to-r from-amber-500 via-indigo-600 to-blue-600 text-white flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-inner">
            <Camera className="w-6 h-6 animate-bounce stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-wider text-white">
              {exportTitle}
            </h3>
            <p className="text-[11px] text-amber-100 font-semibold mt-0.5">
              Định dạng ảnh PNG độ phân giải cao (200DPI HD)
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-center">
          {/* Animated Central Camera Icon */}
          <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-amber-100 animate-ping opacity-70"></div>
            <div className="relative w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-inner">
              <ImageIcon className="w-8 h-8 text-amber-600 animate-pulse" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md animate-spin">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Current Step Text */}
          <div className="space-y-1.5">
            <div className="text-xs font-black text-slate-800 leading-snug flex items-center justify-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              <span>📸 Đang chụp ảnh & tự động fix kích thước cột chuẩn...</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 max-w-xs mx-auto">
              {subText}
            </p>
          </div>

          {/* Animated Infinite Progress Line */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 relative">
            <div className="h-full bg-gradient-to-r from-amber-400 via-indigo-500 to-sky-500 rounded-full animate-pulse w-full"></div>
          </div>

          {/* Footer Notice */}
          <div className="pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-400">
            ✨ File ảnh PNG sẽ tự động tải về máy sau khi hoàn tất
          </div>
        </div>
      </div>
    </div>
  );
};
