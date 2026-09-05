import { StoreRecord, Channel, RemarkDisplayMode, TimeMode, RevenueCungKyRecord } from '../types';

export interface BossAssignmentRecord {
  stt?: number;
  // All 25 columns from Anh Mieng's standard BOSS file (A -> Y)
  viTriSieuThi?: string;        // A: VỊ TRÍ SIÊU THỊ
  huyenCuaSieuThi?: string;     // B: HUYỆN của siêu thị
  qlPhuTrach?: string;          // C: QL phụ trách
  tinhBase?: string;            // D: TỈNH BASE
  cumMoi?: string;              // E: CỤM MỚI
  maBaseMoi?: string;           // F: MÃ BASE MỚI
  sieuthiBase?: string;         // G: SIÊU THỊ BASE
  tinhMoi?: string;             // H: TỈNH MỚI 2026
  mst?: string;                 // I: MST
  sieuthiNgan?: string;         // J: SIÊU THỊ
  user?: string;                // K: USER
  tinh?: string;                // L: TỈNH
  boss: string;                 // M: BOSS
  bossRaw?: string;
  kenh?: Channel | string;      // N: KÊNH
  sieuthi: string;              // O: MST – TÊN SIÊU THỊ
  chienIct?: string;            // P: CHIẾN ICT
  chienCe?: string;             // Q: CHIẾN CE
  slShop?: string | number;     // R: SL SHOP
  soThangLamViec?: string;      // S: Số tháng làm việc
  stKdLaptop?: string;          // T: ST KD LAPTOP
  slTruongCa?: string | number; // U: SL TRƯỞNG CA
  dtQdTb?: string | number;     // V: DT QĐ TB 5T26
  phanLoaiShop?: string;        // W: PHÂN LOẠI SHOP
  coTuDongHo?: string;          // X: CÓ TỦ ĐỒNG HỒ
  coKdLaptop?: string;          // Y: CÓ KD LAPTOP
}

/**
 * Canonicalize Vietnamese text to NFC before any channel/exclusion string
 * comparison. Text pasted from Excel/Google Sheets can arrive as NFD
 * (decomposed — base letter + separate combining diacritic marks) instead
 * of the NFC form every hardcoded literal in this file is written in
 * ("LƯU ĐỘNG" etc.) — visually identical, byte-for-byte different, so a
 * plain .includes() silently fails depending on which encoding the source
 * cell happened to use. This was very likely why the same store showed up
 * as "LƯU ĐỘNG" in one screen (whichever comparison happened not to hit
 * the encoding mismatch) and "ĐML" in another (whichever comparison did).
 */
const normVN = (s: string = ''): string => s.normalize('NFC');

const normalizeHeaderCache = new Map<string, string>();

/**
 * Strips diacritics/case for loose header-keyword matching (paste-format
 * detection & parsing).
 *
 * Memo hoá: hàm này thuần tuý (cùng chuỗi vào -> cùng chuỗi ra) nhưng mỗi lần
 * gọi phải chạy .normalize('NFD') + 4 regex + toUpperCase. Trước khi có cache,
 * một lần bấm tab TỔNG gọi nó 11,7 TRIỆU lần trên vài chục chuỗi lặp đi lặp
 * lại — đó là phần lớn 8 giây đứng hình. Số chuỗi khác nhau thực tế chỉ vài
 * chục (tên cột + tên ngành hàng) nên cache luôn nhỏ.
 */
function normalizeHeaderText(h: string): string {
  const cacheKey = h || '';
  const cached = normalizeHeaderCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const result = cacheKey
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .trim();
  if (normalizeHeaderCache.size < 50000) normalizeHeaderCache.set(cacheKey, result);
  return result;
}

/**
 * Heuristic KÊNH inferred purely from a store's own name/code when no BOSS
 * file match (or explicit KÊNH column) is available — e.g. "ĐMM_..." implies
 * DMM. Shared by both paste-format parsers below.
 */
function inferKenhFromSieuThiName(sieuthi: string): Channel | string {
  const u = normVN(sieuthi).toUpperCase();
  if (u.includes('LƯU ĐỘNG') || u.includes('LUU DONG') || u.includes('LUUDONG')) return 'LƯU ĐỘNG';
  if (u.includes('OFF') || u.includes('OFFLINE')) return 'OFF';
  if (u.includes('TOPZONE') || u.includes('TOP ZONE') || u.includes('TZ') || u.includes('AAR')) return 'TopZone';
  if (u.includes('ĐMM') || u.includes('DMM')) return 'DMM';
  if (u.includes('ĐMS') || u.includes('DMS')) return 'DMS';
  if (u.includes('TGD')) return 'TGD';
  return 'DML';
}

/**
 * Smart Shortening Engine for Category Column Headers.
 * Converts long Vietnamese BI category names into clean, compact abbreviations.
 */
export const getShortCategoryName = (catName: string): string => {
  if (!catName) return '';
  // Ngành hàng dán từ BI mới có mã số đứng đầu (VD: "827-Nồi cơm") — mã này
  // chỉ cần để định danh/khớp dữ liệu nội bộ, không cần hiển thị cho người
  // dùng, nên bỏ đi trước khi rút gọn/tra từ điển tên hiển thị.
  const trimmed = catName.trim().replace(/^\d+\s*-\s*/, '');
  const upper = trimmed.toUpperCase();

  const dictionary: Record<string, string> = {
    'BẢO HIỂM THỢ ĐIỆN MÁY XANH': 'BH THỢ ĐMX',
    'BẢO HIỂM ĐMX': 'BH ĐMX',
    'BẢO HIỂM THIẾT BỊ': 'BH THIẾT BỊ',
    'BẢO HIỂM BỆNH BẢO HIỂM SỨC KHỎE': 'BH SỨC KHỎE',
    'SIM VINAPHONE & SIM ĐMX': 'SIM VINA & ĐMX',
    'SIM VINAPHONE': 'SIM VINA',
    'SIM VIETTEL': 'SIM VIETTEL',
    'TRẢ CHẬM HOMECREDIT': 'TC HOMECREDIT',
    'TRẢ CHẬM FECREDIT, SHINHAN, SAMSUNG FINANCE+': 'TC FE, SHINHAN, SS+',
    'TRẢ CHẬM FECREDIT': 'TC FECREDIT',
    'TRẢ CHẬM SHINHAN': 'TC SHINHAN',
    'TRẢ CHẬM SAMSUNG FINANCE+': 'TC SAMSUNG+',
    'TRẢ CHẬM ĐIỆN MÁY VÀ GIA DỤNG': 'TC ĐIỆN MÁY & GD',
    'TRẢ CHẬM GIA DỤNG': 'TC GIA DỤNG',
    'DỊCH VỤ VAS': 'DỊCH VỤ VAS',
    'OTT MANGO+, ICALLME': 'MANGO+ / ICALLME',
    'MỞ THẺ TÍN DỤNG TPBANK EVO VÀ VPBANK MWG': 'THẺ TPBANK & VPBANK',
    'MỞ THẺ TÍN DỤNG': 'THẺ TÍN DỤNG',
    'VAY TIỀN MẶT': 'VAY TIỀN MẶT',
    'VÍ TRẢ SAU': 'VÍ TRẢ SAU',
    'NẠP RÚT TIỀN TÀI KHOẢN NGÂN HÀNG': 'NẠP RÚT NGÂN HÀNG',
    'NẠP RÚT TIỀN NGÂN HÀNG': 'NẠP RÚT NGÂN HÀNG',
    'ĐIỆN TỬ SAMSUNG': 'ĐIỆN TỬ SS',
    'ĐIỆN TỬ ĐIỆN LẠNH AQUA + HAIER': 'ĐIỆN LẠNH AQUA/HAIER',
    'ĐIỆN TỬ ĐIỆN LẠNH': 'ĐIỆN TỬ ĐIỆN LẠNH',
    'THIẾT BỊ GIA DỤNG': 'GIA DỤNG',
    'PHỤ KIỆN ĐIỆN THOẠI': 'PHỤ KIỆN',
  };

  if (dictionary[upper]) {
    return dictionary[upper];
  }

  let res = trimmed
    .replace(/TRẢ CHẬM/gi, 'TC')
    .replace(/BẢO HIỂM/gi, 'BH')
    .replace(/SAMSUNG/gi, 'SS')
    .replace(/ĐIỆN MÁY XANH/gi, 'ĐMX')
    .replace(/THẾ GIỚI DI ĐỘNG/gi, 'TGDĐ')
    .replace(/TÀI KHOẢN NGÂN HÀNG/gi, 'NGÂN HÀNG')
    .replace(/\s+VÀ\s+/gi, ' & ');

  return res;
};

const canonicalCategoryCache = new Map<string, string>();

/**
 * Smart Canonical Category Resolver.
 * Normalizes raw category names from various BI export formats into the 38 standard canonical names.
 */
export function canonicalizeCategoryName(rawName: string): string {
  if (!rawName) return '';
  const cached = canonicalCategoryCache.get(rawName);
  if (cached !== undefined) return cached;
  const result = canonicalizeCategoryNameUncached(rawName);
  if (canonicalCategoryCache.size < 50000) canonicalCategoryCache.set(rawName, result);
  return result;
}

/**
 * Bản gốc (không cache) — chỉ chạy đúng MỘT lần cho mỗi tên ngành hàng khác
 * nhau. Thân hàm là một chuỗi ~50 phép .includes() sau một lần chuẩn hoá
 * Unicode; trước khi có cache nó bị gọi 3,9 triệu lần cho một lần đổi tab.
 */
function canonicalizeCategoryNameUncached(rawName: string): string {
  if (!rawName) return '';
  // 1. Strip leading BI numeric codes ("827-Nồi cơm" -> "Nồi cơm") and trailing hyphens/punctuation
  let cleaned = rawName.trim().replace(/^\d+\s*-\s*/, '').replace(/[\s-]+$/, '').trim();
  if (!cleaned) return '';

  const norm = normalizeHeaderText(cleaned); // diacritics stripped, uppercase, trimmed

  // DỊCH VỤ
  if (norm === 'BAO HIEM TONG' || norm === 'BAO HIEM' || norm === 'BH TONG' || norm.startsWith('BAO HIEM TONG')) return 'Bảo hiểm';
  if (norm.includes('THO DMX') || norm.includes('THO DIEN MAY XANH') || norm.includes('BH THO')) return 'Bảo hiểm thợ Điện Máy Xanh';
  if (norm.includes('SIM MOBIFONE') || norm.includes('SIM VINAPHONE') || norm.includes('SIM VINA') || norm.includes('SIM DMX') || norm.includes('VINA & DMX') || norm.includes('VINAPHONE & SIM DMX')) {
    if (!norm.includes('SIM TONG') && !norm.includes('SIMTONG')) return 'Sim Vinaphone & Sim ĐMX';
  }
  if (norm === 'SIM TONG' || norm === 'SIMTONG' || norm.includes('SIM TONG')) return 'Sim Tổng';
  if (norm.includes('MANGO') || norm.includes('ICALLME') || norm.includes('ICALL ME')) return 'OTT Mango+, iCallMe';
  if (norm === 'VAS' || norm === 'DICH VU VAS' || norm.includes('VAS')) return 'Dịch vụ VAS';
  if (norm.includes('TPBANK') || norm.includes('VPBANK') || norm.includes('MO THE TIN DUNG') || norm.includes('THE TIN DUNG')) return 'Mở thẻ tín dụng TPBank EVO và VPBank MWG';
  if (norm.includes('VAY TIEN MAT') || norm === 'VAY TMT' || norm.includes('VAY TIEN')) return 'Vay tiền mặt';
  if (norm.includes('VI TRA SAU') || norm === 'TRA SAU' || norm.includes('VI TRA')) return 'Ví trả sau';
  if (norm.includes('NAP RUT') || norm.includes('TAI KHOAN NGAN HANG') || norm.includes('RUT TIEN')) return 'Nạp rút tiền tài khoản ngân hàng';
  if (norm.includes('HOMECREDIT') || norm.includes('HOME CREDIT')) return 'Trả chậm HomeCredit';
  if (norm.includes('FECREDIT') || norm.includes('FE CREDIT') || norm.includes('SHINHAN') || norm.includes('SAMSUNG FINANCE') || norm.includes('SS+')) return 'Trả chậm FECredit, Shinhan, Samsung Finance+';
  if (norm.includes('DIEN MAY VA GIA DUNG') || norm.includes('DIEN MAY & GIA DUNG') || norm.includes('DIEN MAY & GD') || norm.includes('DM & GD') || norm.includes('TRA CHAM DIEN MAY')) return 'Trả chậm Điện máy và Gia dụng';

  // ICT
  if (norm.includes('FLAGSHIP') || norm.includes('GALAXY S/Z') || norm.includes('GALAXY S') || norm.includes('GALAXY Z')) return 'Điện thoại Flagship Samsung Galaxy S/Z Series';
  if (norm.includes('ANDROID') || norm.includes('TABLET ANDROID') || norm.includes('SMP & TAB')) return 'Điện thoại & Tablet Android';
  if (norm.includes('REALME')) return 'Điện thoại Realme';
  if (norm.includes('VIVO')) return 'Điện thoại Vivo';
  if (norm.includes('LAPTOP')) return 'Laptop';
  if (norm.includes('PHU KIEN - DONG HO') || norm.includes('PHU KIEN & DONG HO') || norm.includes('PHU KIEN DONG HO')) return 'Phụ kiện - Đồng hồ';
  if (norm.includes('DHTT') || norm.includes('SMW') || norm.includes('SMARTWATCH') || (norm.includes('DONG HO') && !norm.includes('PHU KIEN'))) return 'Đồng hồ (DHTT + SMW)';
  if (norm.includes('CAMERA')) return 'Camera';
  if (norm.includes('LOA')) return 'Loa';
  if (norm.includes('SAC DU PHONG') || norm.includes('PIN SAC')) return 'Sạc dự phòng';
  if (norm.includes('TAI NGHE') || norm.includes('BLUETOOTH')) return 'Tai nghe Bluetooth';
  if (norm.includes('NANG LUONG MAT TROI') || norm.includes('NLMT') || norm.includes('DEN NANG LUONG')) return 'Đèn năng lượng mặt trời';

  // CE & GD
  if (norm.includes('DIEN TU SAMSUNG') || norm.includes('DIEN TU SS') || norm.includes('TV SAMSUNG') || norm.includes('TIVI SAMSUNG')) return 'Điện tử Samsung';
  if (norm.includes('AQUA') || norm.includes('HAIER')) return 'Điện tử điện lạnh Aqua + Haier';
  if (norm === 'TIVI' || norm === 'TI VI' || norm === 'TV' || norm.includes('TIVI')) {
    if (!norm.includes('SAMSUNG') && !norm.includes('TOSHIBA')) return 'Tivi';
  }
  if (norm.includes('TOSHIBA')) return 'Điện tử toshiba';
  if (norm.includes('AUDIO') || norm.includes('AM THANH')) return 'Tăng cường Audio';
  if (norm.includes('TU LANH') || norm.includes('TU DONG') || norm.includes('TU MAT')) return 'Tủ lạnh, Tủ đông, Tủ mát';
  if (norm.includes('MAY GIAT') || norm.includes('MAY SAY') || norm.includes('RUA CHEN')) return 'Máy giặt, Máy sấy, Máy rửa chén';
  if (norm.includes('DAIKIN')) return 'Máy lạnh Daikin';
  if (norm.includes('CASPER')) return 'Máy lạnh Casper';
  if (norm.includes('LOC NUOC')) return 'Máy lọc nước';
  if (norm.includes('QUAT GIO') || norm === 'QUAT') return 'Quạt gió';
  if (norm.includes('NOI COM') || norm.includes('NOI CHIEN')) return 'Nồi cơm';
  if (norm.includes('LOC KHONG KHI') || norm.includes('HUT BUI') || norm.includes('HUT AM') || norm.includes('LOC KKI')) return 'Máy lọc không khí - Hút bụi - Hút ẩm';

  // Fallback to cleaned original name
  return cleaned;
}

/**
 * Resolves the display name for a Ngành hàng, preferring a user-defined
 * custom short name (set via the "Quản lý Nhóm & Vị trí" modal) over the
 * built-in auto-abbreviation dictionary in getShortCategoryName.
 */
