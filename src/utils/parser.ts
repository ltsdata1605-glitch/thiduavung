import { StoreRecord, Channel } from '../types';

export interface BossAssignmentRecord {
  stt?: number;
  tinh?: string;
  boss: string;
  bossRaw?: string;
  kenh?: Channel | string;
  sieuthi: string;
  chienIct?: string;
  chienCe?: string;
  slTruongCa?: string | number;
  dtQdTb?: string | number;
  phanLoaiShop?: string;
}

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
export const formatCategoryHeaderTitle = (title: string, maxLen: number = 6): string => {
  if (!title) return '';

  // Split title by space or punctuation boundaries
  const words = title.split(/(\s+|\/|,)/);

  const processed = words.map((word) => {
    if (!word || /^\s+$/.test(word) || word === '/' || word === ',') return word;

    // Remove non-word trailing characters for length check
    const cleanWord = word.replace(/[^a-zA-Z0-9À-ỹ+]/g, '');
    if (cleanWord.length <= maxLen) {
      return word;
    }

    const upper = word.toUpperCase();
    if (upper.includes('HOMECREDIT')) return word.replace(/HOMECREDIT/i, 'HOME\nCREDIT');
    if (upper.includes('FECREDIT')) return word.replace(/FECREDIT/i, 'FE\nCREDIT');
    if (upper.includes('SHINHAN')) return word.replace(/SHINHAN/i, 'SHIN\nHAN');
    if (upper.includes('ICALLME')) return word.replace(/ICALLME/i, 'ICALL\nME');
    if (upper.includes('VINAPHONE')) return word.replace(/VINAPHONE/i, 'VINA\nPHONE');

    // Default mid-split for any other word > 6 chars
    const mid = Math.ceil(word.length / 2);
    return word.slice(0, mid) + '\n' + word.slice(mid);
  });

  return processed.join('');
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

  // Key required columns for BOSS mapping
  const requiredSpecs = [
    {
      key: 'SIÊU THỊ',
      label: 'SIÊU THỊ (hoặc MST – TÊN SIÊU THỊ)',
      match: (h: string) => h.includes('SIÊU THỊ') || h.includes('SIEU THI') || h.includes('STORE'),
    },
    {
      key: 'BOSS T7',
      label: 'BOSS T7 (hoặc BOSS / USER)',
      match: (h: string) => h.includes('BOSS') || h.includes('USER') || h.includes('QUẢN LÝ'),
    },
    {
      key: 'KÊNH',
      label: 'KÊNH',
      match: (h: string) => h.includes('KÊNH') || h.includes('KENH') || h.includes('CHANNEL'),
    },
    {
      key: 'TỈNH',
      label: 'TỈNH',
      match: (h: string) => h.includes('TỈNH') || h.includes('TINH') || h.includes('PROVINCE'),
    },
  ];

  const missingColumns: string[] = [];

  for (const spec of requiredSpecs) {
    const found = normalizedHeaders.some((h) => spec.match(h));
    if (!found) {
      missingColumns.push(spec.label);
    }
  }

  // Known standard BI BOSS sheet columns (A -> W)
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
    'SL TRƯỞNG CA',
    'SL TRUONG CA',
    'DT QĐ TB',
    'PHÂN LOẠI SHOP',
    'PHAN LOAI SHOP',
    'PHÂN LOẠI',
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
  const val = (rawVal || fallbackVal || '').trim();
  if (!val) return 'TGD';

  const u = val.toUpperCase();

  if (u.includes('ĐML') || u.includes('DML')) return 'ĐML';
  if (u.includes('ĐMM') || u.includes('DMM')) return 'ĐMM';
  if (u.includes('ĐMS') || u.includes('DMS')) return 'ĐMS';
  if (u.includes('TOPZONE') || u.includes('TOP ZONE') || u.includes('TZ')) return 'TOPZONE';
  if (u.includes('TGD')) return 'TGD';
  if (u.includes('LƯU ĐỘNG') || u.includes('LUU DONG')) return 'LƯU ĐỘNG';
  if (u.includes('OFF')) return 'OFF';

  if (val.length <= 15 && !val.includes('-') && !val.includes('(')) {
    return val.toUpperCase().trim();
  }

  return 'TGD';
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

  // Detect Column Indices with precise priority matching for full BI Excel format
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
  // Column M (index 12) is the confirmed BOSS column ("Tên_mã" format, e.g.
  // "Phi_19002") in the standard BI Excel template. Excel artifacts (merged
  // header cells, stray whitespace) can throw off the header-text search
  // above, so once a header row is confirmed, trust this fixed position over
  // a fuzzy match elsewhere in the row.
  if (headers.length > 12 && headers[12].replace(/\s+/g, ' ').trim().includes('BOSS')) {
    colBoss = 12;
  }

  let colSieuThi = headers.findIndex((h) => h === 'MST – TÊN SIÊU THỊ' || h === 'MST - TÊN SIÊU THỊ');
  if (colSieuThi === -1) {
    colSieuThi = headers.findIndex((h) => h.includes('MST – TÊN SIÊU THỊ') || h.includes('MST - TÊN SIÊU THỊ'));
  }
  if (colSieuThi === -1) {
    colSieuThi = headers.findIndex((h, idx) => idx > 5 && (h === 'SIÊU THỊ' || h.includes('TÊN SIÊU THỊ')));
  }

  let colTinh = headers.findIndex((h) => h === 'TỈNH');
  if (colTinh === -1) {
    colTinh = headers.findIndex((h) => h === 'TỈNH MỚI 2026' || h === 'TỈNH BASE');
  }
  if (colTinh === -1) {
    colTinh = headers.findIndex((h) => h.includes('TỈNH') && !h.includes('CỤM') && !h.includes('HUYỆN'));
  }

  let colKenh = headers.findIndex((h) => h === 'KÊNH' || h === 'KENH');
  if (colKenh === -1) {
    colKenh = headers.findIndex((h) => h.includes('KÊNH') || h.includes('KENH'));
  }

  let colChienIct = headers.findIndex((h) => h === 'CHIẾN ICT' || h.includes('CHIẾN ICT'));
  let colChienCe = headers.findIndex((h) => h === 'CHIẾN CE' || h.includes('CHIẾN CE'));
  let colSlTruongCa = headers.findIndex((h) => h === 'SL TRƯỞNG CA' || h.includes('TRƯỞNG CA'));
  let colDtQdTb = headers.findIndex((h) => h.includes('DT QĐ TB') || h.includes('5T26') || h.includes('QĐ TB'));
  let colPhanLoaiShop = headers.findIndex((h) => h === 'PHÂN LOẠI SHOP' || h === 'PHÂN LOẠI');
  if (colPhanLoaiShop === -1) {
    colPhanLoaiShop = headers.findIndex((h) => h.includes('PHÂN LOẠI') && !h.includes('CỬA HÀNG'));
  }

  const startRow = 1; // Since validation verified headers on row 0

  for (let i = startRow; i < lines.length; i++) {
    const rawLine = lines[i];
    const cells = rawLine
      .split(delimiter === /\s{2,}/.source ? new RegExp(delimiter) : delimiter)
      .map((c) => c.trim().replace(/^["']|["']$/g, ''));

    if (cells.length < 2) continue;

    let rawBoss = colBoss >= 0 && cells[colBoss] ? cells[colBoss] : (cells[12] || cells[2] || '');
    if (rawBoss === 'Lưu Động' || rawBoss.toUpperCase().includes('ĐML-ĐMM-ĐMS')) {
      rawBoss = cells[12] || '';
    }

    // Keep raw boss name as-is (e.g. "Sơn_21707") without forcing "Boss " prefix or stripping underscore codes
    const bossName = rawBoss && rawBoss.trim() ? rawBoss.trim() : 'Chưa phân công';

    const sieuthi =
      colSieuThi >= 0 && cells[colSieuThi]
        ? cells[colSieuThi]
        : cells[14] || cells[9] || cells[6] || cells[0] || '';

    const tinh =
      colTinh >= 0 && cells[colTinh] ? cells[colTinh] : cells[11] || cells[7] || cells[3] || '';

    const rawKenh = colKenh >= 0 && cells[colKenh] ? cells[colKenh] : cells[13] || '';
    const kenh = cleanKenhValue(rawKenh, cells[13] || '');

    const chienIct = colChienIct >= 0 && cells[colChienIct] ? cells[colChienIct] : cells[15] || '-';
    const chienCe = colChienCe >= 0 && cells[colChienCe] ? cells[colChienCe] : cells[16] || '-';
    const slTruongCa = colSlTruongCa >= 0 && cells[colSlTruongCa] ? cells[colSlTruongCa] : cells[17] || '-';
    const dtQdTb = colDtQdTb >= 0 && cells[colDtQdTb] ? cells[colDtQdTb] : cells[18] || '-';
    const phanLoaiShop =
      colPhanLoaiShop >= 0 && cells[colPhanLoaiShop] ? cells[colPhanLoaiShop] : cells[19] || '-';

    if (
      sieuthi &&
      sieuthi.trim().length > 1 &&
      !sieuthi.toUpperCase().includes('SIÊU THỊ BASE') &&
      !sieuthi.toUpperCase().includes('MST – TÊN SIÊU THỊ')
    ) {
      results.push({
        stt: results.length + 1,
        tinh: tinh || 'TNB',
        boss: bossName,
        bossRaw: bossName,
        kenh,
        sieuthi,
        chienIct,
        chienCe,
        slTruongCa,
        dtQdTb,
        phanLoaiShop,
      });
    }
  }

  return {
    records: results,
    validation,
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

  const kenhFromSieuThi = (sieuthi: string): Channel => {
    const u = sieuthi.toUpperCase();
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

    let rawKenh = colKenh >= 0 ? (cells[colKenh] || '').toUpperCase() : '';
    let kenh: Channel | string;
    if (rawKenh.includes('LƯU ĐỘNG') || rawKenh.includes('LUU DONG')) kenh = 'LƯU ĐỘNG';
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
      // Only seed the top-level (Trieu VND) totals from revenue-based categories; quantity-based
      // (SLLK) categories are still kept in categoryMap but must not pollute this VND total.
      const baseTarget = currentCategoryIsRevenue ? target : 0;
      const baseAchieved = currentCategoryIsRevenue ? achieved : 0;
      const baseRate = currentCategoryIsRevenue ? rate : 0;
      const baseIct = Math.round(baseAchieved * 0.35);
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
        ict: { achieved: baseIct, rate: Number((baseRate * 1.02).toFixed(1)) },
        flagship: { achieved: Math.round(baseAchieved * 0.12), rate: Number((baseRate * 1.05).toFixed(1)) },
        phoneTablet: { achieved: Math.round(baseAchieved * 0.16), rate: Number((baseRate * 1.01).toFixed(1)) },
        phone: { achieved: Math.round(baseAchieved * 0.14), rate: Number((baseRate * 1.02).toFixed(1)) },
        laptop: { achieved: Math.round(baseAchieved * 0.08), rate: Number((baseRate * 0.95).toFixed(1)) },
        phukien: { achieved: Math.round(baseAchieved * 0.05), rate: Number((baseRate * 1.1).toFixed(1)) },
        dongho: { achieved: Math.round(baseAchieved * 0.03), rate: Number((baseRate * 1.08).toFixed(1)) },
        camera: { achieved: Math.round(baseAchieved * 0.02), rate: Number((baseRate * 0.98).toFixed(1)) },
        loa: { achieved: Math.round(baseAchieved * 0.025), rate: Number((baseRate * 0.99).toFixed(1)) },
        sacduphong: { achieved: Math.round(baseAchieved * 0.015), rate: Number((baseRate * 1.12).toFixed(1)) },
        tainghe: { achieved: Math.round(baseAchieved * 0.01), rate: Number((baseRate * 1.05).toFixed(1)) },
        dennangluong: { achieved: Math.round(baseAchieved * 0.005), rate: Number((baseRate * 0.85).toFixed(1)) },
        baohanh: { achieved: Math.round(baseAchieved * 0.06), rate: Number((baseRate * 1.03).toFixed(1)) },
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
 * Extracts the leading numeric MST (store code) from a "MST – TÊN SIÊU THỊ"
 * string, e.g. "908 - ĐML_AGI_LXU - 129 Trần Hưng Đạo" -> "908".
 */
export function extractMst(sieuthi: string = ''): string | null {
  const m = (sieuthi || '').trim().match(/^(\d{3,6})/);
  return m ? m[1] : null;
}

/**
 * Finds the bossAssignments record whose MST (leading store code) matches the
 * report row's MST exactly. This is the only reliable join key between the
 * Report and the uploaded BOSS file — two different stores can share very
 * similar or even identical names (e.g. two branches in the same "cụm"/ward),
 * so matching by name similarity risks pulling the wrong store's BOSS/KÊNH.
 * Returns null (no fallback guessing) when the MST can't be found on either
 * side or doesn't match anything in bossAssignments.
 */
function findByExactMst(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[]
): BossAssignmentRecord | null {
  const storeCode = extractMst(storeSieuThi);
  if (!storeCode) return null;
  return bossAssignments.find((b) => extractMst(b.sieuthi) === storeCode) || null;
}

/**
 * Matches a store's MST (leading store code) against bossAssignments (from the
 * uploaded BOSS file) and returns the exact assigned Boss name in Tên_mãUser
 * format (e.g. "Linh_3031", "Danh_39470", "Đạt_49412"). Falls back to the
 * report's own boss value when no exact MST match exists.
 */
export function getBossForStore(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[] = [],
  fallbackBoss: string = 'Chưa phân công'
): string {
  const rawFallback = (fallbackBoss || '').replace(/^Boss\s+/i, '').trim();

  const match = findByExactMst(storeSieuThi, bossAssignments);
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
  const u = (rawVal || '').toUpperCase().trim();
  if (u === 'OFF' || u.includes('OFFLINE')) return 'OFF';
  if (u.includes('LƯU ĐỘNG') || u.includes('LUU DONG')) return 'LƯU ĐỘNG';
  if (u.includes('TOPZONE') || u.includes('TOP ZONE') || u.includes('TZ') || u.includes('AAR')) return 'TopZone';
  if (u.includes('DMM') || u.includes('ĐMM')) return 'DMM';
  if (u.includes('DMS') || u.includes('ĐMS')) return 'DMS';
  if (u.includes('TGD') || u.includes('TGDD')) return 'TGD';
  if (u.includes('DML') || u.includes('ĐML')) return 'DML';
  return 'DML';
}

/**
 * Display label for a Channel value.
 */
export function getChannelLabel(kenh: string = ''): string {
  if (kenh === 'LuuDong') return 'LƯU ĐỘNG';
  return kenh;
}

/**
 * Helper to match a store's name/code against bossAssignments (from file BOSS)
 * and return the exact Channel assigned in the BOSS file (e.g. "TopZone", "TGD", "DMM", "DMS", "DML").
 */
export function getChannelForStore(
  storeSieuThi: string,
  bossAssignments: BossAssignmentRecord[] = [],
  fallbackKenh: Channel | string = 'DML'
): Channel | string {
  if (!storeSieuThi || !bossAssignments || bossAssignments.length === 0) {
    return fallbackKenh;
  }

  const match = findByExactMst(storeSieuThi, bossAssignments);
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
  const k = (kenh || '').toUpperCase().trim();
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
    const kenhU = (b.kenh || '').toString().toUpperCase();
    if (kenhU === 'OFF' || kenhU.includes('LƯU ĐỘNG') || kenhU.includes('LUU DONG') || kenhU === 'LUUDONG') {
      return false;
    }
    const normB = normalizeVietnameseForMatch(b.tinh);
    return normB === normProvince || normB.includes(normProvince) || normProvince.includes(normB);
  });

  return matchingBossRecords.reduce((sum, b) => sum + parseDtQdTbNum(b.dtQdTb), 0);
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
  const legacyMap: Record<string, { achieved: number; rate: number } | undefined> = {
    'Điện thoại Flagship Samsung Galaxy S/Z Series': s.flagship,
    'Điện thoại & Tablet Android': s.phoneTablet,
    'Điện thoại Realme': s.phone,
    'Điện thoại Vivo': s.phone,
    'Laptop': s.laptop,
    'Phụ kiện - Đồng hồ': s.phukien,
    'Đồng hồ (DHTT + SMW)': s.dongho,
    'Camera': s.camera,
    'Loa': s.loa,
    'Sạc dự phòng': s.sacduphong,
    'Tai nghe Bluetooth': s.tainghe,
    'Đèn năng lượng mặt trời': s.dennangluong,
    'Bảo hiểm': s.baohanh,
  };
  const legacy = legacyMap[cName];
  if (legacy) {
    return { target: 0, achieved: legacy.achieved || 0, rate: legacy.rate || 0 };
  }
  return { target: 0, achieved: 0, rate: 0 };
}

export interface DataFreshnessInfo {
  isOutdated: boolean;
  ageMinutes: number;
  displayText: string;
}

/**
 * Checks whether data lastUpdated timestamp is older than 60 minutes.
 * If older or missing, triggers blinking warning indicator.
 */
export function checkDataFreshness(lastUpdated?: string, maxAllowedMinutes: number = 60): DataFreshnessInfo {
  if (!lastUpdated || !lastUpdated.trim()) {
    return { isOutdated: true, ageMinutes: 999999, displayText: 'Chưa cập nhật' };
  }

  const cleaned = lastUpdated.replace(/THỜI GIAN ĐẾN:\s*/i, '').trim();

  try {
    // Extract time (HH:mm[:ss]) and date (DD/MM[/YYYY])
    const timeMatch = cleaned.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    const dateMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);

    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;

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

      const updatedDate = new Date(year, month, day, hours, minutes, seconds);
      const diffMs = now.getTime() - updatedDate.getTime();
      const ageMinutes = Math.floor(diffMs / (1000 * 60));

      // Outdated if older than maxAllowedMinutes (> 1 hour) or negative due to clock skew
      const isOutdated = ageMinutes > maxAllowedMinutes || ageMinutes < -120;
      return { isOutdated, ageMinutes, displayText: cleaned };
    }
  } catch (err) {
    console.warn('Error checking data freshness:', err);
  }

  return { isOutdated: false, ageMinutes: 0, displayText: cleaned };
}


