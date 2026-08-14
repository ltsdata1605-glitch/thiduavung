import { StoreRecord, UserProfile, AppSettings } from '../types';

export const initialUserProfile: UserProfile = {
  name: 'Lê Trường Sơn',
  role: 'Giám Đốc Vùng',
  title: 'Quản Lý Vùng Tây Nam Bộ (TNB)',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
  region: 'Vùng Tây Nam Bộ',
  lastLogin: '08/08/2026 12:37:15',
};

export const initialSettings: AppSettings = {
  systemName: 'TNB LEADER',
  subTitle: 'Dữ liệu thi đua hệ thống',
  lastUpdateRealtime: '12:37:00 NGÀY 09/8/2026',
  lastUpdateLuyKe: '08:00:00 NGÀY 09/8/2026',
  targetThresholdGreen: 100,
  targetThresholdYellow: 80,
  autoTagBossTemplate: '🔥 THÔNG BÁO BẢNG XẾP HẠNG THI ĐUA VÙNG TNB 🔥\n-----------------------------------\nTop 1 Xuất Sắc: {TOP_BOSS} ({TOP_RATE}%)\nCần tăng tốc khẩn cấp: {LOW_BOSS} ({LOW_RATE}%)\nCác Boss hãy kiểm tra lại tiến độ ca hôm nay nhé!',
};