export const resolveCategoryDisplayName = (
  catName: string,
  customNameMap: Record<string, string> = {}
): string => {
  if (!catName) return '';
  const custom = customNameMap[catName];
  if (custom && custom.trim()) return custom.trim();
  const canonical = canonicalizeCategoryName(catName);
  if (customNameMap[canonical] && customNameMap[canonical].trim()) return customNameMap[canonical].trim();
  return getShortCategoryName(catName);
};

/**
 * Splits any word in a category string that exceeds maxLen (default 6) into 2 lines.
 * Ensures no single word token exceeds 6 characters, keeping category column headers compact.
 */
/**
 * Formats a category header title by wrapping words into lines with max `maxLen` (default 6) characters per line.
 * If a word or line exceeds maxLen, it breaks across lines using \n.
 */
export const formatCategoryHeaderTitle = (title: string, maxLen: number = 6): string => {
  if (!title) return '';

  let normalized = title.trim();
  normalized = normalized.replace(/HOMECREDIT/gi, 'HOME CREDIT');
  normalized = normalized.replace(/FECREDIT/gi, 'FE CREDIT');
  normalized = normalized.replace(/SHINHAN/gi, 'SHIN HAN');
  normalized = normalized.replace(/ICALLME/gi, 'ICALL ME');
  normalized = normalized.replace(/VINAPHONE/gi, 'VINA PHONE');
  normalized = normalized.replace(/BLUETOOTH/gi, 'BLUET OOTH');
  normalized = normalized.replace(/ANDROID/gi, 'ANDR OID');

  const rawWords = normalized.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of rawWords) {
    if (!word) continue;

    if (word.length > maxLen) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      for (let i = 0; i < word.length; i += maxLen) {
        lines.push(word.slice(i, i + maxLen));
      }
    } else {
      if (!currentLine) {
        currentLine = word;
      } else if ((currentLine + ' ' + word).length <= maxLen) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
};

export interface BossValidationResult {
  isValid: boolean;
  errorMessage?: string;
  missingColumns: string[];
  extraColumns: string[];
  foundColumns: string[];
}

/**
 * Validates header structure of BOSS Excel/TSV table.
 * Checks for missing required columns (Thiếu cột) or extra/wrong columns (Dư/Lệch cột).
 */
export function validateBossHeaders(headers: string[]): BossValidationResult {
  const normalizedHeaders = headers.map((h) => h.trim().toUpperCase());

  // Strict required columns from Anh Mieng's standard 25-column BOSS Excel file
  const requiredSpecs = [
    {
      key: 'TỈNH',
      label: 'TỈNH',
      match: (h: string) => h === 'TỈNH' || h === 'TINH' || (h.includes('TỈNH') && !h.includes('MỚI') && !h.includes('BASE')),
    },
    {
      key: 'MST',
      label: 'MST (Mã siêu thị)',
      match: (h: string) => h === 'MST' || h === 'MÃ SIÊU THỊ' || h === 'MÃ KHO' || h === 'MÃ BASE MỚI',
    },
    {
      key: 'SIÊU THỊ BASE',
      label: 'SIÊU THỊ BASE',
      match: (h: string) => h.includes('SIÊU THỊ BASE') || h.includes('SIEU THI BASE'),
    },
    {
      key: 'BOSS',
      label: 'BOSS (hoặc BOSS T7)',
      match: (h: string) => h === 'BOSS' || h === 'BOSS T7' || (h.includes('BOSS') && !h.includes('QL')),
    },
    {
      key: 'KÊNH',
      label: 'KÊNH',
      match: (h: string) => h === 'KÊNH' || h === 'KENH' || h.includes('KÊNH') || h.includes('KENH'),
    },
    {
      key: 'MST – TÊN SIÊU THỊ',
      label: 'MST – TÊN SIÊU THỊ',
      match: (h: string) => h.includes('MST – TÊN SIÊU THỊ') || h.includes('MST - TÊN SIÊU THỊ') || h.includes('MST – TEN SIEU THI'),
    },
    {
      key: 'CHIẾN ICT',
      label: 'CHIẾN ICT',
      match: (h: string) => h.includes('CHIẾN ICT') || h.includes('CHIEN ICT'),
    },
    {
      key: 'CHIẾN CE',
      label: 'CHIẾN CE',
      match: (h: string) => h.includes('CHIẾN CE') || h.includes('CHIEN CE'),
    },
    {
      key: 'SL TRƯỞNG CA',
      label: 'SL TRƯỞNG CA',
      match: (h: string) => h.includes('TRƯỞNG CA') || h.includes('TRUONG CA'),
    },
    {
      key: 'PHÂN LOẠI SHOP',
      label: 'PHÂN LOẠI SHOP',
      match: (h: string) => h.includes('PHÂN LOẠI') || h.includes('PHAN LOAI'),
    },
  ];

  const missingColumns: string[] = [];

  for (const spec of requiredSpecs) {
    const found = normalizedHeaders.some((h) => spec.match(h));
    if (!found) {
      missingColumns.push(spec.label);
    }
  }

  // Known 25 columns from Anh Mieng's standard BOSS sheet (A -> Y)
  const knownBIColumns = [
    'VỊ TRÍ SIÊU THỊ',
    'VI TRI SIEU THI',
    'HUYỆN CỦA SIÊU THỊ',
    'HUYEN CUA SIEU THI',
    'HUYỆN',
    'QL PHỤ TRÁCH',
    'QL PHU TRACH',
    'TỈNH BASE',
    'TINH BASE',
    'CỤM MỚI',
    'CUM MOI',
    'CỤM',
    'MÃ BASE MỚI',
    'MA BASE MOI',
    'SIÊU THỊ BASE',
    'SIEU THI BASE',
    'TỈNH MỚI 2026',
    'TINH MOI 2026',
    'MST',
    'SIÊU THỊ',
    'SIEU THI',
    'USER',
    'TỈNH',
    'TINH',
    'BOSS T7',
    'BOSS',
    'KÊNH',
    'KENH',
    'MST – TÊN SIÊU THỊ',
    'MST - TÊN SIÊU THỊ',
    'MST – TEN SIEU THI',
    'CHIẾN ICT',
    'CHIEN ICT',
    'CHIẾN CE',
    'CHIEN CE',
    'SL SHOP',
    'SỐ THÁNG LÀM VIỆC',
    'ST KD LAPTOP',
    'SL TRƯỞNG CA',
    'SL TRUONG CA',
    'DT QĐ TB 5T26',
    'DT QĐ TB',
    'PHÂN LOẠI SHOP',
    'PHAN LOAI SHOP',
    'PHÂN LOẠI',
    'CÓ TỦ ĐỒNG HỒ',
    'CÓ KD LAPTOP',
    'STT',
  ];

  const extraColumns: string[] = [];
  for (const h of normalizedHeaders) {
    if (!h) continue;
    const isKnown = knownBIColumns.some((k) => h === k || h.includes(k) || k.includes(h));
    if (!isKnown && h.length > 2) {
      extraColumns.push(h);
    }
  }

  if (missingColumns.length > 0) {
    return {
      isValid: false,
      errorMessage: `File thiếu các cột bắt buộc: ${missingColumns.join(', ')}`,
      missingColumns,
      extraColumns,
      foundColumns: normalizedHeaders,
    };
  }

  return {
    isValid: true,
    missingColumns: [],
    extraColumns,
    foundColumns: normalizedHeaders,
  };
}

/**
 * Sanitizes KÊNH column values specifically from Column N (index 13 in Excel).
 * Prevents full store name strings from being read as channel names.
 */
export function cleanKenhValue(rawVal: string, fallbackVal: string = ''): string {
  const val = normVN(rawVal || fallbackVal || '').trim();
  if (!val) return 'TGD';

  const u = val.toUpperCase();

  if (u.includes('LƯU ĐỘNG') || u.includes('LUU DONG') || u.includes('LUUDONG')) return 'LƯU ĐỘNG';
  if (u === 'OFF' || u.includes('OFFLINE')) return 'OFF';
  if (u.includes('TOPZONE') || u.includes('TOP ZONE') || u.includes('TZ')) return 'TOPZONE';
  if (u.includes('ĐMM') || u.includes('DMM')) return 'ĐMM';
  if (u.includes('ĐMS') || u.includes('DMS')) return 'ĐMS';
  if (u.includes('TGD')) return 'TGD';
  if (u.includes('ĐML') || u.includes('DML')) return 'ĐML';

  if (val.length <= 15 && !val.includes('-') && !val.includes('(')) {
    return val.toUpperCase().trim();
  }

  return 'TGD';
}

/**
 * Checks if a channel string is excluded from ranking and reports
 */
export function isExcludedChannel(k?: string): boolean {
  const u = normVN((k || '').toString()).toUpperCase().trim();
  return u === 'OFF' || u.includes('OFFLINE') || u.includes('LƯU ĐỘNG') || u.includes('LUU DONG') || u === 'LUUDONG';
}

/**
 * Checks if a store record is excluded from ranking and reports
 * (e.g. stores belonging to "LƯU ĐỘNG", "OFF", "OFFLINE" channels, store names or boss assignments).
 */
export function isExcludedStore(
  store: { sieuthi?: string; kenh?: string; boss?: string },
  bossAssignments: BossAssignmentRecord[] = []
): boolean {
  const rawSieuthi = (store.sieuthi || '').trim();
  if (!rawSieuthi || /^[0-9.,\s%+-]+$/.test(rawSieuthi) || !/[a-zA-ZÀ-ỹ]/.test(rawSieuthi)) {
    return true;
  }

  const sieuthi = normVN(rawSieuthi).toUpperCase();
  const rawKenh = normVN(store.kenh || '').toUpperCase();
  const boss = normVN(store.boss || '').toUpperCase();
  const effectiveKenh = normVN((getChannelForStore(store.sieuthi || '', bossAssignments, store.kenh) || '').toString()).toUpperCase();

  return (
    effectiveKenh === 'OFF' ||
    effectiveKenh.includes('OFFLINE') ||
    effectiveKenh.includes('LƯU ĐỘNG') ||
    effectiveKenh.includes('LUU DONG') ||
    effectiveKenh === 'LUUDONG' ||
    rawKenh === 'OFF' ||
    rawKenh.includes('OFFLINE') ||
    rawKenh.includes('LƯU ĐỘNG') ||
    rawKenh.includes('LUU DONG') ||
    rawKenh === 'LUUDONG' ||
    sieuthi.includes('LƯU ĐỘNG') ||
    sieuthi.includes('LUU DONG') ||
    sieuthi.includes('LUUDONG') ||
    sieuthi.includes('LƯU ĐỘNG') ||
    boss.includes('LƯU ĐỘNG') ||
    boss.includes('LUU DONG') ||
    boss === 'LUUDONG'
  );
}

/**
 * Parses TSV/CSV string specifically for BOSS assignments pasted from Excel or Google Sheets.
 * Validates header structure and rejects invalid formats.
 */
