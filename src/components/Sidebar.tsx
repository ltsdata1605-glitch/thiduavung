import React from 'react';
import { ViewTab, UserProfile, UserAccount } from '../types';
import {
  BarChart3,
  UploadCloud,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Trophy,
  Zap,
  LogOut,
  Users,
  Shield,
  KeyRound
} from 'lucide-react';

interface SidebarProps {
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
  user: UserProfile;
  currentUser?: UserAccount | null;
  onLogout?: () => void;
  onOpenUserManagement?: () => void;
  onOpenChangePassword?: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  currentUser,
  onLogout,
  onOpenUserManagement,
  onOpenChangePassword,
  isCollapsed,
  setIsCollapsed,
}) => {
  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.accountId === '3717';
  // Only Super Admin / Admin may paste & sync new data — Editor/Viewer never
  // see the "Cập nhật" menu at all (data flows one way: they only view what
  // these two roles upload).
  const canUpdateData = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  const menuItems = [
    {
      id: 'report' as ViewTab,
      label: 'Report',
      subLabel: 'Báo cáo & Thi đua',
      icon: BarChart3,
      badge: 'HOT',
      badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    },
    ...(canUpdateData
      ? [
          {
            id: 'update' as ViewTab,
            label: 'Cập nhật',
            subLabel: 'Dán Realtime & Luỹ kế',
            icon: UploadCloud,
            badge: 'Mới',
            badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
          },
        ]
      : []),
    {
      id: 'settings' as ViewTab,
      label: 'Cài đặt',
      subLabel: 'Chỉ tiêu & Cấu hình',
      icon: Settings,
    },
  ];

  return (
    <aside
      className={`sticky top-0 h-screen shrink-0 flex flex-col bg-white border-r border-slate-200/80 transition-all duration-300 ease-in-out shadow-lg z-40 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header & Toggle Button (Only expands/collapses when clicking the logo) */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center h-16 border-b border-slate-100 bg-slate-50/50 px-3 overflow-hidden cursor-pointer hover:bg-slate-100/80 transition-colors w-full text-left focus:outline-hidden"
        title={isCollapsed ? 'Nhấn vào logo để mở rộng Menu' : 'Nhấn vào logo để thu gọn Menu'}
      >
        {!isCollapsed ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-200 shrink-0 ring-2 ring-indigo-100">
                <Trophy className="w-5 h-5 text-amber-300" />
              </div>
              <div className="truncate">
                <h1 className="font-bold text-slate-800 text-base tracking-tight leading-tight">
                  TNB LEADER
                </h1>
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Firebase Connected
                </span>
              </div>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          </div>
        ) : (
          <div className="flex items-center justify-center w-full relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-200/60 ring-2 ring-indigo-100 transition-transform duration-200 hover:scale-105">
              <Trophy className="w-5 h-5 text-amber-300" />
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 absolute right-1 top-1/2 -translate-y-1/2 opacity-70" />
          </div>
        )}
      </button>

      {/* Navigation Menu */}
      <nav className="flex-1 px-3 py-4 space-y-2">
        <div className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase h-4">
          {!isCollapsed && 'MENU QUẢN LÝ'}
        </div>

        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center py-3 rounded-xl font-medium transition-all duration-200 group relative ${
                isCollapsed ? 'justify-center px-0' : 'px-3 gap-3'
              } ${
                isActive
                  ? 'bg-gradient-to-r from-blue-200 to-indigo-200 text-indigo-900 shadow-md shadow-blue-200/60'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? 'text-indigo-700' : 'text-slate-500 group-hover:text-blue-600'
                }`}
              />

              {!isCollapsed && (
                <div className="flex-1 min-w-0 flex items-center justify-between text-left">
                  <div>
                    <div className="text-sm font-semibold leading-none">{item.label}</div>
                    <div
                      className={`text-[11px] mt-1 truncate ${
                        isActive ? 'text-indigo-700' : 'text-slate-400'
                      }`}
                    >
                      {item.subLabel}
                    </div>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ml-2 ${
                        isActive
                          ? 'bg-white/60 text-indigo-800'
                          : item.badgeColor || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}

              {/* Floating Tooltip on collapsed state */}
              {isCollapsed && (
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap z-50 pointer-events-none shadow-xl border border-slate-700/50 flex items-center gap-1.5">
                  <span>{item.label}</span>
                  <span className="text-[10px] font-normal text-slate-400">({item.subLabel})</span>
                </div>
              )}
            </button>
          );
        })}

        {/* Super Admin Manage Users Button */}
        {isSuperAdmin && onOpenUserManagement && (
          <button
            onClick={onOpenUserManagement}
            className={`w-full flex items-center py-3 rounded-xl font-medium transition-all duration-200 group relative text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${
              isCollapsed ? 'justify-center px-0' : 'px-3 gap-3'
            }`}
          >
            <Shield className="w-5 h-5 shrink-0 text-slate-500 group-hover:text-blue-600 transition-transform duration-200 group-hover:scale-110" />

            {!isCollapsed && (
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-semibold leading-none">Quản Lý Tài Khoản</div>
                <div className="text-[11px] mt-1 truncate text-slate-400">Phân quyền & Bảo mật</div>
              </div>
            )}

            {/* Floating Tooltip on collapsed state */}
            {isCollapsed && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap z-50 pointer-events-none shadow-xl border border-slate-700/50 flex items-center gap-1.5">
                <span>Quản Lý Tài Khoản</span>
                <span className="text-[10px] font-normal text-slate-400">(Phân quyền & Bảo mật)</span>
              </div>
            )}
          </button>
        )}
      </nav>

      {/* User Info Footer */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/80 space-y-2">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center border-2 border-white shadow-xs">
              {currentUser?.accountId.substring(0, 2).toUpperCase() || '37'}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></span>
          </div>

          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-slate-900 truncate flex items-center gap-1">
                <span>{currentUser?.name || user.name}</span>
                {isSuperAdmin && <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              </div>
              <div className="text-[10.5px] text-slate-500 font-mono truncate">
                TK: {currentUser?.accountId || '3717'} ({currentUser?.role || 'Super Admin'})
              </div>
            </div>
          )}

          {!isCollapsed && (
            <div className="flex items-center gap-1 shrink-0">
              {onOpenChangePassword && (
                <button
                  onClick={onOpenChangePassword}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                  title="Đổi mật khẩu"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
              )}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Đăng xuất"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