// Rich sample dataset for LUỸ KẾ
export const sampleLuyKeStores: StoreRecord[] = [
  {
    stt: 1,
    id: 'ST001',
    tinh: 'Cần Thơ',
    boss: 'Sơn_21707',
    kenh: 'DML',
    sieuthi: 'ĐMX Cần Thơ 01 (Số 1 Đường 3/2)',
    target: 2500,
    achieved: 3125,
    rate: 125.0,
    rank: 1,
    ict: { achieved: 980, rate: 122.5 },
    flagship: { achieved: 320, rate: 128.0 },
    phoneTablet: { achieved: 450, rate: 125.0 },
    phone: { achieved: 380, rate: 126.7 },
    laptop: { achieved: 210, rate: 116.7 },
    phukien: { achieved: 140, rate: 140.0 },
    dongho: { achieved: 95, rate: 135.7 },
    camera: { achieved: 62, rate: 124.0 },
    loa: { achieved: 88, rate: 125.7 },
    sacduphong: { achieved: 75, rate: 136.4 },
    tainghe: { achieved: 65, rate: 130.0 },
    dennangluong: { achieved: 40, rate: 100.0 },
    baohanh: { achieved: 200, rate: 133.3 },
    lastUpdated: '08/08/2026 12:30',
  },
  {
    stt: 2,
    id: 'ST002',
    tinh: 'An Giang',
    boss: 'Hùng_19814',
    kenh: 'TGD',
    sieuthi: 'TGD Long Xuyên (Trần Hưng Đạo)',
    target: 2200,
    achieved: 2684,
    rate: 122.0,
    rank: 2,
    ict: { achieved: 890, rate: 120.3 },
    flagship: { achieved: 290, rate: 126.1 },
    phoneTablet: { achieved: 410, rate: 124.2 },
    phone: { achieved: 350, rate: 125.0 },
    laptop: { achieved: 190, rate: 111.8 },
    phukien: { achieved: 125, rate: 131.6 },
    dongho: { achieved: 82, rate: 126.2 },
    camera: { achieved: 55, rate: 119.6 },
    loa: { achieved: 78, rate: 120.0 },
    sacduphong: { achieved: 68, rate: 128.3 },
    tainghe: { achieved: 58, rate: 123.4 },
    dennangluong: { achieved: 38, rate: 95.0 },
    baohanh: { achieved: 160, rate: 123.1 },
    lastUpdated: '08/08/2026 12:32',
  },
  {
    stt: 3,
    id: 'ST003',
    tinh: 'Kiên Giang',
    boss: 'Linh_49412',
    kenh: 'DMM',
    sieuthi: 'ĐMX Rạch Giá (Nguyễn Trung Trực)',
    target: 2100,
    achieved: 2478,
    rate: 118.0,
    rank: 3,
    ict: { achieved: 820, rate: 117.1 },
    flagship: { achieved: 260, rate: 120.9 },
    phoneTablet: { achieved: 380, rate: 118.8 },
    phone: { achieved: 320, rate: 120.0 },
    laptop: { achieved: 175, rate: 109.4 },
    phukien: { achieved: 118, rate: 124.2 },
    dongho: { achieved: 76, rate: 120.6 },
    camera: { achieved: 48, rate: 114.3 },
    loa: { achieved: 72, rate: 116.1 },
    sacduphong: { achieved: 60, rate: 120.0 },
    tainghe: { achieved: 52, rate: 115.6 },
    dennangluong: { achieved: 35, rate: 87.5 },
    baohanh: { achieved: 150, rate: 115.4 },
    lastUpdated: '08/08/2026 12:28',
  },
  {
    stt: 4,
    id: 'ST004',
    tinh: 'Tiền Giang',
    boss: 'Tuấn_36802',
    kenh: 'DMS',
    sieuthi: 'ĐMX Mỹ Tho (Ấp Bắc)',
    target: 1900,
    achieved: 2147,
    rate: 113.0,
    rank: 4,
    ict: { achieved: 740, rate: 113.8 },
    flagship: { achieved: 230, rate: 115.0 },
    phoneTablet: { achieved: 340, rate: 113.3 },
    phone: { achieved: 290, rate: 116.0 },
    laptop: { achieved: 160, rate: 106.7 },
    phukien: { achieved: 102, rate: 113.3 },
    dongho: { achieved: 68, rate: 113.3 },
    camera: { achieved: 42, rate: 105.0 },
    loa: { achieved: 65, rate: 108.3 },
    sacduphong: { achieved: 52, rate: 115.6 },
    tainghe: { achieved: 45, rate: 112.5 },
    dennangluong: { achieved: 30, rate: 85.7 },
    baohanh: { achieved: 130, rate: 108.3 },
    lastUpdated: '08/08/2026 12:25',
  },
  {
    stt: 5,
    id: 'ST005',
    tinh: 'Bến Tre',
    boss: 'Hương_20156',
    kenh: 'DML',
    sieuthi: 'ĐMX Bến Tre (Đại Lộ Đồng Khởi)',
    target: 1800,
    achieved: 1944,
    rate: 108.0,
    rank: 5,
    ict: { achieved: 680, rate: 109.7 },
    flagship: { achieved: 210, rate: 110.5 },
    phoneTablet: { achieved: 310, rate: 108.8 },
    phone: { achieved: 265, rate: 110.4 },
    laptop: { achieved: 145, rate: 103.6 },
    phukien: { achieved: 92, rate: 108.2 },
    dongho: { achieved: 60, rate: 109.1 },
    camera: { achieved: 38, rate: 100.0 },
    loa: { achieved: 58, rate: 103.6 },
    sacduphong: { achieved: 48, rate: 106.7 },
    tainghe: { achieved: 40, rate: 105.3 },
    dennangluong: { achieved: 28, rate: 80.0 },
    baohanh: { achieved: 120, rate: 100.0 },
    lastUpdated: '08/08/2026 12:35',
  },
  {
    stt: 6,
    id: 'ST006',
    tinh: 'Đồng Tháp',
    boss: 'Boss Nam',
    kenh: 'TGD',
    sieuthi: 'TGD Cao Lãnh (Nguyễn Huệ)',
    target: 1750,
    achieved: 1820,
    rate: 104.0,
    rank: 6,
    ict: { achieved: 630, rate: 105.0 },
    flagship: { achieved: 195, rate: 105.4 },
    phoneTablet: { achieved: 290, rate: 103.6 },
    phone: { achieved: 250, rate: 104.2 },
    laptop: { achieved: 135, rate: 100.0 },
    phukien: { achieved: 85, rate: 106.3 },
    dongho: { achieved: 55, rate: 105.8 },
    camera: { achieved: 35, rate: 97.2 },
    loa: { achieved: 52, rate: 102.0 },
    sacduphong: { achieved: 44, rate: 104.8 },
    tainghe: { achieved: 36, rate: 102.9 },
    dennangluong: { achieved: 25, rate: 78.1 },
    baohanh: { achieved: 110, rate: 98.2 },
    lastUpdated: '08/08/2026 12:20',
  },
  {
    stt: 7,
    id: 'ST007',
    tinh: 'Cà Mau',
    boss: 'Boss Đức',
    kenh: 'DMM',
    sieuthi: 'ĐMX Cà Mau (Phường 5)',
    target: 1600,
    achieved: 1568,
    rate: 98.0,
    rank: 7,
    ict: { achieved: 540, rate: 98.2 },
    flagship: { achieved: 168, rate: 98.8 },
    phoneTablet: { achieved: 250, rate: 98.0 },
    phone: { achieved: 215, rate: 97.7 },
    laptop: { achieved: 120, rate: 96.0 },
    phukien: { achieved: 74, rate: 98.7 },
    dongho: { achieved: 48, rate: 98.0 },
    camera: { achieved: 30, rate: 93.8 },
    loa: { achieved: 45, rate: 95.7 },
    sacduphong: { achieved: 38, rate: 97.4 },
    tainghe: { achieved: 31, rate: 96.9 },
    dennangluong: { achieved: 22, rate: 73.3 },
    baohanh: { achieved: 95, rate: 95.0 },
    lastUpdated: '08/08/2026 12:15',
  },
  {
    stt: 8,
    id: 'ST008',
    tinh: 'Bạc Liêu',
    boss: 'Boss Lan',
    kenh: 'DMS',
    sieuthi: 'ĐMX Bạc Liêu (Trần Phú)',
    target: 1500,
    achieved: 1380,
    rate: 92.0,
    rank: 8,
    ict: { achieved: 470, rate: 92.2 },
    flagship: { achieved: 145, rate: 93.5 },
    phoneTablet: { achieved: 220, rate: 91.7 },
    phone: { achieved: 190, rate: 92.7 },
    laptop: { achieved: 105, rate: 87.5 },
    phukien: { achieved: 62, rate: 91.2 },
    dongho: { achieved: 42, rate: 93.3 },
    camera: { achieved: 26, rate: 86.7 },
    loa: { achieved: 39, rate: 88.6 },
    sacduphong: { achieved: 33, rate: 91.7 },
    tainghe: { achieved: 27, rate: 90.0 },
    dennangluong: { achieved: 18, rate: 69.2 },
    baohanh: { achieved: 80, rate: 88.9 },
    lastUpdated: '08/08/2026 12:10',
  },
  {
    stt: 9,
    id: 'ST009',
    tinh: 'Sóc Trăng',
    boss: 'Boss Khánh',
    kenh: 'TGD',
    sieuthi: 'TGD Sóc Trăng (Lê Lợi)',
    target: 1450,
    achieved: 1232,
    rate: 85.0,
    rank: 9,
    ict: { achieved: 410, rate: 85.4 },
    flagship: { achieved: 128, rate: 86.5 },
    phoneTablet: { achieved: 195, rate: 84.8 },
    phone: { achieved: 168, rate: 85.7 },
    laptop: { achieved: 92, rate: 80.7 },
    phukien: { achieved: 53, rate: 84.1 },
    dongho: { achieved: 36, rate: 85.7 },
    camera: { achieved: 22, rate: 78.6 },
    loa: { achieved: 34, rate: 81.0 },
    sacduphong: { achieved: 28, rate: 84.8 },
    tainghe: { achieved: 23, rate: 82.1 },
    dennangluong: { achieved: 15, rate: 65.2 },
    baohanh: { achieved: 70, rate: 82.4 },
    lastUpdated: '08/08/2026 12:05',
  },
  {
    stt: 10,
    id: 'ST010',
    tinh: 'Vĩnh Long',
    boss: 'Boss Phong',
    kenh: 'DML',
    sieuthi: 'ĐMX Vĩnh Long (Phạm Thái Bường)',
    target: 1400,
    achieved: 1078,
    rate: 77.0,
    rank: 10,
    ict: { achieved: 350, rate: 76.1 },
    flagship: { achieved: 108, rate: 77.1 },
    phoneTablet: { achieved: 165, rate: 76.7 },
    phone: { achieved: 142, rate: 77.2 },
    laptop: { achieved: 78, rate: 70.9 },
    phukien: { achieved: 44, rate: 75.9 },
    dongho: { achieved: 30, rate: 76.9 },
    camera: { achieved: 18, rate: 69.2 },
    loa: { achieved: 28, rate: 71.8 },
    sacduphong: { achieved: 23, rate: 76.7 },
    tainghe: { achieved: 19, rate: 73.1 },
    dennangluong: { achieved: 12, rate: 60.0 },
    baohanh: { achieved: 58, rate: 72.5 },
    lastUpdated: '08/08/2026 11:50',
  },
  {
    stt: 11,
    id: 'ST011',
    tinh: 'Long An',
    boss: 'Hiếu_20156',
    kenh: 'TGD',
    sieuthi: 'TGD Tân An (Hùng Vương)',
    target: 1850,
    achieved: 1998,
    rate: 108.0,
    rank: 11,
    ict: { achieved: 690, rate: 109.5 },
    flagship: { achieved: 215, rate: 110.0 },
    phoneTablet: { achieved: 315, rate: 108.5 },
    phone: { achieved: 270, rate: 110.0 },
    laptop: { achieved: 150, rate: 103.4 },
    phukien: { achieved: 95, rate: 108.0 },
    dongho: { achieved: 62, rate: 108.8 },
    camera: { achieved: 40, rate: 100.0 },
    loa: { achieved: 60, rate: 103.4 },
    sacduphong: { achieved: 50, rate: 106.4 },
    tainghe: { achieved: 42, rate: 105.0 },
    dennangluong: { achieved: 30, rate: 81.1 },
    baohanh: { achieved: 125, rate: 100.0 },
    lastUpdated: '08/08/2026 12:22',
  },
  {
    stt: 12,
    id: 'ST012',
    tinh: 'Hậu Giang',
    boss: 'Truyền_15078',
    kenh: 'DMS',
    sieuthi: 'ĐMX Vị Thanh (Trần Hưng Đạo)',
    target: 1550,
    achieved: 1472,
    rate: 95.0,
    rank: 12,
    ict: { achieved: 510, rate: 95.3 },
    flagship: { achieved: 155, rate: 96.0 },
    phoneTablet: { achieved: 235, rate: 95.0 },
    phone: { achieved: 200, rate: 95.2 },
    laptop: { achieved: 110, rate: 91.7 },
    phukien: { achieved: 68, rate: 95.8 },
    dongho: { achieved: 45, rate: 95.7 },
    camera: { achieved: 28, rate: 90.3 },
    loa: { achieved: 42, rate: 93.3 },
    sacduphong: { achieved: 35, rate: 94.6 },
    tainghe: { achieved: 29, rate: 93.5 },
    dennangluong: { achieved: 20, rate: 71.4 },
    baohanh: { achieved: 88, rate: 92.6 },
    lastUpdated: '08/08/2026 12:12',
  },
  {
    stt: 13,
    id: 'ST013',
    tinh: 'Trà Vinh',
    boss: 'Viện_175375',
    kenh: 'DMM',
    sieuthi: 'ĐMX Trà Vinh (Điện Biên Phủ)',
    target: 1480,
    achieved: 1317,
    rate: 89.0,
    rank: 13,
    ict: { achieved: 440, rate: 89.4 },
    flagship: { achieved: 135, rate: 90.0 },
    phoneTablet: { achieved: 205, rate: 89.1 },
    phone: { achieved: 175, rate: 89.7 },
    laptop: { achieved: 98, rate: 84.5 },
    phukien: { achieved: 58, rate: 89.2 },
    dongho: { achieved: 38, rate: 90.5 },
    camera: { achieved: 24, rate: 82.8 },
    loa: { achieved: 36, rate: 85.7 },
    sacduphong: { achieved: 30, rate: 88.2 },
    tainghe: { achieved: 25, rate: 86.2 },
    dennangluong: { achieved: 16, rate: 66.7 },
    baohanh: { achieved: 75, rate: 85.7 },
    lastUpdated: '08/08/2026 12:08',
  },
];

