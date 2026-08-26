import { StoreRecord, Channel, RemarkDisplayMode, TimeMode } from '../types';

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

/**
 * Smart Shortening Engine for Category Column Headers.
 * Converts long Vietnamese BI category names into clean, compact abbreviations.
 */
export const getShortCategoryName = (catName: string): string => {
  if (!catName) return '';
  const trimmed = catName.trim();
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

/** What one of the 4 Realtime/Luỹ Kế × Tỉnh/Vùng paste boxes is supposed to receive. */
export interface PasteScopeExpectation {
  timeMode: 'realtime' | 'luyke';
  granularity: 'tinh' | 'sieuthi';
}

/**
 * Validates that pasted text (any of the 4 Realtime/Luỹ Kế Tỉnh/Vùng boxes)
 * actually looks like a store competition table — i.e. has a recognizable
 * TARGET/CHỈ TIÊU and/or ĐẠT/REALTIME/LUỸ KẾ column — before the expensive
 * parse+save pipeline runs. Catches the common "pasted the wrong sheet /
 * wrong box" mistake instead of silently producing 0 or garbage rows.
 *
 * When `expected` is given, also cross-checks the pasted header against
 * which box it landed in — e.g. text carrying a REALTIME column pasted into
 * a Luỹ Kế box, or store-level text (SIÊU THỊ/BOSS columns) pasted into a
 * Tỉnh (province rollup) box — and reports a dedicated mismatch error
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

  for (let i = 0; i < Math.min(50, lines.length); i++) {
    const delimiter = detectDelimiter(lines[i]);
    const cells = splitLine(lines[i], delimiter);
    if (cells.length < 2) continue;
    const normHeaders = cells.map(normalizeHeader);

    const tTarget = normHeaders.some((h) => h.includes('CHI TIEU') || h.includes('KE HOACH') || h.includes('TARGET'));
    const tAchieved = normHeaders.some(
      (h) => h.includes('DAT') || h.includes('REALTIME') || h.includes('LUY KE') || h.includes('DOANH THU') || h.includes('DTLK') || h.includes('SLLK')
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
 * Parses TSV/CSV string pasted directly from Excel or Google Sheets.
 * Handles headers like STT, TỈNH, BOSS, KÊNH, SIÊU THỊ, CHỈ TIÊU, ĐẠT, TỶ LỆ...
 */
export function parsePastedData(text: string, isRealtime: boolean = false): StoreRecord[] {
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

  const kenhFromSieuThi = (sieuthi: string): Channel | string => {
    const u = normVN(sieuthi).toUpperCase();
    if (u.includes('LƯU ĐỘNG') || u.includes('LUU DONG') || u.includes('LUUDONG')) return 'LƯU ĐỘNG';
    if (u.includes('OFF') || u.includes('OFFLINE')) return 'OFF';
    if (u.includes('TOPZONE') || u.includes('TOP ZONE') || u.includes('TZ') || u.includes('AAR')) return 'TopZone';
    if (u.includes('ĐMM') || u.includes('DMM')) return 'DMM';
    if (u.includes('ĐMS') || u.includes('DMS')) return 'DMS';
    if (u.includes('TGD')) return 'TGD';
    return 'DML';
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
      currentCategoryName = cells[0].trim();
      currentCategoryIsRevenue = tAchieved === -1 || !upper[tAchieved].includes('SLLK');
    }
  };

  // Find initial header mapping
  for (let i = 0; i < Math.min(50, lines.length); i++) {
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

    const tinh = tinhRaw;
    const boss = colBoss >= 0 ? cells[colBoss] : 'Boss Quản Lý';

    let rawKenh = colKenh >= 0 ? normVN(cells[colKenh] || '').toUpperCase() : '';
    let kenh: Channel | string;
    if (rawKenh.includes('LƯU ĐỘNG') || rawKenh.includes('LUU DONG') || rawKenh === 'LUUDONG') kenh = 'LƯU ĐỘNG';
    else if (rawKenh.includes('OFF') || rawKenh.includes('OFFLINE')) kenh = 'OFF';
    else if (normVN(sieuthiRaw).toUpperCase().includes('LƯU ĐỘNG') || sieuthiRaw.toUpperCase().includes('LUU DONG') || sieuthiRaw.toUpperCase().includes('LUUDONG')) kenh = 'LƯU ĐỘNG';
    else if (rawKenh.includes('TOPZONE') || rawKenh.includes('TOP ZONE') || rawKenh.includes('TZ') || rawKenh.includes('AAR')) kenh = 'TopZone';
    else if (rawKenh.includes('TGD')) kenh = 'TGD';
    else if (rawKenh.includes('DMM')) kenh = 'DMM';
    else if (rawKenh.includes('DMS')) kenh = 'DMS';
    else if (rawKenh.includes('DML')) kenh = 'DML';
    else kenh = kenhFromSieuThi(sieuthiRaw);

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
 * Parses revenue and installment (trả chậm) pasted TSV/CSV data from BI BCDTST sheet:
 * https://bi.thegioididong.com/khoi-ban-hang-sub?id=8126&tab=bcdtst&rt=1&dm=1
 */
export function parseRevenuePastedData(
  text: string,
  isRealtime: boolean = false,
  dataType: 'doanhthu' | 'tracham' = 'doanhthu'
): StoreRecord[] {
  if (!text || !text.trim()) return [];

  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (rawLines.length === 0) return [];

  const parseNum = (val: string | undefined): number => {
    if (!val) return 0;
    const clean = val.replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const parseRate = (val: string | undefined): number => {
    if (!val) return 0;
    const clean = val.replace(/%/g, '').replace(/,/g, '.').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const kenhFromSieuThi = (sieuthi: string): Channel | string => {
    const u = normVN(sieuthi).toUpperCase();
    if (u.includes('LƯU ĐỘNG') || u.includes('LUU DONG') || u.includes('LUUDONG')) return 'LƯU ĐỘNG';
    if (u.includes('OFF') || u.includes('OFFLINE')) return 'OFF';
    if (u.includes('TOPZONE') || u.includes('TOP ZONE') || u.includes('TZ') || u.includes('AAR')) return 'TopZone';
    if (u.includes('ĐMM') || u.includes('DMM')) return 'DMM';
    if (u.includes('ĐMS') || u.includes('DMS')) return 'DMS';
    if (u.includes('TGD')) return 'TGD';
    return 'DML';
  };

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
    const isPureNumber = (str: string) => /^[0-9.,\s%+-]+$/.test(str.trim());
    const isStore1 = (/\d+\s*-\s*[a-zA-ZÀ-ỹ]/.test(col1) || (col1.length > 5 && (col1.includes('_') || col1.includes('Kho chứa') || /ĐML|DML|ĐMM|DMM|ĐMS|DMS|TGD|TOPZONE/i.test(col1)))) && !isPureNumber(col1);
    const isStore0 = (/\d+\s*-\s*[a-zA-ZÀ-ỹ]/.test(col0) || (col0.length > 5 && (col0.includes('_') || col0.includes('Kho chứa') || /ĐML|DML|ĐMM|DMM|ĐMS|DMS|TGD|TOPZONE/i.test(col0)))) && !isPureNumber(col0);

    if (!isStore1 && !isStore0) continue;

    let tinh = col0;
    let sieuthi = col1;
    let colOffset = 1;

    // In case province column is missing and store is in col0
    if (isStore0 && !isStore1) {
      sieuthi = col0;
      tinh = 'Khác';
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
      // Trả Chậm table structure (BI BCTCK):
      // Col 0: Tỉnh / Tên miền (if offset=1)
      // Col 1: Tên siêu thị
      // Col 2: DT Siêu thị (*) (Base Target / Store Revenue)
      // Col 3: Tổng DT Trả Chậm (*) (Achieved Installment Revenue)
      // Col 4: Tỷ Trọng Trả Chậm (%) (Installment Rate)
      const valDtStore = parseNum(cells[colOffset + 1]);
      const valTraCham = parseNum(cells[colOffset + 2]);
      const valRate = parseRate(cells[colOffset + 3]);

      target = valDtStore;
      achieved = valTraCham;
      rate = valRate > 0 ? valRate : target > 0 ? (achieved / target) * 100 : 0;
    } else {
      // Doanh Thu table structure:
      // Check if Luỹ Kế format (contains +/- DTCK Tháng column, length >= 8) or Realtime format
      const isLuyKeStructure = !isRealtime || cells.length >= colOffset + 8;

      if (isLuyKeStructure && cells.length >= colOffset + 7) {
        // Luỹ Kế Doanh Thu (BI BCDTST Luỹ kế):
        // Col offset + 1: % HT Target Dự Kiến (e.g. 91.64%)
        // Col offset + 2: DTLK (DT Thực e.g. 14,400)
        // Col offset + 3: Target Tháng (e.g. 21,789)
        // Col offset + 4: +/- DTCK Tháng (e.g. 23.72%)
        // Col offset + 5: % HT Target Dự Kiến (QĐ) (e.g. 100.22%)
        // Col offset + 6: DTQĐ (THỰC HIỆN e.g. 22,269)
        // Col offset + 7: Target (QĐ) (MỤC TIÊU e.g. 30,809)
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
        rate = target > 0 ? (achieved / target) * 100 : (valRateQd > 0 ? valRateQd : valRateRaw);
      } else {
        // Realtime Doanh Thu (BI BCDTST Realtime):
        // Col offset + 1: % HT Target Ngày (e.g. 53.43%)
        // Col offset + 2: DT Realtime (DT Thực e.g. 482)
        // Col offset + 3: Target Ngày (e.g. 902)
        // Col offset + 4: % HT Target Ngày (QĐ) (e.g. 57.27%)
        // Col offset + 5: DT Realtime (QĐ) (THỰC HIỆN e.g. 730)
        // Col offset + 6: Target Ngày (QĐ) (MỤC TIÊU e.g. 1,275)
        const valRateRaw = parseRate(cells[colOffset + 1]);
        const valDtRaw = parseNum(cells[colOffset + 2]);
        const valTargetRaw = parseNum(cells[colOffset + 3]);

        const valRateQd = parseRate(cells[colOffset + 4]);
        const valDtQd = parseNum(cells[colOffset + 5]);
        const valTargetQd = parseNum(cells[colOffset + 6]);

        dtThuc = valDtRaw;
        dtQd = valDtQd > 0 ? valDtQd : valDtRaw;

        if (valTargetQd > 0 || valDtQd > 0) {
          achieved = valDtQd;
          target = valTargetQd;
          rate = target > 0 ? (achieved / target) * 100 : (valRateQd > 0 ? valRateQd : 0);
        } else {
          achieved = valDtRaw;
          target = valTargetRaw;
          rate = target > 0 ? (achieved / target) * 100 : (valRateRaw > 0 ? valRateRaw : 0);
        }
      }
    }

    const mst = extractMst(sieuthi) || extractStoreCode(sieuthi) || `REV_${results.length + 1}`;

    results.push({
      stt: results.length + 1,
      rank: results.length + 1,
      id: mst,
      sieuthi,
      tinh: tinh || 'Khác',
      target: Math.round(target * 100) / 100,
      achieved: Math.round(achieved * 100) / 100,
      rate: Number(rate.toFixed(1)),
      dtThuc: dataType === 'doanhthu' ? (dtThuc || 0) : undefined,
      dtQd: dataType === 'doanhthu' ? (dtQd || 0) : undefined,
      kenh: kenhFromSieuThi(sieuthi),
      boss: '',
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
  // 1. Chuỗi bắt đầu bằng mã số (ví dụ: "1165 - ĐML_LAN_BLU..." hoặc "1165")
  const mLeading = str.match(/^(\d{2,6})/);
  if (mLeading) return mLeading[1];

  // 2. Mã số đứng riêng lẻ bên trong chuỗi (ví dụ: "... - 1165 - ..." hoặc "(1165)")
  const mMiddle = str.match(/(?:^|\s|-|_|\[|\()(\d{3,6})(?:\s|-|_|\]|\)|$)/);
  if (mMiddle) return mMiddle[1];

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
// findBossAssignmentRecord used to do up to 3 full linear .find() scans of
// bossAssignments on EVERY call — and it's called once per store from ~8
// call sites across the app (GroupReportView, TagBossModal, ReportView,
// TopBotRemarksModal, ProvinceDetailRemarksModal, App.tsx's bossList, ...),
// each iterating the full store list (700-900 rows). That's O(stores ×
// bossAssignments) — both sides routinely in the hundreds — repeated in
// several unmemoized/re-triggered places. The exact-match tiers (MST, store
// code, exact normalized name — which cover the overwhelming majority of
// real lookups) are trivially indexable into Maps; only the final fuzzy
// substring fallback genuinely requires a scan, and it only runs when every
// exact tier already missed. Cached per bossAssignments array identity via
// WeakMap, so a fresh paste (new array reference) naturally invalidates the
// old index instead of ever going stale.
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

  // First occurrence wins for a given key — matches Array.find()'s
  // "first match in array order" semantics exactly.
  bossAssignments.forEach((b) => {
    const mstDirect = b.mst ? b.mst.trim() : '';
    if (mstDirect && !byMst.has(mstDirect)) byMst.set(mstDirect, b);
    const mstFromSieuthi = extractMst(b.sieuthi);
    if (mstFromSieuthi && !byMst.has(mstFromSieuthi)) byMst.set(mstFromSieuthi, b);

    const code = extractStoreCode(b.sieuthi) || extractStoreCode(b.sieuthiBase || '');
    if (code && !byCode.has(code)) byCode.set(code, b);

    const normB = normalizeVietnameseForMatch(b.sieuthi);
    if (normB && !byNormName.has(normB)) byNormName.set(normB, b);
    const normBase = normalizeVietnameseForMatch(b.sieuthiBase || '');
    if (normBase && !byNormName.has(normBase)) byNormName.set(normBase, b);
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

  // 1. Dò tìm chính xác bằng MST (Mã Siêu Thị / Mã Kho)
  const storeMst = extractMst(raw);
  if (storeMst) {
    const matchByMst = index.byMst.get(storeMst);
    if (matchByMst) return matchByMst;
  }

  // 2. Dò tìm chính xác bằng Mã Kho (ví dụ: DML_LAN_BLU, TGD_CTH_NKI, DML_AGI_CDO)
  const storeCodeKey = extractStoreCode(raw);
  if (storeCodeKey) {
    const matchByCode = index.byCode.get(storeCodeKey);
    if (matchByCode) return matchByCode;
  }

  // 3. Dò tìm bằng chuỗi tên chuẩn hóa — khớp chính xác trước (O(1))
  const normStore = normalizeVietnameseForMatch(raw);
  const matchByExactName = index.byNormName.get(normStore);
  if (matchByExactName) return matchByExactName;

  // 3b. Fallback cuối: so khớp một phần (substring) — không thể index hoá vì
  // đây là quan hệ "chứa nhau", không phải bằng nhau, nên vẫn cần quét tuyến
  // tính, nhưng chỉ chạy khi cả 3 tầng khớp chính xác ở trên đều không tìm
  // thấy (trường hợp hiếm trong thực tế).
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
 * Helper to safely extract category data from StoreRecord
 */
export function getCategoryData(
  s: StoreRecord,
  cName: string
): { target: number; achieved: number; rate: number } {
  if (s.categoryMap && s.categoryMap[cName]) {
    const item = s.categoryMap[cName];
    return {
      target: item.target || 0,
      achieved: item.achieved || 0,
      rate: item.rate || 0,
    };
  }
  return { target: 0, achieved: 0, rate: 0 };
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


