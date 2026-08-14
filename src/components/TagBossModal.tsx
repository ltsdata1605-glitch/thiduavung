import React, { useState, useMemo } from 'react';
import { StoreRecord, Channel } from '../types';
import {
  formatStoreDisplayName,
  getChannelForStore,
  getCategoryData,
  BossAssignmentRecord,
} from '../utils/parser';
import { X, Copy, Check, MessageSquare, Flame, AlertCircle, Zap, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';

function isExcludedChannel(k?: string): boolean {
  if (!k) return false;
  const u = String(k).toUpperCase();
  return u === 'LUUDONG' || u.includes('LƯU ĐỘNG') || u.includes('LUU DONG') || u === 'OFF' || u === 'OFFLINE';
}

function formatInt(n: number): string {
  return Math.round(n || 0).toLocaleString('vi-VN');
}

interface TagBossModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreRecord[];
  selectedProvince?: string;
  selectedChannels?: Channel[];
  selectedCategory?: string;
  selectedCategoryGroup?: string;
  bossAssignments?: BossAssignmentRecord[];
  categoryDisplayNameMap?: Record<string, string>;
  timeModeName?: string;
  lastUpdated?: string;
}

export function generateReportRemarksText(params: {
  stores: StoreRecord[];
  selectedProvince?: string;
  selectedChannels?: Channel[];
  selectedCategory?: string;
  bossAssignments?: BossAssignmentRecord[];
  timeModeName?: string;
  lastUpdated?: string;
  entityScope?: 'sieuthi' | 'vung' | 'nhom';
}): string {
  const {
    stores = [],
    selectedProvince = 'ALL',
    selectedChannels = [],
    selectedCategory = 'ALL',
    bossAssignments = [],
    timeModeName = 'Luỹ kế',
    lastUpdated,
    entityScope = 'sieuthi',
  } = params;

  const isLuyKe = !timeModeName.toLowerCase().includes('real');
  const safeStores = stores || [];
  const modeIcon = isLuyKe ? '📈' : '⚡';
  const modeTitle = isLuyKe ? 'CẬP NHẬT LUỸ KẾ' : 'CẬP NHẬT REALTIME';
  const fullTime = lastUpdated || `19:59:24 NGÀY 13/8/2026`;

  const isSpecificProvince = Boolean(selectedProvince && selectedProvince !== 'ALL');
  const provinceName = isSpecificProvince ? selectedProvince.toUpperCase() : '';

  const filteredStores = safeStores.filter((s) => {
    if (isSpecificProvince && s.tinh !== selectedProvince) return false;
    const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
    if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return false;
    if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) return false;
    return true;
  });

  const set = new Set<string>();
  filteredStores.forEach((s) => {
    if (s.categoryMap) {
      Object.keys(s.categoryMap).forEach((cat) => set.add(cat));
    }
  });
  const activeCategoryList = Array.from(set);
  const totalCatCount = activeCategoryList.length || 38;

  // Province ranking
  const map = new Map<string, {
    target: number;
    achieved: number;
    storesCount: number;
    catTotals: Record<string, { target: number; achieved: number; rateSum: number; count: number }>;
  }>();

  safeStores.forEach((s) => {
    const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
    if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return;
    if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) return;

    const tinh = s.tinh || 'Khác';
    const cur = map.get(tinh) || { target: 0, achieved: 0, storesCount: 0, catTotals: {} };
    cur.target += (s.target || 0);
    cur.achieved += (s.achieved || 0);
    cur.storesCount += 1;

    if (s.categoryMap) {
      Object.entries(s.categoryMap).forEach(([cat, data]) => {
        const c = cur.catTotals[cat] || { target: 0, achieved: 0, rateSum: 0, count: 0 };
        c.target += (data.target || 0);
        c.achieved += (data.achieved || 0);
        c.rateSum += (data.rate || 0);
        c.count += 1;
        cur.catTotals[cat] = c;
      });
    }

    map.set(tinh, cur);
  });

  const provinceRanking = Array.from(map.entries())
    .map(([tinh, stat]) => {
      let achievedCategories = 0;
      if (activeCategoryList.length > 0) {
        activeCategoryList.forEach((cat) => {
          const c = stat.catTotals[cat];
          if (c) {
            const catRate = isLuyKe
              ? (c.count > 0 ? Math.round(c.rateSum / c.count) : (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : 0))
              : (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : (c.count > 0 ? Math.round(c.rateSum / c.count) : 0));

            if (catRate >= 100) achievedCategories += 1;
          }
        });
      }

      const rate =
        selectedCategory !== 'ALL'
          ? stat.target > 0
            ? Math.round((stat.achieved / stat.target) * 100)
            : 0
          : activeCategoryList.length > 0
          ? Math.round((achievedCategories / activeCategoryList.length) * 100)
          : stat.target > 0
          ? Math.round((stat.achieved / stat.target) * 100)
          : 0;

      return {
        tinh,
        target: stat.target,
        achieved: stat.achieved,
        achievedCategories,
        rate,
        storesCount: stat.storesCount,
      };
    })
    .sort((a, b) => {
      if (b.achievedCategories !== a.achievedCategories) {
        return b.achievedCategories - a.achievedCategories;
      }
      return b.rate - a.rate;
    });

  // Region metrics
  const regionCatTotals: Record<string, { target: number; achieved: number; rateSum: number; count: number }> = {};
  let totalTargetVal = 0;
  let totalAchievedVal = 0;

  safeStores.forEach((s) => {
    const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
    if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return;
    if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) return;

    totalTargetVal += (s.target || 0);
    totalAchievedVal += (s.achieved || 0);

    if (s.categoryMap) {
      Object.entries(s.categoryMap).forEach(([cat, data]) => {
        const c = regionCatTotals[cat] || { target: 0, achieved: 0, rateSum: 0, count: 0 };
        c.target += (data.target || 0);
        c.achieved += (data.achieved || 0);
        c.rateSum += (data.rate || 0);
        c.count += 1;
        regionCatTotals[cat] = c;
      });
    }
  });

  let vungAchievedCatCount = 0;
  if (activeCategoryList.length > 0) {
    activeCategoryList.forEach((cat) => {
      const c = regionCatTotals[cat];
      if (c) {
        const catRate = isLuyKe
          ? (c.count > 0 ? Math.round(c.rateSum / c.count) : (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : 0))
          : (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : (c.count > 0 ? Math.round(c.rateSum / c.count) : 0));
        if (catRate >= 100) vungAchievedCatCount += 1;
      }
    });
  }

  const vungRate = totalCatCount > 0 ? Math.round((vungAchievedCatCount / totalCatCount) * 100) : 0;

  // Store ranking
  const storeRanking = [...filteredStores]
    .map((s) => {
      const target = s.target || 0;
      const achieved = s.achieved || 0;

      let achievedCategories = 0;
      if (activeCategoryList.length > 0) {
        activeCategoryList.forEach((cat) => {
          const data = getCategoryData(s, cat);
          if ((data.rate || 0) >= 100) {
            achievedCategories += 1;
          }
        });
      }

      const rate =
        selectedCategory !== 'ALL'
          ? target > 0
            ? Math.round((achieved / target) * 100)
            : 0
          : activeCategoryList.length > 0
          ? Math.round((achievedCategories / activeCategoryList.length) * 100)
          : s.rate !== undefined
          ? Math.round(s.rate)
          : target > 0
          ? Math.round((achieved / target) * 100)
          : 0;

      return {
        tinh: s.tinh,
        storeName: formatStoreDisplayName(s.sieuthi),
        target,
        achieved,
        achievedCategories,
        rate,
      };
    })
    .sort((a, b) => {
      if (b.achievedCategories !== a.achievedCategories) {
        return b.achievedCategories - a.achievedCategories;
      }
      return b.rate - a.rate;
    });

  if (entityScope === 'sieuthi' && !isSpecificProvince) {
    // VÙNG Tab: Province ranking
    const half = Math.ceil(provinceRanking.length / 2);
    const topTinhs = provinceRanking.slice(0, half);
    const botTinhs = provinceRanking.slice(half).reverse();

    const topLines = topTinhs
      .map((p, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(p.achieved)} / ${formatInt(p.target)}`
            : `${p.achievedCategories} / ${totalCatCount}`;
        return `${medal} #${idx + 1} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    const botLines = botTinhs
      .map((p) => {
        const rank = provinceRanking.findIndex((item) => item.tinh === p.tinh) + 1;
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(p.achieved)} / ${formatInt(p.target)}`
            : `${p.achievedCategories} / ${totalCatCount}`;
        return `🔻 #${rank} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    return `${modeIcon} ${modeTitle} - BẢNG XẾP HẠNG THI ĐUA CÁC TỈNH VÙNG TNB - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ TOÀN VÙNG: ${vungAchievedCatCount} / ${totalCatCount} ngành hàng đạt (${vungRate}%)
🎯 Target: ${formatInt(totalTargetVal)} | ${modeIcon} Thực đạt: ${formatInt(totalAchievedVal)}

🏆 TOP TỈNH DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ CÁC TỈNH CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Tỉnh bám sát, tập trung đẩy mạnh tư vấn để bứt phá mục tiêu! 💪🏼🔥`;
  } else {
    // SIÊU THỊ Tab or Specific Province: Store ranking
    const top10 = storeRanking.slice(0, 10);
    const storesWithTarget = storeRanking.filter((s) => s.target > 0);
    const bot10 = storesWithTarget.slice(-10).reverse();

    const topLines = top10
      .map((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(s.achieved)} / ${formatInt(s.target)}`
            : `${s.achievedCategories} / ${totalCatCount}`;
        return `${medal} #${idx + 1} ${s.storeName}: ${valuePart} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    const botLines = bot10
      .map((s) => {
        const rank = storeRanking.findIndex((item) => item.storeName === s.storeName) + 1;
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(s.achieved)} / ${formatInt(s.target)}`
            : `${s.achievedCategories} / ${totalCatCount}`;
        return `🔻 #${rank} ${s.storeName}: ${valuePart} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    const scopeTitle = isSpecificProvince ? `TỈNH ${provinceName}` : 'TOÀN VÙNG TNB';

    return `${modeIcon} ${modeTitle} - TOP/BOT SIÊU THỊ ${scopeTitle} - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ ${scopeTitle}:
🎯 Target: ${formatInt(totalTargetVal)} | ${modeIcon} Thực đạt: ${formatInt(totalAchievedVal)}

🏆 TOP 10 SIÊU THỊ DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 10 SIÊU THỊ CẦN TĂNG TỐC (Chỉ xét ST có Target):
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Siêu thị bám sát, tập trung đẩy mạnh tư vấn để bứt phá mục tiêu! 💪🏼🔥`;
  }
}

export const TagBossModal: React.FC<TagBossModalProps> = ({
  isOpen,
  onClose,
  stores = [],
  selectedProvince = 'ALL',
  selectedChannels = [],
  selectedCategory = 'ALL',
  selectedCategoryGroup = 'ALL',
  bossAssignments = [],
  categoryDisplayNameMap = {},
  timeModeName = 'Luỹ kế',
  lastUpdated,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTemplateTab, setActiveTemplateTab] = useState<'template_1' | 'template_2' | 'template_3'>('template_1');
  const [customText, setCustomText] = useState<string>('');

  const isLuyKe = !timeModeName.toLowerCase().includes('real');
  const safeStores = stores || [];
  const modeIcon = isLuyKe ? '📈' : '⚡';
  const modeTitle = isLuyKe ? 'CẬP NHẬT LUỸ KẾ' : 'CẬP NHẬT REALTIME';
  const fullTime = lastUpdated || `19:59:24 NGÀY 13/8/2026`;

  const isSpecificProvince = Boolean(selectedProvince && selectedProvince !== 'ALL');
  const provinceName = isSpecificProvince ? selectedProvince.toUpperCase() : '';
  const scopeLabel = isSpecificProvince ? `TỈNH ${provinceName}` : 'VÙNG';

  // 1. Filter stores according to selectedProvince & selectedChannels
  const filteredStores = useMemo(() => {
    return safeStores.filter((s) => {
      if (isSpecificProvince && s.tinh !== selectedProvince) return false;
      const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
      if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return false;
      if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) return false;
      return true;
    });
  }, [safeStores, isSpecificProvince, selectedProvince, bossAssignments, selectedChannels]);

  // Extract all active categories
  const activeCategoryList = useMemo(() => {
    const set = new Set<string>();
    filteredStores.forEach((s) => {
      if (s.categoryMap) {
        Object.keys(s.categoryMap).forEach((cat) => set.add(cat));
      }
    });
    return Array.from(set);
  }, [filteredStores]);

  const totalCatCount = activeCategoryList.length || 38;

  // 2. Province Ranking (Aggregated across all stores in each province matching selectedChannels)
  const provinceRanking = useMemo(() => {
    const map = new Map<string, {
      target: number;
      achieved: number;
      storesCount: number;
      catTotals: Record<string, { target: number; achieved: number; rateSum: number; count: number }>;
    }>();

    safeStores.forEach((s) => {
      const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
      if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return;
      if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) return;

      const tinh = s.tinh || 'Khác';
      const cur = map.get(tinh) || { target: 0, achieved: 0, storesCount: 0, catTotals: {} };
      cur.target += (s.target || 0);
      cur.achieved += (s.achieved || 0);
      cur.storesCount += 1;

      if (s.categoryMap) {
        Object.entries(s.categoryMap).forEach(([cat, data]) => {
          const c = cur.catTotals[cat] || { target: 0, achieved: 0, rateSum: 0, count: 0 };
          c.target += (data.target || 0);
          c.achieved += (data.achieved || 0);
          c.rateSum += (data.rate || 0);
          c.count += 1;
          cur.catTotals[cat] = c;
        });
      }

      map.set(tinh, cur);
    });

    return Array.from(map.entries())
      .map(([tinh, stat]) => {
        let achievedCategories = 0;
        if (activeCategoryList.length > 0) {
          activeCategoryList.forEach((cat) => {
            const c = stat.catTotals[cat];
            if (c) {
              // In Luỹ Kế: average % HT Dự Kiến across stores in the province for that category
              // In Realtime: calculate % from daily target vs realtime achieved (or average per-store rate)
              const catRate = isLuyKe
                ? (c.count > 0 ? Math.round(c.rateSum / c.count) : (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : 0))
                : (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : (c.count > 0 ? Math.round(c.rateSum / c.count) : 0));

              if (catRate >= 100) achievedCategories += 1;
            }
          });
        }

        const rate =
          selectedCategory !== 'ALL'
            ? stat.target > 0
              ? Math.round((stat.achieved / stat.target) * 100)
              : 0
            : activeCategoryList.length > 0
            ? Math.round((achievedCategories / activeCategoryList.length) * 100)
            : stat.target > 0
            ? Math.round((stat.achieved / stat.target) * 100)
            : 0;

        return {
          tinh,
          target: stat.target,
          achieved: stat.achieved,
          achievedCategories,
          rate,
          storesCount: stat.storesCount,
        };
      })
      .sort((a, b) => {
        if (b.achievedCategories !== a.achievedCategories) {
          return b.achievedCategories - a.achievedCategories;
        }
        return b.rate - a.rate;
      });
  }, [safeStores, bossAssignments, selectedChannels, activeCategoryList, selectedCategory, isLuyKe]);

  // 3. Region-wide total category metrics
  const regionMetrics = useMemo(() => {
    const regionCatTotals: Record<string, { target: number; achieved: number; rateSum: number; count: number }> = {};
    let totalTargetVal = 0;
    let totalAchievedVal = 0;

    safeStores.forEach((s) => {
      const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
      if (isExcludedChannel(effectiveKenh) || isExcludedChannel(s.kenh)) return;
      if (selectedChannels.length > 0 && !selectedChannels.includes(effectiveKenh as Channel)) return;

      totalTargetVal += (s.target || 0);
      totalAchievedVal += (s.achieved || 0);

      if (s.categoryMap) {
        Object.entries(s.categoryMap).forEach(([cat, data]) => {
          const c = regionCatTotals[cat] || { target: 0, achieved: 0, rateSum: 0, count: 0 };
          c.target += (data.target || 0);
          c.achieved += (data.achieved || 0);
          c.rateSum += (data.rate || 0);
          c.count += 1;
          regionCatTotals[cat] = c;
        });
      }
    });

    let vungAchievedCatCount = 0;
    if (activeCategoryList.length > 0) {
      activeCategoryList.forEach((cat) => {
        const c = regionCatTotals[cat];
        if (c) {
          const catRate = isLuyKe
            ? (c.count > 0 ? Math.round(c.rateSum / c.count) : (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : 0))
            : (c.target > 0 ? Math.round((c.achieved / c.target) * 100) : (c.count > 0 ? Math.round(c.rateSum / c.count) : 0));
          if (catRate >= 100) vungAchievedCatCount += 1;
        }
      });
    }

    const vungRate = totalCatCount > 0 ? Math.round((vungAchievedCatCount / totalCatCount) * 100) : 0;
    return {
      totalTarget: totalTargetVal,
      totalAchieved: totalAchievedVal,
      vungAchievedCatCount,
      vungRate,
    };
  }, [safeStores, bossAssignments, selectedChannels, activeCategoryList, totalCatCount, isLuyKe]);

  // 4. Store Ranking (No tags, clean display names)
  const storeRanking = useMemo(() => {
    return [...filteredStores]
      .map((s) => {
        const target = s.target || 0;
        const achieved = s.achieved || 0;

        let achievedCategories = 0;
        if (activeCategoryList.length > 0) {
          activeCategoryList.forEach((cat) => {
            const data = getCategoryData(s, cat);
            if ((data.rate || 0) >= 100) {
              achievedCategories += 1;
            }
          });
        }

        const rate =
          selectedCategory !== 'ALL'
            ? target > 0
              ? Math.round((achieved / target) * 100)
              : 0
            : activeCategoryList.length > 0
            ? Math.round((achievedCategories / activeCategoryList.length) * 100)
            : s.rate !== undefined
            ? Math.round(s.rate)
            : target > 0
            ? Math.round((achieved / target) * 100)
            : 0;

        return {
          tinh: s.tinh,
          storeName: formatStoreDisplayName(s.sieuthi),
          target,
          achieved,
          achievedCategories,
          rate,
        };
      })
      .sort((a, b) => {
        if (b.achievedCategories !== a.achievedCategories) {
          return b.achievedCategories - a.achievedCategories;
        }
        return b.rate - a.rate;
      });
  }, [filteredStores, activeCategoryList, selectedCategory]);

  // Highlights
  const top1Province = provinceRanking[0];
  const low1Province = provinceRanking[provinceRanking.length - 1];

  const top1Store = storeRanking[0];
  const low1Store = storeRanking[storeRanking.length - 1];

  const totalTarget = isSpecificProvince ? filteredStores.reduce((acc, s) => acc + (s.target || 0), 0) : regionMetrics.totalTarget;
  const totalAchieved = isSpecificProvince ? filteredStores.reduce((acc, s) => acc + (s.achieved || 0), 0) : regionMetrics.totalAchieved;
  const totalRate = isSpecificProvince
    ? (totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0)
    : regionMetrics.vungRate;

  // =========================================================================
  // TEMPLATES FOR TAB VÙNG (Scope = Toàn Vùng TNB)
  // =========================================================================

  // Mẫu 1 (Vùng): Xếp hạng tất cả Tỉnh (TOP / BOT Tỉnh)
  const templateVungRankingTinh = useMemo(() => {
    const half = Math.ceil(provinceRanking.length / 2);
    const topTinhs = provinceRanking.slice(0, half);
    const botTinhs = provinceRanking.slice(half).reverse();

    const topLines = topTinhs
      .map((p, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(p.achieved)} / ${formatInt(p.target)}`
            : `${p.achievedCategories} / ${totalCatCount}`;
        return `${medal} #${idx + 1} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    const botLines = botTinhs
      .map((p) => {
        const rank = provinceRanking.findIndex((item) => item.tinh === p.tinh) + 1;
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(p.achieved)} / ${formatInt(p.target)}`
            : `${p.achievedCategories} / ${totalCatCount}`;
        return `🔻 #${rank} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    return `${modeIcon} ${modeTitle} - BẢNG XẾP HẠNG THI ĐUA CÁC TỈNH VÙNG TNB - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ TOÀN VÙNG: ${regionMetrics.vungAchievedCatCount} / ${totalCatCount} ngành hàng đạt (${regionMetrics.vungRate}%)
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)}

🏆 TOP TỈNH DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ CÁC TỈNH CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Tỉnh bám sát, tập trung đẩy mạnh tư vấn để bứt phá mục tiêu! 💪🏼🔥`;
  }, [
    provinceRanking,
    modeIcon,
    modeTitle,
    fullTime,
    regionMetrics,
    totalTarget,
    totalAchieved,
    selectedCategory,
    totalCatCount,
  ]);

  // Mẫu 2 (Vùng): Top 10 & Bot 10 Siêu thị toàn vùng (Không tag tên)
  const templateVungTopBotStore = useMemo(() => {
    const top10 = storeRanking.slice(0, 10);
    const storesWithTarget = storeRanking.filter((s) => s.target > 0);
    const bot10 = storesWithTarget.slice(-10).reverse();

    const topLines = top10
      .map((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(s.achieved)} / ${formatInt(s.target)}`
            : `${s.achievedCategories} / ${totalCatCount}`;
        return `${medal} #${idx + 1} ${s.storeName}: ${valuePart} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    const botLines = bot10
      .map((s) => {
        const rank = storeRanking.findIndex((item) => item.storeName === s.storeName) + 1;
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(s.achieved)} / ${formatInt(s.target)}`
            : `${s.achievedCategories} / ${totalCatCount}`;
        return `🔻 #${rank} ${s.storeName}: ${valuePart} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    return `${modeIcon} ${modeTitle} - TOP/BOT SIÊU THỊ TOÀN VÙNG TNB - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ TOÀN VÙNG: ${regionMetrics.vungAchievedCatCount} / ${totalCatCount} ngành hàng đạt (${regionMetrics.vungRate}%)
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)}