// Sample dataset for REALTIME (Daily / Shifts speed tracking)
export const sampleRealtimeStores: StoreRecord[] = sampleLuyKeStores.map((item, idx) => {
  // Realtime numbers for today's shift
  const dayTarget = Math.round(item.target / 30);
  // Introduce live variation
  const factor = [1.35, 1.28, 1.22, 1.15, 1.05, 0.98, 0.92, 0.86, 0.79, 0.71, 1.12, 0.94, 0.88][idx] || 1.0;
  const dayAchieved = Math.round(dayTarget * factor);
  const dayRate = Number(((dayAchieved / dayTarget) * 100).toFixed(1));

  return {
    ...item,
    target: dayTarget,
    achieved: dayAchieved,
    rate: dayRate,
    ict: { achieved: Math.round(item.ict.achieved / 28 * factor), rate: Number((item.ict.rate * factor / 1.1).toFixed(1)) },
    flagship: { achieved: Math.round(item.flagship.achieved / 28 * factor), rate: Number((item.flagship.rate * factor / 1.1).toFixed(1)) },
    phoneTablet: { achieved: Math.round(item.phoneTablet.achieved / 28 * factor), rate: Number((item.phoneTablet.rate * factor / 1.1).toFixed(1)) },
    phone: { achieved: Math.round(item.phone.achieved / 28 * factor), rate: Number((item.phone.rate * factor / 1.1).toFixed(1)) },
    laptop: { achieved: Math.round(item.laptop.achieved / 28 * factor), rate: Number((item.laptop.rate * factor / 1.1).toFixed(1)) },
    phukien: { achieved: Math.round(item.phukien.achieved / 28 * factor), rate: Number((item.phukien.rate * factor / 1.1).toFixed(1)) },
    dongho: { achieved: Math.round(item.dongho.achieved / 28 * factor), rate: Number((item.dongho.rate * factor / 1.1).toFixed(1)) },
    camera: { achieved: Math.round(item.camera.achieved / 28 * factor), rate: Number((item.camera.rate * factor / 1.1).toFixed(1)) },
    loa: { achieved: Math.round(item.loa.achieved / 28 * factor), rate: Number((item.loa.rate * factor / 1.1).toFixed(1)) },
    sacduphong: { achieved: Math.round(item.sacduphong.achieved / 28 * factor), rate: Number((item.sacduphong.rate * factor / 1.1).toFixed(1)) },
    tainghe: { achieved: Math.round(item.tainghe.achieved / 28 * factor), rate: Number((item.tainghe.rate * factor / 1.1).toFixed(1)) },
    dennangluong: { achieved: Math.round(item.dennangluong.achieved / 28 * factor), rate: Number((item.dennangluong.rate * factor / 1.1).toFixed(1)) },
    baohanh: { achieved: Math.round(item.baohanh.achieved / 28 * factor), rate: Number((item.baohanh.rate * factor / 1.1).toFixed(1)) },
    lastUpdated: 'Vừa xong (12:37:15)',
  };
}).sort((a, b) => b.rate - a.rate).map((item, index) => ({ ...item, rank: index + 1, stt: index + 1 }));

