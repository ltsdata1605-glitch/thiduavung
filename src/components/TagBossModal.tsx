import React, { useState, useMemo, useEffect } from 'react';
import { StoreRecord, Channel, EntityScope, RemarkDisplayMode, UserAccount } from '../types';
import {
  formatStoreDisplayName,
  getChannelForStore,
  getCategoryData,
  isExcludedStore,
  isExcludedChannel,
  getFormattedNow,
  getBossForStore,
  formatBossTag,
  formatStoreRemarkLine,
  BossAssignmentRecord,
  getPhanLoaiShopForStore,
  getTinhMoiForStore,
} from '../utils/parser';
import { getCategoryGroup } from './ReportView';
import { X, Copy, Check, MessageSquare, Flame, AlertCircle, Zap, Trophy, ListOrdered } from 'lucide-react';
import confetti from 'canvas-confetti';
import { copyTextToClipboard } from '../services/imageExport';
import { getLocalRemarkConfig, saveRemarkConfigToFirebaseAndLocal } from '../services/storeService';

function formatInt(n: number): string {
  return Math.round(n || 0).toLocaleString('vi-VN');
}

/**
 * Restricts a list of category names down to what's currently selected via
 * the Ngành Hàng (selectedCategory) and/or Nhóm N.Hàng (selectedCategoryGroup)
 * filters — both can be 'ALL' or a comma-joined multi-select string.
 */
function filterCategoriesBySelection(
  categoryNames: string[],
  selectedCategory?: string,
  selectedCategoryGroup?: string,
  categoryGroupMap?: Record<string, string>
): string[] {
  let list = categoryNames;
  if (selectedCategory && selectedCategory !== 'ALL') {
    const selectedIds = new Set(selectedCategory.split(',').map((s) => s.trim()).filter(Boolean));
    list = list.filter((c) => selectedIds.has(c));
  }
  if (selectedCategoryGroup && selectedCategoryGroup !== 'ALL') {
    const selectedGroups = new Set(selectedCategoryGroup.split(',').map((s) => s.trim()).filter(Boolean));
    list = list.filter((c) => selectedGroups.has(getCategoryGroup(c, categoryGroupMap)));
  }
  return list;
}

export interface TagBossModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreRecord[];
  selectedProvince?: string;
  selectedChannels?: Channel[];
  selectedBoss?: string;
  selectedPhanLoaiShop?: string;
  selectedTinhMoi?: string;
  selectedCategory?: string;
  selectedCategoryGroup?: string;
  categoryGroupMap?: Record<string, string>;
  bossAssignments?: BossAssignmentRecord[];
  categoryDisplayNameMap?: Record<string, string>;
  timeModeName?: string;
  lastUpdated?: string;
  entityScope?: EntityScope;
  currentUser?: UserAccount | null;
  // Toàn bộ doc user_preferences hiện tại (theo accountId) — bắt buộc truyền
  // vào để merge đúng khi lưu mẫu nhận xét, tránh setDoc (không merge) ghi đè
  // mất preference của các tài khoản khác.
  userPreferencesMap?: Record<string, any>;
}

/**
 * Generates structured, copy-paste ready remark texts dynamically based on
 * the active filter selections (filtered stores, active categories, scope).
 */
