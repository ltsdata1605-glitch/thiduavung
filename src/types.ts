export type ViewTab = 'report' | 'update' | 'settings';

export type TimeMode = 'realtime' | 'luyke';

export type EntityScope = 'vung' | 'sieuthi' | 'nhom';

export type Channel = 'DML' | 'DMM' | 'DMS' | 'TGD' | 'TopZone';

export interface CategoryData {
  id: string;
  name: string;
  target: number; // Trong Trieu VND hoac San pham
  achieved: number;
  rate: number; // Percent
}

export interface StoreRecord {
  stt: number;
  id: string;
  tinh: string;
  boss: string;
  kenh: Channel | string;
  sieuthi: string;
  target: number; // Chi tieu tong (Trieu VND)
  achieved: number; // Dat tong (Trieu VND)
  rate: number; // Ty le %
  rank: number;
  
  // Breakdown categories
  categoryMap?: Record<string, { target: number; achieved: number; rate: number }>;
  ict: { achieved: number; rate: number };
  flagship: { achieved: number; rate: number };
  phoneTablet: { achieved: number; rate: number };
  phone: { achieved: number; rate: number };
  laptop: { achieved: number; rate: number };
  phukien: { achieved: number; rate: number };
  dongho: { achieved: number; rate: number };
  camera: { achieved: number; rate: number };
  loa: { achieved: number; rate: number };
  sacduphong: { achieved: number; rate: number };
  tainghe: { achieved: number; rate: number };
  dennangluong: { achieved: number; rate: number };
  baohanh: { achieved: number; rate: number };
  
  achievedCategories?: number;
  lastUpdated?: string;
}

export interface RegionSummary {
  totalTarget: number;
  totalAchieved: number;
  overallRate: number;
  totalStores: number;
  reachedCount: number; // >= 100%
  warningCount: number; // < 80%
  topStore: StoreRecord | null;
  topBoss: string;
  topProvince: string;
}

export interface UserProfile {
  name: string;
  role: string;
  title: string;
  avatarUrl: string;
  region: string;
  lastLogin: string;
}

export interface AppSettings {
  systemName: string;
  subTitle: string;
  lastUpdateRealtime: string;
  lastUpdateLuyKe: string;
  targetThresholdGreen: number; // Default 100%
  targetThresholdYellow: number; // Default 80%
  autoTagBossTemplate: string;
  firebaseConfig?: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
}

export type UserRole = 'super_admin' | 'admin' | 'editor' | 'viewer';

export interface UserAccount {
  accountId: string; // E.g., '3717'
  password?: string;
  passwordHash?: string;
  name: string;
  role: UserRole;
  createdAt?: string;
  createdBy?: string;
  lastLogin?: string;
  isActive: boolean;
}