// Sample TSV strings for quick pasting tests
export const sampleTSVTextRealtime = `STT\tTỈNH\tBOSS\tKÊNH\tSIÊU THỊ\tCHỈ TIÊU\tĐẠT REALTIME\tTỶ LỆ %
1\tCần Thơ\tSơn_21707\tDML\tĐMX Cần Thơ 01\t83\t112\t134.9%
2\tAn Giang\tHùng_19814\tTGD\tTGD Long Xuyên\t73\t93\t127.4%
3\tKiên Giang\tLinh_49412\tDMM\tĐMX Rạch Giá\t70\t85\t121.4%
4\tTiền Giang\tTuấn_36802\tDMS\tĐMX Mỹ Tho\t63\t72\t114.3%
5\tBến Tre\tHương_20156\tDML\tĐMX Bến Tre\t60\t63\t105.0%
6\tĐồng Tháp\tNam_13166\tTGD\tTGD Cao Lãnh\t58\t57\t98.3%
7\tCà Mau\tĐức_39470\tDMM\tĐMX Cà Mau\t53\t49\t92.5%
8\tBạc Liêu\tLan_62475\tDMS\tĐMX Bạc Liêu\t50\t43\t86.0%
9\tSóc Trăng\tKhánh_175375\tTGD\tTGD Sóc Trăng\t48\t38\t79.2%
10\tVĩnh Long\tPhong_49412\tDML\tĐMX Vĩnh Long\t47\t33\t70.2%
11\tLong An\tHiếu_20156\tTGD\tTGD Tân An\t60\t65\t108.3%
12\tHậu Giang\tTruyền_15078\tDMS\tĐMX Vị Thanh\t52\t49\t94.2%
13\tTrà Vinh\tViện_175375\tDMM\tĐMX Trà Vinh\t49\t43\t87.8%`;

