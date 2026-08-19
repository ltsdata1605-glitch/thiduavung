import React, { useState, useRef, useMemo, useEffect } from 'react';
import { StoreRecord } from '../types';
import {
  parsePastedData,
  parseBossPastedData,
  validateStoreHeaders,
  BossAssignmentRecord,
  BossValidationResult,
  cleanKenhValue,
  extractMst
} from '../utils/parser';
import { 
  ClipboardPaste, 
  Zap, 
  TrendingUp, 
  CheckCircle, 
  RotateCcw,
  RefreshCw,
  Users,
  Lock,
  Unlock,
  FileSpreadsheet,
  Upload,
  Download,
  FileText,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Check,
  AlertTriangle,
  XCircle,
  X,
  Globe,
  Store,
  Clock,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  Puzzle
} from 'lucide-react';
import { usePersistedState } from '../hooks/usePersistedState';

interface UpdateDataViewProps {
  onUpdateRealtimeData: (newStores: StoreRecord[], rawText: string, scope?: 'tinh' | 'vung') => void;
  onUpdateLuyKeData: (newStores: StoreRecord[], rawText: string, scope?: 'tinh' | 'vung') => void;
  onUpdateBossData?: (bossAssignments: BossAssignmentRecord[]) => Promise<void> | void;
  currentRealtimeStoresTinh: StoreRecord[];
  currentRealtimeStoresVung: StoreRecord[];
  currentLuyKeStoresTinh: StoreRecord[];
  currentLuyKeStoresVung: StoreRecord[];
  currentBossAssignments: BossAssignmentRecord[];
  lastUpdateRealtime?: string;
  lastUpdateLuyKe?: string;
  // Only Super Admin / Admin may see the DT QĐ TB column in the BOSS list.
  canViewDtQdTb?: boolean;
}

interface MultiSelectFilterProps {
  label: string;
  allLabel: string;
  options: string[];
  selectedValues: string[];
  onChange: (selected: string[]) => void;
}

