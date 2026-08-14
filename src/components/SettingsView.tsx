import React, { useState } from 'react';
import { AppSettings, UserProfile } from '../types';
import { Settings, Save, RotateCcw, Check, User, Palette, Shield } from 'lucide-react';

interface SettingsViewProps {
  settings: AppSettings;
  user: UserProfile;
  onSave: (settings: AppSettings, user: UserProfile) => void;
  onResetDefaultData: () => void;
  onOpenUserManagement?: () => void;
  isSuperAdmin?: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  user,
  onSave,
  onResetDefaultData,
  onOpenUserManagement,
  isSuperAdmin = false,
}) => {
  const [formData, setFormData] = useState<AppSettings>({ ...settings });
  const [userData, setUserData] = useState<UserProfile>({ ...user });
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData, userData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            CÀI ĐẶT HỆ THỐNG &amp; CẤU HÌNH THI ĐUA
          </h2>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Tùy chỉnh thông tin Vùng, Ngưỡng màu thi đua, Cấu hình Firebase &amp; Tài khoản
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSuperAdmin && onOpenUserManagement && (
            <button
              type="button"
              onClick={onOpenUserManagement}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
            >
              <Shield className="w-4 h-4" /> Quản Lý Tài Khoản (3717)
            </button>
          )}

          {saved && (
            <div className="px-3.5 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 animate-bounce">
              <Check className="w-4 h-4" /> Đã lưu!
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* System Settings Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Palette className="w-4 h-4 text-indigo-600" /> CẤU HÌNH HIỂN THỊ CHUNG
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Tên tiêu đề Hệ thống
              </label>
              <input
                type="text"
                value={formData.systemName}
                onChange={(e) => setFormData({ ...formData, systemName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Mô tả phụ
              </label>
              <input
                type="text"
                value={formData.subTitle}
                onChange={(e) => setFormData({ ...formData, subTitle: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Ngưỡng đạt tiêu chuẩn (Màu Xanh Đậm)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={formData.targetThresholdGreen}
                  onChange={(e) =>
                    setFormData({ ...formData, targetThresholdGreen: Number(e.target.value) })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs font-bold text-slate-500">%</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Ngưỡng cảnh báo (Màu Vàng - Cam)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={formData.targetThresholdYellow}
                  onChange={(e) =>
                    setFormData({ ...formData, targetThresholdYellow: Number(e.target.value) })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-amber-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs font-bold text-slate-500">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* User Info Config */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-600" /> THÔNG TIN NGƯỜI ĐĂNG NHẬP
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Họ và Tên</label>
              <input
                type="text"
                value={userData.name}
                onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Chức danh / Vị trí</label>
              <input
                type="text"
                value={userData.title}
                onChange={(e) => setUserData({ ...userData, title: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Vùng quản lý</label>
              <input
                type="text"
                value={userData.region}
                onChange={(e) => setUserData({ ...userData, region: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Avatar Image URL</label>
              <input
                type="text"
                value={userData.avatarUrl}
                onChange={(e) => setUserData({ ...userData, avatarUrl: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={onResetDefaultData}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" /> Khôi Phục Dữ Liệu Mẫu Mặc Định
          </button>

          <button
            type="submit"
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            <Save className="w-4 h-4" /> Lưu Cài Đặt Hệ Thống
          </button>
        </div>
      </form>
    </div>
  );
};