🏆 TOP 10 SIÊU THỊ DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 10 SIÊU THỊ CẦN TĂNG TỐC (Chỉ xét ST có Target):
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Siêu thị bám sát, tập trung đẩy mạnh tư vấn để bứt phá mục tiêu! 💪🏼🔥`;
  }, [
    storeRanking,
    modeIcon,
    modeTitle,
    fullTime,
    regionMetrics,
    totalTarget,
    totalAchieved,
    selectedCategory,
    totalCatCount,
  ]);

  // Mẫu 3 (Vùng): Tóm tắt ngắn gọn Vùng (Top 3 & Bot 3 Tỉnh)
  const templateVungSummary = useMemo(() => {
    const top3 = provinceRanking.slice(0, 3);
    const bot3 = provinceRanking.slice(-3).reverse();

    const topLines = top3
      .map((p, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(p.achieved)} / ${formatInt(p.target)}`
            : `${p.achievedCategories} / ${totalCatCount}`;
        return `${medal} #${idx + 1} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    const botLines = bot3
      .map((p) => {
        const rank = provinceRanking.findIndex((item) => item.tinh === p.tinh) + 1;
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(p.achieved)} / ${formatInt(p.target)}`
            : `${p.achievedCategories} / ${totalCatCount}`;
        return `🔻 #${rank} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    return `${modeIcon} TÓM TẮT KẾT QUẢ THI ĐUA TỈNH TNB - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ TOÀN VÙNG: ${regionMetrics.vungAchievedCatCount} / ${totalCatCount} ngành hàng đạt (${regionMetrics.vungRate}%)
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)}

