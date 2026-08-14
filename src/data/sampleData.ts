import { UserProfile, AppSettings } from '../types';

export const initialUserProfile: UserProfile = {
  name: 'Lê Trường Sơn',
  role: 'Giám Đốc Vùng',
  title: 'Quản Lý Vùng Tây Nam Bộ (TNB)',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
  region: 'Vùng Tây Nam Bộ',
  lastLogin: '',
};

export const initialSettings: AppSettings = {
  systemName: 'TNB LEADER',
  subTitle: 'Dữ liệu thi đua hệ thống',
  lastUpdateRealtime: '',
  lastUpdateLuyKe: '',
  targetThresholdGreen: 100,
  targetThresholdYellow: 80,
  autoTagBossTemplate: '🔥 THÔNG BÁO BẢNG XẾP HẠNG THI ĐUA VÙNG TNB 🔥\n-----------------------------------\nTop 1 Xuất Sắc: {TOP_BOSS} ({TOP_RATE}%)\nCần tăng tốc khẩn cấp: {LOW_BOSS} ({LOW_RATE}%)\nCác Boss hãy kiểm tra lại tiến độ ca hôm nay nhé!',
};