export const sampleTSVTextLuyKe = `STT\tTỈNH\tBOSS\tKÊNH\tSIÊU THỊ\tCHỈ TIÊU TỔNG\tĐẠT LUỸ KẾ\tTỶ LỆ %
1\tCần Thơ\tSơn_21707\tDML\tĐMX Cần Thơ 01 (Số 1 Đường 3/2)\t2500\t3125\t125.0%
2\tAn Giang\tHùng_19814\tTGD\tTGD Long Xuyên (Trần Hưng Đạo)\t2200\t2684\t122.0%
3\tKiên Giang\tLinh_49412\tDMM\tĐMX Rạch Giá (Nguyễn Trung Trực)\t2100\t2478\t118.0%
4\tTiền Giang\tTuấn_36802\tDMS\tĐMX Mỹ Tho (Ấp Bắc)\t1900\t2147\t113.0%
5\tBến Tre\tHương_20156\tDML\tĐMX Bến Tre (Đại Lộ Đồng Khởi)\t1800\t1944\t108.0%
6\tĐồng Tháp\tNam_13166\tTGD\tTGD Cao Lãnh (Nguyễn Huệ)\t1750\t1820\t104.0%
7\tCà Mau\tĐức_39470\tDMM\tĐMX Cà Mau (Phường 5)\t1600\t1568\t98.0%
8\tBạc Liêu\tLan_62475\tDMS\tĐMX Bạc Liêu (Trần Phú)\t1500\t1380\t92.0%
9\tSóc Trăng\tKhánh_175375\tTGD\tTGD Sóc Trăng (Lê Lợi)\t1450\t1232\t85.0%
10\tVĩnh Long\tPhong_49412\tDML\tĐMX Vĩnh Long (Phạm Thái Bường)\t1400\t1078\t77.0%
11\tLong An\tHiếu_20156\tTGD\tTGD Tân An (Hùng Vương)\t1850\t1998\t108.0%
12\tHậu Giang\tTruyền_15078\tDMS\tĐMX Vị Thanh (Trần Hưng Đạo)\t1550\t1472\t95.0%
13\tTrà Vinh\tViện_175375\tDMM\tĐMX Trà Vinh (Điện Biên Phủ)\t1480\t1317\t89.0%`;