🏆 TOP 3 TỈNH DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 3 TỈNH CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Tỉnh bám sát, tập trung đẩy mạnh các ngành hàng trọng điểm để về đích xuất sắc! 💪🏼🔥`;
  }, [
    provinceRanking,
    modeIcon,
    fullTime,
    regionMetrics,
    totalTarget,
    totalAchieved,
    selectedCategory,
    totalCatCount,
  ]);

  // =========================================================================
  // TEMPLATES FOR TAB SIÊU THỊ / TỪNG TỈNH CỤ THỂ
  // =========================================================================

  // Mẫu 1 (Tỉnh): Top 10 & Bot 10 Siêu thị trong Tỉnh (Không tag tên)
  const templateTinhTopBotStore = useMemo(() => {
    const top10 = storeRanking.slice(0, 10);
    const storesWithTarget = storeRanking.filter((s) => s.target > 0);
    const bot10 = storesWithTarget.slice(-10).reverse();

    const topLines = top10
      .map((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(s.achieved)} / ${formatInt(s.target)}`
            : `${s.achievedCategories} / ${totalCatCount}`;
        return `${medal} #${idx + 1} ${s.storeName}: ${valuePart} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    const botLines = bot10
      .map((s) => {
        const rank = storeRanking.findIndex((item) => item.storeName === s.storeName) + 1;
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(s.achieved)} / ${formatInt(s.target)}`
            : `${s.achievedCategories} / ${totalCatCount}`;
        return `🔻 #${rank} ${s.storeName}: ${valuePart} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    return `${modeIcon} ${modeTitle} - TOP/BOT SIÊU THỊ TỈNH ${provinceName} - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ TỈNH ${provinceName}:
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)} (${totalRate}%)