export function parseBossPastedData(text: string): {
  records: BossAssignmentRecord[];
  validation: BossValidationResult;
} {
  if (!text || !text.trim()) {
    return {
      records: [],
      validation: {
        isValid: false,
        errorMessage: 'Dữ liệu trống!',
        missingColumns: ['Tất cả'],
        extraColumns: [],
        foundColumns: [],
      },
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      records: [],
      validation: {
        isValid: false,
        errorMessage: 'Không tìm thấy dòng dữ liệu hợp lệ!',
        missingColumns: ['Tất cả'],
        extraColumns: [],
        foundColumns: [],
      },
    };
  }

  const firstLine = lines[0];
  let delimiter = '\t';
  if (!firstLine.includes('\t') && firstLine.includes(',')) {
    delimiter = ',';
  } else if (!firstLine.includes('\t') && !firstLine.includes('  ')) {
    delimiter = ',';
  } else if (!firstLine.includes('\t')) {
    delimiter = /\s{2,}/.source;
  }

  const headers = firstLine
    .split(delimiter === /\s{2,}/.source ? new RegExp(delimiter) : delimiter)
    .map((h) => h.trim().toUpperCase());

  // Run Header Validation
  const validation = validateBossHeaders(headers);
  if (!validation.isValid) {
    return {
      records: [],
      validation,
    };
  }

  const results: BossAssignmentRecord[] = [];

  // Detect Column Indices with precise priority matching for full 25-column BI Excel format (A -> Y)
  let colViTriSieuThi = headers.findIndex((h) => h.includes('VỊ TRÍ') || h.includes('VI TRI'));
  if (colViTriSieuThi === -1 && headers.length > 0) colViTriSieuThi = 0;

  let colHuyenCuaSieuThi = headers.findIndex((h) => h.includes('HUYỆN') || h.includes('HUYEN'));
  if (colHuyenCuaSieuThi === -1 && headers.length > 1) colHuyenCuaSieuThi = 1;

  let colQlPhuTrach = headers.findIndex((h) => h.includes('QL PHỤ TRÁCH') || h.includes('QL PHU TRACH'));
  if (colQlPhuTrach === -1 && headers.length > 2) colQlPhuTrach = 2;

  let colTinhBase = headers.findIndex((h) => h.includes('TỈNH BASE') || h.includes('TINH BASE'));
  if (colTinhBase === -1 && headers.length > 3) colTinhBase = 3;

  let colCumMoi = headers.findIndex((h) => h.includes('CỤM MỚI') || h.includes('CUM MOI') || h === 'CỤM');
  if (colCumMoi === -1 && headers.length > 4) colCumMoi = 4;

  let colMaBaseMoi = headers.findIndex((h) => h.includes('MÃ BASE') || h.includes('MA BASE'));
  if (colMaBaseMoi === -1 && headers.length > 5) colMaBaseMoi = 5;

  let colSieuThiBase = headers.findIndex((h) => h.includes('SIÊU THỊ BASE') || h.includes('SIEU THI BASE'));
  if (colSieuThiBase === -1 && headers.length > 6) colSieuThiBase = 6;

  let colTinhMoi = headers.findIndex((h) => h.includes('TỈNH MỚI') || h.includes('TINH MOI'));
  if (colTinhMoi === -1 && headers.length > 7) colTinhMoi = 7;

  let colMst = headers.findIndex((h) => h === 'MST' || h === 'MÃ SIÊU THỊ' || h === 'MA SIEU THI' || h === 'MÃ KHO' || h === 'MA KHO');
  if (colMst === -1) {
    colMst = headers.findIndex((h) => h.includes('MST') && !h.includes('TÊN'));
  }
  if (colMst === -1 && headers.length > 8) colMst = 8;

  let colSieuThiNgan = headers.findIndex((h, idx) => (h === 'SIÊU THỊ' || h === 'SIEU THI') && idx !== colSieuThiBase);
  if (colSieuThiNgan === -1 && headers.length > 9) colSieuThiNgan = 9;

  let colUser = headers.findIndex((h) => h === 'USER' || h.includes('MÃ USER') || h.includes('TAG'));
  if (colUser === -1 && headers.length > 10) colUser = 10;

  let colTinh = headers.findIndex((h, idx) => (h === 'TỈNH' || h === 'TINH') && idx !== colTinhBase && idx !== colTinhMoi);
  if (colTinh === -1) {
    colTinh = headers.findIndex((h) => h.includes('TỈNH') && !h.includes('CỤM') && !h.includes('HUYỆN'));
  }
  if (colTinh === -1 && headers.length > 11) colTinh = 11;

  let colBoss = headers.findIndex((h) => h === 'BOSS T7' || h === 'BOSS');
  if (colBoss === -1) {
    colBoss = headers.findIndex((h) => h.includes('BOSS T7'));
  }
  if (colBoss === -1) {
    colBoss = headers.findIndex((h) => h.includes('BOSS') && !h.includes('QL PHỤ TRÁCH'));
  }
  if (colBoss === -1) {
    colBoss = headers.findIndex((h) => h.includes('USER'));
  }
  if (colBoss === -1 && headers.length > 12) colBoss = 12;

  let colKenh = headers.findIndex((h) => h === 'KÊNH' || h === 'KENH');
  if (colKenh === -1) {
    colKenh = headers.findIndex((h) => h.includes('KÊNH') || h.includes('KENH'));
  }
  if (colKenh === -1 && headers.length > 13) colKenh = 13;

  let colSieuThi = headers.findIndex((h) => h.includes('MST – TÊN SIÊU THỊ') || h.includes('MST - TÊN SIÊU THỊ') || h.includes('MST – TEN SIEU THI'));
  if (colSieuThi === -1) {
    colSieuThi = headers.findIndex((h, idx) => idx > 5 && (h === 'SIÊU THỊ' || h.includes('TÊN SIÊU THỊ')));
  }
  if (colSieuThi === -1 && headers.length > 14) colSieuThi = 14;

  let colChienIct = headers.findIndex((h) => h.includes('CHIẾN ICT') || h.includes('CHIEN ICT'));
  if (colChienIct === -1 && headers.length > 15) colChienIct = 15;

  let colChienCe = headers.findIndex((h) => h.includes('CHIẾN CE') || h.includes('CHIEN CE'));
  if (colChienCe === -1 && headers.length > 16) colChienCe = 16;

  let colSlShop = headers.findIndex((h) => h.includes('SL SHOP') || h.includes('SỐ SHOP'));
  if (colSlShop === -1 && headers.length > 17) colSlShop = 17;

  let colSoThangLamViec = headers.findIndex((h) => h.includes('THÁNG LÀM VIỆC') || h.includes('THANG LAM VIEC'));
  if (colSoThangLamViec === -1 && headers.length > 18) colSoThangLamViec = 18;

  let colStKdLaptop = headers.findIndex((h) => h.includes('ST KD LAPTOP') || h.includes('SHOP KD LAPTOP'));
  if (colStKdLaptop === -1 && headers.length > 19) colStKdLaptop = 19;

  let colSlTruongCa = headers.findIndex((h) => h.includes('SL TRƯỞNG CA') || h.includes('TRƯỞNG CA') || h.includes('TRUONG CA'));
  if (colSlTruongCa === -1 && headers.length > 20) colSlTruongCa = 20;

  let colDtQdTb = headers.findIndex((h) => h.includes('DT QĐ TB') || h.includes('5T26') || h.includes('QĐ TB'));
  if (colDtQdTb === -1 && headers.length > 21) colDtQdTb = 21;

  let colPhanLoaiShop = headers.findIndex((h) => h.includes('PHÂN LOẠI SHOP') || h.includes('PHAN LOAI SHOP') || h === 'PHÂN LOẠI');
  if (colPhanLoaiShop === -1) {
    colPhanLoaiShop = headers.findIndex((h) => h.includes('PHÂN LOẠI') && !h.includes('CỬA HÀNG'));
  }
  if (colPhanLoaiShop === -1 && headers.length > 22) colPhanLoaiShop = 22;

  let colCoTuDongHo = headers.findIndex((h) => h.includes('TỦ ĐỒNG HỒ') || h.includes('TU DONG HO') || h.includes('TỦ ĐH'));
  if (colCoTuDongHo === -1 && headers.length > 23) colCoTuDongHo = 23;

  let colCoKdLaptop = headers.findIndex((h) => h.includes('KD LAPTOP') || h.includes('CÓ KD LAPTOP'));
  if (colCoKdLaptop === -1 && headers.length > 24) colCoKdLaptop = 24;

  const startRow = 1; // Since validation verified headers on row 0

  for (let i = startRow; i < lines.length; i++) {
    const rawLine = lines[i];
    const cells = rawLine
      .split(delimiter === /\s{2,}/.source ? new RegExp(delimiter) : delimiter)
      .map((c) => c.trim().replace(/^["']|["']$/g, ''));

    if (cells.length < 2) continue;

    const viTriSieuThi = (colViTriSieuThi >= 0 && cells[colViTriSieuThi]) ? cells[colViTriSieuThi] : cells[0] || '';
    const huyenCuaSieuThi = (colHuyenCuaSieuThi >= 0 && cells[colHuyenCuaSieuThi]) ? cells[colHuyenCuaSieuThi] : cells[1] || '';
    const qlPhuTrach = (colQlPhuTrach >= 0 && cells[colQlPhuTrach]) ? cells[colQlPhuTrach] : cells[2] || '';
    const tinhBase = (colTinhBase >= 0 && cells[colTinhBase]) ? cells[colTinhBase] : cells[3] || '';
    const cumMoi = (colCumMoi >= 0 && cells[colCumMoi]) ? cells[colCumMoi] : cells[4] || '';
    const maBaseMoi = (colMaBaseMoi >= 0 && cells[colMaBaseMoi]) ? cells[colMaBaseMoi] : cells[5] || '';
    const sieuthiBase = (colSieuThiBase >= 0 && cells[colSieuThiBase]) ? cells[colSieuThiBase] : cells[6] || cells[0] || '';
    const tinhMoi = (colTinhMoi >= 0 && cells[colTinhMoi]) ? cells[colTinhMoi] : cells[7] || '-';

    const rawMst = colMst >= 0 && cells[colMst] ? cells[colMst] : cells[8] || extractMst(cells[14] || cells[9] || cells[6] || '') || '';
    const mst = rawMst.trim();

    const sieuthiNgan = (colSieuThiNgan >= 0 && cells[colSieuThiNgan]) ? cells[colSieuThiNgan] : cells[9] || '';
    const user = (colUser >= 0 && cells[colUser]) ? cells[colUser] : cells[10] || '';

    const tinh = (colTinh >= 0 && cells[colTinh]) ? cells[colTinh] : cells[11] || tinhBase || 'TNB';

    let rawBoss = colBoss >= 0 && cells[colBoss] ? cells[colBoss] : (cells[12] || cells[2] || '');
    if (rawBoss === 'Lưu Động' || rawBoss.toUpperCase().includes('ĐML-ĐMM-ĐMS')) {
      rawBoss = cells[12] || '';
    }

    // Keep raw boss name as-is (e.g. "Sơn_21707") without forcing "Boss " prefix or stripping underscore codes
    const bossName = rawBoss && rawBoss.trim() ? rawBoss.trim() : 'Chưa phân công';

    // Kênh lấy chính xác và duy nhất từ cột N (colKenh hoặc index 13)
    const rawKenh = colKenh >= 0 && cells[colKenh] ? cells[colKenh] : cells[13] || '';
    const kenh = cleanKenhValue(rawKenh, cells[13] || '');

    const sieuthi =
      colSieuThi >= 0 && cells[colSieuThi]
        ? cells[colSieuThi]
        : cells[14] || cells[9] || sieuthiBase || '';

    const chienIct = colChienIct >= 0 && cells[colChienIct] ? cells[colChienIct] : cells[15] || '-';
    const chienCe = colChienCe >= 0 && cells[colChienCe] ? cells[colChienCe] : cells[16] || '-';
    const slShop = colSlShop >= 0 && cells[colSlShop] ? cells[colSlShop] : cells[17] || '1';
    const soThangLamViec = colSoThangLamViec >= 0 && cells[colSoThangLamViec] ? cells[colSoThangLamViec] : cells[18] || '-';
    const stKdLaptop = colStKdLaptop >= 0 && cells[colStKdLaptop] ? cells[colStKdLaptop] : cells[19] || '-';
    const slTruongCa = colSlTruongCa >= 0 && cells[colSlTruongCa] ? cells[colSlTruongCa] : cells[20] || '1';
    const dtQdTb = colDtQdTb >= 0 && cells[colDtQdTb] ? cells[colDtQdTb] : cells[21] || '-';
    const phanLoaiShop =
      colPhanLoaiShop >= 0 && cells[colPhanLoaiShop] ? cells[colPhanLoaiShop] : cells[22] || '-';
    const coTuDongHo = colCoTuDongHo >= 0 && cells[colCoTuDongHo] ? cells[colCoTuDongHo] : cells[23] || '-';
    const coKdLaptop = colCoKdLaptop >= 0 && cells[colCoKdLaptop] ? cells[colCoKdLaptop] : cells[24] || '-';

    if (
      sieuthi &&
      sieuthi.trim().length > 1 &&
      !sieuthi.toUpperCase().includes('SIÊU THỊ BASE') &&
      !sieuthi.toUpperCase().includes('MST – TÊN SIÊU THỊ')
    ) {
      results.push({
        stt: results.length + 1,
        viTriSieuThi,
        huyenCuaSieuThi,
        qlPhuTrach,
        tinhBase,
        cumMoi,
        maBaseMoi,
        sieuthiBase,
        tinhMoi,
        mst: mst || undefined,
        sieuthiNgan,
        user,
        tinh: tinh || 'TNB',
        boss: bossName,
        bossRaw: bossName,
        kenh,
        sieuthi,
        chienIct,
        chienCe,
        slShop,
        soThangLamViec,
        stKdLaptop,
        slTruongCa,
        dtQdTb,
        phanLoaiShop,
        coTuDongHo,
        coKdLaptop,
      });
    }
  }

  return {
    records: results,
    validation,
  };
}

/** What one of the Realtime/Luỹ Kế Siêu Thị paste boxes is supposed to receive. */
export interface PasteScopeExpectation {
  timeMode: 'realtime' | 'luyke';
  // 'tinh' (province rollup) is no longer a paste target — kept as a detected
  // value so a stray province-rollup paste into the Siêu Thị box is still
  // caught and reported below instead of silently accepted.
  granularity: 'tinh' | 'sieuthi';
}

/**
 * Validates that pasted text (either of the Realtime/Luỹ Kế Siêu Thị boxes)
 * actually looks like a store competition table — i.e. has a recognizable
 * TARGET/CHỈ TIÊU and/or ĐẠT/REALTIME/LUỸ KẾ column — before the expensive
 * parse+save pipeline runs. Catches the common "pasted the wrong sheet /
 * wrong box" mistake instead of silently producing 0 or garbage rows.
 *
 * When `expected` is given, also cross-checks the pasted header against
 * which box it landed in — e.g. text carrying a REALTIME column pasted into
 * a Luỹ Kế box, or a province-rollup table (TỈNH column, no SIÊU THỊ/BOSS)
 * pasted into the Siêu Thị box — and reports a dedicated mismatch error
 * instead of silently accepting data that's structurally valid but destined
 * for the wrong box. Ambiguous headers (neither signal present) are never
 * flagged — false positives are worse than missing a rare mismatch.
 */
export function validateStoreHeaders(text: string, expected?: PasteScopeExpectation): BossValidationResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      isValid: false,
      errorMessage: 'Không có dữ liệu nào được dán.',
      missingColumns: ['TARGET / CHỈ TIÊU', 'ĐẠT / REALTIME / LUỸ KẾ'],
      extraColumns: [],
      foundColumns: [],
    };
  }

  const detectDelimiter = (line: string): string => {
    if (line.includes('\t')) return '\t';
    if (line.includes(',')) return ',';
    return /\s{2,}/.source;
  };
  const splitLine = (line: string, delimiter: string): string[] => {
    const parts = delimiter === /\s{2,}/.source ? line.split(new RegExp(delimiter)) : line.split(delimiter);
    return parts.map((c) => c.trim().replace(/^["']|["']$/g, ''));
  };
  const normalizeHeader = (h: string): string =>
    (h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase()
      .trim();

  let headerCells: string[] | null = null;
  let headerNormCells: string[] = [];
  let hasTarget = false;
  let hasAchieved = false;

  // Scans the WHOLE paste, not just a leading slice — the newer BI export
  // (baocao.dienmayxanh.com) carries a long sidebar/toolbar preamble (page
  // nav, user info, filters...) ahead of the real header row, easily 100+
  // lines, so capping this scan used to make a perfectly valid paste look
  // structureless (reported as "found columns: DASHBOARDS").
  for (let i = 0; i < lines.length; i++) {
    const delimiter = detectDelimiter(lines[i]);
    const cells = splitLine(lines[i], delimiter);
    if (cells.length < 2) continue;
    const normHeaders = cells.map(normalizeHeader);

    const tTarget = normHeaders.some((h) => h.includes('CHI TIEU') || h.includes('KE HOACH') || h.includes('TARGET'));
    const tAchieved = normHeaders.some(
      (h) =>
        h.includes('DAT') ||
        h.includes('REALTIME') ||
        h.includes('LUY KE') ||
        h.includes('DOANH THU') ||
        h.includes('DTLK') ||
        h.includes('SLLK') ||
        h.includes('SO LUONG')
    );
    const tRate = normHeaders.some((h) => h.includes('DU KIEN') || h.includes('TY LE') || h.includes('%') || h.includes('HOAN THANH'));

    if (tTarget || tAchieved || tRate) {
      headerCells = cells;
      headerNormCells = normHeaders;
      hasTarget = tTarget;
      hasAchieved = tAchieved;
      break;
    }
  }

  const foundColumns = (headerCells || splitLine(lines[0], detectDelimiter(lines[0]))).map((c) => c.toUpperCase()).filter(Boolean);

  if (!headerCells || (!hasTarget && !hasAchieved)) {
    return {
      isValid: false,
      errorMessage:
        'Không tìm thấy cấu trúc cột dữ liệu thi đua hợp lệ (thiếu cả cột TARGET/CHỈ TIÊU và ĐẠT/REALTIME/LUỸ KẾ). Có thể bạn đã dán nhầm bảng khác.',
      missingColumns: ['TARGET / CHỈ TIÊU', 'ĐẠT / REALTIME / LUỸ KẾ'],
      extraColumns: [],
      foundColumns,
    };
  }

  if (expected) {
    const hasStoreCol = headerNormCells.some((h) => h.includes('SIEU THI') || h.includes('STORE') || h.includes('CUA HANG'));
    const hasBossCol = headerNormCells.some((h) => h.includes('BOSS'));
    const hasTinhCol = headerNormCells.some((h) => h.includes('TINH') || h.includes('PROVINCE'));

    let detectedGranularity: 'tinh' | 'sieuthi' | null = null;
    if (hasStoreCol || hasBossCol) detectedGranularity = 'sieuthi';
    else if (hasTinhCol) detectedGranularity = 'tinh';

    const hasRealtimeMarker = headerNormCells.some((h) => h.includes('REALTIME'));
    const hasLuyKeMarker = headerNormCells.some(
      (h) => h.includes('LUY KE') || h.includes('LUYKE') || h.includes('DTLK') || h.includes('SLLK') || h.includes('DU KIEN')
    );

    let detectedTimeMode: 'realtime' | 'luyke' | null = null;
    if (hasRealtimeMarker && !hasLuyKeMarker) detectedTimeMode = 'realtime';
    else if (hasLuyKeMarker && !hasRealtimeMarker) detectedTimeMode = 'luyke';

    const mismatches: string[] = [];
    if (detectedGranularity && detectedGranularity !== expected.granularity) {
      mismatches.push(
        detectedGranularity === 'sieuthi'
          ? `Dữ liệu bạn dán có cột "${hasStoreCol ? 'SIÊU THỊ' : 'BOSS'}" => đây là dữ liệu SIÊU THỊ (chi tiết từng cửa hàng), nhưng ô này chỉ nhận dữ liệu TỈNH (tổng hợp theo tỉnh).`
          : `Dữ liệu bạn dán chỉ có cột TỈNH, không có cột SIÊU THỊ/BOSS => đây là dữ liệu TỈNH (tổng hợp), nhưng ô này chỉ nhận dữ liệu SIÊU THỊ (chi tiết từng cửa hàng).`
      );
    }
    if (detectedTimeMode && detectedTimeMode !== expected.timeMode) {
      mismatches.push(
        detectedTimeMode === 'realtime'
          ? `Dữ liệu bạn dán có cột "REALTIME" => đây là dữ liệu REALTIME, nhưng ô này chỉ nhận dữ liệu LŨY KẾ.`
          : `Dữ liệu bạn dán có cột "LŨY KẾ/DTLK/SLLK/DỰ KIẾN" => đây là dữ liệu LŨY KẾ, nhưng ô này chỉ nhận dữ liệu REALTIME.`
      );
    }

    if (mismatches.length > 0) {
      return {
        isValid: false,
        errorMessage: `Có vẻ bạn đã dán NHẦM Ô! ${mismatches.join(' ')}`,
        missingColumns: [],
        extraColumns: [],
        foundColumns,
      };
    }
  }

  return {
    isValid: true,
    missingColumns: [],
    extraColumns: [],
    foundColumns,
  };
}

/**
 * Detects the "store-name-only" BI export format (e.g. BI Dashboards'
 * "Doanh thu theo kênh bán" / revenue-by-store report) — pasted rows carry
 * NO Tỉnh/Siêu Thị/Boss/Kênh column at all, only value columns like
 * "DOANH THU (RT)", "TARGET", "% HT NGÀY". The store's own name/code sits
 * alone on the line directly above its value row (an artifact of copying an
 * HTML table where the store name is a hyperlink), so a header row here has
 * TARGET/ĐẠT-like columns but no entity-identifying column — the opposite
 * of the classic format handled below, whose header always includes a
 * SIÊU THỊ/TỈNH/BOSS/KÊNH column alongside them.
 */
function looksLikeStoreNameOnlyFormat(
  lines: string[],
  detectDelimiter: (line: string) => string,
  splitLine: (line: string, delimiter: string) => string[],
  normalizeHeader: (h: string) => string
): boolean {
  // Scans the whole paste — see the matching comment in validateStoreHeaders
  // above about the new BI source's long sidebar/toolbar preamble.
  for (let i = 0; i < lines.length; i++) {
    const delim = detectDelimiter(lines[i]);
    const cells = splitLine(lines[i], delim);
    if (cells.length < 2) continue;
    const norm = cells.map(normalizeHeader);
    const hasAchieved = norm.some(
      (h) => h.includes('DOANH THU') || h.includes('DAT') || h.includes('REALTIME') || h.includes('LUY KE') || h.includes('SO LUONG')
    );
    const hasTarget = norm.some((h) => h.includes('TARGET') || h.includes('CHI TIEU'));
    if (!hasAchieved && !hasTarget) continue;
    const hasEntityCol = norm.some(
      (h) => h.includes('SIEU THI') || h.includes('TINH') || h.includes('BOSS') || h.includes('KENH') || h.includes('STORE') || h.includes('CUA HANG')
    );
    return !hasEntityCol;
  }
  return false;
}

/**
 * Parses the "store-name-only" BI export format described above. Since the
 * pasted text carries nothing but a store name/code and its numbers, every
 * other attribute (Tỉnh, Tỉnh Mới, Kênh, Boss, Phân Loại Shop, Mã Kho) is
 * resolved by matching that name against the uploaded BOSS file (Cột J —
 * see getBossAssignmentIndex above, which now also indexes on Cột J).
 * Multiple stacked ngành hàng blocks (each with its own "827-Nồi cơm"-style
 * label line, header line, and "TỔNG" line) are merged per store into one
 * categoryMap, same as the classic parser below.
 *
 * The header's rate column means something different depending on which box
 * this was pasted into:
 * - Realtime ("DOANH THU (RT)" / TARGET NGÀY): rate = "% HT NGÀY", the
 *   day's actual completion so far.
 * - Luỹ Kế ("DOANH THU" / TARGET THÁNG): rate = "% DỰ BÁO" instead — the
 *   BI's own forecasted month-end completion, not the plain
 *   doanh-thu/target-tháng ratio that "% HT THÁNG" gives.
 */
function parseStoreNameOnlyFormat(lines: string[], isRealtime: boolean, bossAssignments: BossAssignmentRecord[]): StoreRecord[] {
  const detectDelimiter = (line: string): string => {
    if (line.includes('\t')) return '\t';
    // No comma fallback here (unlike the classic parser below): this
    // format's own ngành hàng/store names routinely contain commas — "OTT
    // Mango+, iCallMe", "Trả chậm FECredit, Shinhan, Samsung Finance+", "Tủ
    // lạnh, Tủ đông, Tủ mát". Treating comma as a delimiter would shred a
    // bare label line into multiple cells, so it skips the "cells.length <
    // 2 -> pendingLabel" branch below and its whole category block silently
    // gets attributed to whichever category came right before it.
    return /\s{2,}/.source;
  };
  const splitLine = (line: string, delimiter: string): string[] => {
    const parts = delimiter === /\s{2,}/.source ? line.split(new RegExp(delimiter)) : line.split(delimiter);
    return parts.map((c) => c.trim().replace(/^["']|["']$/g, ''));
  };
  // This source uses US-style number formatting (comma = thousands
  // separator, period = decimal — e.g. "4,210.5%", "747.78"), the opposite
  // convention from the classic parser's Vietnamese-locale numbers below.
  const parseNumUS = (val: string | undefined, defaultVal = 0): number => {
    if (!val) return defaultVal;
    const clean = val.replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? defaultVal : num;
  };
  const parseRateUS = (val: string | undefined): number => {
    if (!val) return 0;
    const clean = val.replace(/%/g, '').replace(/,/g, '').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const recordMap = new Map<string, StoreRecord>();
  let currentCategoryName = '';
  let colAchieved = -1;
  let colTarget = -1;
  let colRate = -1;
  // Whether the current category block is revenue-based (DOANH THU, Triệu VND)
  // vs quantity-based (SỐ LƯỢNG, SLLK — e.g. Camera, Sim Tổng, thẻ, VAS...).
  // The top-level target/achieved fields are documented as Triệu VND, so only
  // revenue-based categories should be summed into them — mixing in quantity
  // counts would make the store's overall total meaningless (mirrors the same
  // guard in the classic parser below).
  let currentCategoryIsRevenue = true;
  // The single-cell line seen most recently — either a ngành hàng label
  // ("827-Nồi cơm"), a store name, or "TỔNG", disambiguated by what kind of
  // line follows it (a column header vs. a plain value row).
  let pendingLabel: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const delim = detectDelimiter(lines[i]);
    const cells = splitLine(lines[i], delim);

    if (cells.length < 2) {
      pendingLabel = lines[i].trim();
      continue;
    }

    const norm = cells.map(normalizeHeaderText);
    // Some ngành hàng (Camera, Sim Tổng, VAS/thẻ/ngân hàng...) are measured
    // by quantity, not revenue — their column reads "SỐ LƯỢNG (RT)" / "SỐ
    // LƯỢNG" instead of "DOANH THU (RT)" / "DOANH THU". Missing this made
    // those blocks' header rows go unrecognized entirely, so colAchieved
    // stayed stale (or -1) and every store under them parsed as 0%.
    const hasAchieved = norm.some(
      (h) => h.includes('DOANH THU') || h.includes('DAT') || h.includes('REALTIME') || h.includes('LUY KE') || h.includes('SO LUONG')
    );
    const hasTarget = norm.some((h) => h.includes('TARGET') || h.includes('CHI TIEU'));

    if (hasAchieved && hasTarget) {
      // New ngành hàng block's column-header row. The label line right
      // before it (if any) was the category name, not a store/"Tổng" line.
      // Strip the BI's internal numeric code ("827-Nồi cơm" -> "Nồi cơm") —
      // this becomes the categoryMap KEY (not just a display label), and it
      // must match the app's existing 38-category taxonomy
      // (ALL_HARDCODED_CATEGORY_NAMES / DEFAULT_CATEGORY_GROUP_MAP in
      // ReportView.tsx) exactly, or the category silently falls into "Chưa
      // phân nhóm" and every column for it renders as 0 — the code prefix
      // is a BI-internal id, not part of that established category identity.
      if (pendingLabel) currentCategoryName = canonicalizeCategoryName(pendingLabel);
      colAchieved = norm.findIndex(
        (h) => h.includes('DOANH THU') || h.includes('DAT') || h.includes('REALTIME') || h.includes('LUY KE') || h.includes('SO LUONG')
      );
      currentCategoryIsRevenue =
        colAchieved === -1 || (!norm[colAchieved].includes('SLLK') && !norm[colAchieved].includes('SO LUONG'));
      colTarget = norm.findIndex((h) => h.includes('TARGET') || h.includes('CHI TIEU'));
      const forecastIdx = norm.findIndex((h) => h.includes('DU BAO'));
      if (isRealtime) {
        // Realtime: "% HT NGÀY" — the day's actual completion, not the forecast.
        colRate = norm.findIndex((h, idx) => (h.includes('% HT') || h.includes('HOAN THANH')) && idx !== forecastIdx);
        if (colRate === -1) {
          colRate = norm.findIndex((h, idx) => h.includes('%') && idx !== forecastIdx);
        }
      } else {
        // Luỹ Kế: "% DỰ BÁO" — BI's forecasted month-end completion.
        colRate = forecastIdx;
        if (colRate === -1) {
          colRate = norm.findIndex((h, idx) => (h.includes('% HT') || h.includes('HOAN THANH')) && idx !== forecastIdx);
        }
      }
      pendingLabel = null;
      continue;
    }

    // A value row belongs to whatever pendingLabel named — a store, or the
    // block's "TỔNG" line (which is skipped, not turned into a record).
    if (!pendingLabel) continue;
    const label = pendingLabel;
    pendingLabel = null;

    const labelLower = label.trim().toLowerCase();
    if (labelLower === 'tổng' || labelLower === 'tong') continue;
    if (!label) continue;

    const achieved = colAchieved >= 0 ? parseNumUS(cells[colAchieved]) : 0;
    const target = colTarget >= 0 ? parseNumUS(cells[colTarget]) : 0;
    let rate = colRate >= 0 ? parseRateUS(cells[colRate]) : 0;
    if (colRate === -1 && target > 0) {
      rate = Number(((achieved / target) * 100).toFixed(1));
    }

    const matched = findBossAssignmentRecord(label, bossAssignments);
    const tinh = matched?.tinh || 'Cần Thơ';
    const boss = matched?.boss || 'Boss Quản Lý';
    const kenh: Channel | string = (matched?.kenh as Channel) || inferKenhFromSieuThiName(label);

    const entityKey = label.toLowerCase();
    if (recordMap.has(entityKey)) {
      const existing = recordMap.get(entityKey)!;
      if (currentCategoryIsRevenue) {
        existing.target = Number((existing.target + target).toFixed(2));
        existing.achieved = Number((existing.achieved + achieved).toFixed(2));
        existing.rate = existing.target > 0 ? Number(((existing.achieved / existing.target) * 100).toFixed(1)) : 0;
      }
      if (currentCategoryName) {
        existing.categoryMap = existing.categoryMap || {};
        existing.categoryMap[currentCategoryName] = {
          target: Number(target.toFixed(2)),
          achieved: Number(achieved.toFixed(2)),
          rate,
        };
      }
    } else {
      const baseTarget = currentCategoryIsRevenue ? target : 0;
      const baseAchieved = currentCategoryIsRevenue ? achieved : 0;
      const baseRate = currentCategoryIsRevenue ? rate : 0;
      const catMap: Record<string, { target: number; achieved: number; rate: number }> = {};
      if (currentCategoryName) {
        catMap[currentCategoryName] = {
          target: Number(target.toFixed(2)),
          achieved: Number(achieved.toFixed(2)),
          rate,
        };
      }
      recordMap.set(entityKey, {
        stt: recordMap.size + 1,
        id: `ST_${Date.now()}_${recordMap.size + 1}`,
        tinh,
        boss,
        kenh,
        sieuthi: label,
        target: Number(baseTarget.toFixed(2)),
        achieved: Number(baseAchieved.toFixed(2)),
        rate: baseRate,
        rank: 0,
        categoryMap: catMap,
        lastUpdated: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      });
    }
  }

  const records = Array.from(recordMap.values());
  records.sort((a, b) => b.rate - a.rate);
  records.forEach((rec, idx) => {
    rec.rank = idx + 1;
    rec.stt = idx + 1;
  });
  return records;
}

/**
 * Parses TSV/CSV string pasted directly from Excel or Google Sheets.
 * Handles headers like STT, TỈNH, BOSS, KÊNH, SIÊU THỊ, CHỈ TIÊU, ĐẠT, TỶ LỆ...
 */
export function parsePastedData(
  text: string,
  isRealtime: boolean = false,
  bossAssignments: BossAssignmentRecord[] = []
): StoreRecord[] {
  if (!text || !text.trim()) return [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const recordMap = new Map<string, StoreRecord>();

  const detectDelimiter = (line: string): string => {
    if (line.includes('\t')) return '\t';
    if (line.includes(',')) return ',';
    return /\s{2,}/.source;
  };

  const splitLine = (line: string, delimiter: string): string[] => {
    const parts = delimiter === /\s{2,}/.source ? line.split(new RegExp(delimiter)) : line.split(delimiter);
    return parts.map((c) => c.trim().replace(/^["']|["']$/g, ''));
  };

  // BI export with no Tỉnh/Siêu Thị/Boss/Kênh column at all (just a store
  // name line + a numbers line) — hand off entirely to the dedicated parser,
  // which resolves those attributes from the BOSS file instead.
  if (looksLikeStoreNameOnlyFormat(lines, detectDelimiter, splitLine, normalizeHeaderText)) {
    return parseStoreNameOnlyFormat(lines, isRealtime, bossAssignments);
  }

  const parseNum = (val: string | undefined, defaultVal = 0): number => {
    if (!val) return defaultVal;
    const clean = val.replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? defaultVal : num;
  };

  const parseRateStr = (val: string | undefined): number => {
    if (!val) return 0;
    const clean = val.replace(/%/g, '').replace(/,/g, '.').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const isNumericLike = (s: string): boolean => /^-?[\d.,]+%?$/.test(s.trim());

  let colTinh = -1, colBoss = -1, colKenh = -1, colSieuThi = -1, colTarget = -1, colAchieved = -1, colRate = -1;
  let currentDelimiter = detectDelimiter(lines[0]);
  let currentCategoryName = '';
  // Whether the current category block is revenue-based (DTLK, Triệu VND) vs quantity-based (SLLK, số lượng).
  // The top-level target/achieved fields are documented as "Trieu VND" (StoreRecord), so only
  // revenue-based categories should be summed into them — mixing in SLLK counts made the "Tất cả
  // ngành hàng" total meaningless.
  let currentCategoryIsRevenue = true;

  const normalizeHeader = (h: string): string => {
    return (h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase()
      .trim();
  };

  const updateHeaderMappings = (cells: string[]) => {
    const normHeaders = cells.map(normalizeHeader);
    const upper = cells.map((c) => c.toUpperCase());

    // Target column search: prioritize exact 'TARGET' / 'CHỈ TIÊU' / 'KẾ HOẠCH' over '% HT TARGET THÁNG'
    let tTarget = normHeaders.findIndex((h) => h === 'TARGET' || h === 'CHI TIEU' || h === 'KE HOACH' || h.includes('CHI TIEU') || h.includes('KE HOACH'));
    if (tTarget === -1) {
      tTarget = normHeaders.findIndex((h) => h.includes('TARGET') && !h.includes('%') && !h.includes('HT'));
    }
    if (tTarget === -1) {
      tTarget = normHeaders.findIndex((h) => h.includes('TARGET'));
    }

    const tAchieved = normHeaders.findIndex((h) => h.includes('DAT') || h.includes('REALTIME') || h.includes('LUY KE') || h.includes('DOANH THU') || h.includes('DTLK') || h.includes('SLLK'));

    // Rate column search: strictly prioritize '% HT DỰ KIẾN' for Luỹ Kế
    let tRate = normHeaders.findIndex((h) => h.includes('DU KIEN') || h.includes('DU KIN'));
    if (tRate === -1) {
      tRate = normHeaders.findIndex((h) => (h.includes('TY LE') || h.includes('HOAN THANH') || h.includes('%')) && !h.includes('TARGET'));
    }
    if (tRate === -1) {
      tRate = normHeaders.findIndex((h) => h.includes('TY LE') || h.includes('%') || h.includes('HOAN THANH'));
    }

    colTinh = normHeaders.findIndex((h) => h.includes('TINH') || h.includes('PROVINCE'));
    colBoss = normHeaders.findIndex((h) => h.includes('BOSS') || h.includes('QUAN LY') || h.includes('NHOM'));
    colKenh = normHeaders.findIndex((h) => h.includes('KENH') || h.includes('CHANNEL'));
    colSieuThi = normHeaders.findIndex((h) => h.includes('SIEU THI') || h.includes('STORE') || h.includes('CUA HANG'));
    colTarget = tTarget;
    colAchieved = tAchieved;
    colRate = tRate;

    if (colTinh === -1) colTinh = 0;
    if (colSieuThi === -1) colSieuThi = cells.length > 1 ? 1 : 0;

    // First cell in header row often contains the category name (e.g. "Nồi cơm", "Tivi", "Máy lọc nước")
    const firstCellUpper = normHeaders[0] || '';
    if (
      firstCellUpper &&
      !firstCellUpper.includes('STT') &&
      !firstCellUpper.includes('XEP HANG') &&
      !firstCellUpper.includes('RANK') &&
      (colTarget >= 0 || colAchieved >= 0 || colRate >= 0)
    ) {
      // Strip a leading BI numeric code ("827-Nồi cơm" -> "Nồi cơm") so this
      // categoryMap key matches the app's established category taxonomy —
      // see the matching comment in parseStoreNameOnlyFormat above.
      currentCategoryName = canonicalizeCategoryName(cells[0]);
      currentCategoryIsRevenue = tAchieved === -1 || !upper[tAchieved].includes('SLLK');
    }
  };

  // Find initial header mapping — scans the whole paste (see the preamble
  // comment in validateStoreHeaders above).
  for (let i = 0; i < lines.length; i++) {
    const lineDelimiter = detectDelimiter(lines[i]);
    const cells = splitLine(lines[i], lineDelimiter);
    if (cells.length < 2) continue;
    const normHeaders = cells.map(normalizeHeader);

    const tTarget = normHeaders.findIndex((h) => h.includes('CHI TIEU') || h.includes('KE HOACH') || h.includes('TARGET'));
    const tAchieved = normHeaders.findIndex((h) => h.includes('DAT') || h.includes('REALTIME') || h.includes('LUY KE') || h.includes('DOANH THU') || h.includes('DTLK') || h.includes('SLLK'));
    let tRate = normHeaders.findIndex((h) => h.includes('DU KIEN') || h.includes('DU KIN'));
    if (tRate === -1) {
      tRate = normHeaders.findIndex((h) => h.includes('TY LE') || h.includes('%') || h.includes('HOAN THANH'));
    }

    if (tTarget >= 0 || tAchieved >= 0 || tRate >= 0) {
      currentDelimiter = lineDelimiter;
      updateHeaderMappings(cells);
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const cells = splitLine(rawLine, currentDelimiter);

    if (cells.length < 2) continue;

    const upperCells = cells.map((c) => c.toUpperCase());
    const looksLikeAnotherHeader =
      upperCells.some((h) => h.includes('XẾP HẠNG')) ||
      (upperCells.some((h) => h.includes('TARGET') || h.includes('TIÊU') || h.includes('KẾ HOẠCH')) &&
        upperCells.some((h) => h.includes('ĐẠT') || h.includes('REALTIME') || h.includes('LUỸ KẾ') || h.includes('DOANH THU') || h.includes('DTLK') || h.includes('SLLK')));

    if (looksLikeAnotherHeader) {
      updateHeaderMappings(cells);
      continue;
    }

    const tinhRaw = colTinh >= 0 ? cells[colTinh] || '' : '';
    let sieuthiRaw = colSieuThi >= 0 ? cells[colSieuThi] || '' : '';

    if (isNumericLike(sieuthiRaw)) sieuthiRaw = tinhRaw;

    if (tinhRaw.trim().toLowerCase() === 'tổng' || sieuthiRaw.trim().toLowerCase() === 'tổng') continue;
    if (!sieuthiRaw.trim()) continue;

    const matchedBoss = bossAssignments.length > 0 ? findBossAssignmentRecord(sieuthiRaw, bossAssignments) : null;
    const tinh = matchedBoss?.tinh || tinhRaw || inferProvinceFromStoreName(sieuthiRaw) || 'Cần Thơ';
    const boss = matchedBoss?.boss ? matchedBoss.boss.replace(/^Boss\s+/i, '').trim() : (colBoss >= 0 ? cells[colBoss] : 'Boss Quản Lý');

    let rawKenh = colKenh >= 0 ? normVN(cells[colKenh] || '').toUpperCase() : '';
    let kenh: Channel | string;
    if (matchedBoss?.kenh) {
      kenh = parseChannelValue(matchedBoss.kenh);
    } else if (rawKenh.includes('LƯU ĐỘNG') || rawKenh.includes('LUU DONG') || rawKenh === 'LUUDONG') kenh = 'LƯU ĐỘNG';
    else if (rawKenh.includes('OFF') || rawKenh.includes('OFFLINE')) kenh = 'OFF';
    else if (normVN(sieuthiRaw).toUpperCase().includes('LƯU ĐỘNG') || sieuthiRaw.toUpperCase().includes('LUU DONG') || sieuthiRaw.toUpperCase().includes('LUUDONG')) kenh = 'LƯU ĐỘNG';
    else if (rawKenh.includes('TOPZONE') || rawKenh.includes('TOP ZONE') || rawKenh.includes('TZ') || rawKenh.includes('AAR')) kenh = 'TopZone';
    else if (rawKenh.includes('TGD')) kenh = 'TGD';
    else if (rawKenh.includes('DMM')) kenh = 'DMM';
    else if (rawKenh.includes('DMS')) kenh = 'DMS';
    else if (rawKenh.includes('DML')) kenh = 'DML';
    else kenh = inferKenhFromSieuThiName(sieuthiRaw);

    const sieuthi = sieuthiRaw;

    const target = colTarget >= 0 ? parseNum(cells[colTarget]) : isRealtime ? 100 : 2000;
    const achieved = colAchieved >= 0 ? parseNum(cells[colAchieved]) : isRealtime ? 115 : 2200;

    let rate = colRate >= 0 ? parseRateStr(cells[colRate]) : 0;
    if (colRate === -1 && target > 0) {
      rate = Number(((achieved / target) * 100).toFixed(1));
    }

    // Key by store name or province name to combine stacked category tables
    const entityKey = (sieuthi || tinh).trim().toLowerCase();

    if (recordMap.has(entityKey)) {
      const existing = recordMap.get(entityKey)!;
      if (currentCategoryIsRevenue) {
        existing.target = Number((existing.target + target).toFixed(2));
        existing.achieved = Number((existing.achieved + achieved).toFixed(2));
        existing.rate = isRealtime
          ? (existing.target > 0 ? Number(((existing.achieved / existing.target) * 100).toFixed(1)) : 0)
          : (rate > 0 ? rate : (existing.target > 0 ? Number(((existing.achieved / existing.target) * 100).toFixed(1)) : 0));
      }
      if (currentCategoryName) {
        existing.categoryMap = existing.categoryMap || {};
        existing.categoryMap[currentCategoryName] = {
          target: Number(target.toFixed(2)),
          achieved: Number(achieved.toFixed(2)),
          rate,
        };
      }
    } else {
      const baseTarget = currentCategoryIsRevenue ? target : 0;
      const baseAchieved = currentCategoryIsRevenue ? achieved : 0;
      const baseRate = currentCategoryIsRevenue ? rate : 0;
      const catMap: Record<string, { target: number; achieved: number; rate: number }> = {};
      if (currentCategoryName) {
        catMap[currentCategoryName] = {
          target: Number(target.toFixed(2)),
          achieved: Number(achieved.toFixed(2)),
          rate,
        };
      }

      recordMap.set(entityKey, {
        stt: recordMap.size + 1,
        id: `ST_${Date.now()}_${recordMap.size + 1}`,
        tinh: tinh || 'Cần Thơ',
        boss: boss || 'Boss Quản Lý',
        kenh,
        sieuthi: sieuthi || `Siêu thị ${recordMap.size + 1}`,
        target: Number(baseTarget.toFixed(2)),
        achieved: Number(baseAchieved.toFixed(2)),
        rate: baseRate,
        rank: 0,
        categoryMap: catMap,
        lastUpdated: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        tinhMoi: matchedBoss?.tinhMoi || '-',
        phanLoaiShop: matchedBoss?.phanLoaiShop || '-',
      });
    }
  }

  const records = Array.from(recordMap.values());
  records.sort((a, b) => b.rate - a.rate);
  records.forEach((rec, idx) => {
    rec.rank = idx + 1;
    rec.stt = idx + 1;
  });

  return records;
}

export function extractDaysInMonthFromText(text: string): number {
  const mFull = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mFull) {
    const month = parseInt(mFull[2], 10);
    const year = parseInt(mFull[3], 10);
    if (month >= 1 && month <= 12 && year >= 2020) {
      return new Date(year, month, 0).getDate();
    }
  }
  const mMonthYear = text.match(/(?:^|[^\d])(0?[1-9]|1[0-2])\/(\d{4})/);
  if (mMonthYear) {
    const month = parseInt(mMonthYear[1], 10);
    const year = parseInt(mMonthYear[2], 10);
    return new Date(year, month, 0).getDate();
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export function inferProvinceFromStoreName(sieuthi: string): string {
  const u = sieuthi.toUpperCase();
  if (u.includes('_STR_') || u.includes('_STR ') || u.includes(' SÓC TRĂNG') || u.includes(' SOC TRANG')) return 'Sóc Trăng';
  if (u.includes('_TVI_') || u.includes('_TVI ') || u.includes(' TRÀ VINH') || u.includes(' TRA VINH')) return 'Trà Vinh';
  if (u.includes('_KGI_') || u.includes('_KGI ') || u.includes(' KIÊN GIANG') || u.includes(' KIEN GIANG')) return 'Kiên Giang';
  if (u.includes('_AGI_') || u.includes('_AGI ') || u.includes(' AN GIANG')) return 'An Giang';
  if (u.includes('_CMA_') || u.includes('_CMA ') || u.includes(' CÀ MAU') || u.includes(' CA MAU')) return 'Cà Mau';
  if (u.includes('_LAN_') || u.includes('_LAN ') || u.includes(' LONG AN')) return 'Long An';
  if (u.includes('_HGI_') || u.includes('_HGI ') || u.includes(' HẬU GIANG') || u.includes(' HAU GIANG')) return 'Hậu Giang';
  if (u.includes('_DTH_') || u.includes('_DTH ') || u.includes(' ĐỒNG THÁP') || u.includes(' DONG THAP')) return 'Đồng Tháp';
  if (u.includes('_CTH_') || u.includes('_CTH ') || u.includes(' CẦN THƠ') || u.includes(' CAN THO')) return 'Cần Thơ';
  if (u.includes('_TGI_') || u.includes('_TGI ') || u.includes(' TIỀN GIANG') || u.includes(' TIEN GIANG')) return 'Tiền Giang';
  if (u.includes('_BLI_') || u.includes('_BLI ') || u.includes(' BẠC LIÊU') || u.includes(' BAC LIEU')) return 'Bạc Liêu';
  if (u.includes('_BTR_') || u.includes('_BTR ') || u.includes(' BẾN TRE') || u.includes(' BEN TRE')) return 'Bến Tre';
  if (u.includes('_VLO_') || u.includes('_VLO ') || u.includes(' VĨNH LONG') || u.includes(' VINH LONG')) return 'Vĩnh Long';
  return 'Khác';
}

/**
 * Parses revenue and installment (trả chậm) pasted TSV/CSV data from BI sheet:
 * Supports BOTH the new "Doanh thu hợp nhất" layout and legacy BI formats.
 */
export function parseRevenuePastedData(
  text: string,
  isRealtime: boolean = false,
  dataType: 'doanhthu' | 'tracham' = 'doanhthu',
  bossAssignments: BossAssignmentRecord[] = []
): StoreRecord[] {
  if (!text || !text.trim()) return [];

  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (rawLines.length === 0) return [];

  const parseNum = (val: string | undefined): number => {
    if (!val || val === '—' || val === '--' || val === '-') return 0;
    const clean = val.replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const parseRate = (val: string | undefined): number => {
    if (!val || val === '—' || val === '--' || val === '-') return 0;
    const clean = val.replace(/%/g, '').replace(/,/g, '.').replace(/[^0-9.-]/g, '').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  // 1. Detect if this is the new "Doanh thu hợp nhất" format
  const isDoanhThuHopNhat =
    /DOANH THU QĐ|DOANH THU QD/i.test(text) ||
    /DT TRẢ GÓP|DT TRA GOP/i.test(text) ||
    /% TRẢ GÓP|% TRA GOP/i.test(text) ||
    /Doanh thu hợp nhất/i.test(text) ||
    /% HT TARGET/i.test(text);

  if (isDoanhThuHopNhat) {
    const daysInMonth = extractDaysInMonthFromText(text);
    const results: StoreRecord[] = [];

    const isPureNumber = (str: string) => /^[0-9.,\s%+—\-]+$/.test(str.trim());
    const isStoreHeader = (str: string): boolean => {
      if (!str || isPureNumber(str)) return false;
      const u = str.toUpperCase();
      if (
        u.startsWith('TỔNG') ||
        u.startsWith('TONG') ||
        u.includes('CẤP CHA') ||
        u.includes('KÝ TỰ') ||
        u.includes('ĐANG CHỌN') ||
        u.includes('SAO CHÉP') ||
        u.includes('DASHBOARDS') ||
        u.includes('DANH MỤC') ||
        u.includes('HIỆU QUẢ') ||
        u.includes('NGÀNH HÀNG')
      ) {
        return false;
      }
      return (
        /^\d+\s*[-–]\s*[a-zA-ZÀ-ỹ]/.test(str) ||
        (str.length > 5 &&
          (str.includes('_') ||
            str.includes('Kho chứa') ||
            /ĐML|DML|ĐMM|DMM|ĐMS|DMS|TGD|TOPZONE|AAR|Kho/i.test(str)))
      );
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (line.toUpperCase().startsWith('TỔNG') || line.toUpperCase().startsWith('TONG')) continue;

      // Format B: Same line tab-separated (Store\tCol1\tCol2...)
      const tabs = line.split('\t');
      if (tabs.length >= 10 && isStoreHeader(tabs[0])) {
        const sieuthi = tabs[0];
        const soLuong = parseNum(tabs[1]);
        const dtQd = parseNum(tabs[2]);
        const dtThuc = parseNum(tabs[4]);
        const rawTarget = parseNum(tabs[5]);
        const htTargetRaw = parseRate(tabs[6]);
        const tb3Thang = parseNum(tabs[7]);
        const growthRate = parseRate(tabs[8]);
        const dtTraGop = parseNum(tabs[9]);
        const tiTrongTraGop = parseRate(tabs[10]);

        const target = isRealtime
          ? (daysInMonth > 0 ? Math.round((rawTarget / daysInMonth) * 100) / 100 : rawTarget)
          : rawTarget;
        const achieved = dtQd;
        const rate = target > 0
          ? Number(((achieved / target) * 100).toFixed(1))
          : (isRealtime ? 0 : htTargetRaw);

        const matchedBoss = bossAssignments.length > 0 ? findBossAssignmentRecord(sieuthi, bossAssignments) : null;
        const tinh = matchedBoss?.tinh || inferProvinceFromStoreName(sieuthi);
        const mst = matchedBoss?.mst || extractMst(sieuthi) || extractStoreCode(sieuthi) || `REV_${results.length + 1}`;
        const boss = matchedBoss?.boss ? matchedBoss.boss.replace(/^Boss\s+/i, '').trim() : '';
        const kenh = matchedBoss?.kenh ? parseChannelValue(matchedBoss.kenh) : inferKenhFromSieuThiName(sieuthi);
        const tinhMoi = matchedBoss?.tinhMoi || '-';
        const phanLoaiShop = matchedBoss?.phanLoaiShop || '-';

        results.push({
          stt: results.length + 1,
          rank: results.length + 1,
          id: mst,
          sieuthi,
          tinh,
          target,
          achieved,
          rate,
          dtThuc,
          dtQd,
          dtTraGop,
          tiTrongTraGop,
          soLuong,
          tb3Thang,
          growthRate,
          targetThang: rawTarget,
          htTargetRate: htTargetRaw,
          kenh,
          boss,
          tinhMoi,
          phanLoaiShop,
          categoryMap: {},
        });
        continue;
      }

      // Format A: Store on line i, numbers on line i+1
      if (isStoreHeader(line) && i + 1 < rawLines.length) {
        const nextLine = rawLines[i + 1];
        const nextCells = nextLine.split('\t');
        if (nextCells.length >= 9) {
          const sieuthi = line;
          const soLuong = parseNum(nextCells[0]);
          const dtQd = parseNum(nextCells[1]);
          const dtThuc = parseNum(nextCells[3]);
          const rawTarget = parseNum(nextCells[4]);
          const htTargetRaw = parseRate(nextCells[5]);
          const tb3Thang = parseNum(nextCells[6]);
          const growthRate = parseRate(nextCells[7]);
          const dtTraGop = parseNum(nextCells[8]);
          const tiTrongTraGop = parseRate(nextCells[9]);

          const target = isRealtime
            ? (daysInMonth > 0 ? Math.round((rawTarget / daysInMonth) * 100) / 100 : rawTarget)
            : rawTarget;
          const achieved = dtQd;
          const rate = target > 0
            ? Number(((achieved / target) * 100).toFixed(1))
            : (isRealtime ? 0 : htTargetRaw);

          const matchedBoss = bossAssignments.length > 0 ? findBossAssignmentRecord(sieuthi, bossAssignments) : null;
          const tinh = matchedBoss?.tinh || inferProvinceFromStoreName(sieuthi);
          const mst = matchedBoss?.mst || extractMst(sieuthi) || extractStoreCode(sieuthi) || `REV_${results.length + 1}`;
          const boss = matchedBoss?.boss ? matchedBoss.boss.replace(/^Boss\s+/i, '').trim() : '';
          const kenh = matchedBoss?.kenh ? parseChannelValue(matchedBoss.kenh) : inferKenhFromSieuThiName(sieuthi);
          const tinhMoi = matchedBoss?.tinhMoi || '-';
          const phanLoaiShop = matchedBoss?.phanLoaiShop || '-';

          results.push({
            stt: results.length + 1,
            rank: results.length + 1,
            id: mst,
            sieuthi,
            tinh,
            target,
            achieved,
            rate,
            dtThuc,
            dtQd,
            dtTraGop,
            tiTrongTraGop,
            soLuong,
            tb3Thang,
            growthRate,
            targetThang: rawTarget,
            htTargetRate: htTargetRaw,
            kenh,
            boss,
            tinhMoi,
            phanLoaiShop,
            categoryMap: {},
          });
          i++; // Skip the numbers row
          continue;
        }
      }
    }

    if (results.length > 0) {
      return results;
    }
  }

  // 2. Legacy BI Parser fallback
  const results: StoreRecord[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const cells = (line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : line.split(/\s{2,}/))
      .map((c) => c.trim().replace(/^["']|["']$/g, ''));

    if (cells.length < 2) continue;

    const col0 = cells[0] || '';
    const col1 = cells[1] || '';
    const c0Upper = col0.toUpperCase();
    const c1Upper = col1.toUpperCase();

    // Skip general non-store headers
    if (
      c0Upper === 'TỔNG' ||
      c0Upper === 'TONG' ||
      c1Upper === 'TỔNG' ||
      c1Upper === 'TONG' ||
      c0Upper.includes('KHU VỰC') ||
      c0Upper.includes('TÊN MIỀN') ||
      c1Upper.includes('TÊN SIÊU THỊ') ||
      c0Upper.includes('DT SIÊU THỊ') ||
      c0Upper.includes('DT TRẢ CHẬM') ||
      c1Upper.includes('TỶ TRỌNG') ||
      c0Upper.includes('TRANG CHỦ') ||
      c0Upper.includes('BÁO CÁO') ||
      c0Upper.includes('KHỐI KINH DOANH') ||
      c0Upper.includes('HỖ TRỢ BI') ||
      c0Upper.includes('ĐANG CHỌN VÀ SAO CHÉP') ||
      c0Upper.startsWith('(*')
    ) {
      continue;
    }

    // Identify if this row is a valid store row (has store code \d+ - or standard store naming)
    const isPureNumber = (str: string) => /^[0-9.,\s%+-—\-]+$/.test(str.trim());
    const isStore1 = (/\d+\s*[-–]\s*[a-zA-ZÀ-ỹ]/.test(col1) || (col1.length > 5 && (col1.includes('_') || col1.includes('Kho chứa') || /ĐML|DML|ĐMM|DMM|ĐMS|DMS|TGD|TOPZONE/i.test(col1)))) && !isPureNumber(col1);
    const isStore0 = (/\d+\s*[-–]\s*[a-zA-ZÀ-ỹ]/.test(col0) || (col0.length > 5 && (col0.includes('_') || col0.includes('Kho chứa') || /ĐML|DML|ĐMM|DMM|ĐMS|DMS|TGD|TOPZONE/i.test(col0)))) && !isPureNumber(col0);

    if (!isStore1 && !isStore0) continue;

    let tinh = col0;
    let sieuthi = col1;
    let colOffset = 1;

    // In case province column is missing and store is in col0
    if (isStore0 && !isStore1) {
      sieuthi = col0;
      tinh = inferProvinceFromStoreName(sieuthi) || 'Khác';
      colOffset = 0;
    } else {
      tinh = col0;
      sieuthi = col1;
      colOffset = 1;
    }

    if (isPureNumber(sieuthi) || !/[a-zA-ZÀ-ỹ]/.test(sieuthi)) continue;

    let target = 0;
    let achieved = 0;
    let rate = 0;
    let dtThuc = 0;
    let dtQd = 0;

    if (dataType === 'tracham') {
      const valDtStore = parseNum(cells[colOffset + 1]);
      const valTraCham = parseNum(cells[colOffset + 2]);
      const valRate = parseRate(cells[colOffset + 3]);

      target = valDtStore;
      achieved = valTraCham;
      rate = valRate > 0 ? valRate : target > 0 ? (achieved / target) * 100 : 0;
    } else {
      const isLuyKeStructure = !isRealtime || cells.length >= colOffset + 8;

      if (isLuyKeStructure && cells.length >= colOffset + 7) {
        const valRateRaw = parseRate(cells[colOffset + 1]);
        const valDtRaw = parseNum(cells[colOffset + 2]);
        const valTargetRaw = parseNum(cells[colOffset + 3]);

        const valRateQd = parseRate(cells[colOffset + 5]);
        const valDtQd = parseNum(cells[colOffset + 6]);
        const valTargetQd = parseNum(cells[colOffset + 7]);

        dtThuc = valDtRaw;
        dtQd = valDtQd > 0 ? valDtQd : valDtRaw;

        achieved = dtQd;
        target = valTargetQd > 0 ? valTargetQd : valTargetRaw;
        rate = cells[colOffset + 5] !== undefined && cells[colOffset + 5].trim() !== ''
          ? valRateQd
          : (target > 0 ? (achieved / target) * 100 : valRateRaw);
      } else {
        const valRateRaw = parseRate(cells[colOffset + 1]);
        const valDtRaw = parseNum(cells[colOffset + 2]);
        const valTargetRaw = parseNum(cells[colOffset + 3]);

        const valRateQd = parseRate(cells[colOffset + 4]);
        const valDtQd = parseNum(cells[colOffset + 5]);
        const valTargetQd = parseNum(cells[colOffset + 6]);

        dtThuc = valDtRaw;
        dtQd = valDtQd > 0 ? valDtQd : valDtRaw;

        achieved = valDtQd > 0 ? valDtQd : valDtRaw;
        target = valTargetQd > 0 ? valTargetQd : valTargetRaw;
        rate = cells[colOffset + 4] !== undefined && cells[colOffset + 4].trim() !== ''
          ? valRateQd
          : (target > 0 ? (achieved / target) * 100 : valRateRaw);
      }
    }

    const matchedBoss = bossAssignments.length > 0 ? findBossAssignmentRecord(sieuthi, bossAssignments) : null;
    const effectiveTinh = matchedBoss?.tinh || tinh || inferProvinceFromStoreName(sieuthi) || 'Khác';
    const mst = matchedBoss?.mst || extractMst(sieuthi) || extractStoreCode(sieuthi) || `REV_${results.length + 1}`;
    const boss = matchedBoss?.boss ? matchedBoss.boss.replace(/^Boss\s+/i, '').trim() : '';
    const kenh = matchedBoss?.kenh ? parseChannelValue(matchedBoss.kenh) : inferKenhFromSieuThiName(sieuthi);
    const tinhMoi = matchedBoss?.tinhMoi || '-';
    const phanLoaiShop = matchedBoss?.phanLoaiShop || '-';

    results.push({
      stt: results.length + 1,
      rank: results.length + 1,
      id: mst,
      sieuthi,
      tinh: effectiveTinh,
      target: Math.round(target * 100) / 100,
      achieved: Math.round(achieved * 100) / 100,
      rate: Number(rate.toFixed(1)),
      dtThuc: dataType === 'doanhthu' ? (dtThuc || 0) : undefined,
      dtQd: dataType === 'doanhthu' ? (dtQd || 0) : undefined,
      kenh,
      boss,
      tinhMoi,
      phanLoaiShop,
      categoryMap: {},
    });
  }

  return results;
}

/**
 */
export function getFormattedNow(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return `${hours}:${minutes}:${seconds} NGÀY ${day}/${month}/${year}`;
}

export function formatVND(amount: number): string {
  if (amount >= 1000) {
    return (amount / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' Tỷ';
  }
  return amount.toLocaleString('vi-VN') + ' Tr';
}

/**
 * Formats a DTQĐ TB value as a whole number with Vietnamese thousands
 * grouping (e.g. 10297.80704 -> "10.297 tỷ") — drops the fractional part
 * entirely rather than rounding, so the column stays short and consistent.
 */
export function formatDtQdTb(amount: number): string {
  if (!amount) return '-';
  return `${Math.floor(amount).toLocaleString('vi-VN')} tỷ`;
}

export function formatPercent(rate: number): string {
  return `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`;
}

/**
 * Normalizes Vietnamese string for accent-insensitive and Unicode-safe comparison (NFC/NFD).
 */
export function normalizeVietnameseForMatch(str: string = ''): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Extracts the numeric MST (store code) from a store string.
 * Supports "1165 - ĐML_LAN_BLU...", "(1165)", "... - 1165 - ...", etc.
 */
export function extractMst(sieuthi: string = ''): string | null {
  if (!sieuthi) return null;
  const str = sieuthi.trim();

  // 1. Chuỗi bắt đầu bằng mã số: "1165 - ĐML_LAN_BLU...", "1165 - ...", "1165"
  // Phải có ký tự phân cách (-, –, /, :) hoặc khoảng trắng theo sau hoặc là toàn bộ chuỗi
  const mLeading = str.match(/^(\d{2,6})(?:\s*[-–/:]|\s+|$)/);
  if (mLeading) return mLeading[1];

  // 2. Mã số trong ngoặc đơn hoặc ngoặc vuông: "(1165)", "[1165]"
  const mBracket = str.match(/[\(\[]\s*(\d{2,6})\s*[\)\]]/);
  if (mBracket) return mBracket[1];

  // 3. Đứng sau nhãn rõ ràng: "MST: 1165", "Mã kho: 1165", "Mã ST: 1165"
  const mLabel = str.match(/(?:MST|MÃ\s*(?:KHO|ST|SIÊU\s*THỊ)|MA\s*(?:KHO|ST|SIEU\s*THI))[\s:]*(\d{2,6})(?!\d)/i);
  if (mLabel) return mLabel[1];

  // 4. Mã số đứng riêng lẻ giữa 2 dấu gạch nối (ví dụ: "ĐML_LAN_BLU - 1165 - Nguyễn Hữu Thọ")
  const mBetweenDashes = str.match(/(?:^|\s)[-–]\s*(\d{2,6})\s*[-–](?:\s|$)/);
  if (mBetweenDashes) return mBetweenDashes[1];

  return null;
}

/**
 * Extracts store warehouse code (ví dụ: "DML_LAN_BLU", "TGD_CTH_NKI", "DML_AGI_CDO").
 */
export function extractStoreCode(sieuthi: string = ''): string | null {
  if (!sieuthi) return null;
  const m = sieuthi.match(/([a-zđA-ZĐ]{3}_[a-z0-9A-Z0-9]{2,5}_[a-z0-9A-Z0-9]{2,5})/i);
  return m ? m[1].toUpperCase().replace(/Đ/g, 'D') : null;
}

/**
 * Dò tìm chính xác siêu thị trong danh sách file BOSS:
 * Ưu tiên 1: Dò tìm bằng MST (Mã Siêu Thị / Mã Kho từ Cột I)
 * Ưu tiên 2: Dò tìm bằng Mã kho (Store Code ví dụ: DML_LAN_BLU, TGD_CTH_NKI)
 * Ưu tiên 3: Dò tìm bằng Tên Siêu Thị chuẩn hóa
 */
interface BossAssignmentIndex {
  byMst: Map<string, BossAssignmentRecord>;
  byCode: Map<string, BossAssignmentRecord>;
  byNormName: Map<string, BossAssignmentRecord>;
}

const bossIndexCache = new WeakMap<BossAssignmentRecord[], BossAssignmentIndex>();

function getBossAssignmentIndex(bossAssignments: BossAssignmentRecord[]): BossAssignmentIndex {
  const cached = bossIndexCache.get(bossAssignments);
  if (cached) return cached;

  const byMst = new Map<string, BossAssignmentRecord>();
  const byCode = new Map<string, BossAssignmentRecord>();
  const byNormName = new Map<string, BossAssignmentRecord>();

  bossAssignments.forEach((b) => {
    const mstDirect = b.mst ? b.mst.trim() : '';
    if (mstDirect && !byMst.has(mstDirect)) byMst.set(mstDirect, b);
    const mstFromSieuthi = extractMst(b.sieuthi);
    if (mstFromSieuthi && !byMst.has(mstFromSieuthi)) byMst.set(mstFromSieuthi, b);

    const code = extractStoreCode(b.sieuthi) || extractStoreCode(b.sieuthiBase || '') || extractStoreCode(b.sieuthiNgan || '');
    if (code) {
      const existing = byCode.get(code);
      const isLuuDong = String(b.kenh || '').toUpperCase().includes('LƯU ĐỘNG') || String(b.kenh || '').toUpperCase().includes('LUU DONG');
      if (!existing || (!isLuuDong && String(existing.kenh || '').toUpperCase().includes('LƯU ĐỘNG'))) {
        byCode.set(code, b);
      }
    }

    const normB = normalizeVietnameseForMatch(b.sieuthi);
    if (normB && !byNormName.has(normB)) byNormName.set(normB, b);
    const normBase = normalizeVietnameseForMatch(b.sieuthiBase || '');
    if (normBase && !byNormName.has(normBase)) byNormName.set(normBase, b);
    const normNgan = normalizeVietnameseForMatch(b.sieuthiNgan || '');
    if (normNgan && !byNormName.has(normNgan)) byNormName.set(normNgan, b);
  });

  const index: BossAssignmentIndex = { byMst, byCode, byNormName };
  bossIndexCache.set(bossAssignments, index);
  return index;
}

export function findBossAssignmentRecord(
  storeSieuThi: string = '',
  bossAssignments: BossAssignmentRecord[] = []
): BossAssignmentRecord | null {
  if (!storeSieuThi || !bossAssignments || bossAssignments.length === 0) return null;

  const raw = storeSieuThi.trim();
  const index = getBossAssignmentIndex(bossAssignments);
  const storeCodeKey = extractStoreCode(raw);

  // 1. Dò tìm chính xác bằng MST (Mã Siêu Thị / Mã Kho)
  const storeMst = extractMst(raw);
  if (storeMst) {
    const matchByMst = index.byMst.get(storeMst);
    if (matchByMst) {
      // Kiểm tra xung đột tỉnh: Nếu chuỗi raw có mã kho rõ ràng (ví dụ chứa "_CMA_") mà MST lại trỏ sang tỉnh khác (ví dụ "Long An"),
      // thì MST này bị xung đột do số nhà, ưu tiên dò theo mã kho.
      if (storeCodeKey) {
        const rawProv = inferProvinceFromStoreName(raw);
        const mstProv = matchByMst.tinh || inferProvinceFromStoreName(matchByMst.sieuthi);
        if (rawProv !== 'Khác' && mstProv !== 'Khác' && rawProv !== mstProv) {
          const matchByCode = index.byCode.get(storeCodeKey);
          if (matchByCode) return matchByCode;
        } else {
          return matchByMst;
        }
      } else {
        return matchByMst;
      }
    }
  }

  // 2. Dò tìm chính xác bằng Mã Kho (ví dụ: DML_LAN_BLU, TGD_CTH_NKI, TGD_CMA_CMA)
  if (storeCodeKey) {
    const matchByCode = index.byCode.get(storeCodeKey);
    if (matchByCode) return matchByCode;
  }

  // 3. Dò tìm bằng chuỗi tên chuẩn hóa — khớp chính xác trước (O(1))
  const normStore = normalizeVietnameseForMatch(raw);
  const matchByExactName = index.byNormName.get(normStore);
  if (matchByExactName) return matchByExactName;

  // 3b. Fallback cuối: so khớp một phần (substring)
  if (normStore.length > 6) {
    const matchByName = bossAssignments.find((b) => {
      const normB = normalizeVietnameseForMatch(b.sieuthi);
      return normB.includes(normStore) || normStore.includes(normB);
    });
    if (matchByName) return matchByName;
  }

  return null;
}

export function findByExactMst(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[]
): BossAssignmentRecord | null {
  return findBossAssignmentRecord(storeSieuThi, bossAssignments);
}

/**
 * Matches a store against bossAssignments (from the uploaded BOSS file)
 * and returns the exact assigned Boss name in Tên_mãUser format.
 */
export function getBossForStore(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[] = [],
  fallbackBoss: string = 'Chưa phân công'
): string {
  const rawFallback = (fallbackBoss || '').replace(/^Boss\s+/i, '').trim();

  const match = findBossAssignmentRecord(storeSieuThi, bossAssignments);
  if (match && match.boss) {
    const cleanMatchedBoss = match.boss.replace(/^Boss\s+/i, '').trim();
    if (cleanMatchedBoss) return cleanMatchedBoss;
  }

  return rawFallback || 'Chưa phân công';
}

/**
 * Helper to parse raw channel text string into standard Channel type.
 */
export function parseChannelValue(rawVal: string = ''): Channel | string {
  const u = normVN(rawVal || '').toUpperCase().trim();
  if (u === 'OFF' || u.includes('OFFLINE')) return 'OFF';
  if (u.includes('LƯU ĐỘNG') || u.includes('LUU DONG') || u.includes('LUUDONG')) return 'LƯU ĐỘNG';
  if (u.includes('TOPZONE') || u.includes('TOP ZONE') || u.includes('TZ') || u.includes('AAR')) return 'TopZone';
  if (u.includes('DMM') || u.includes('ĐMM')) return 'DMM';
  if (u.includes('DMS') || u.includes('ĐMS')) return 'DMS';
  if (u.includes('TGD') || u.includes('TGDD')) return 'TGD';
  if (u.includes('DML') || u.includes('ĐML')) return 'DML';
  return rawVal.trim() || 'DML';
}

/**
 * Display label for a Channel value.
 */
export function getChannelLabel(kenh: string = ''): string {
  if (kenh === 'LuuDong') return 'LƯU ĐỘNG';
  return kenh;
}

/**
 * Lấy chính xác KÊNH từ file BOSS (Cột N) thông qua dò tìm MST / Mã kho.
 * Tuyệt đối không đoán kênh từ mã kho hay tên siêu thị.
 */
export function getChannelForStore(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[] = [],
  fallbackKenh: Channel | string = 'DML'
): Channel | string {
  if (!storeSieuThi || !bossAssignments || bossAssignments.length === 0) {
    return fallbackKenh;
  }

  const match = findBossAssignmentRecord(storeSieuThi, bossAssignments);
  if (match && match.kenh) {
    return parseChannelValue(match.kenh);
  }

  return fallbackKenh;
}

/**
 * Channel priority rank order for sorting:
 * 1: ĐML
 * 2: ĐMM
 * 3: ĐMS
 * 4: TGD
 * 5: Lưu Động
 * 6: Topzone / TZ
 * 7: Other
 */
export function getChannelRank(kenh: string = ''): number {
  const k = normVN(kenh || '').toUpperCase().trim();
  if (k === 'DML' || k.includes('DML') || k.includes('ĐML')) return 1;
  if (k === 'DMM' || k.includes('DMM') || k.includes('ĐMM')) return 2;
  if (k === 'DMS' || k.includes('DMS') || k.includes('ĐMS')) return 3;
  if (k === 'TGD' || k.includes('TGD') || k.includes('TGDD')) return 4;
  if (k.includes('LƯU ĐỘNG') || k.includes('LUU DONG')) return 5;
  if (k.includes('TOPZONE') || k.includes('TOP ZONE') || k === 'TZ' || k.includes('AAR')) return 6;
  return 7;
}

/**
 * Helper to match a store's name/code against bossAssignments (from file BOSS)
 * and return its DTQĐ TB 5T2026 value (e.g. "28,451", "11,721", "9,252").
 */
export function getDtQdTbForStore(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[] = []
): string {
  if (!storeSieuThi || !bossAssignments || bossAssignments.length === 0) {
    return '-';
  }

  const match = findByExactMst(storeSieuThi, bossAssignments);
  if (match && match.dtQdTb !== undefined && match.dtQdTb !== null && match.dtQdTb !== '') {
    return String(match.dtQdTb);
  }

  return '-';
}

/**
 * Helper to match a store's name/code against bossAssignments (from file BOSS)
 * and return its Phân Loại Shop (e.g. "<3 TỶ", "3-5 TỶ", ...).
 */
export function getPhanLoaiShopForStore(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[] = []
): string {
  if (!storeSieuThi || !bossAssignments || bossAssignments.length === 0) {
    return '-';
  }

  const match = findByExactMst(storeSieuThi, bossAssignments);
  if (match && match.phanLoaiShop) {
    return match.phanLoaiShop;
  }

  return '-';
}

/**
 * Helper to match a store's name/code against bossAssignments (from file BOSS)
 * and return its Tỉnh MỚI 2026 (cột H — tỉnh sáp nhập mới).
 */
export function getTinhMoiForStore(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[] = []
): string {
  if (!storeSieuThi || !bossAssignments || bossAssignments.length === 0) {
    return '-';
  }

  const match = findByExactMst(storeSieuThi, bossAssignments);
  if (match && match.tinhMoi) {
    return match.tinhMoi;
  }

  return '-';
}

/**
 * Lấy chính xác TỈNH từ file BOSS thông qua dò tìm MST / Mã kho / Tên siêu thị.
 */
export function getProvinceForStore(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[] = [],
  fallbackProvince: string = 'Khác'
): string {
  if (!storeSieuThi) return fallbackProvince;
  if (bossAssignments && bossAssignments.length > 0) {
    const match = findBossAssignmentRecord(storeSieuThi, bossAssignments);
    if (match && match.tinh) {
      return match.tinh;
    }
  }
  const inferred = inferProvinceFromStoreName(storeSieuThi);
  return (fallbackProvince && fallbackProvince !== 'Khác') ? fallbackProvince : (inferred !== 'Khác' ? inferred : fallbackProvince);
}

/**
 * Lấy chính xác MÃ KHO (Store Code hoặc MST) từ file BOSS.
 */
export function getStoreCodeForStore(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[] = []
): string {
  if (!storeSieuThi) return '';
  if (bossAssignments && bossAssignments.length > 0) {
    const match = findBossAssignmentRecord(storeSieuThi, bossAssignments);
    if (match) {
      const code = extractStoreCode(match.sieuthi) || match.mst;
      if (code) return code;
    }
  }
  return extractStoreCode(storeSieuThi) || extractMst(storeSieuThi) || '';
}

/**
 * Đồng bộ toàn bộ thông tin chuẩn: Mã kho, BOSS, Kênh, Tỉnh mới, Tỉnh
 * dựa vào dữ liệu file BOSS (bossAssignments).
 */
export function enrichStoreWithBossAssignments<T extends {
  sieuthi: string;
  tinh?: string;
  boss?: string;
  kenh?: any;
  tinhMoi?: string;
  phanLoaiShop?: string;
  storeCode?: string;
  mst?: string;
  dtQdTb?: any;
}>(store: T, bossAssignments: BossAssignmentRecord[]): T {
  if (!store || !bossAssignments || bossAssignments.length === 0) return store;

  const match = findBossAssignmentRecord(store.sieuthi, bossAssignments);
  if (!match) return store;

  const newTinh = match.tinh || store.tinh || 'Khác';
  const newBoss = match.boss ? match.boss.replace(/^Boss\s+/i, '').trim() : (store.boss || 'Chưa phân công');
  const newKenh = match.kenh ? (parseChannelValue(match.kenh) as any) : store.kenh;
  const newTinhMoi = match.tinhMoi || store.tinhMoi || '-';
  const newPhanLoai = match.phanLoaiShop || store.phanLoaiShop || '-';
  const newStoreCode = extractStoreCode(match.sieuthi) || match.mst || (store as any).storeCode;
  const newMst = match.mst || (store as any).mst;

  if (
    store.tinh === newTinh &&
    store.boss === newBoss &&
    store.kenh === newKenh &&
    store.tinhMoi === newTinhMoi &&
    store.phanLoaiShop === newPhanLoai &&
    (store as any).storeCode === newStoreCode &&
    (store as any).mst === newMst
  ) {
    return store;
  }

  return {
    ...store,
    tinh: newTinh,
    boss: newBoss,
    kenh: newKenh,
    tinhMoi: newTinhMoi,
    phanLoaiShop: newPhanLoai,
    storeCode: newStoreCode,
    mst: newMst,
    dtQdTb: match.dtQdTb || (store as any).dtQdTb,
  };
}

export function parseDtQdTbNum(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Strips leading numeric store code prefix from a store string for display.
 * Example: "908 - ĐML_AGI_LXU - 129 Trần Hưng Đạo" => "ĐML_AGI_LXU - 129 Trần Hưng Đạo"
 * Example: "1760 - ĐML_AGI_LXU - Cái Sao" => "ĐML_AGI_LXU - Cái Sao"
 */
export function formatStoreDisplayName(sieuthi: string = ''): string {
  if (!sieuthi) return '';
  return sieuthi.replace(/^\d{1,6}\s*-\s*/, '').trim();
}

/**
 * Extracts ONLY the warehouse code (mã kho / short code) from a store string.
 * Example: "908 - ĐML_AGI_LXU - 129 Trần Hưng Đạo" => "ĐML_AGI_LXU"
 * Example: "ĐML_STR_STR - 99 Hùng Vương" => "ĐML_STR_STR"
 * Example: "ĐML_LAN_BLU - Nguyễn Hữu Thọ" => "ĐML_LAN_BLU"
 * Example: "8853 - ĐMS_LAN_DHU - Mỹ Quý Tây" => "ĐMS_LAN_DHU"
 * Example: "8853 - Mỹ Quý Tây" => "8853"
 */
export function getStoreCodeOnly(sieuthi: string = ''): string {
  if (!sieuthi) return '';
  const cleaned = sieuthi.trim();
  const parts = cleaned.split(/\s*-\s*/);
  if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
    return parts[1] || parts[0];
  }
  if (parts.length >= 2) {
    return parts[0];
  }
  return cleaned;
}

/**
 * Extracts ONLY the friendly store name / street name / location from a store string.
 * Example: "ĐML_STR_STR - 99 Hùng Vương" => "99 Hùng Vương"
 * Example: "ĐML_LAN_BLU - Nguyễn Hữu Thọ" => "Nguyễn Hữu Thọ"
 * Example: "8853 - ĐMS_LAN_DHU - Mỹ Quý Tây" => "Mỹ Quý Tây"
 * Example: "908 - ĐML_AGI_LXU - 129 Trần Hưng Đạo" => "129 Trần Hưng Đạo"
 */
export function getStoreShortName(sieuthi: string = ''): string {
  if (!sieuthi) return '';
  const parts = sieuthi.trim().split(/\s*-\s*/);
  if (parts.length >= 2) {
    return parts[parts.length - 1].trim();
  }
  return sieuthi.trim();
}

/**
 * Helper to calculate total DTQĐ TB 5T2026 for a given province directly from bossAssignments.
 */
export function getDtQdTbForProvince(
  provinceName: string,
  bossAssignments: BossAssignmentRecord[] = []
): number {
  if (!provinceName || !bossAssignments || bossAssignments.length === 0) return 0;
  const normProvince = normalizeVietnameseForMatch(provinceName);

  const matchingBossRecords = bossAssignments.filter((b) => {
    if (!b.tinh) return false;
    const kenhU = normVN((b.kenh || '').toString()).toUpperCase();
    if (kenhU === 'OFF' || kenhU.includes('LƯU ĐỘNG') || kenhU.includes('LUU DONG') || kenhU === 'LUUDONG') {
      return false;
    }
    const normB = normalizeVietnameseForMatch(b.tinh);
    return normB === normProvince || normB.includes(normProvince) || normProvince.includes(normB);
  });

  return matchingBossRecords.reduce((sum, b) => sum + parseDtQdTbNum(b.dtQdTb), 0);
}

/**
 * %HT (Realtime) vs %DKHT (Luỹ Kế) completion rate for a target/achieved pair.
 * Realtime uses the plain achieved/target ratio ("% HT Target Tháng").
 * Luỹ Kế projects the full month from accumulated data instead
 * ("% HT Dự Kiến"): ((achieved / daysElapsed) * daysInMonth) / target * 100.
 */
export function computeCompletionRate(
  target: number,
  achieved: number,
  timeMode: TimeMode,
  daysInMonth?: number,
  daysElapsed?: number
): number {
  if (target <= 0) return 0;
  if (timeMode !== 'luyke') {
    return (achieved / target) * 100;
  }
  const dim = daysInMonth || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const de = daysElapsed || new Date().getDate();
  if (de <= 0) return 0;
  return ((achieved / de) * dim / target) * 100;
}

/**
 * Helper to safely extract category data from StoreRecord with smart canonical alias fallback.
 */
type CategoryData = { target: number; achieved: number; rate: number };

const ZERO_CATEGORY_DATA: CategoryData = { target: 0, achieved: 0, rate: 0 };

/**
 * Cache kết quả tra cứu theo TỪNG categoryMap (WeakMap nên tự giải phóng khi
 * dữ liệu siêu thị bị thay thế). categoryMap chỉ được ghi trong lúc parse, không
 * bao giờ bị sửa sau khi render, nên cache luôn khớp dữ liệu.
 *
 * Vì sao cần: nhánh "không tìm thấy" của resolveCategoryData quét toàn bộ
 * ~38 key và gọi canonicalize/normalize cho từng key rồi trả về {0,0,0} —
 * đo được 92,87 µs/lần so với 0,02 µs khi trúng (đắt gấp 4.410 lần). Mà
 * "không tìm thấy" lại là trường hợp PHỔ BIẾN: không siêu thị nào có đủ 38
 * ngành hàng. Cache biến nó thành một lần duy nhất cho mỗi cặp (siêu thị,
 * ngành hàng).
 *
 * Lưu ý: đối tượng trả về được dùng chung, toàn bộ code hiện chỉ ĐỌC
 * .target/.achieved/.rate — không được sửa giá trị trả về.
 */
const categoryDataCache = new WeakMap<object, Map<string, CategoryData>>();

export function getCategoryData(s: StoreRecord, cName: string): CategoryData {
  if (!s || !s.categoryMap) return ZERO_CATEGORY_DATA;
  let perStore = categoryDataCache.get(s.categoryMap);
  if (!perStore) {
    perStore = new Map<string, CategoryData>();
    categoryDataCache.set(s.categoryMap, perStore);
  }
  const cached = perStore.get(cName);
  if (cached !== undefined) return cached;
  const resolved = resolveCategoryData(s, cName);
  perStore.set(cName, resolved);
  return resolved;
}

function resolveCategoryData(
  s: StoreRecord,
  cName: string
): { target: number; achieved: number; rate: number } {
  if (!s || !s.categoryMap) return ZERO_CATEGORY_DATA;

  // 1. Direct exact match
  if (s.categoryMap[cName]) {
    const item = s.categoryMap[cName];
    return {
      target: item.target || 0,
      achieved: item.achieved || 0,
      rate: item.rate || 0,
    };
  }

  // 2. Canonicalized name match
  const canonical = canonicalizeCategoryName(cName);
  if (s.categoryMap[canonical]) {
    const item = s.categoryMap[canonical];
    return {
      target: item.target || 0,
      achieved: item.achieved || 0,
      rate: item.rate || 0,
    };
  }

  // 3. Match against all keys in categoryMap via canonical/normalized comparison
  const keys = Object.keys(s.categoryMap);
  const targetNorm = normalizeHeaderText(cName);
  const canonicalNorm = normalizeHeaderText(canonical);

  for (const k of keys) {
    const kCanonical = canonicalizeCategoryName(k);
    if (
      kCanonical === canonical ||
      kCanonical === cName ||
      normalizeHeaderText(k) === targetNorm ||
      normalizeHeaderText(kCanonical) === canonicalNorm
    ) {
      const item = s.categoryMap[k];
      return {
        target: item.target || 0,
        achieved: item.achieved || 0,
        rate: item.rate || 0,
      };
    }
  }

  return ZERO_CATEGORY_DATA;
}

export interface DataFreshnessInfo {
  isOutdated: boolean;
  ageMinutes: number;
  displayText: string;
  badgeText?: string;
}

/**
 * Checks whether data lastUpdated timestamp is fresh or outdated.
 * - For Realtime: Outdated if older than maxAllowedMinutes (default 60 mins).
 * - For Luỹ Kế: Cumulative data is daily. If updated date = today (same calendar date) => NO warning.
 *   Only triggers warning if updated date is before today (>= 1 day old).
 */
export function checkDataFreshness(
  lastUpdated?: string,
  maxAllowedMinutes: number = 60,
  timeMode?: string
): DataFreshnessInfo {
  if (!lastUpdated || !lastUpdated.trim()) {
    return { isOutdated: true, ageMinutes: 999999, displayText: 'Chưa cập nhật', badgeText: 'Chưa cập nhật' };
  }

  const cleaned = lastUpdated.replace(/THỜI GIAN ĐẾN:\s*/i, '').trim();

  try {
    // Extract time (HH:mm[:ss]) and date (DD/MM[/YYYY])
    const timeMatch = cleaned.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    const dateMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);

    const now = new Date();
    let day = now.getDate();
    let month = now.getMonth();
    let year = now.getFullYear();

    if (dateMatch) {
      day = parseInt(dateMatch[1], 10);
      month = parseInt(dateMatch[2], 10) - 1;
      if (dateMatch[3]) {
        year = dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3], 10) : parseInt(dateMatch[3], 10);
      }
    }

    // Special logic for Luỹ Kế:
    // If timeMode === 'luyke':
    // If updated date = today (same day, month, year) => NOT outdated (no warning).
    // If updated date is before today => outdated (warning).
    if (timeMode === 'luyke') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const updatedDayStart = new Date(year, month, day).getTime();
      const diffDays = Math.round((todayStart - updatedDayStart) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        // Updated today (or future date) -> fresh, NO warning!
        return { isOutdated: false, ageMinutes: 0, displayText: cleaned, badgeText: '' };
      } else {
        // 1 or more days old -> warning
        return {
          isOutdated: true,
          ageMinutes: diffDays * 24 * 60,
          displayText: cleaned,
          badgeText: diffDays === 1 ? 'Cũ > 1 ngày' : `Cũ > ${diffDays} ngày`,
        };
      }
    }

    // Default Realtime mode logic (checked by minutes, default 60 mins):
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
      seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    }

    const updatedDate = new Date(year, month, day, hours, minutes, seconds);
    const diffMs = now.getTime() - updatedDate.getTime();
    const ageMinutes = Math.floor(diffMs / (1000 * 60));

    // Outdated if older than maxAllowedMinutes (> 1 hour) or negative due to clock skew
    const isOutdated = ageMinutes > maxAllowedMinutes || ageMinutes < -120;
    const badgeText = ageMinutes > 60 ? `Cũ > ${Math.floor(ageMinutes / 60)}h` : 'Cũ > 1h';
    return { isOutdated, ageMinutes, displayText: cleaned, badgeText };
  } catch (err) {
    console.warn('Error checking data freshness:', err);
  }

  return { isOutdated: false, ageMinutes: 0, displayText: cleaned, badgeText: '' };
}

/**
 * Formats raw boss string (e.g. "Thành_106654", "53136", "Sơn_21707") into user tag ("@106654", "@53136", "@21707").
 */
export function formatBossTag(rawBoss: string = ''): string {
  if (!rawBoss) return '';
  const trimmed = rawBoss.trim().replace(/^Boss\s+/i, '');
  if (!trimmed || trimmed === 'Chưa phân công') return '';
  if (trimmed.includes('_')) {
    const parts = trimmed.split('_');
    const idPart = parts[parts.length - 1]?.trim();
    if (idPart) return `@${idPart}`;
  }
  if (/^\d+$/.test(trimmed)) {
    return `@${trimmed}`;
  }
  return `@${trimmed}`;
}

/**
 * Formats a single store ranking remark line based on RemarkDisplayMode:
 * - 'user': 🥇 #1. @53136
 * - 'sieuthi': 🥇 #1. ĐMS_AGI_CPH - Bình Thủy: 11 / 38 (29%)
 * - 'sieuthi_user': 🥇 #1. ĐMS_AGI_CPH - Bình Thủy: 11 / 38 (29%) @53136
 * - 'no_tag_top': như 'user', nhưng dòng thuộc nhóm TOP (group: 'top') không
 *   @tag mà chỉ in tên Boss dạng "Tên_User" (vd: Luân_55810) để tránh ping
 *   không cần thiết; dòng thuộc nhóm BOT (group: 'bot') vẫn @tag như bình thường.
 */
export function formatStoreRemarkLine(params: {
  prefix: string; // e.g. "🥇 #1" or "🔻 #73"
  storeName: string;
  bossTag: string;
  rawBoss?: string; // chuỗi Boss gốc "Tên_mãUser", dùng riêng cho mode 'no_tag_top'
  valuePart: string;
  rate: number;
  mode?: RemarkDisplayMode;
  group?: 'top' | 'bot'; // dòng này thuộc nhóm TOP hay BOT — chỉ có ý nghĩa với mode 'no_tag_top'
}): string {
  const { prefix, storeName, bossTag, rawBoss = '', valuePart, rate, mode = 'user', group = 'top' } = params;
  const tag = bossTag ? (bossTag.startsWith('@') ? bossTag : `@${bossTag}`) : '';
  const cleanPrefix = prefix.trim();
  const prefixWithDot = cleanPrefix.endsWith('.') ? cleanPrefix : `${cleanPrefix}.`;

  if (mode === 'no_tag_top' && group === 'top') {
    const nameId = rawBoss.trim() && rawBoss.trim() !== 'Chưa phân công' ? rawBoss.trim() : '';
    return nameId ? `${prefixWithDot} ${nameId}` : `${prefixWithDot} ${storeName}: ${valuePart} (${Math.round(rate)}%)`;
  }

  if (mode === 'user' || mode === 'no_tag_top') {
    return tag ? `${prefixWithDot} ${tag}` : `${prefixWithDot} ${storeName}: ${valuePart} (${Math.round(rate)}%)`;
  }

  if (mode === 'sieuthi') {
    return `${prefixWithDot} ${storeName}: ${valuePart} (${Math.round(rate)}%)`;
  }

  // mode === 'sieuthi_user'
  return tag
    ? `${prefixWithDot} ${storeName}: ${valuePart} (${Math.round(rate)}%) ${tag}`
    : `${prefixWithDot} ${storeName}: ${valuePart} (${Math.round(rate)}%)`;
}

/**
 * Parses and standardizes date cell values from Excel to dd/mm/yyyy
 */
export function parseExcelDate(val: any): string {
  if (val === null || val === undefined) return '';

  let d = 0;
  let m = 0;
  let y = '';

  if (val instanceof Date) {
    d = val.getDate();
    m = val.getMonth() + 1;
    y = String(val.getFullYear());
  } else {
    const str = String(val).trim();
    if (!str) return '';

    // Match d/m/yyyy, dd/mm/yyyy, d-m-yyyy, dd-mm-yyyy, d/m/yy, dd/mm/yy (allow optional time e.g. 4/9/25 0:00)
    const slashMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+.*)?$/);
    if (slashMatch) {
      d = parseInt(slashMatch[1], 10);
      m = parseInt(slashMatch[2], 10);
      let yearPart = slashMatch[3];
      if (yearPart.length === 2) {
        yearPart = Number(yearPart) < 50 ? `20${yearPart}` : `19${yearPart}`;
      }
      y = yearPart;
    } else {
      // Match yyyy-mm-dd or yyyy/mm/dd or yy-mm-dd
      const isoMatch = str.match(/^(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+.*)?$/);
      if (isoMatch) {
        let yearPart = isoMatch[1];
        if (yearPart.length === 2) {
          yearPart = Number(yearPart) < 50 ? `20${yearPart}` : `19${yearPart}`;
        }
        y = yearPart;
        m = parseInt(isoMatch[2], 10);
        d = parseInt(isoMatch[3], 10);
      } else {
        // Match Excel numeric serial date (e.g. 45901)
        const num = Number(str);
        if (!isNaN(num) && num > 20000 && num < 80000) {
          const utc_days = Math.floor(num - 25569);
          const utc_value = utc_days * 86400;
          const date_info = new Date(utc_value * 1000);
          d = date_info.getUTCDate();
          m = date_info.getUTCMonth() + 1;
          y = String(date_info.getUTCFullYear());
        } else {
          // Fallback: check if matches d/m/yy or similar anywhere in string
          const fallbackMatch = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
          if (fallbackMatch) {
            d = parseInt(fallbackMatch[1], 10);
            m = parseInt(fallbackMatch[2], 10);
            let yearPart = fallbackMatch[3];
            if (yearPart.length === 2) {
              yearPart = Number(yearPart) < 50 ? `20${yearPart}` : `19${yearPart}`;
            }
            y = yearPart;
          } else {
            return str;
          }
        }
      }
    }
  }

  // If day was interpreted as 9 and month is 1..12 due to Excel/system regional setting swapping M/D,
  // whereas the report data is for September (month 9) for days 1..12:
  if (d === 9 && m >= 1 && m <= 12 && m !== 9) {
    d = m;
    m = 9;
  }

  if (y && y.length === 2) {
    y = Number(y) < 50 ? `20${y}` : `19${y}`;
  }

  const dStr = String(d).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  return `${dStr}/${mStr}/${y}`;
}

/**
 * Parses Excel rows for "Doanh thu cùng kỳ năm"
 * Expected columns:
 * A: MÃ KHO
 * B: NGÀY (dd/mm/yyyy)
 * C: DOANH THU
 * D: DOANH THU QĐ
 * Maps MÃ KHO to store name, province, channel, and boss from bossAssignments.
 */
export function parseRevenueCungKyExcelData(
  rawRows: any[][],
  bossAssignments: BossAssignmentRecord[] = []
): { records: RevenueCungKyRecord[]; validation: { isValid: boolean; error?: string } } {
  if (!rawRows || rawRows.length < 2) {
    return {
      records: [],
      validation: { isValid: false, error: 'File Excel không có dữ liệu hoặc chỉ có 1 dòng tiêu đề.' },
    };
  }

  let headerRowIdx = -1;
  let colMaKho = 0;
  let colNgay = 1;
  let colDoanhThu = 2;
  let colDoanhThuQd = 3;

  for (let r = 0; r < Math.min(5, rawRows.length); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    let foundMaKho = -1;
    let foundNgay = -1;
    let foundDt = -1;
    let foundDtQd = -1;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim().toLowerCase().normalize('NFC');
      if (
        cell.includes('mã siêu thị') ||
        cell.includes('ma sieu thi') ||
        cell.includes('mã st') ||
        cell.includes('ma st') ||
        cell.includes('mã kho') ||
        cell.includes('ma kho') ||
        cell.includes('siêu thị') ||
        cell.includes('sieu thi') ||
        cell.includes('kho') ||
        cell === 'mst' ||
        cell === 'st'
      ) {
        foundMaKho = c;
      } else if (cell.includes('ngày') || cell.includes('ngay') || cell === 'date') {
        foundNgay = c;
      } else if (
        cell.includes('doanh thu q') ||
        cell.includes('dt q') ||
        cell.includes('quy đổi') ||
        cell.includes('quy doi') ||
        cell.includes('qđ') ||
        cell.includes('qd')
      ) {
        foundDtQd = c;
      } else if (cell.includes('doanh thu') || cell === 'dt' || cell.includes('thực') || cell.includes('thuc')) {
        foundDt = c;
      }
    }

    if (foundMaKho !== -1 && (foundNgay !== -1 || foundDt !== -1)) {
      headerRowIdx = r;
      colMaKho = foundMaKho;
      colNgay = foundNgay !== -1 ? foundNgay : 1;
      colDoanhThu = foundDt !== -1 ? foundDt : 2;
      colDoanhThuQd = foundDtQd !== -1 ? foundDtQd : (foundDt === 2 ? 3 : (colDoanhThu === 2 ? 3 : 3));
      break;
    }
  }

  const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 1;

  // Build BOSS lookup map by MST and store codes
  const bossMap = new Map<string, BossAssignmentRecord>();
  bossAssignments.forEach((b) => {
    if (b.mst) {
      const raw = String(b.mst).trim();
      bossMap.set(raw, b);
      bossMap.set(raw.toLowerCase(), b);
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) {
        bossMap.set(String(parsed), b);
      }
    }
    const fromSieuthi = extractMst(b.sieuthi);
    if (fromSieuthi) {
      const raw = fromSieuthi.trim();
      if (!bossMap.has(raw)) bossMap.set(raw, b);
      if (!bossMap.has(raw.toLowerCase())) bossMap.set(raw.toLowerCase(), b);
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && !bossMap.has(String(parsed))) {
        bossMap.set(String(parsed), b);
      }
    }
    if (b.maBaseMoi) {
      const raw = String(b.maBaseMoi).trim();
      if (!bossMap.has(raw)) bossMap.set(raw, b);
    }
  });

  const records: RevenueCungKyRecord[] = [];

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rawMaKho = String(row[colMaKho] ?? '').trim();
    const lowerMaKho = rawMaKho.toLowerCase();
    if (
      !rawMaKho ||
      lowerMaKho === 'mã kho' ||
      lowerMaKho === 'ma kho' ||
      lowerMaKho === 'mã siêu thị' ||
      lowerMaKho === 'ma sieu thi' ||
      lowerMaKho === 'mã st' ||
      lowerMaKho === 'siêu thị' ||
      lowerMaKho === 'tổng' ||
      lowerMaKho === 'tong' ||
      lowerMaKho === 'stt'
    ) {
      continue;
    }

    const rawNgay = row[colNgay];
    const ngay = parseExcelDate(rawNgay);

    const parseNum = (v: any) => {
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      if (!v) return 0;
      let s = String(v).trim();
      s = s.replace(/\.0+$/, '').replace(/,0+$/, '');
      s = s.replace(/[,.\s₫đVND]/gi, '').trim();
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    };

    const doanhThu = parseNum(row[colDoanhThu]);
    const doanhThuQd = parseNum(row[colDoanhThuQd]);

    // Map store info from BOSS file
    const cleanMaKho = String(parseInt(rawMaKho, 10) || rawMaKho);
    const matchedBoss = bossMap.get(cleanMaKho) || bossMap.get(rawMaKho) || bossMap.get(rawMaKho.toLowerCase());

    const sieuthi = matchedBoss?.sieuthi || `Mã kho ${rawMaKho}`;
    const tinh = matchedBoss?.tinh || matchedBoss?.tinhMoi || matchedBoss?.tinhBase || '-';
    const kenh = matchedBoss?.kenh || '-';
    const boss = matchedBoss?.boss || '-';
    const phanLoaiShop = matchedBoss?.phanLoaiShop || '-';

    records.push({
      id: `${rawMaKho}_${ngay}_${r}`,
      maKho: rawMaKho,
      ngay,
      doanhThu,
      doanhThuQd,
      sieuthi,
      tinh,
      kenh,
      boss,
      phanLoaiShop,
    });
  }

  if (records.length === 0) {
    return {
      records: [],
      validation: { isValid: false, error: 'Không tìm thấy dòng dữ liệu nào hợp lệ trong file Excel.' },
    };
  }

  return {
    records,
    validation: { isValid: true },
  };
}