export const sampleTSVBossText = `VỊ TRÍ SIÊU THỊ\tHUYỆN của siêu thị\tQL phụ trách\tTỈNH BASE\tCỤM MỚI\tMÃ BASE MỚI\tSIÊU THỊ BASE\tTỈNH MỚI 2026\tMST\tSIÊU THỊ\tUSER\tTỈNH\tBOSS T7\tKÊNH\tMST – TÊN SIÊU THỊ\tCHIẾN ICT\tCHIẾN CE\tSL SHOP\tSố tháng làm Việc\tST KD LAPTOP\tSL TRƯỞNG CA\tDT QĐ TB 5T26\tPHÂN LOẠI SHOP\tCÓ TỦ ĐỒNG HỒ\tCÓ KD LAPTOP
10.108925 105.62078\tQuận Ô Môn\tTGD–TZ\tCần Thơ\tCụm 54\t54\t54 – TGD_CTH_OMO – 1066/6 Quốc Lộ 91\tCần Thơ\t54\tTGD_CTH_OMO – 1066/6 Quốc Lộ 91\t@62475\tCần Thơ\tVân_62475\tTGD\t54 – TGD_CTH_OMO – 1066/6 Quốc Lộ 91\tChiến Trực Diện\tKhông chiến\t1\t–\t3.Shop Loại D\t1\t11,721\t>8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
9.7963451 106.45174\tHuyện Cầu Ngang\tTGD–TZ\tTrà Vinh\tCụm 61\t61\t61 – TGD_TVI_CNG – 269 Đường 3/2\tVĩnh Long\t61\tTGD_TVI_CNG – 269 Đường 3/2\t@175375\tTrà Vinh\tViện_175375\tTGD\t61 – TGD_TVI_CNG – 269 Đường 3/2\tKhông Chiến\tKhông chiến\t1\t–\t5.Shop Loại D\t1\t4,971\t3 – 5 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
9.603934 105.97446\tTP. Sóc Trăng\tTGD–TZ\tSóc Trăng\tCụm 104\t104\t104 – TGD_STR_STR – 50 Hai Bà Trưng\tCần Thơ\t104\tTGD_STR_STR – 50 Hai Bà Trưng\t@19814\tSóc Trăng\tChọn_19814\tTGD\t104 – TGD_STR_STR – 50 Hai Bà Trưng\tChiến kẹp nách\tKhông chiến\t1\t–\t2.Shop Loại C\t1\t6,160\t>5 – 8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
9.2387311 105.45877\tTX. Giá Rai\tTGD–TZ\tBạc Liêu\tCụm 126\t126\t126 – TGD_BLI_GRA – 472 Phường 1 (Giá Rai)\tCà Mau\t126\tTGD_BLI_GRA – 472 Phường 1 (Giá Rai)\t@49412\tBạc Liêu\tĐạt_49412\tTGD\t126 – TGD_BLI_GRA – 472 Phường 1 (Giá Rai)\tKhông Chiến\tKhông chiến\t1\t–\t4.Shop Loại D\t1\t5,669\t>5 – 8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
9.9640711 105.92342\tHuyện Trà Ôn\tĐML–ĐMM–ĐMS\tVĩnh Long\tCụm 153\t153\t153 – ĐMM_VLO_TON – 1A Thống Chế Điều\tVĩnh Long\t153\tĐMM_VLO_TON – 1A Thống Chế Điều\t@36802\tVĩnh Long\tToàn_36802\tĐMM\t153 – ĐMM_VLO_TON – 1A Thống Chế Điều\tKhông Chiến\tKhông chiến\t1\t–\t5.Shop Loại D\t1\t8,066\t–\tCÓ TỦ ĐH\tKD LAPTOP
10.825489 106.45887\tHuyện Đức Hòa\tTGD–TZ\tLong An\tCụm 154\t154\t154 – TGD_LAN_DHO – 177C Đức Hòa\tTây Ninh\t154\tTGD_LAN_DHO – 177C Đức Hòa\t@20156\tLong An\tHiếu_20156\tTGD\t154 – TGD_LAN_DHO – 177C Đức Hòa\tKhông Chiến\tKhông chiến\t1\t–\t3.Shop Loại D\t1\t10,239\t>8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
10.184347 106.27361\tHuyện Mỏ Cày Bắc\tTGD–TZ\tBến Tre\tCụm 155\t155\t155 – TGD_BTR_MCB – Phước Mỹ Trung\tVĩnh Long\t155\tTGD_BTR_MCB – Phước Mỹ Trung\t@13166\tBến Tre\tSang_13166\tTGD\t155 – TGD_BTR_MCB – Phước Mỹ Trung\tKhông Chiến\tKhông chiến\t1\t–\t5.Shop Loại D\t1\t4,160\t3 – 5 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
10.3770741 105.4403883\tTP. Long Xuyên\tTGD–TZ\tAn Giang\tCụm 165\t165\t165 – TGD_AGI_LXU – 170A Trần Hưng Đạo\tAn Giang\t165\tTGD_AGI_LXU – 170A Trần Hưng Đạo\t@39470\tAn Giang\tDanh_39470\tTGD\t165 – TGD_AGI_LXU – 170A Trần Hưng Đạo\tChiến kẹp nách\tKhông chiến\t1\t–\t2.Shop Loại C\t2\t9,572\t>8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
10.289137 105.65947\tHuyện Lai Vung\tTGD–TZ\tĐồng Tháp\tCụm 175\t175\t175 – TGD_DTH_LVU – Lai Vung\tĐồng Tháp\t175\tTGD_DTH_LVU – Lai Vung\t@22093\tĐồng Tháp\tSum_22093\tTGD\t175 – TGD_DTH_LVU – Lai Vung\tKhông Chiến\tKhông chiến\t1\t–\t5.Shop Loại D\t–\t3,266\t<3 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tTP. Sóc Trăng\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 910\t910\t910 – ĐML_STR_STR – 99 Hùng Vương\tSóc Trăng\t910\tĐML_STR_STR – 99 Hùng Vương\t@21707\tSóc Trăng\tSơn_21707\tĐML\t910 – ĐML_STR_STR – 99 Hùng Vương\tChiến Trực Diện\tChiến kẹp nách\t1\t–\t1\t1\t28,451\t>8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tTX. Vĩnh Châu\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 1843\t1843\t1843 – ĐMM_STR_VCH – Vĩnh Châu\tSóc Trăng\t1843\tĐMM_STR_VCH – Vĩnh Châu\t@13480\tSóc Trăng\tLợi_13480\tĐMM\t1843 – ĐMM_STR_VCH – Vĩnh Châu\tKhông Chiến\tKhông chiến\t1\t–\t1\t1\t9,252\t>8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Mỹ Tú\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 1086\t1086\t1086 – ĐMM_STR_TTR – Phú Lộc\tSóc Trăng\t1086\tĐMM_STR_TTR – Phú Lộc\t@140100\tSóc Trăng\tThành_140100\tĐMM\t1086 – ĐMM_STR_TTR – Phú Lộc\tKhông Chiến\tKhông chiến\t1\t–\t1\t1\t8,246\t>8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Trần Đề\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 2871\t2871\t2871 – ĐMM_STR_CLD – 86 Đoàn Thế Trung\tSóc Trăng\t2871\tĐMM_STR_CLD – 86 Đoàn Thế Trung\t@15458\tSóc Trăng\tPhong_15458\tĐMM\t2871 – ĐMM_STR_CLD – 86 Đoàn Thế Trung\tKhông Chiến\tKhông chiến\t1\t–\t1\t1\t6,996\t>5 – 8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Mỹ Xuyên\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 1578\t1578\t1578 – ĐMM_STR_MXU – Thạnh Phú\tSóc Trăng\t1578\tĐMM_STR_MXU – Thạnh Phú\t@15464\tSóc Trăng\tThư_15464\tĐMM\t1578 – ĐMM_STR_MXU – Thạnh Phú\tKhông Chiến\tKhông chiến\t1\t–\t1\t1\t5,865\t>5 – 8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Mỹ Xuyên\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 3798\t3798\t3798 – ĐMM_STR_MXU – Mỹ Xuyên\tSóc Trăng\t3798\tĐMM_STR_MXU – Mỹ Xuyên\t@41119\tSóc Trăng\tDuyên_41119\tĐMM\t3798 – ĐMM_STR_MXU – Mỹ Xuyên\tKhông Chiến\tKhông chiến\t1\t–\t1\t–\t5,478\t>5 – 8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Mỹ Tú\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 5477\t5477\t5477 – ĐMM_STR_MTU – Huỳnh Hữu Nghĩa\tSóc Trăng\t5477\tĐMM_STR_MTU – Huỳnh Hữu Nghĩa\t@18361\tSóc Trăng\tTú_18361\tĐMM\t5477 – ĐMM_STR_MTU – Huỳnh Hữu Nghĩa\tKhông Chiến\tKháng Chiến\t1\t–\t1\t1\t5,002\t>5 – 8 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Trần Đề\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 4700\t4700\t4700 – ĐMM_STR_TDE – Trần Đề\tSóc Trăng\t4700\tĐMM_STR_TDE – Trần Đề\t@28686\tSóc Trăng\tSang_28686\tĐMM\t4700 – ĐMM_STR_TDE – Trần Đề\tKhông Chiến\tKhông chiến\t1\t–\t1\t1\t4,865\t3 – 5 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tTP. Sóc Trăng\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 10550\t10550\t10550 – ĐMM_STR_STR – Phường 03\tSóc Trăng\t10550\tĐMM_STR_STR – Phường 03\t@14036\tSóc Trăng\tTín_14036\tĐMM\t10550 – ĐMM_STR_STR – Phường 03\tChiến Trực Diện\tChiến kẹp nách\t1\t–\t1\t–\t4,608\t3 – 5 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Ngô Năm\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 5323\t5323\t5323 – ĐMM_STR_NNA – Ngô Năm\tSóc Trăng\t5323\tĐMM_STR_NNA – Ngô Năm\t@7475\tSóc Trăng\tUyên_7475\tĐMM\t5323 – ĐMM_STR_NNA – Ngô Năm\tKhông Chiến\tKhông chiến\t1\t–\t1\t1\t4,549\t3 – 5 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Châu Thành\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 2569\t2569\t2569 – ĐMM_STR_CTH – Châu Thành\tSóc Trăng\t2569\tĐMM_STR_CTH – Châu Thành\t@59691\tSóc Trăng\tTài_59691\tĐMM\t2569 – ĐMM_STR_CTH – Châu Thành\tKhông Chiến\tChiến trực diện\t1\t–\t1\t–\t4,340\t3 – 5 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Long Phú\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 2311\t2311\t2311 – ĐMM_STR_LPH – Long Phú\tSóc Trăng\t2311\tĐMM_STR_LPH – Long Phú\t@32266\tSóc Trăng\tThùy_32266\tĐMM\t2311 – ĐMM_STR_LPH – Long Phú\tKhông Chiến\tKhông chiến\t1\t–\t1\t1\t3,624\t3 – 5 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Kế Sách\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 6174\t6174\t6174 – ĐMM_STR_KSA – Kế Sách\tSóc Trăng\t6174\tĐMM_STR_KSA – Kế Sách\t@146122\tSóc Trăng\tLinh_146122\tĐMM\t6174 – ĐMM_STR_KSA – Kế Sách\tKhông Chiến\tKhông chiến\t1\t–\t1\t1\t3,542\t3 – 5 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Trần Đề\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 7705\t7705\t7705 – ĐMS_STR_TDE – Lịch Hội Thượng\tSóc Trăng\t7705\tĐMS_STR_TDE – Lịch Hội Thượng\t@169991\tSóc Trăng\tPhú_169991\tĐMS\t7705 – ĐMS_STR_TDE – Lịch Hội Thượng\tKhông Chiến\tKhông chiến\t1\t–\t1\t–\t3,689\t3 – 5 TỶ\tCÓ TỦ ĐH\tKD LAPTOP
–\tHuyện Kế Sách\tĐML–ĐMM–ĐMS\tSóc Trăng\tCụm 8074\t8074\t8074 – ĐMS_STR_KSA – An Lạc Thôn\tSóc Trăng\t8074\tĐMS_STR_KSA – An Lạc Thôn\t@59147\tSóc Trăng\tHải_59147\tĐMS\t8074 – ĐMS_STR_KSA – An Lạc Thôn\tKhông Chiến\tKhông chiến\t1\t–\t1\t–\t3,002\t<3 TỶ\tCÓ TỦ ĐH\tKD LAPTOP`;