🏆 TOP 10 SIÊU THỊ DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT 10 SIÊU THỊ CẦN TĂNG TỐC (Chỉ xét ST có Target):
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Siêu thị bám sát, tập trung đẩy mạnh tư vấn để bứt phá mục tiêu! 💪🏼🔥`;
  }, [
    storeRanking,
    provinceName,
    modeIcon,
    modeTitle,
    fullTime,
    totalTarget,
    totalAchieved,
    totalRate,
    selectedCategory,
    totalCatCount,
  ]);

  // Mẫu 2 (Tỉnh): Danh sách siêu thị cần tăng tốc trong Tỉnh (<100%)
  const templateTinhBotStores = useMemo(() => {
    const underperformingStores = storeRanking.filter((s) => s.target > 0 && s.rate < 100).slice(0, 20);

    const storeLines = underperformingStores
      .map((s, idx) => {
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(s.achieved)} / ${formatInt(s.target)}`
            : `${s.achievedCategories} / ${totalCatCount}`;
        return `🔻 #${idx + 1} ${s.storeName}: ${valuePart} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    return `⚠️ DANH SÁCH SIÊU THỊ CẦN TĂNG TỐC - TỈNH ${provinceName} - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ TỈNH ${provinceName}:
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)} (${totalRate}%)