export function generateReportRemarksText(params: {
  stores: StoreRecord[];
  selectedProvince?: string;
  selectedChannels?: Channel[];
  selectedBoss?: string;
  selectedPhanLoaiShop?: string;
  selectedTinhMoi?: string;
  selectedCategory?: string;
  selectedCategoryGroup?: string;
  categoryGroupMap?: Record<string, string>;
  bossAssignments?: BossAssignmentRecord[];
  categoryDisplayNameMap?: Record<string, string>;
  timeModeName?: string;
  lastUpdated?: string;
  entityScope?: EntityScope;
  remarkDisplayMode?: RemarkDisplayMode;
  templateType?: 'template_1' | 'template_2' | 'template_3';
  includeEmoji?: boolean;
  includeCallToAction?: boolean;
  botCount?: number; // Mẫu 1 Siêu thị: số lượng Siêu thị BOT được tag, mặc định 30
}): string {
  const {
    stores = [],
    selectedProvince = 'ALL',
    selectedChannels = [],
    selectedBoss = 'ALL',
    selectedPhanLoaiShop = 'ALL',
    selectedTinhMoi = 'ALL',
    selectedCategory = 'ALL',
    selectedCategoryGroup = 'ALL',
    categoryGroupMap,
    bossAssignments = [],
    categoryDisplayNameMap = {},
    timeModeName = 'Luỹ kế',
    lastUpdated,
    entityScope = 'vung',
    remarkDisplayMode = 'user',
    templateType = 'template_1',
    includeEmoji = true,
    includeCallToAction = true,
    botCount = 30,
  } = params;

  const isLuyKe = !timeModeName.toLowerCase().includes('real');
  const safeStores = stores || [];
  const modeIcon = includeEmoji ? (isLuyKe ? '📈' : '⚡') : '•';
  const modeTitle = isLuyKe ? 'CẬP NHẬT LUỸ KẾ' : 'CẬP NHẬT REALTIME';
  const fullTime = lastUpdated || getFormattedNow();

  const isSpecificProvince = Boolean(selectedProvince && selectedProvince !== 'ALL');
  const isSpecificBoss = Boolean(selectedBoss && selectedBoss !== 'ALL');
  const isSpecificPhanLoai = Boolean(selectedPhanLoaiShop && selectedPhanLoaiShop !== 'ALL');
  const isSpecificTinhMoi = Boolean(selectedTinhMoi && selectedTinhMoi !== 'ALL');
  const hasChannelFilter = Boolean(selectedChannels && selectedChannels.length > 0);

  // 1. Filter stores based strictly on ALL active filters
  const filteredStores = safeStores.filter((s) => {
    if (isExcludedStore(s, bossAssignments)) return false;
    if (isSpecificProvince && s.tinh !== selectedProvince) return false;
    const effectiveKenh = getChannelForStore(s.sieuthi, bossAssignments, s.kenh);
    if (hasChannelFilter && !selectedChannels.includes(effectiveKenh as Channel)) return false;
    if (isSpecificBoss) {
      const effectiveBoss = getBossForStore(s.sieuthi, bossAssignments, s.boss);
      if (effectiveBoss !== selectedBoss && s.boss !== selectedBoss) return false;
    }
    if (isSpecificPhanLoai && getPhanLoaiShopForStore(s.sieuthi, bossAssignments) !== selectedPhanLoaiShop) return false;
    if (isSpecificTinhMoi && getTinhMoiForStore(s.sieuthi, bossAssignments) !== selectedTinhMoi) return false;
    return true;
  });

  // 2. Identify active categories matching selectedCategory & selectedCategoryGroup
  const set = new Set<string>();
  filteredStores.forEach((s) => {
    if (s.categoryMap) {
      Object.keys(s.categoryMap).forEach((cat) => set.add(cat));
    }
  });
  const activeCategoryList = filterCategoriesBySelection(Array.from(set), selectedCategory, selectedCategoryGroup, categoryGroupMap);
  const totalCatCount = activeCategoryList.length || 1;

  // 3. Build scope title & category title
  const scopeParts: string[] = [];
  if (isSpecificProvince) scopeParts.push(`TỈNH ${selectedProvince.toUpperCase()}`);
  if (isSpecificBoss) scopeParts.push(`BOSS ${selectedBoss}`);
  if (hasChannelFilter) scopeParts.push(`KÊNH ${selectedChannels.join(', ')}`);
  if (isSpecificPhanLoai) scopeParts.push(`SHOP ${selectedPhanLoaiShop}`);
  if (isSpecificTinhMoi) scopeParts.push(`TỈNH MỚI ${selectedTinhMoi}`);
  const scopeTitle = scopeParts.length > 0 ? scopeParts.join(' - ') : 'TOÀN VÙNG TNB';

  let categoryTitle = 'BẢNG XẾP HẠNG THI ĐUA';
  if (selectedCategory && selectedCategory !== 'ALL') {
    const rawCatName = selectedCategory.split(',')[0].trim();
    const displayName = categoryDisplayNameMap[rawCatName] || rawCatName;
    categoryTitle = `NGÀNH HÀNG ${displayName}`;
  } else if (selectedCategoryGroup && selectedCategoryGroup !== 'ALL') {
    categoryTitle = `NHÓM ${selectedCategoryGroup}`;
  }

  const callToActionText = includeCallToAction
    ? `\n━━━━━━━━━━━━━━\n👉 Đề nghị các Siêu thị / Tỉnh bám sát, tập trung đẩy mạnh tư vấn để bứt phá mục tiêu! ${includeEmoji ? '💪🏼🔥' : ''}`
    : '';

  // 4. Province-level ranking (when on Tab VÙNG: entityScope === 'sieuthi')
  const isProvinceLevel = entityScope === 'sieuthi';

  if (isProvinceLevel) {
    const map = new Map<
      string,
      {
        target: number;
        achieved: number;
        storesCount: number;
        catTotals: Record<string, { target: number; achieved: number; rateSum: number; count: number }>;
      }
    >();

    filteredStores.forEach((s) => {
      const tinh = s.tinh || 'Khác';
      const cur = map.get(tinh) || { target: 0, achieved: 0, storesCount: 0, catTotals: {} };
      cur.target += s.target || 0;
      cur.achieved += s.achieved || 0;
      cur.storesCount += 1;

      if (s.categoryMap) {
        Object.entries(s.categoryMap).forEach(([cat, data]) => {
          const c = cur.catTotals[cat] || { target: 0, achieved: 0, rateSum: 0, count: 0 };
          c.target += data.target || 0;
          c.achieved += data.achieved || 0;
          c.rateSum += data.rate || 0;
          c.count += 1;
          cur.catTotals[cat] = c;
        });
      }

      map.set(tinh, cur);
    });

    const provinceRanking = Array.from(map.entries())
      .map(([tinh, stat]) => {
        let achievedCategories = 0;
        let catTargetSum = 0;
        let catAchievedSum = 0;

        if (activeCategoryList.length > 0) {
          activeCategoryList.forEach((cat) => {
            const c = stat.catTotals[cat];
            if (c) {
              catTargetSum += c.target;
              catAchievedSum += c.achieved;
              const catRate = isLuyKe
                ? c.count > 0
                  ? Math.round(c.rateSum / c.count)
                  : c.target > 0
                  ? Math.round((c.achieved / c.target) * 100)
                  : 0
                : c.target > 0
                ? Math.round((c.achieved / c.target) * 100)
                : c.count > 0
                ? Math.round(c.rateSum / c.count)
                : 0;

              if (catRate >= 100) achievedCategories += 1;
            }
          });
        }

        const rate =
          totalCatCount === 1
            ? catTargetSum > 0
              ? Math.round((catAchievedSum / catTargetSum) * 100)
              : 0
            : totalCatCount > 0
            ? Math.round((achievedCategories / totalCatCount) * 100)
            : 0;

        return {
          tinh,
          target: catTargetSum || stat.target,
          achieved: catAchievedSum || stat.achieved,
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

    const totalTargetVal = provinceRanking.reduce((acc, p) => acc + p.target, 0);
    const totalAchievedVal = provinceRanking.reduce((acc, p) => acc + p.achieved, 0);
    const vungRate = totalTargetVal > 0 ? Math.round((totalAchievedVal / totalTargetVal) * 100) : 0;
    const reachedProvinces = provinceRanking.filter((p) => (totalCatCount === 1 ? p.rate >= 100 : p.achievedCategories === totalCatCount)).length;

    const channelInfo = hasChannelFilter ? `📡 Kênh: ${selectedChannels.join(', ')}\n` : '';
    const remaining = totalTargetVal - totalAchievedVal;
    const isSurpassed = remaining <= 0 && totalTargetVal > 0;
    const totalSummaryLine = totalCatCount === 1
      ? (isSurpassed
          ? `🎉 ĐÃ VƯỢT: +${formatInt(Math.abs(remaining))} (${vungRate}%) - Hoàn thành xuất sắc mục tiêu! 🚀`
          : `📉 CÒN THIẾU: ${formatInt(remaining)} để hoàn thành 100% mục tiêu`)
      : `${includeEmoji ? '📊' : '•'} Tiến độ: ${reachedProvinces} / ${provinceRanking.length} Tỉnh đạt đủ ${totalCatCount} ngành`;

    if (templateType === 'template_2') {
      // Mẫu 2 Vùng: Tỉnh cần tăng tốc
      const botTinhs = provinceRanking.filter((p) => p.rate < 80 || (totalCatCount > 1 && p.achievedCategories < Math.round(totalCatCount * 0.8)));
      const botLines = (botTinhs.length > 0 ? botTinhs : provinceRanking.slice(-5).reverse())
        .map((p) => {
          const rank = provinceRanking.findIndex((item) => item.tinh === p.tinh) + 1;
          const valuePart = totalCatCount === 1 ? `${formatInt(p.achieved)} / ${formatInt(p.target)}` : `${p.achievedCategories} / ${totalCatCount} ngành`;
          return `${includeEmoji ? '🔻' : '•'} #${rank} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
        })
        .join('\n');

      return `${modeIcon} ${modeTitle} - ${categoryTitle.toUpperCase()} - ${fullTime}
${channelInfo}━━━━━━━━━━━━━━
${includeEmoji ? '📊' : '•'} KẾT QUẢ VÙNG:
${includeEmoji ? '🎯' : '•'} Target: ${formatInt(totalTargetVal)} | ${modeIcon} Thực đạt: ${formatInt(totalAchievedVal)} (${vungRate}%)
${totalSummaryLine}

${includeEmoji ? '⚠️' : '•'} CÁC TỈNH CẦN TĂNG TỐC:
${botLines || 'Tất cả các tỉnh đều đang đạt kết quả tốt'}
━━━━━━━━━━━━━━
💪🏼 Quyết tâm bứt phá mục tiêu hôm nay! 🔥`;
    }

    if (templateType === 'template_3') {
      // Mẫu 3 Vùng: Tóm tắt Top 3 & Bot 3
      const top3 = provinceRanking.slice(0, 3);
      const bot3 = provinceRanking.slice(-3).reverse();

      const topLines = top3
        .map((p, idx) => {
          const medal = includeEmoji ? (idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉') : `#${idx + 1}`;
          const valuePart = totalCatCount === 1 ? `${formatInt(p.achieved)} / ${formatInt(p.target)}` : `${p.achievedCategories} / ${totalCatCount} ngành`;
          return `${medal} #${idx + 1} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
        })
        .join('\n');

      const botLines = bot3
        .map((p) => {
          const rank = provinceRanking.findIndex((item) => item.tinh === p.tinh) + 1;
          const valuePart = totalCatCount === 1 ? `${formatInt(p.achieved)} / ${formatInt(p.target)}` : `${p.achievedCategories} / ${totalCatCount} ngành`;
          return `${includeEmoji ? '🔻' : '•'} #${rank} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
        })
        .join('\n');

      return `${modeIcon} ${modeTitle} - ${categoryTitle.toUpperCase()} - ${fullTime}
${channelInfo}━━━━━━━━━━━━━━
${includeEmoji ? '📊' : '•'} KẾT QUẢ VÙNG:
${includeEmoji ? '🎯' : '•'} Target: ${formatInt(totalTargetVal)} | ${modeIcon} Thực đạt: ${formatInt(totalAchievedVal)} (${vungRate}%)
${totalSummaryLine}

${includeEmoji ? '🏆' : '•'} TOP 3 TỈNH DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

${includeEmoji ? '⚠️' : '•'} BOT 3 TỈNH CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━
💪🏼 Quyết tâm bứt phá mục tiêu hôm nay! 🔥`;
    }

    // Mẫu 1 Vùng: Đầy đủ Top & Bot
    const half = Math.min(Math.ceil(provinceRanking.length / 2), 5);
    const topTinhs = provinceRanking.slice(0, half);
    const botTinhs = provinceRanking.slice(-half).reverse();

    const topLines = topTinhs
      .map((p, idx) => {
        const medal = includeEmoji ? (idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹') : `#${idx + 1}`;
        const valuePart = totalCatCount === 1 ? `${formatInt(p.achieved)} / ${formatInt(p.target)}` : `${p.achievedCategories} / ${totalCatCount} ngành`;
        return `${medal} #${idx + 1} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    const botLines = botTinhs
      .map((p) => {
        const rank = provinceRanking.findIndex((item) => item.tinh === p.tinh) + 1;
        const valuePart = totalCatCount === 1 ? `${formatInt(p.achieved)} / ${formatInt(p.target)}` : `${p.achievedCategories} / ${totalCatCount} ngành`;
        return `${includeEmoji ? '🔻' : '•'} #${rank} ${p.tinh}: ${valuePart} (${Math.round(p.rate)}%)`;
      })
      .join('\n');

    return `${modeIcon} ${modeTitle} - ${categoryTitle.toUpperCase()} - ${fullTime}
${channelInfo}━━━━━━━━━━━━━━
${includeEmoji ? '📊' : '•'} KẾT QUẢ VÙNG:
${includeEmoji ? '🎯' : '•'} Target: ${formatInt(totalTargetVal)} | ${modeIcon} Thực đạt: ${formatInt(totalAchievedVal)} (${vungRate}%)
${totalSummaryLine}

${includeEmoji ? '🏆' : '•'} TOP TỈNH DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

${includeEmoji ? '⚠️' : '•'} CÁC TỈNH CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
━━━━━━━━━━━━━━
💪🏼 Quyết tâm bứt phá mục tiêu hôm nay! 🔥`;
  }

  // 5. STORE-LEVEL RANKING (Tab Siêu Thị hoặc khi có bất kỳ bộ lọc nào)
  const storeRanking = [...filteredStores]
    .map((s) => {
      let achievedCategories = 0;
      let target = 0;
      let achieved = 0;

      if (totalCatCount === 1) {
        const cat = activeCategoryList[0];
        const data = getCategoryData(s, cat);
        target = data.target || 0;
        achieved = data.achieved || 0;
        const catRate = data.rate ?? (target > 0 ? (achieved / target) * 100 : 0);
        if (catRate >= 100) achievedCategories = 1;
        const rate = Math.round(catRate);

        const boss = getBossForStore(s.sieuthi, bossAssignments, s.boss);
        const bossTag = formatBossTag(boss);

        return {
          tinh: s.tinh,
          storeName: formatStoreDisplayName(s.sieuthi),
          target,
          achieved,
          achievedCategories,
          rate,
          boss,
          bossTag,
        };
      }

      // Multiple categories or group
      activeCategoryList.forEach((cat) => {
        const data = getCategoryData(s, cat);
        target += data.target || 0;
        achieved += data.achieved || 0;
        if ((data.rate || 0) >= 100) {
          achievedCategories += 1;
        }
      });

      const rate = totalCatCount > 0 ? Math.round((achievedCategories / totalCatCount) * 100) : 0;
      const boss = getBossForStore(s.sieuthi, bossAssignments, s.boss);
      const bossTag = formatBossTag(boss);

      return {
        tinh: s.tinh,
        storeName: formatStoreDisplayName(s.sieuthi),
        target,
        achieved,
        achievedCategories,
        rate,
        boss,
        bossTag,
      };
    })
    .sort((a, b) => {
      if (b.achievedCategories !== a.achievedCategories) {
        return b.achievedCategories - a.achievedCategories;
      }
      return b.rate - a.rate;
    });

  const totalTargetVal = storeRanking.reduce((acc, s) => acc + (s.target || 0), 0);
  const totalAchievedVal = storeRanking.reduce((acc, s) => acc + (s.achieved || 0), 0);
  const totalRateVal = totalTargetVal > 0 ? Math.round((totalAchievedVal / totalTargetVal) * 100) : 0;
  const reachedCount = storeRanking.filter((s) => (totalCatCount === 1 ? s.rate >= 100 : s.achievedCategories === totalCatCount)).length;

  if (templateType === 'template_2') {
    // Mẫu 2 Siêu thị: Danh sách cần tăng tốc (< 100% hoặc < 80%)
    const warningStores = storeRanking.filter((s) => (totalCatCount === 1 ? s.rate < 100 : s.rate < 80 || s.achievedCategories < totalCatCount) && (s.target > 0 || totalCatCount === 1));
    // Tag tối đa 30 Boss để tránh vượt giới hạn @mention của Zalo/Line khi danh sách cần tăng tốc quá dài
    const warningLines = (warningStores.length > 0 ? warningStores : storeRanking.slice(-10).reverse())
      .slice(0, 30)
      .map((s) => {
        const rank = storeRanking.findIndex((item) => item.storeName === s.storeName) + 1;
        const valuePart = totalCatCount === 1 ? `${formatInt(s.achieved)} / ${formatInt(s.target)}` : `${s.achievedCategories} / ${totalCatCount}`;
        return formatStoreRemarkLine({
          prefix: `${includeEmoji ? '⚠️' : '•'} #${rank}`,
          storeName: s.storeName,
          bossTag: s.bossTag,
          rawBoss: s.boss,
          valuePart,
          rate: s.rate,
          mode: remarkDisplayMode,
          group: 'bot',
        });
      })
      .join('\n');

    return `${modeIcon} ${modeTitle} - ${categoryTitle.toUpperCase()} - CÁC SIÊU THỊ CẦN TĂNG TỐC ${scopeTitle} - ${fullTime}
━━━━━━━━━━━━━━
${includeEmoji ? '📊' : '•'} KẾT QUẢ ${scopeTitle}: ${reachedCount} / ${storeRanking.length} Siêu thị đạt ${totalCatCount === 1 ? '(≥ 100%)' : `đủ ${totalCatCount} ngành`}
${includeEmoji ? '🎯' : '•'} Target: ${formatInt(totalTargetVal)} | ${modeIcon} Thực đạt: ${formatInt(totalAchievedVal)} (${totalRateVal}%)

${includeEmoji ? '🚨' : '•'} DANH SÁCH SIÊU THỊ CẦN BỨT PHÁ GẤP:
${warningLines || 'Tất cả siêu thị đều đang đạt tiến độ xuất sắc!'}
${callToActionText}`;
  }

  if (templateType === 'template_3') {
    // Mẫu 3 Siêu thị: Toàn bộ danh sách siêu thị (hoặc Tóm tắt Top 5 & Bot 5 nếu danh sách quá dài)
    const storesToShow = storeRanking.length <= 30 ? storeRanking : [...storeRanking.slice(0, 5), ...storeRanking.slice(-5)];
    const allLines = storesToShow
      .map((s) => {
        const rank = storeRanking.findIndex((item) => item.storeName === s.storeName) + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank <= 5 ? '🔹' : '🔻';
        const valuePart = totalCatCount === 1 ? `${formatInt(s.achieved)} / ${formatInt(s.target)}` : `${s.achievedCategories} / ${totalCatCount}`;
        return formatStoreRemarkLine({
          prefix: `${includeEmoji ? medal : '•'} #${rank}`,
          storeName: s.storeName,
          bossTag: s.bossTag,
          rawBoss: s.boss,
          valuePart,
          rate: s.rate,
          mode: remarkDisplayMode,
          group: rank <= 5 ? 'top' : 'bot',
        });
      })
      .join('\n');

    return `${modeIcon} ${modeTitle} - BẢNG XẾP HẠNG ${categoryTitle.toUpperCase()} ${scopeTitle} - ${fullTime}
━━━━━━━━━━━━━━
${includeEmoji ? '📊' : '•'} KẾT QUẢ ${scopeTitle}: ${reachedCount} / ${storeRanking.length} Siêu thị đạt ${totalCatCount === 1 ? '(≥ 100%)' : `đủ ${totalCatCount} ngành`}
${includeEmoji ? '🎯' : '•'} Target: ${formatInt(totalTargetVal)} | ${modeIcon} Thực đạt: ${formatInt(totalAchievedVal)} (${totalRateVal}%)

${includeEmoji ? '📋' : '•'} DANH SÁCH BẢNG XẾP HẠNG:
${allLines || 'Đang cập nhật'}
${callToActionText}`;
  }

  // Mẫu 1 Siêu thị: Top 10 + Bot {botCount} Siêu thị (botCount tuỳ chỉnh, mặc định 30)
  const top10 = storeRanking.slice(0, 10);
  const storesWithTarget = storeRanking.filter((s) => s.target > 0 || totalCatCount === 1);
  const botStores = storesWithTarget.slice(-Math.max(1, botCount)).reverse();

  const topLines = top10
    .map((s, idx) => {
      const medal = includeEmoji ? (idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹') : `#${idx + 1}`;
      const valuePart = totalCatCount === 1 ? `${formatInt(s.achieved)} / ${formatInt(s.target)}` : `${s.achievedCategories} / ${totalCatCount}`;
      return formatStoreRemarkLine({
        prefix: `${medal} #${idx + 1}`,
        storeName: s.storeName,
        bossTag: s.bossTag,
        rawBoss: s.boss,
        valuePart,
        rate: s.rate,
        mode: remarkDisplayMode,
        group: 'top',
      });
    })
    .join('\n');

  const botLines = botStores
    .map((s) => {
      const rank = storeRanking.findIndex((item) => item.storeName === s.storeName) + 1;
      const valuePart = totalCatCount === 1 ? `${formatInt(s.achieved)} / ${formatInt(s.target)}` : `${s.achievedCategories} / ${totalCatCount}`;
      return formatStoreRemarkLine({
        prefix: `${includeEmoji ? '🔻' : '•'} #${rank}`,
        storeName: s.storeName,
        bossTag: s.bossTag,
        rawBoss: s.boss,
        valuePart,
        rate: s.rate,
        mode: remarkDisplayMode,
        group: 'bot',
      });
    })
    .join('\n');

  return `${modeIcon} ${modeTitle} - ${categoryTitle.toUpperCase()} - TOP/BOT SIÊU THỊ ${scopeTitle} - ${fullTime}
━━━━━━━━━━━━━━
${includeEmoji ? '📊' : '•'} KẾT QUẢ ${scopeTitle}: ${reachedCount} / ${storeRanking.length} Siêu thị đạt ${totalCatCount === 1 ? '(≥ 100%)' : `đủ ${totalCatCount} ngành`}
${includeEmoji ? '🎯' : '•'} Target: ${formatInt(totalTargetVal)} | ${modeIcon} Thực đạt: ${formatInt(totalAchievedVal)} (${totalRateVal}%)

${includeEmoji ? '🏆' : '•'} TOP 10 SIÊU THỊ DẪN ĐẦU:
${topLines || 'Đang cập nhật'}

${includeEmoji ? '⚠️' : '•'} BOT ${botStores.length} SIÊU THỊ CẦN TĂNG TỐC:
${botLines || 'Đang cập nhật'}
${callToActionText}`;
}

export const TagBossModal: React.FC<TagBossModalProps> = ({
  isOpen,
  onClose,
  stores = [],
  selectedProvince = 'ALL',
  selectedChannels = [],
  selectedBoss = 'ALL',
  selectedPhanLoaiShop = 'ALL',
  selectedTinhMoi = 'ALL',
  selectedCategory = 'ALL',
  selectedCategoryGroup = 'ALL',
  categoryGroupMap,
  bossAssignments = [],
  categoryDisplayNameMap = {},
  timeModeName = 'Luỹ kế',
  lastUpdated,
  entityScope = 'vung',
  currentUser,
  userPreferencesMap = {},
}) => {
  const accountId = currentUser?.accountId || 'global';
  const [copied, setCopied] = useState(false);
  const [activeTemplateTab, setActiveTemplateTab] = useState<'template_1' | 'template_2' | 'template_3'>('template_1');
  // LƯU Ý: giá trị entityScope bị đặt tên ngược với nhãn nút bấm trên UI —
  // nút "SIÊU THỊ" gọi setEntityScope('vung'), nút "VÙNG" gọi
  // setEntityScope('sieuthi') (xem HeaderBanner.tsx). Nên Tab Siêu Thị (theo
  // đúng nhãn người dùng nhìn thấy) ứng với entityScope === 'vung'.
  const isTabSieuThi = entityScope === 'vung';
  const [remarkDisplayMode, setRemarkDisplayMode] = useState<RemarkDisplayMode>(() =>
    isTabSieuThi ? 'no_tag_top' : getLocalRemarkConfig(accountId).displayMode
  );
  const [botCount, setBotCount] = useState<number>(() => getLocalRemarkConfig(accountId).botCount);
  const [customText, setCustomText] = useState<string>('');

  // Mỗi lần mở modal (và khi đổi tài khoản trong lúc modal đang mở sẵn trong
  // cây component, không unmount) nạp lại mẫu nhận xét. Riêng Tab Siêu Thị
  // luôn mặc định "Bỏ Tag TOP" — dù trên thiết bị nào, tài khoản nào (admin
  // hay viewer), hay đã từng lưu mẫu khác — vì đây là nơi hay xuất ảnh gửi
  // nhóm, không tag TOP cá nhân. Tab Vùng/khác vẫn theo đúng mẫu đã lưu
  // riêng của tài khoản.
  useEffect(() => {
    if (!isOpen) return;
    const cfg = getLocalRemarkConfig(accountId);
    setRemarkDisplayMode(isTabSieuThi ? 'no_tag_top' : cfg.displayMode);
    setBotCount(cfg.botCount);
  }, [isOpen, accountId, entityScope]);

  // Lưu displayMode/botCount vào Firebase + localStorage riêng theo accountId,
  // giữ nguyên các field khác (templateType, emoji, cta) đã lưu trước đó.
  const persistRemarkConfig = (patch: Partial<{ displayMode: RemarkDisplayMode; botCount: number }>) => {
    const updated = { ...getLocalRemarkConfig(accountId), ...patch };
    const updatedBy = currentUser?.name || currentUser?.accountId || 'User';
    saveRemarkConfigToFirebaseAndLocal(updated, userPreferencesMap, accountId, updatedBy).catch((e) => {
      console.error('Failed to persist remark config:', e);
    });
  };

  const isSpecificProvince = Boolean(selectedProvince && selectedProvince !== 'ALL');
  const isSpecificBoss = Boolean(selectedBoss && selectedBoss !== 'ALL');
  const isSpecificPhanLoai = Boolean(selectedPhanLoaiShop && selectedPhanLoaiShop !== 'ALL');
  const isSpecificTinhMoi = Boolean(selectedTinhMoi && selectedTinhMoi !== 'ALL');
  const isProvinceLevel = entityScope === 'sieuthi';

  const scopeLabel = isProvinceLevel ? 'VÙNG' : selectedProvince !== 'ALL' ? `TỈNH ${selectedProvince}` : selectedBoss !== 'ALL' ? `BOSS ${selectedBoss}` : 'SIÊU THỊ';

  const template1Text = useMemo(() => {
    return generateReportRemarksText({
      stores,
      selectedProvince,
      selectedChannels,
      selectedBoss,
      selectedPhanLoaiShop,
      selectedTinhMoi,
      selectedCategory,
      selectedCategoryGroup,
      categoryGroupMap,
      bossAssignments,
      categoryDisplayNameMap,
      timeModeName,
      lastUpdated,
      entityScope,
      remarkDisplayMode,
      templateType: 'template_1',
      botCount,
    });
  }, [stores, selectedProvince, selectedChannels, selectedBoss, selectedPhanLoaiShop, selectedTinhMoi, selectedCategory, selectedCategoryGroup, categoryGroupMap, bossAssignments, categoryDisplayNameMap, timeModeName, lastUpdated, entityScope, remarkDisplayMode, botCount]);

  const template2Text = useMemo(() => {
    return generateReportRemarksText({
      stores,
      selectedProvince,
      selectedChannels,
      selectedBoss,
      selectedPhanLoaiShop,
      selectedTinhMoi,
      selectedCategory,
      selectedCategoryGroup,
      categoryGroupMap,
      bossAssignments,
      categoryDisplayNameMap,
      timeModeName,
      lastUpdated,
      entityScope,
      remarkDisplayMode,
      templateType: 'template_2',
    });
  }, [stores, selectedProvince, selectedChannels, selectedBoss, selectedPhanLoaiShop, selectedTinhMoi, selectedCategory, selectedCategoryGroup, categoryGroupMap, bossAssignments, categoryDisplayNameMap, timeModeName, lastUpdated, entityScope, remarkDisplayMode]);

  const template3Text = useMemo(() => {
    return generateReportRemarksText({
      stores,
      selectedProvince,
      selectedChannels,
      selectedBoss,
      selectedPhanLoaiShop,
      selectedTinhMoi,
      selectedCategory,
      selectedCategoryGroup,
      categoryGroupMap,
      bossAssignments,
      categoryDisplayNameMap,
      timeModeName,
      lastUpdated,
      entityScope,
      remarkDisplayMode,
      templateType: 'template_3',
    });
  }, [stores, selectedProvince, selectedChannels, selectedBoss, selectedPhanLoaiShop, selectedTinhMoi, selectedCategory, selectedCategoryGroup, categoryGroupMap, bossAssignments, categoryDisplayNameMap, timeModeName, lastUpdated, entityScope, remarkDisplayMode]);

  if (!isOpen) return null;

  const currentTemplateText =
    activeTemplateTab === 'template_1'
      ? template1Text
      : activeTemplateTab === 'template_2'
      ? template2Text
      : template3Text;

  const activeMessage = customText || currentTemplateText;

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(activeMessage);
    if (ok) {
      setCopied(true);
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.7 } });
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5 font-black text-base">
            <MessageSquare className="w-5 h-5 text-amber-200" />
            <span>NHẬN XÉT DỮ LIỆU ĐANG LỌC ({scopeLabel})</span>
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
          {/* Template Selector Tabs & Remark Format Selector */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-extrabold text-slate-700">
                Chọn mẫu nội dung nhận xét:
              </label>

              {/* Số lượng Siêu thị BOT được tag — chỉ áp dụng cho Mẫu 1: TOP/BOT */}
              {!isProvinceLevel && activeTemplateTab === 'template_1' && (
                <div className="flex items-center gap-1.5">
                  <label htmlFor="bot-count-input" className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                    Số lượng BOT:
                  </label>
                  <input
                    id="bot-count-input"
                    type="number"
                    min={1}
                    max={999}
                    value={botCount}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setBotCount(Number.isFinite(n) && n > 0 ? Math.min(999, n) : 1);
                      setCustomText('');
                    }}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value, 10);
                      persistRemarkConfig({ botCount: Number.isFinite(n) && n > 0 ? Math.min(999, n) : 1 });
                    }}
                    className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-[11px] font-bold text-center focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* Tùy chọn hiển thị nhận xét: User | Siêu thị | Siêu thị + User
                  Chỉ có ý nghĩa ở cấp Siêu thị (có boss/tên ST để hiển thị) —
                  Nhận xét cấp VÙNG chỉ liệt kê Tỉnh nên ẩn hẳn bộ chọn này. */}
              {!isProvinceLevel && (
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
                {(
                  [
                    { id: 'user', label: 'User' },
                    { id: 'sieuthi', label: 'Siêu thị' },
                    { id: 'sieuthi_user', label: 'Siêu thị + User' },
                    { id: 'no_tag_top', label: 'Bỏ Tag TOP' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setRemarkDisplayMode(opt.id);
                      setCustomText('');
                      persistRemarkConfig({ displayMode: opt.id });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      remarkDisplayMode === opt.id
                        ? 'bg-amber-500 text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-white/80'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded-xs border flex items-center justify-center ${
                        remarkDisplayMode === opt.id ? 'border-white bg-white text-amber-600' : 'border-slate-400 bg-white'
                      }`}
                    >
                      {remarkDisplayMode === opt.id && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
              )}
            </div>

            {/* Template Buttons */}
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
                <span className="truncate">Mẫu 1: TOP/BOT</span>
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
                <span className="truncate">Mẫu 2: Cần tăng tốc</span>
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
                <span className="truncate">Mẫu 3: Đầy đủ / Tóm tắt</span>
              </button>
            </div>
          </div>

          {/* Text Area Content */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-extrabold text-slate-700">
                Nội dung nhận xét (tự động theo bộ lọc):
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
              rows={13}
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