const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  label,
  allLabel,
  options,
  selectedValues,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter((o) => String(o).toLowerCase().includes(search.toLowerCase().trim()));
  }, [options, search]);

  const toggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((v) => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const isAllSelected = selectedValues.length === 0;

  const getDisplayText = () => {
    if (selectedValues.length === 0) return allLabel;
    if (selectedValues.length === 1) return selectedValues[0];
    return `${selectedValues[0]} (+${selectedValues.length - 1})`;
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full py-1.5 px-2.5 bg-white border rounded-xl text-xs font-semibold flex items-center justify-between gap-1 transition-all cursor-pointer truncate ${
          selectedValues.length > 0
            ? 'border-blue-500 text-blue-700 bg-blue-50/60 font-bold ring-1 ring-blue-400/30'
            : 'border-slate-200 text-slate-800 hover:border-slate-300'
        }`}
      >
        <span className="truncate">{getDisplayText()}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 space-y-2 animate-in fade-in zoom-in-95 duration-100">
          {/* Quick Search inside filter dropdown */}
          {options.length > 5 && (
            <div className="relative">
              <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Tìm ${label}...`}
                className="w-full pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Header Action Row */}
          <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-500 border-b border-slate-100 pb-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className={`hover:text-blue-600 cursor-pointer ${isAllSelected ? 'text-blue-600 font-extrabold' : ''}`}
            >
              ✓ Tất cả ({options.length})
            </button>
            {selectedValues.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-red-500 hover:text-red-700 cursor-pointer"
              >
                Xóa chọn ({selectedValues.length})
              </button>
            )}
          </div>

          {/* List of checkboxes */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const checked = selectedValues.includes(opt);
                return (
                  <div
                    key={opt}
                    onClick={() => toggleOption(opt)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      checked ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                      checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {checked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="truncate">{opt}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-2 text-xs text-slate-400 italic">Không tìm thấy</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Channel Priority Rank: ĐML (1) > ĐMM (2) > ĐMS (3) > TGD (4) > LƯU ĐỘNG (5) > TOPZONE (6)
const getChannelRank = (kenh?: string): number => {
  if (!kenh) return 99;
  const k = String(kenh).toUpperCase().trim();
  if (k.includes('ĐML') || k.includes('DML')) return 1;
  if (k.includes('ĐMM') || k.includes('DMM')) return 2;
  if (k.includes('ĐMS') || k.includes('DMS')) return 3;
  if (k.includes('TGD')) return 4;
  if (k.includes('LƯU ĐỘNG') || k.includes('LUU DONG')) return 5;
  if (k.includes('TOPZONE') || k.includes('TZ')) return 6;
  return 99;
};

export const UpdateDataView: React.FC<UpdateDataViewProps> = ({
  onUpdateRealtimeData,
  onUpdateLuyKeData,
  onUpdateBossData,
  currentRealtimeStoresTinh,
  currentRealtimeStoresVung,
  currentLuyKeStoresTinh,
  currentLuyKeStoresVung,
  currentBossAssignments,
  lastUpdateRealtime,
  lastUpdateLuyKe,
  canViewDtQdTb = true,
}) => {
  // Lock / Unlock states for Realtime & Luỹ Kế inputs (Tỉnh & Vùng)
  const [isRealtimeLockedTinh, setIsRealtimeLockedTinh] = useState(true);
  const [isRealtimeLockedVung, setIsRealtimeLockedVung] = useState(true);
  const [isLuyKeLockedTinh, setIsLuyKeLockedTinh] = useState(true);
  const [isLuyKeLockedVung, setIsLuyKeLockedVung] = useState(true);

  // Input text states for Tỉnh & Vùng
  const [realtimeTextTinh, setRealtimeTextTinh] = useState('');
  const [realtimeTextVung, setRealtimeTextVung] = useState('');
  const [luykeTextTinh, setLuyKeTextTinh] = useState('');
  const [luykeTextVung, setLuyKeTextVung] = useState('');
  const [bossText, setBossText] = useState('');

  // File input ref for BOSS Excel import & Backup JSON import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Live parsed state previews for Tỉnh & Vùng — seeded from the
  // persisted/synced dataset owned by App.
  const [parsedRealtimeStoresTinh, setParsedRealtimeStoresTinh] = useState<StoreRecord[]>(currentRealtimeStoresTinh);
  // Category count badge shown twice below (locked-state label + live count) —
  // computed once here instead of two separate unmemoized Set-building passes
  // over up to ~900 rows on every render.
  const realtimeTinhCategoryCount = useMemo(() => {
    const catSet = new Set<string>();
    parsedRealtimeStoresTinh.forEach((r) => r.categoryMap && Object.keys(r.categoryMap).forEach((c) => catSet.add(c)));
    return catSet.size;
  }, [parsedRealtimeStoresTinh]);
  const [parsedRealtimeStoresVung, setParsedRealtimeStoresVung] = useState<StoreRecord[]>(currentRealtimeStoresVung);
  const [parsedLuyKeStoresTinh, setParsedLuyKeStoresTinh] = useState<StoreRecord[]>(currentLuyKeStoresTinh);
  const [parsedLuyKeStoresVung, setParsedLuyKeStoresVung] = useState<StoreRecord[]>(currentLuyKeStoresVung);
  // Boss Header Validation Error State
  const [bossValidationError, setBossValidationError] = useState<BossValidationResult | null>(null);
  // Structure validation error for one of the 4 Realtime/Luỹ Kế Tỉnh/Vùng paste boxes
  const [storeValidationError, setStoreValidationError] = useState<(BossValidationResult & { scopeName: string }) | null>(null);

  // Interactive Processing Overlay State
  const [processingState, setProcessingState] = useState<{
    title: string;
    stepText: string;
    progress: number;
  } | null>(null);

  // AutoCopy: opens bi.thegioididong.com in a popup, a matching Tampermonkey
  // script there auto-navigates Tỉnh/Siêu Thị and postMessage()s the raw
  // table text back — see runAutoCopy below for the message contract.
  const [autoCopyState, setAutoCopyState] = useState<{
    mode: 'realtime' | 'luyke';
    running: boolean;
    message: string;
  } | null>(null);
  const autoCopyPopupRef = useRef<Window | null>(null);
  const autoCopyTimeoutRef = useRef<number | null>(null);
  const autoCopyPollRef = useRef<number | null>(null);

  // Setup guide shown when AutoCopy is clicked but the companion
  // Tampermonkey script doesn't answer the install-check ping — remembers
  // which mode was requested so "Thử lại" can resume it once installed.
  const [tampermonkeyGuide, setTampermonkeyGuide] = useState<{ mode: 'realtime' | 'luyke'; checking: boolean } | null>(null);

  // Seeded from the persisted/synced dataset owned by App.
  const [parsedBossItems, setParsedBossItems] = useState<BossAssignmentRecord[]>(currentBossAssignments);

  // Keep each table in sync when the shared dataset changes elsewhere
  // (Firestore real-time updates, other tabs/users)
  useEffect(() => {
    if (currentBossAssignments.length > 0) {
      setParsedBossItems(currentBossAssignments);
    }
  }, [currentBossAssignments]);

  useEffect(() => {
    if (currentRealtimeStoresTinh.length > 0) setParsedRealtimeStoresTinh(currentRealtimeStoresTinh);
  }, [currentRealtimeStoresTinh]);

  useEffect(() => {
    if (currentRealtimeStoresVung.length > 0) setParsedRealtimeStoresVung(currentRealtimeStoresVung);
  }, [currentRealtimeStoresVung]);

  useEffect(() => {
    if (currentLuyKeStoresTinh.length > 0) setParsedLuyKeStoresTinh(currentLuyKeStoresTinh);
  }, [currentLuyKeStoresTinh]);

  useEffect(() => {
    if (currentLuyKeStoresVung.length > 0) setParsedLuyKeStoresVung(currentLuyKeStoresVung);
  }, [currentLuyKeStoresVung]);

  // Show/Hide toggle for BOSS table (default false = always hidden initially)
  const [isBossTableVisible, setIsBossTableVisible] = useState(false);

  // Multi-select Filter states for BOSS list (persisted so they survive a refresh)
  const [searchQuery, setSearchQuery] = usePersistedState('tnb_boss_searchQuery', '');
  const [selectedTinhs, setSelectedTinhs] = usePersistedState<string[]>('tnb_boss_selectedTinhs', []);
  const [selectedBosses, setSelectedBosses] = usePersistedState<string[]>('tnb_boss_selectedBosses', []);
  const [selectedKenhs, setSelectedKenhs] = usePersistedState<string[]>('tnb_boss_selectedKenhs', []);
  const [selectedChienIcts, setSelectedChienIcts] = usePersistedState<string[]>('tnb_boss_selectedChienIcts', []);
  const [selectedChienCes, setSelectedChienCes] = usePersistedState<string[]>('tnb_boss_selectedChienCes', []);
  const [selectedPhanLoais, setSelectedPhanLoais] = usePersistedState<string[]>('tnb_boss_selectedPhanLoais', []);

  // Sorting state (Default sort by KÊNH: ĐML > ĐMM > ĐMS > TGD > TOPZONE), persisted across refreshes
  const [sortField, setSortField] = usePersistedState<string>('tnb_boss_sortField', 'kenh');
  const [sortDirection, setSortDirection] = usePersistedState<'asc' | 'desc'>('tnb_boss_sortDirection', 'asc');

  // Pagination state (20 items per page)
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;


  // Handle header sorting click
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Extract unique filter options from parsedBossItems
  const uniqueTinhs = useMemo(() => Array.from(new Set(parsedBossItems.map(i => i.tinh).filter(Boolean))).sort() as string[], [parsedBossItems]);
  const uniqueBosses = useMemo(() => Array.from(new Set(parsedBossItems.map(i => i.bossRaw || i.boss).filter(Boolean))).sort() as string[], [parsedBossItems]);
  const uniqueKenhs = useMemo(() => Array.from(new Set(parsedBossItems.map(i => String(i.kenh)).filter(Boolean))).sort() as string[], [parsedBossItems]);
  const uniqueChienIcts = useMemo(() => Array.from(new Set(parsedBossItems.map(i => i.chienIct).filter(Boolean))).sort() as string[], [parsedBossItems]);
  const uniqueChienCes = useMemo(() => Array.from(new Set(parsedBossItems.map(i => i.chienCe).filter(Boolean))).sort() as string[], [parsedBossItems]);
  const uniquePhanLoais = useMemo(() => Array.from(new Set(parsedBossItems.map(i => i.phanLoaiShop).filter(Boolean))).sort() as string[], [parsedBossItems]);

  // Filtered BOSS items (Supports Multi-select filtering)
  const filteredBossItems = useMemo(() => {
    return parsedBossItems.filter((item) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          (item.sieuthi && item.sieuthi.toLowerCase().includes(q)) ||
          (item.boss && item.boss.toLowerCase().includes(q)) ||
          (item.bossRaw && item.bossRaw.toLowerCase().includes(q)) ||
          (item.tinh && item.tinh.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (selectedTinhs.length > 0 && !selectedTinhs.includes(item.tinh || '')) return false;
      if (selectedBosses.length > 0 && !selectedBosses.includes(item.bossRaw || item.boss || '')) return false;
      if (selectedKenhs.length > 0 && !selectedKenhs.includes(String(item.kenh))) return false;
      if (selectedChienIcts.length > 0 && !selectedChienIcts.includes(item.chienIct || '')) return false;
      if (selectedChienCes.length > 0 && !selectedChienCes.includes(item.chienCe || '')) return false;
      if (selectedPhanLoais.length > 0 && !selectedPhanLoais.includes(item.phanLoaiShop || '')) return false;
      return true;
    });
  }, [parsedBossItems, searchQuery, selectedTinhs, selectedBosses, selectedKenhs, selectedChienIcts, selectedChienCes, selectedPhanLoais]);

  // Sorted BOSS items
  const sortedBossItems = useMemo(() => {
    const items = [...filteredBossItems];
    return items.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortField === 'kenh') {
        valA = getChannelRank(a.kenh);
        valB = getChannelRank(b.kenh);
      } else if (sortField === 'stt') {
        valA = a.stt ?? 0;
        valB = b.stt ?? 0;
      } else if (sortField === 'tinh') {
        valA = (a.tinh || '').toLowerCase();
        valB = (b.tinh || '').toLowerCase();
      } else if (sortField === 'boss') {
        valA = (a.bossRaw || a.boss || '').toLowerCase();
        valB = (b.bossRaw || b.boss || '').toLowerCase();
      } else if (sortField === 'sieuthi') {
        valA = (a.sieuthi || '').toLowerCase();
        valB = (b.sieuthi || '').toLowerCase();
      } else if (sortField === 'chienIct') {
        valA = (a.chienIct || '').toLowerCase();
        valB = (b.chienIct || '').toLowerCase();
      } else if (sortField === 'chienCe') {
        valA = (a.chienCe || '').toLowerCase();
        valB = (b.chienCe || '').toLowerCase();
      } else if (sortField === 'slTruongCa') {
        valA = parseFloat(String(a.slTruongCa).replace(/[^0-9.-]+/g, '')) || 0;
        valB = parseFloat(String(b.slTruongCa).replace(/[^0-9.-]+/g, '')) || 0;
      } else if (sortField === 'dtQdTb') {
        valA = parseFloat(String(a.dtQdTb).replace(/[^0-9.-]+/g, '')) || 0;
        valB = parseFloat(String(b.dtQdTb).replace(/[^0-9.-]+/g, '')) || 0;
      } else if (sortField === 'phanLoaiShop') {
        valA = (a.phanLoaiShop || '').toLowerCase();
        valB = (b.phanLoaiShop || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredBossItems, sortField, sortDirection]);

  const totalPages = Math.ceil(sortedBossItems.length / ITEMS_PER_PAGE) || 1;
  const paginatedBossItems = useMemo(() => {
    return sortedBossItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [sortedBossItems, currentPage]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedTinhs([]);
    setSelectedBosses([]);
    setSelectedKenhs([]);
    setSelectedChienIcts([]);
    setSelectedChienCes([]);
    setSelectedPhanLoais([]);
    setSortField('kenh');
    setSortDirection('asc');
    setCurrentPage(1);
  };

  // Async helper to run paste processing with step-by-step progress feedback
  const runProcessWithFeedback = async (
    title: string,
    scopeName: string,
    text: string,
    isRealtime: boolean,
    scope: 'tinh' | 'vung',
    setLock: (locked: boolean) => void,
    setText: (t: string) => void,
    setParsed: (p: StoreRecord[]) => void,
    onUpdate: (parsed: StoreRecord[], rawText: string, s?: 'tinh' | 'vung') => Promise<void> | void
  ) => {
    // Validate BEFORE touching any lock/modal state — a bad paste (wrong
    // sheet, wrong box, random text) gets rejected instantly instead of
    // running the full processing overlay only to land on 0/garbage rows.
    const validation = validateStoreHeaders(text);
    if (!validation.isValid) {
      setStoreValidationError({ ...validation, scopeName: `${title} (${scopeName})` });
      return;
    }

    setText(text);
    setIsRealtimeLockedTinh(true);
    setIsRealtimeLockedVung(true);
    setIsLuyKeLockedTinh(true);
    setIsLuyKeLockedVung(true);

    setProcessingState({
      title: `ĐANG XỬ LÝ DỮ LIỆU ${title.toUpperCase()}`,
      stepText: `⚡ 1. Đang đọc và phân tích cấu trúc dữ liệu ${scopeName}...`,
      progress: 25,
    });

    // Short yield (not a real delay) — just enough for React to paint step 1
    // before the parse runs; parsing itself is the actual work, not this wait.
    await new Promise((r) => setTimeout(r, 15));

    const parsed = parsePastedData(text, isRealtime);
    setParsed(parsed);

    if (parsed.length === 0) {
      setProcessingState(null);
      setStoreValidationError({
        isValid: false,
        errorMessage: `Đã nhận diện được cấu trúc cột, nhưng không đọc được siêu thị nào từ dữ liệu đã dán (${scopeName}). Vui lòng kiểm tra lại nội dung đã dán.`,
        missingColumns: [],
        extraColumns: [],
        foundColumns: validation.foundColumns,
        scopeName: `${title} (${scopeName})`,
      });
      return;
    }

    setProcessingState({
      title: `ĐANG TÍNH TOÁN ${title.toUpperCase()}`,
      stepText: `📊 2. Đã đọc thành công ${parsed.length} siêu thị. Đang tính tỷ lệ % & xếp hạng...`,
      progress: 60,
    });

    await new Promise((r) => setTimeout(r, 15));

    setProcessingState({
      title: `ĐANG ĐỒNG BỘ NỀN FIREBASE`,
      stepText: `☁️ 3. Đang lưu giữ liệu & đồng bộ hệ thống Firebase Database...`,
      progress: 88,
    });

    await onUpdate(parsed, text, scope);

    setProcessingState({
      title: `HOÀN TẤT ĐỒNG BỘ DỮ LIỆU`,
      stepText: `✨ 4. Đã phân tích & đồng bộ ${parsed.length} siêu thị (${scopeName}) lên Firebase thành công!`,
      progress: 100,
    });

    await new Promise((r) => setTimeout(r, 150));
    setProcessingState(null);
  };

  const processRealtimeDataTinh = (text: string) => {
    runProcessWithFeedback('Realtime Thi Đua Tỉnh', 'Tỉnh', text, true, 'tinh', setIsRealtimeLockedTinh, setRealtimeTextTinh, setParsedRealtimeStoresTinh, onUpdateRealtimeData);
  };

  const processRealtimeDataVung = (text: string) => {
    runProcessWithFeedback('Realtime Thi Đua Vùng', 'Vùng', text, true, 'vung', setIsRealtimeLockedVung, setRealtimeTextVung, setParsedRealtimeStoresVung, onUpdateRealtimeData);
  };

  const processLuyKeDataTinh = (text: string) => {
    runProcessWithFeedback('Luỹ Kế Thi Đua Tỉnh', 'Tỉnh', text, false, 'tinh', setIsLuyKeLockedTinh, setLuyKeTextTinh, setParsedLuyKeStoresTinh, onUpdateLuyKeData);
  };

  const processLuyKeDataVung = (text: string) => {
    runProcessWithFeedback('Luỹ Kế Thi Đua Vùng', 'Vùng', text, false, 'vung', setIsLuyKeLockedVung, setLuyKeTextVung, setParsedLuyKeStoresVung, onUpdateLuyKeData);
  };

  // Clears the safety timeout + "did the user close the popup?" poll —
  // called whenever an AutoCopy run ends, however it ends.
  const stopAutoCopyWatchers = () => {
    if (autoCopyTimeoutRef.current) {
      window.clearTimeout(autoCopyTimeoutRef.current);
      autoCopyTimeoutRef.current = null;
    }
    if (autoCopyPollRef.current) {
      window.clearInterval(autoCopyPollRef.current);
      autoCopyPollRef.current = null;
    }
  };

  const BI_AUTOCOPY_ORIGIN = 'https://bi.thegioididong.com';

  // Pings the page itself (same-window postMessage) and waits briefly for
  // the companion Tampermonkey script's TNB_AUTOCOPY_PONG reply — the
  // script's `@match *://*/*` responder runs on every page including this
  // one specifically so this check works without needing to touch BI first.
  const checkTampermonkeyInstalled = (): Promise<boolean> => {
    return new Promise((resolve) => {
      let settled = false;
      const handler = (event: MessageEvent) => {
        if (event.source !== window || event.data?.type !== 'TNB_AUTOCOPY_PONG') return;
        if (settled) return;
        settled = true;
        window.removeEventListener('message', handler);
        resolve(true);
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'TNB_AUTOCOPY_PING' }, window.location.origin);
      window.setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', handler);
        resolve(false);
      }, 600);
    });
  };

  const startAutoCopy = async (mode: 'realtime' | 'luyke') => {
    if (autoCopyState?.running) return;
    const installed = await checkTampermonkeyInstalled();
    if (!installed) {
      setTampermonkeyGuide({ mode, checking: false });
      return;
    }
    launchAutoCopyPopup(mode);
  };

  // Re-checks after the user says they've finished installing, from the
  // guide modal's "Tôi đã cài xong, thử lại" button.
  const retryAutoCopyAfterInstall = async () => {
    if (!tampermonkeyGuide) return;
    const { mode } = tampermonkeyGuide;
    setTampermonkeyGuide({ mode, checking: true });
    const installed = await checkTampermonkeyInstalled();
    if (installed) {
      setTampermonkeyGuide(null);
      launchAutoCopyPopup(mode);
    } else {
      setTampermonkeyGuide({ mode, checking: false });
    }
  };

  const launchAutoCopyPopup = (mode: 'realtime' | 'luyke') => {
    if (autoCopyState?.running) return;
    const rt = mode === 'realtime' ? '1' : '2';
    const origin = encodeURIComponent(window.location.origin);
    const url = `${BI_AUTOCOPY_ORIGIN}/thi-dua?id=-1&tab=1&rt=${rt}&dm=2&mt=2&__tnb_autocopy=1&__tnb_origin=${origin}`;
    const popup = window.open(url, 'tnb_bi_autocopy', 'width=1440,height=900');
    if (!popup) {
      setAutoCopyState({ mode, running: false, message: '❌ Trình duyệt đã chặn cửa sổ bật lên (popup). Vui lòng cho phép popup cho trang này rồi bấm AutoCopy lại.' });
      return;
    }
    autoCopyPopupRef.current = popup;
    setAutoCopyState({ mode, running: true, message: 'Đang mở BI và tự động chuyển chế độ / lấy dữ liệu...' });

    // Safety net: the matching Tampermonkey script may not be installed, the
    // BI site's layout may have changed, or the user may have closed the tab —
    // never leave the button stuck disabled forever waiting for a message.
    autoCopyTimeoutRef.current = window.setTimeout(() => {
      stopAutoCopyWatchers();
      setAutoCopyState({ mode, running: false, message: '⏱️ Hết thời gian chờ dữ liệu từ BI. Kiểm tra đã cài script Tampermonkey chưa, hoặc BI đang yêu cầu đăng nhập lại.' });
    }, 45000);

    autoCopyPollRef.current = window.setInterval(() => {
      if (autoCopyPopupRef.current?.closed) {
        stopAutoCopyWatchers();
        setAutoCopyState((prev) => (prev && prev.running ? { ...prev, running: false, message: 'Cửa sổ BI đã bị đóng trước khi lấy xong dữ liệu.' } : prev));
      }
    }, 1000);
  };

  // Receives the raw table text the Tampermonkey script scrapes from BI and
  // feeds it straight through the same processXxx functions the manual
  // Ctrl+V paste boxes use — no simulated paste event needed since those
  // functions already take plain text.
  useEffect(() => {
    const handleAutoCopyMessage = (event: MessageEvent) => {
      if (event.origin !== BI_AUTOCOPY_ORIGIN) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || typeof data.type !== 'string' || !data.type.startsWith('TNB_BI_AUTOCOPY')) return;

      const mode: 'realtime' | 'luyke' = data.rt === '2' ? 'luyke' : 'realtime';

      if (data.type === 'TNB_BI_AUTOCOPY_DATA') {
        const text: string = typeof data.text === 'string' ? data.text : '';
        if (!text.trim() || (data.scope !== 'tinh' && data.scope !== 'sieuthi')) return;
        if (data.scope === 'tinh') {
          if (mode === 'realtime') processRealtimeDataTinh(text);
          else processLuyKeDataTinh(text);
          setAutoCopyState((prev) => (prev ? { ...prev, message: '✅ Đã nhận dữ liệu Tỉnh. Đang lấy dữ liệu Siêu Thị...' } : prev));
        } else {
          if (mode === 'realtime') processRealtimeDataVung(text);
          else processLuyKeDataVung(text);
          setAutoCopyState((prev) => (prev ? { ...prev, message: '✅ Đã nhận dữ liệu Siêu Thị. Đang hoàn tất...' } : prev));
        }
      } else if (data.type === 'TNB_BI_AUTOCOPY_DONE') {
        stopAutoCopyWatchers();
        setAutoCopyState({ mode, running: false, message: '✨ Đã tự động cập nhật xong dữ liệu ' + (mode === 'realtime' ? 'Realtime' : 'Luỹ Kế') + ' (Tỉnh + Siêu Thị)!' });
        window.setTimeout(() => setAutoCopyState((prev) => (prev && !prev.running ? null : prev)), 6000);
      } else if (data.type === 'TNB_BI_AUTOCOPY_ERROR') {
        stopAutoCopyWatchers();
        setAutoCopyState({ mode, running: false, message: '❌ Lỗi từ BI: ' + (typeof data.message === 'string' ? data.message : 'Không rõ nguyên nhân.') });
      }
    };
    window.addEventListener('message', handleAutoCopyMessage);
    return () => {
      window.removeEventListener('message', handleAutoCopyMessage);
      stopAutoCopyWatchers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Excel File Upload for BOSS List & auto apply
  const handleBossFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setProcessingState({
          title: 'ĐANG XỬ LÝ FILE EXCEL BOSS',
          stepText: '⚡ 1. Đang đọc file Excel...',
          progress: 20,
        });

        // Loaded on demand — SheetJS is a large dependency and this is the
        // only place in the app that needs it, so keeping it out of the main
        // bundle noticeably shrinks the initial page load.
        const XLSX = await import('xlsx');
        const buffer = evt.target?.result as ArrayBuffer;
        // cellText must stay enabled — sheet_to_txt below reads each cell's
        // formatted text (.w), not its raw value; disabling it turned numbers
        // like "24,791" into raw floats like "24791.80704".
        const workbook = XLSX.read(buffer, { type: 'array', cellHTML: false, cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert Excel worksheet to TSV string
        const tsvText = XLSX.utils.sheet_to_txt(worksheet, { FS: '\t' });
        setBossText(tsvText);

        setProcessingState({
          title: 'ĐANG TÍNH TOÁN DANH SÁCH BOSS',
          stepText: '📊 2. Đang phân tích cấu trúc & khớp dữ liệu...',
          progress: 55,
        });

        const { records, validation } = parseBossPastedData(tsvText);

        if (!validation.isValid) {
          setBossValidationError(validation);
          setProcessingState(null);
          return;
        }

        setBossValidationError(null);
        setParsedBossItems(records);
        setCurrentPage(1);

        if (records.length > 0) {
          if (onUpdateBossData) {
            setProcessingState({
              title: 'ĐANG ĐỒNG BỘ NỀN FIREBASE',
              stepText: '☁️ 3. Đang lưu giữ liệu & đồng bộ hệ thống Firebase Database...',
              progress: 88,
            });
            await onUpdateBossData(records);
          }
          setProcessingState({
            title: 'HOÀN TẤT ĐỒNG BỘ DỮ LIỆU',
            stepText: `✨ 4. Đã phân tích & đồng bộ ${records.length} siêu thị (Danh sách BOSS) lên Firebase thành công!`,
            progress: 100,
          });
          await new Promise((r) => setTimeout(r, 300));
        } else {
          alert('Không tìm thấy dữ liệu BOSS hợp lệ trong file Excel.');
        }
      } catch (err) {
        console.error(err);
        alert('Không thể đọc file Excel. Vui lòng kiểm tra lại định dạng file!');
      } finally {
        setProcessingState(null);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleDownloadBossExcel = async () => {
    const itemsToExport = parsedBossItems.length > 0 ? parsedBossItems : currentBossAssignments;
    if (!itemsToExport || itemsToExport.length === 0) {
      alert('Chưa có dữ liệu danh sách BOSS để tải xuống.');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const excelRows = itemsToExport.map((item, idx) => ({
        'VỊ TRÍ SIÊU THỊ': item.viTriSieuThi || '',
        'HUYỆN của siêu thị': item.huyenCuaSieuThi || '',
        'QL phụ trách': item.qlPhuTrach || '',
        'TỈNH BASE': item.tinhBase || '',
        'CỤM MỚI': item.cumMoi || '',
        'MÃ BASE MỚI': item.maBaseMoi || '',
        'SIÊU THỊ BASE': item.sieuthiBase || '',
        'TỈNH MỚI 2026': item.tinhMoi || '',
        'MST': item.mst || extractMst(item.sieuthi) || '',
        'SIÊU THỊ': item.sieuthiNgan || '',
        'USER': item.user || '',
        'TỈNH': item.tinh || '',
        'BOSS': item.bossRaw || item.boss || '',
        'KÊNH': item.kenh || '',
        'MST – TÊN SIÊU THỊ': item.sieuthi || '',
        'CHIẾN ICT': item.chienIct || '',
        'CHIẾN CE': item.chienCe || '',
        'SL SHOP': item.slShop || 1,
        'Số tháng làm việc': item.soThangLamViec || '-',
        'ST KD LAPTOP': item.stKdLaptop || '',
        'SL TRƯỞNG CA': item.slTruongCa || 1,
        'DT QĐ TB 5T26': item.dtQdTb || '',
        'PHÂN LOẠI SHOP': item.phanLoaiShop || '',
        'CÓ TỦ ĐỒNG HỒ': item.coTuDongHo || '',
        'CÓ KD LAPTOP': item.coKdLaptop || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const colWidths = [
        { wch: 18 }, // A: VỊ TRÍ SIÊU THỊ
        { wch: 22 }, // B: HUYỆN của siêu thị
        { wch: 18 }, // C: QL phụ trách
        { wch: 15 }, // D: TỈNH BASE
        { wch: 15 }, // E: CỤM MỚI
        { wch: 14 }, // F: MÃ BASE MỚI
        { wch: 45 }, // G: SIÊU THỊ BASE
        { wch: 16 }, // H: TỈNH MỚI 2026
        { wch: 10 }, // I: MST
        { wch: 45 }, // J: SIÊU THỊ
        { wch: 14 }, // K: USER
        { wch: 15 }, // L: TỈNH
        { wch: 20 }, // M: BOSS
        { wch: 10 }, // N: KÊNH
        { wch: 45 }, // O: MST – TÊN SIÊU THỊ
        { wch: 18 }, // P: CHIẾN ICT
        { wch: 18 }, // Q: CHIẾN CE
        { wch: 10 }, // R: SL SHOP
        { wch: 18 }, // S: Số tháng làm việc
        { wch: 18 }, // T: ST KD LAPTOP
        { wch: 15 }, // U: SL TRƯỞNG CA
        { wch: 16 }, // V: DT QĐ TB 5T26
        { wch: 18 }, // W: PHÂN LOẠI SHOP
        { wch: 16 }, // X: CÓ TỦ ĐỒNG HỒ
        { wch: 16 }, // Y: CÓ KD LAPTOP
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'DANH SACH BOSS');
      const fileName = `Danh_Sach_BOSS_TNB_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('Download Boss Excel failed:', err);
      alert('Có lỗi khi tải xuống file Excel BOSS.');
    }
  };

  const handleExportFullBackup = () => {
    const data = {
      app: 'TNB_Competition_Tracker',
      version: '1.0',
      exportDate: new Date().toLocaleString('vi-VN'),
      realtimeStoresTinh: currentRealtimeStoresTinh,
      realtimeStoresVung: currentRealtimeStoresVung,
      luykeStoresTinh: currentLuyKeStoresTinh,
      luykeStoresVung: currentLuyKeStoresVung,
      bossAssignments: currentBossAssignments,
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tnb_backup_4_boxes_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFullBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const data = JSON.parse(text);
        let count = 0;
        if (Array.isArray(data.realtimeStoresTinh) && data.realtimeStoresTinh.length > 0) {
          onUpdateRealtimeData(data.realtimeStoresTinh, '', 'tinh');
          count++;
        }
        if (Array.isArray(data.realtimeStoresVung) && data.realtimeStoresVung.length > 0) {
          onUpdateRealtimeData(data.realtimeStoresVung, '', 'vung');
          count++;
        }
        if (Array.isArray(data.luykeStoresTinh) && data.luykeStoresTinh.length > 0) {
          onUpdateLuyKeData(data.luykeStoresTinh, '', 'tinh');
          count++;
        }
        if (Array.isArray(data.luykeStoresVung) && data.luykeStoresVung.length > 0) {
          onUpdateLuyKeData(data.luykeStoresVung, '', 'vung');
          count++;
        }
        if (Array.isArray(data.bossAssignments) && data.bossAssignments.length > 0 && onUpdateBossData) {
          onUpdateBossData(data.bossAssignments);
        }
        alert('✅ Đã phục hồi thành công dữ liệu cả 4 ô từ file backup!');
      } catch (err) {
        alert('❌ File backup không hợp lệ. Vui lòng chọn file .json đã xuất từ ứng dụng!');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const isAnyFilterActive =
    searchQuery !== '' ||
    selectedTinhs.length > 0 ||
    selectedBosses.length > 0 ||
    selectedKenhs.length > 0 ||
    selectedChienIcts.length > 0 ||
    selectedChienCes.length > 0 ||
    selectedPhanLoais.length > 0 ||
    sortField !== 'kenh' ||
    sortDirection !== 'asc';

  // Render clickable th header for sorting
  const renderSortHeader = (label: string, field: string, align: 'left' | 'center' | 'right' = 'left', minWidth?: string) => {
    const isSorted = sortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={`p-2.5 font-extrabold uppercase text-[11px] tracking-tight cursor-pointer select-none hover:bg-amber-400/90 transition-colors ${
          align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
        } ${minWidth ? minWidth : ''}`}
        title={`Click để sắp xếp theo ${label}`}
      >
        <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
          <span>{label}</span>
          {isSorted ? (
            sortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-blue-900 shrink-0" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-blue-900 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-700 opacity-60 hover:opacity-100 shrink-0" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardPaste className="w-6 h-6 text-blue-600" />
            CẬP NHẬT DỮ LIỆU TỪ BI
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Mở khóa để dán dữ liệu Ctrl+V =&gt; Hệ thống tự động phân tích, đồng bộ &amp; khóa dữ liệu lại
          </p>
        </div>

        {/* Backup & Restore Data Buttons */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={backupInputRef}
            onChange={handleImportFullBackup}
            accept=".json"
            className="hidden"
          />
          <button
            type="button"
            onClick={handleExportFullBackup}
            title="Xuất tất cả dữ liệu đã dán ở 4 ô ra file backup .json"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-600" />
            Xuất Backup (.json)
          </button>
          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            title="Tải file backup .json để phục hồi 100% dữ liệu sang trình duyệt mới"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-white" />
            Nhập Backup (.json)
          </button>
        </div>
      </div>

      {/* SIDE-BY-SIDE 2 COMPACT COLUMNS: REALTIME & LUỸ KẾ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KHU VỰC 1: REALTIME */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shadow-xs shrink-0">
                <Zap className="w-4 h-4 text-emerald-600 fill-emerald-100" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm">
                  REALTIME
                </h3>
                <p className="text-[11px] text-slate-500">
                  Gồm 2 ô dán dữ liệu: Thi Đua Tỉnh (trên) &amp; Thi Đua Siêu Thị (dưới)
                </p>
                {autoCopyState?.mode === 'realtime' && (
                  <p className={`text-[11px] font-bold mt-0.5 ${autoCopyState.message.startsWith('❌') || autoCopyState.message.startsWith('⏱️') ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {autoCopyState.message}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => startAutoCopy('realtime')}
              disabled={!!autoCopyState?.running}
              title="Tự động mở BI, lấy dữ liệu Realtime Tỉnh + Siêu Thị và dán vào 2 ô bên dưới"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {autoCopyState?.running && autoCopyState.mode === 'realtime' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              AutoCopy
            </button>
          </div>

          {/* SUB-BOX 1: Ô TRÊN - THI ĐUA TỈNH */}
          <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-800 flex-wrap gap-1">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <Store className="w-3.5 h-3.5" />
                Thi Đua Tỉnh
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {lastUpdateRealtime && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-300/80 px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-600 shrink-0" />
                    Cập nhật: {lastUpdateRealtime}
                  </span>
                )}
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold">
                  {parsedRealtimeStoresTinh.length} dòng
                  {realtimeTinhCategoryCount > 0 ? ` (${realtimeTinhCategoryCount} ngành hàng)` : ''}
                </span>
              </div>
            </div>

            {isRealtimeLockedTinh ? (
              <div
                onClick={() => {
                  setRealtimeTextTinh('');
                  setIsRealtimeLockedTinh(false);
                }}
                className="h-[52px] bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 hover:border-emerald-300 rounded-xl px-3 flex items-center justify-between cursor-pointer transition-all group"
                title="Bấm vào đây để dán dữ liệu mới"
              >
                <div className="flex items-center gap-2 truncate">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-emerald-950 truncate">
                    Đã khóa dữ liệu Thi Đua Tỉnh ({parsedRealtimeStoresTinh.length} dòng
                    {realtimeTinhCategoryCount > 0 ? ` - ${realtimeTinhCategoryCount} ngành hàng` : ''})
                  </span>
                </div>
                <button className="px-2.5 py-1 bg-emerald-600 group-hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shrink-0 flex items-center gap-1">
                  <Unlock className="w-3 h-3" />
                  Mở dán mới
                </button>
              </div>
            ) : (
              <div className="h-[52px] relative rounded-xl overflow-hidden">
                <textarea
                  autoFocus
                  rows={2}
                  value={realtimeTextTinh}
                  onChange={(e) => processRealtimeDataTinh(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text');
                    if (text && text.trim()) {
                      e.preventDefault();
                      processRealtimeDataTinh(text);
                      setIsRealtimeLockedTinh(true);
                    }
                  }}
                  onBlur={() => setIsRealtimeLockedTinh(true)}
                  placeholder="Bấm Ctrl+V để dán dữ liệu Thi Đua Tỉnh mới tại đây..."
                  className="w-full h-full bg-white border-2 border-emerald-500 text-slate-800 text-xs font-mono rounded-xl p-2.5 pr-16 focus:outline-hidden focus:ring-2 focus:ring-emerald-200 resize-none shadow-inner leading-normal"
                />
                <button
                  onClick={() => setIsRealtimeLockedTinh(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-md z-10"
                >
                  Khóa
                </button>
              </div>
            )}
          </div>

          {/* SUB-BOX 2: Ô DƯỚI - THI ĐUA SIÊU THỊ */}
          <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-800 flex-wrap gap-1">
              <span className="flex items-center gap-1.5 text-blue-700">
                <Globe className="w-3.5 h-3.5" />
                Thi Đua Siêu Thị
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {lastUpdateRealtime && (
                  <span className="text-[10px] bg-blue-50 text-blue-900 border border-blue-300/80 px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-blue-600 shrink-0" />
                    Cập nhật: {lastUpdateRealtime}
                  </span>
                )}
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-bold">
                  {parsedRealtimeStoresVung.length} dòng
                </span>
              </div>
            </div>

            {isRealtimeLockedVung ? (
              <div
                onClick={() => {
                  setRealtimeTextVung('');
                  setIsRealtimeLockedVung(false);
                }}
                className="h-[52px] bg-blue-50 hover:bg-blue-100/80 border border-blue-200 hover:border-blue-300 rounded-xl px-3 flex items-center justify-between cursor-pointer transition-all group"
                title="Bấm vào đây để dán dữ liệu mới"
              >
                <div className="flex items-center gap-2 truncate">
                  <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="text-xs font-bold text-blue-950 truncate">
                    Đã khóa dữ liệu Thi Đua Siêu Thị ({parsedRealtimeStoresVung.length} dòng)
                  </span>
                </div>
                <button className="px-2.5 py-1 bg-blue-600 group-hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg shrink-0 flex items-center gap-1">
                  <Unlock className="w-3 h-3" />
                  Mở dán mới
                </button>
              </div>
            ) : (
              <div className="h-[52px] relative rounded-xl overflow-hidden">
                <textarea
                  autoFocus
                  rows={2}
                  value={realtimeTextVung}
                  onChange={(e) => processRealtimeDataVung(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text');
                    if (text && text.trim()) {
                      e.preventDefault();
                      processRealtimeDataVung(text);
                      setIsRealtimeLockedVung(true);
                    }
                  }}
                  onBlur={() => setIsRealtimeLockedVung(true)}
                  placeholder="Bấm Ctrl+V để dán dữ liệu Thi Đua Siêu Thị mới tại đây..."
                  className="w-full h-full bg-white border-2 border-blue-500 text-slate-800 text-xs font-mono rounded-xl p-2.5 pr-16 focus:outline-hidden focus:ring-2 focus:ring-blue-200 resize-none shadow-inner leading-normal"
                />
                <button
                  onClick={() => setIsRealtimeLockedVung(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-md z-10"
                >
                  Khóa
                </button>
              </div>
            )}
          </div>
        </div>

        {/* KHU VỰC 2: LUỸ KẾ */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold shadow-xs shrink-0">
                <TrendingUp className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm">
                  LUỸ KẾ
                </h3>
                <p className="text-[11px] text-slate-500">
                  Gồm 2 ô dán dữ liệu: Thi Đua Tỉnh (trên) &amp; Thi Đua Siêu Thị (dưới)
                </p>
                {autoCopyState?.mode === 'luyke' && (
                  <p className={`text-[11px] font-bold mt-0.5 ${autoCopyState.message.startsWith('❌') || autoCopyState.message.startsWith('⏱️') ? 'text-rose-600' : 'text-purple-700'}`}>
                    {autoCopyState.message}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => startAutoCopy('luyke')}
              disabled={!!autoCopyState?.running}
              title="Tự động mở BI, lấy dữ liệu Luỹ Kế Tỉnh + Siêu Thị và dán vào 2 ô bên dưới"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {autoCopyState?.running && autoCopyState.mode === 'luyke' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              AutoCopy
            </button>
          </div>

          {/* SUB-BOX 1: Ô TRÊN - THI ĐUA TỈNH */}
          <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-800 flex-wrap gap-1">
              <span className="flex items-center gap-1.5 text-purple-700">
                <Store className="w-3.5 h-3.5" />
                Thi Đua Tỉnh
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {lastUpdateLuyKe && (
                  <span className="text-[10px] bg-purple-50 text-purple-900 border border-purple-300/80 px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-purple-600 shrink-0" />
                    Cập nhật: {lastUpdateLuyKe}
                  </span>
                )}
                <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-bold">
                  {parsedLuyKeStoresTinh.length} dòng
                </span>
              </div>
            </div>

            {isLuyKeLockedTinh ? (
              <div
                onClick={() => {
                  setLuyKeTextTinh('');
                  setIsLuyKeLockedTinh(false);
                }}
                className="h-[52px] bg-purple-50 hover:bg-purple-100/80 border border-purple-200 hover:border-purple-300 rounded-xl px-3 flex items-center justify-between cursor-pointer transition-all group"
                title="Bấm vào đây để dán dữ liệu mới"
              >
                <div className="flex items-center gap-2 truncate">
                  <Lock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span className="text-xs font-bold text-purple-950 truncate">
                    Đã khóa dữ liệu Luỹ Kế Tỉnh ({parsedLuyKeStoresTinh.length} dòng)
                  </span>
                </div>
                <button className="px-2.5 py-1 bg-purple-600 group-hover:bg-purple-700 text-white text-[11px] font-bold rounded-lg shrink-0 flex items-center gap-1">
                  <Unlock className="w-3 h-3" />
                  Mở dán mới
                </button>
              </div>
            ) : (
              <div className="h-[52px] relative rounded-xl overflow-hidden">
                <textarea
                  autoFocus
                  rows={2}
                  value={luykeTextTinh}
                  onChange={(e) => processLuyKeDataTinh(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text');
                    if (text && text.trim()) {
                      e.preventDefault();
                      processLuyKeDataTinh(text);
                      setIsLuyKeLockedTinh(true);
                    }
                  }}
                  onBlur={() => setIsLuyKeLockedTinh(true)}
                  placeholder="Bấm Ctrl+V để dán dữ liệu Luỹ Kế Thi Đua Tỉnh mới tại đây..."
                  className="w-full h-full bg-white border-2 border-purple-500 text-slate-800 text-xs font-mono rounded-xl p-2.5 pr-16 focus:outline-hidden focus:ring-2 focus:ring-purple-200 resize-none shadow-inner leading-normal"
                />
                <button
                  onClick={() => setIsLuyKeLockedTinh(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-md z-10"
                >
                  Khóa
                </button>
              </div>
            )}
          </div>

          {/* SUB-BOX 2: Ô DƯỚI - THI ĐUA SIÊU THỊ */}
          <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-800 flex-wrap gap-1">
              <span className="flex items-center gap-1.5 text-indigo-700">
                <Globe className="w-3.5 h-3.5" />
                Thi Đua Siêu Thị
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {lastUpdateLuyKe && (
                  <span className="text-[10px] bg-indigo-50 text-indigo-900 border border-indigo-300/80 px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-indigo-600 shrink-0" />
                    Cập nhật: {lastUpdateLuyKe}
                  </span>
                )}
                <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md font-bold">
                  {parsedLuyKeStoresVung.length} dòng
                </span>
              </div>
            </div>

            {isLuyKeLockedVung ? (
              <div
                onClick={() => {
                  setLuyKeTextVung('');
                  setIsLuyKeLockedVung(false);
                }}
                className="h-[52px] bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 hover:border-indigo-300 rounded-xl px-3 flex items-center justify-between cursor-pointer transition-all group"
                title="Bấm vào đây để dán dữ liệu mới"
              >
                <div className="flex items-center gap-2 truncate">
                  <Lock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="text-xs font-bold text-indigo-950 truncate">
                    Đã khóa dữ liệu Luỹ Kế Siêu Thị ({parsedLuyKeStoresVung.length} dòng)
                  </span>
                </div>
                <button className="px-2.5 py-1 bg-indigo-600 group-hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg shrink-0 flex items-center gap-1">
                  <Unlock className="w-3 h-3" />
                  Mở dán mới
                </button>
              </div>
            ) : (
              <div className="h-[52px] relative rounded-xl overflow-hidden">
                <textarea
                  autoFocus
                  rows={2}
                  value={luykeTextVung}
                  onChange={(e) => processLuyKeDataVung(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text');
                    if (text && text.trim()) {
                      e.preventDefault();
                      processLuyKeDataVung(text);
                      setIsLuyKeLockedVung(true);
                    }
                  }}
                  onBlur={() => setIsLuyKeLockedVung(true)}
                  placeholder="Bấm Ctrl+V để dán dữ liệu Luỹ Kế Thi Đua Siêu Thị mới tại đây..."
                  className="w-full h-full bg-white border-2 border-indigo-500 text-slate-800 text-xs font-mono rounded-xl p-2.5 pr-16 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 resize-none shadow-inner leading-normal"
                />
                <button
                  onClick={() => setIsLuyKeLockedVung(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-md z-10"
                >
                  Khóa
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KHU VỰC 3: DANH SÁCH BOSS & EXCEL IMPORT */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shadow-xs shrink-0">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <span>CẬP NHẬT DANH SÁCH BOSS</span>
              </h3>
              <p className="text-xs text-slate-500">
                Dự án chỉ hoạt động khi cập nhật đúng file BOSS do Anh Miêng cung cấp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Hidden File Input for Excel */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleBossFileUpload}
              accept=".xlsx, .xls, .csv, .tsv"
              className="hidden"
            />

            {/* Excel Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4" />
              Upload file BOSS
            </button>
          </div>
        </div>

        {/* BOSS LIST FILTER BAR */}
        {parsedBossItems.length > 0 && (
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Filter className="w-4 h-4 text-blue-600" />
                <span>BỘ LỌC DANH SÁCH BOSS:</span>
              </div>
              {isAnyFilterActive && (
                <button
                  onClick={resetFilters}
                  className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Xóa bộ lọc
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {/* Search input for store name or store code */}
              <div className="relative col-span-2 md:col-span-2 lg:col-span-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  placeholder="Tìm siêu thị, mã kho..."
                  className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Tỉnh (Multi-Select) */}
              <MultiSelectFilter
                label="Tỉnh"
                allLabel="Tất cả Tỉnh"
                options={uniqueTinhs}
                selectedValues={selectedTinhs}
                onChange={(vals) => { setSelectedTinhs(vals); setCurrentPage(1); }}
              />

              {/* Boss (Multi-Select) */}
              <MultiSelectFilter
                label="Boss T7"
                allLabel="Tất cả Boss T7"
                options={uniqueBosses}
                selectedValues={selectedBosses}
                onChange={(vals) => { setSelectedBosses(vals); setCurrentPage(1); }}
              />

              {/* Kênh (Multi-Select) */}
              <MultiSelectFilter
                label="Kênh"
                allLabel="Tất cả Kênh"
                options={uniqueKenhs}
                selectedValues={selectedKenhs}
                onChange={(vals) => { setSelectedKenhs(vals); setCurrentPage(1); }}
              />

              {/* Chiến ICT (Multi-Select) */}
              <MultiSelectFilter
                label="Chiến ICT"
                allLabel="Tất cả Chiến ICT"
                options={uniqueChienIcts}
                selectedValues={selectedChienIcts}
                onChange={(vals) => { setSelectedChienIcts(vals); setCurrentPage(1); }}
              />

              {/* Chiến CE (Multi-Select) */}
              <MultiSelectFilter
                label="Chiến CE"
                allLabel="Tất cả Chiến CE"
                options={uniqueChienCes}
                selectedValues={selectedChienCes}
                onChange={(vals) => { setSelectedChienCes(vals); setCurrentPage(1); }}
              />

              {/* Phân loại shop (Multi-Select) */}
              <MultiSelectFilter
                label="Phân Loại"
                allLabel="Tất cả Phân Loại"
                options={uniquePhanLoais}
                selectedValues={selectedPhanLoais}
                onChange={(vals) => { setSelectedPhanLoais(vals); setCurrentPage(1); }}
              />
            </div>
          </div>
        )}

        {/* Live Preview Table for BOSS (Displays ALL items without truncation) */}
        {parsedBossItems.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Danh sách BOSS được nhập ({sortedBossItems.length} siêu thị):</span>
              </span>
              <div className="flex items-center gap-2">
                {isBossTableVisible && (
                  <span className="text-slate-400 font-normal hidden md:inline">
                    Hiển thị tất cả siêu thị (Bấm tiêu đề cột để sắp xếp)
                  </span>
                )}

                {/* Nút Tải xuống file BOSS */}
                <button
                  type="button"
                  onClick={handleDownloadBossExcel}
                  title="Tải xuống file Excel danh sách BOSS (.xlsx)"
                  className="px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải xuống file BOSS</span>
                </button>

                {/* Nút Xem / Ẩn BOSS */}
                <button
                  type="button"
                  onClick={() => setIsBossTableVisible((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 border ${
                    isBossTableVisible
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-blue-600 shadow-sm'
                  }`}
                >
                  {isBossTableVisible ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Ẩn BOSS</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem BOSS ({sortedBossItems.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {isBossTableVisible && (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-amber-300 text-slate-900 font-extrabold uppercase text-[11px] tracking-tight border-b border-amber-400">
                        {renderSortHeader('STT', 'stt', 'center', 'w-12')}
                        {renderSortHeader('TỈNH', 'tinh', 'left')}
                        {renderSortHeader('BOSS T7', 'boss', 'left')}
                        {renderSortHeader('KÊNH', 'kenh', 'left')}
                        {renderSortHeader('MST – TÊN SIÊU THỊ', 'sieuthi', 'left', 'min-w-[280px]')}
                        {renderSortHeader('CHIẾN ICT', 'chienIct', 'left')}
                        {renderSortHeader('CHIẾN CE', 'chienCe', 'left')}
                        {renderSortHeader('SL TRƯỞNG CA', 'slTruongCa', 'center')}
                        {canViewDtQdTb && renderSortHeader('DT QĐ TB 5T26', 'dtQdTb', 'right')}
                        {renderSortHeader('PHÂN LOẠI SHOP', 'phanLoaiShop', 'right')}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 bg-white">
                      {sortedBossItems.length > 0 ? (
                        sortedBossItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-amber-50/40 transition-colors">
                            <td className="p-2.5 font-bold text-slate-500 text-center">
                              {idx + 1}
                            </td>
                            <td className="p-2.5 font-bold text-slate-800 whitespace-nowrap">{item.tinh || '-'}</td>
                            <td className="p-2.5 font-extrabold text-indigo-900 whitespace-nowrap">{item.bossRaw || item.boss}</td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded font-extrabold text-[11px] uppercase ${
                                String(item.kenh).includes('TGD') 
                                  ? 'bg-amber-400 text-slate-900 shadow-2xs' 
                                  : String(item.kenh).includes('ĐMM') || String(item.kenh).includes('DMM')
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-blue-600 text-white shadow-2xs'
                              }`}>
                                {item.kenh || 'TGD'}
                              </span>
                            </td>
                            <td className="p-2.5 font-bold text-slate-900">{item.sieuthi}</td>
                            <td className="p-2.5 font-semibold text-slate-700 whitespace-nowrap">{item.chienIct || '-'}</td>
                            <td className="p-2.5 font-medium text-slate-600 whitespace-nowrap">{item.chienCe || '-'}</td>
                            <td className="p-2.5 font-extrabold text-red-600 text-center whitespace-nowrap">{item.slTruongCa || '1'}</td>
                            {canViewDtQdTb && (
                              <td className="p-2.5 font-bold text-slate-800 text-right whitespace-nowrap">{item.dtQdTb || '-'}</td>
                            )}
                            <td className="p-2.5 font-bold text-amber-800 text-right whitespace-nowrap">{item.phanLoaiShop || '-'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-slate-400 italic">
                            Không tìm thấy siêu thị phù hợp với từ khóa hoặc bộ lọc.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer Summary (Displays ALL items info) */}
                <div className="flex items-center justify-between pt-1 text-xs text-slate-600">
                  <div>
                    Hiển thị tất cả <strong className="text-blue-600 font-bold">{sortedBossItems.length}</strong> siêu thị
                    {parsedBossItems.length !== sortedBossItems.length && (
                      <span className="text-slate-400 text-[11px] ml-1">
                        (lọc từ {parsedBossItems.length} siêu thị gốc)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 italic">
                    Cuộn lên/xuống để xem toàn bộ danh sách
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* BOSS FILE STRUCTURE VALIDATION ERROR MODAL */}
      {bossValidationError && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="max-w-2xl w-full bg-white rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 border border-red-200 relative max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setBossValidationError(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-sm">
                <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-red-700 tracking-tight flex items-center gap-2">
                  <span>❌ FILE BI BOSS KHÔNG ĐÚNG CÚ PHÁP CỘT</span>
                </h3>
                <p className="text-xs font-bold text-slate-600">
                  Hệ thống đã tự động từ chối nhập file này để tránh làm mất hoặc hỏng dữ liệu phân công.
                </p>
              </div>
            </div>

            {/* Validation Details Card */}
            <div className="p-4 bg-red-50/80 border border-red-200 rounded-2xl space-y-3 text-xs">
              {/* Missing Columns */}
              {bossValidationError.missingColumns.length > 0 && (
                <div>
                  <div className="font-extrabold text-red-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <XCircle className="w-4 h-4 text-red-600" />
                    🚨 Các cột bắt buộc bị THIẾU ({bossValidationError.missingColumns.length} cột):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bossValidationError.missingColumns.map((col, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-red-600 text-white font-bold text-[11px] rounded-lg shadow-2xs">
                        ❌ {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Extra Columns */}
              {bossValidationError.extraColumns.length > 0 && (
                <div className="pt-2 border-t border-red-200/60">
                  <div className="font-extrabold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    ⚠️ Phát hiện cột không đúng mẫu BI ({bossValidationError.extraColumns.length} cột dư/lệch):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bossValidationError.extraColumns.map((col, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-[11px] rounded-lg">
                        ⚠️ {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Found Headers in User File */}
              <div className="pt-2 border-t border-red-200/60">
                <div className="font-bold text-slate-700 mb-1">
                  📋 Các tiêu đề cột tìm thấy trong file của bạn ({bossValidationError.foundColumns.length} cột):
                </div>
                <div className="bg-slate-900 text-emerald-400 font-mono text-[11px] p-2.5 rounded-xl max-h-24 overflow-y-auto leading-relaxed">
                  {bossValidationError.foundColumns.length > 0
                    ? bossValidationError.foundColumns.join(' | ')
                    : '(Không tìm thấy hàng tiêu đề nào)'}
                </div>
              </div>
            </div>

            {/* Standard BI Sheet Reference Helper */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                💡 Cấu trúc 25 cột chuẩn của file Excel BOSS do Anh Miêng cung cấp (Cột A ➔ Y):
              </div>
              <div className="text-[11px] font-mono text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 max-h-36 overflow-y-auto space-y-1">
                <div>A: VỊ TRÍ SIÊU THỊ | B: HUYỆN của siêu thị | C: QL phụ trách</div>
                <div>D: TỈNH BASE | E: CỤM MỚI | F: MÃ BASE MỚI | <strong>G: SIÊU THỊ BASE</strong></div>
                <div>H: TỈNH MỚI 2026 | <strong>I: MST</strong> | J: SIÊU THỊ | K: USER</div>
                <div><strong>L: TỈNH</strong> | <strong>M: BOSS</strong> | <strong>N: KÊNH</strong> | <strong>O: MST – TÊN SIÊU THỊ</strong></div>
                <div><strong>P: CHIẾN ICT</strong> | <strong>Q: CHIẾN CE</strong> | R: SL SHOP | S: Số tháng làm việc</div>
                <div>T: ST KD LAPTOP | <strong>U: SL TRƯỞNG CA</strong> | V: DT QĐ TB 5T26 | <strong>W: PHÂN LOẠI SHOP</strong></div>
                <div>X: CÓ TỦ ĐỒNG HỒ | Y: CÓ KD LAPTOP</div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setBossValidationError(null)}
                className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
              >
                Đã Hiểu - Vui Lòng Kiểm Tra &amp; Sửa Lại File Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STORE PASTE STRUCTURE VALIDATION ERROR MODAL (4 boxes: Realtime/Luỹ Kế × Tỉnh/Vùng) */}
      {storeValidationError && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="max-w-2xl w-full bg-white rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 border border-red-200 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setStoreValidationError(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-sm">
                <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-red-700 tracking-tight flex items-center gap-2">
                  <span>❌ DỮ LIỆU DÁN VÀO Ô "{storeValidationError.scopeName.toUpperCase()}" KHÔNG ĐÚNG CẤU TRÚC</span>
                </h3>
                <p className="text-xs font-bold text-slate-600">
                  {storeValidationError.errorMessage || 'Hệ thống đã tự động từ chối xử lý để tránh làm hỏng dữ liệu thi đua hiện có.'}
                </p>
              </div>
            </div>

            {storeValidationError.missingColumns.length > 0 && (
              <div className="p-4 bg-red-50/80 border border-red-200 rounded-2xl space-y-1.5 text-xs">
                <div className="font-extrabold text-red-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <XCircle className="w-4 h-4 text-red-600" />
                  🚨 Không tìm thấy cột bắt buộc ({storeValidationError.missingColumns.length} cột):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {storeValidationError.missingColumns.map((col, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-red-600 text-white font-bold text-[11px] rounded-lg shadow-2xs">
                      ❌ {col}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="text-xs font-bold text-slate-700">
                📋 Tiêu đề cột tìm thấy trong dữ liệu bạn đã dán ({storeValidationError.foundColumns.length} cột):
              </div>
              <div className="bg-slate-900 text-emerald-400 font-mono text-[11px] p-2.5 rounded-xl max-h-24 overflow-y-auto leading-relaxed">
                {storeValidationError.foundColumns.length > 0
                  ? storeValidationError.foundColumns.join(' | ')
                  : '(Không tìm thấy hàng tiêu đề nào)'}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 pt-1">
                💡 Mỗi ô Realtime/Luỹ Kế cần có ít nhất cột <strong>TARGET / CHỈ TIÊU</strong> và/hoặc <strong>ĐẠT / REALTIME / LUỸ KẾ</strong> để hệ thống nhận diện đúng bảng thi đua. Kiểm tra lại xem có dán nhầm sang ô khác, dán nhầm sheet, hay dán nhầm danh sách BOSS vào đây không.
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStoreValidationError(null)}
                className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
              >
                Đã Hiểu - Kiểm Tra Lại Dữ Liệu Đã Dán
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAMPERMONKEY SETUP GUIDE — shown when AutoCopy is clicked but the companion script doesn't answer the install-check ping */}
      {tampermonkeyGuide && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="max-w-lg w-full bg-white rounded-3xl p-6 md:p-8 shadow-2xl space-y-5 border border-slate-200 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setTampermonkeyGuide(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-sm">
                <Puzzle className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                  Cần cài đặt Tampermonkey để dùng AutoCopy
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  Chưa tìm thấy script hỗ trợ trên trình duyệt này. Làm theo 3 bước dưới đây rồi bấm "Thử lại".
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-black flex items-center justify-center shrink-0">1</span>
                  <div>
                    <div className="text-xs font-extrabold text-slate-800">Cài tiện ích Tampermonkey</div>
                    <div className="text-[11px] text-slate-500">Cho trình duyệt bạn đang dùng (Chrome, Edge, Cốc Cốc...)</div>
                  </div>
                </div>
                <a
                  href="https://www.tampermonkey.net/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Cài đặt
                </a>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-black flex items-center justify-center shrink-0">2</span>
                  <div>
                    <div className="text-xs font-extrabold text-slate-800">Tải file script tự động</div>
                    <div className="text-[11px] text-slate-500">bi-tgdd-autocopy.user.js</div>
                  </div>
                </div>
                <a
                  href="/bi-tgdd-autocopy.user.js"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải file
                </a>
              </div>

              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center shrink-0">3</span>
                  <div className="text-xs font-extrabold text-amber-900">Hướng dẫn nhập</div>
                </div>
                <p className="text-[11px] text-amber-900/90 leading-relaxed pl-9">
                  Mở file vừa tải — nếu Tampermonkey tự hiện bảng "Install this script?", bấm <strong>Install</strong>.
                  Nếu không tự hiện: bấm vào icon Tampermonkey (hình khỉ) trên thanh công cụ trình duyệt → <strong>Dashboard</strong> → tab <strong>Utilities</strong> → mục "Import from file" → chọn file <strong>bi-tgdd-autocopy.user.js</strong> vừa tải → <strong>Import</strong>.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={retryAutoCopyAfterInstall}
                disabled={tampermonkeyGuide.checking}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
              >
                {tampermonkeyGuide.checking ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Đang kiểm tra...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    Tôi đã cài xong, thử lại
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE PROCESSING OVERLAY MODAL */}
      {processingState && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-100 text-center space-y-5 animate-in zoom-in-95 duration-200">
            {/* Pulsing Icon */}
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/30 animate-pulse">
              <RefreshCw className="w-8 h-8 animate-spin stroke-[2.5]" />
            </div>

            {/* Title & Step Text */}
            <div className="space-y-2">
              <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wide">
                {processingState.title}
              </h3>
              <p className="text-xs font-semibold text-slate-600 bg-slate-50 py-2.5 px-3.5 rounded-xl border border-slate-200/80 leading-relaxed">
                {processingState.stepText}
              </p>
            </div>

            {/* Animated Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${processingState.progress}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[11px] font-bold text-slate-400">
                <span>Tiến trình xử lý &amp; Đồng bộ Firebase</span>
                <span className="text-sky-600 font-extrabold">{processingState.progress}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