🚨 DANH SÁCH SIÊU THỊ CẦN CẢI THIỆN TIẾN ĐỘ:
${storeLines || 'Tất cả siêu thị đều đạt tiến độ tốt!'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Siêu thị chủ động bám sát kế hoạch ngày, đẩy mạnh tư vấn để về đích xuất sắc! 💪🏼🔥`;
  }, [
    storeRanking,
    provinceName,
    fullTime,
    totalTarget,
    modeIcon,
    totalAchieved,
    totalRate,
    selectedCategory,
    totalCatCount,
  ]);

  // Mẫu 3 (Tỉnh): Tóm tắt ngắn gọn Tỉnh
  const templateTinhSummary = useMemo(() => {
    const top3 = storeRanking.slice(0, 3);
    const storesWithTarget = storeRanking.filter((s) => s.target > 0);
    const bot3 = storesWithTarget.slice(-3).reverse();

    const topLines = top3
      .map((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(s.achieved)} / ${formatInt(s.target)}`
            : `${s.achievedCategories} / ${totalCatCount}`;
        return `${medal} #${idx + 1} ${s.storeName}: ${valuePart} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    const botLines = bot3
      .map((s) => {
        const rank = storeRanking.findIndex((item) => item.storeName === s.storeName) + 1;
        const valuePart =
          selectedCategory !== 'ALL'
            ? `${formatInt(s.achieved)} / ${formatInt(s.target)}`
            : `${s.achievedCategories} / ${totalCatCount}`;
        return `🔻 #${rank} ${s.storeName}: ${valuePart} (${Math.round(s.rate)}%)`;
      })
      .join('\n');

    return `${modeIcon} TÓM TẮT KẾT QUẢ THI ĐUA TỈNH ${provinceName} - ${fullTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 KẾT QUẢ TỈNH ${provinceName}:
🎯 Target: ${formatInt(totalTarget)} | ${modeIcon} Thực đạt: ${formatInt(totalAchieved)} (${totalRate}%)

🏆 TOP SIÊU THỊ DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

⚠️ BOT SIÊU THỊ CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👉 Đề nghị các Siêu thị bám sát, tập trung đẩy mạnh tư vấn để về đích xuất sắc! 💪🏼🔥`;
  }, [
    storeRanking,
    provinceName,
    modeIcon,
    fullTime,
    totalTarget,
    totalAchieved,
    totalRate,
    selectedCategory,
    totalCatCount,
  ]);

  if (!isOpen) return null;

  const currentTemplateText = isSpecificProvince
    ? activeTemplateTab === 'template_1'
      ? templateTinhTopBotStore
      : activeTemplateTab === 'template_2'
      ? templateTinhBotStores
      : templateTinhSummary
    : activeTemplateTab === 'template_1'
    ? templateVungRankingTinh
    : templateVungSummary;

  const activeMessage = customText || currentTemplateText;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeMessage);
    setCopied(true);
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.7 } });
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5 font-black text-base">
            <MessageSquare className="w-5 h-5 text-amber-200" />
            <span>FORM NHẬN XÉT: {scopeLabel}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Quick Highlight Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-amber-700 uppercase">
                  {isSpecificProvince ? 'SIÊU THỊ DẪN ĐẦU TỈNH' : 'TỈNH DẪN ĐẦU VÙNG'}
                </div>
                <div className="text-xs font-black text-slate-900 truncate">
                  {isSpecificProvince
                    ? (top1Store ? top1Store.storeName : '-')
                    : (top1Province ? top1Province.tinh : '-')}
                </div>
                <div className="text-xs font-bold text-emerald-600">
                  {isSpecificProvince
                    ? (top1Store ? `${top1Store.achievedCategories}/${totalCatCount} (${Math.round(top1Store.rate)}%)` : '-')
                    : (top1Province ? `${top1Province.achievedCategories}/${totalCatCount} (${Math.round(top1Province.rate)}%)` : '-')}
                </div>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-rose-700 uppercase">
                  {isSpecificProvince ? 'SIÊU THỊ CẦN TĂNG TỐC' : 'TỈNH CẦN TĂNG TỐC'}
                </div>
                <div className="text-xs font-black text-slate-900 truncate">
                  {isSpecificProvince
                    ? (low1Store ? low1Store.storeName : '-')
                    : (low1Province ? low1Province.tinh : '-')}
                </div>
                <div className="text-xs font-bold text-rose-600">
                  {isSpecificProvince
                    ? (low1Store ? `${low1Store.achievedCategories}/${totalCatCount} (${Math.round(low1Store.rate)}%)` : '-')
                    : (low1Province ? `${low1Province.achievedCategories}/${totalCatCount} (${Math.round(low1Province.rate)}%)` : '-')}
                </div>
              </div>
            </div>
          </div>

          {/* Template Selector Tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-extrabold text-slate-700">
                Chọn mẫu nội dung nhận xét ({scopeLabel}):
              </label>
              {isSpecificProvince && (
                <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                  Đang lọc: {provinceName}
                </span>
              )}
            </div>
            {isSpecificProvince ? (
              /* Scope TỈNH: 3 Mẫu */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
                <button
                  onClick={() => {
                    setActiveTemplateTab('template_1');
                    setCustomText('');
                  }}
                  className={`py-2 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTemplateTab === 'template_1' && !customText
                      ? 'bg-white text-amber-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">Mẫu 1: TOP/BOT ST</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTemplateTab('template_2');
                    setCustomText('');
                  }}
                  className={`py-2 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTemplateTab === 'template_2' && !customText
                      ? 'bg-white text-rose-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="truncate">Mẫu 2: DS Cần tăng tốc</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTemplateTab('template_3');
                    setCustomText('');
                  }}
                  className={`py-2 px-2.5 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTemplateTab === 'template_3' && !customText
                      ? 'bg-white text-sky-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span className="truncate">Mẫu 3: Tóm tắt Tỉnh</span>
                </button>
              </div>
            ) : (
              /* Scope VÙNG: 2 Mẫu */
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                <button
                  onClick={() => {
                    setActiveTemplateTab('template_1');
                    setCustomText('');
                  }}
                  className={`py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTemplateTab === 'template_1' && !customText
                      ? 'bg-white text-amber-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Flame className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="truncate">Mẫu 1: Xếp hạng Tỉnh (TOP/BOT)</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTemplateTab('template_2');
                    setCustomText('');
                  }}
                  className={`py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTemplateTab === 'template_2' && !customText
                      ? 'bg-white text-sky-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Zap className="w-4 h-4 text-sky-500 shrink-0" />
                  <span className="truncate">Mẫu 2: Tóm tắt Vùng (Top/Bot Tỉnh)</span>
                </button>
              </div>
            )}
          </div>

          {/* Text Area Content */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-extrabold text-slate-700">
                Nội dung nhận xét (không tag tên, có thể chỉnh sửa trực tiếp):
              </label>
              {customText && (
                <button
                  onClick={() => setCustomText('')}
                  className="text-[11px] font-bold text-amber-600 hover:underline cursor-pointer"
                >
                  Khôi phục mẫu gốc
                </button>
              )}
            </div>
            <textarea
              rows={12}
              value={activeMessage}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono rounded-2xl p-3.5 focus:outline-hidden focus:ring-2 focus:ring-amber-500 leading-relaxed select-all shadow-inner"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-500 font-semibold">Sẵn sàng dán trực tiếp vào Zalo / Line / Teams</span>
          <button
            onClick={handleCopy}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs text-white transition-all shadow-md cursor-pointer ${
              copied ? 'bg-emerald-600' : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" /> ĐÃ SAO CHÉP VÀO CLIPBOARD!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> SAO CHÉP NHẬN XÉT
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
