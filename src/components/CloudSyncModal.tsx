import React from 'react';
import { RefreshCw, Cloud, Database, CheckCircle2, ShieldCheck } from 'lucide-react';

interface CloudSyncModalProps {
  isOpen: boolean;
  progress: number;
  stepText: string;
  subText?: string;
  onClose?: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  progress,
  stepText,
  subText = 'Vui lòng chờ trong giây lát để hệ thống tải đầy đủ dữ liệu mới nhất...',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col transform transition-all duration-300 scale-100">
        {/* Header Gradient */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 text-white flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-inner">
            <RefreshCw className="w-6 h-6 animate-spin stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-wider text-white">
              ĐANG TẢI DỮ LIỆU TỪ MÁY CHỦ CLOUD
            </h3>
            <p className="text-[11px] text-blue-100 font-semibold mt-0.5">
              Đồng bộ dữ liệu Realtime & Luỹ kế TNB
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-center">
          {/* Central Cloud Icon & Pulse Animation */}
          <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping opacity-60"></div>
            <div className="relative w-16 h-16 rounded-3xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-inner">
              <Cloud className="w-8 h-8 text-blue-600 animate-pulse" />
            </div>
          </div>

          {/* Current Step Title & Detail Text */}
          <div className="space-y-1.5">
            <div className="text-xs font-black text-slate-800 leading-snug min-h-[36px] flex items-center justify-center px-2">
              {stepText || '⚡ Đang kết nối máy chủ dữ liệu Cloud...'}
            </div>
            <p className="text-[11px] font-semibold text-slate-500 max-w-xs mx-auto">
              {subText}
            </p>
          </div>

          {/* Progress Bar Container */}
          <div className="space-y-2 pt-1">
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full transition-all duration-300 shadow-xs"
                style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 px-1">
              <span className="flex items-center gap-1 text-slate-600">
                <Database className="w-3 h-3 text-blue-500 inline" /> Firebase Cloud DB
              </span>
              <span className="text-blue-600 font-extrabold">{Math.round(progress)}%</span>
            </div>
          </div>

          {/* Badge footer notice */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Kết nối bảo mật 256-bit Firestore Live Realtime</span>
          </div>
        </div>
      </div>
    </div>
  );
};
