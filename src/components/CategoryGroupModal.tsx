import React, { useState } from 'react';
import { X, FolderTree, Plus, Trash2, Save, GripVertical, ChevronUp, ChevronDown, Move, Pencil, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { getCategoryGroup } from './ReportView';
import { getShortCategoryName } from '../utils/parser';

interface CategoryGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryList: { id: string; label: string }[];
  categoryGroupMap: Record<string, string>;
  categoryOrderMap?: Record<string, number>;
  categoryDisplayNameMap?: Record<string, string>;
  categoryHiddenMap?: Record<string, boolean>;
  onSave: (
    newMap: Record<string, string>,
    newOrderMap: Record<string, number>,
    newDisplayNameMap: Record<string, string>,
    newHiddenMap: Record<string, boolean>
  ) => void;
}

const UNGROUPED = '__UNGROUPED__';

const getEffectiveGroup = (catId: string, catLabel: string, map: Record<string, string>): string => {
  if (map[catId]) return map[catId];
  if (map[catLabel]) return map[catLabel];
  const grp = getCategoryGroup(catLabel || catId, map);
  return grp === 'Chưa phân nhóm' ? UNGROUPED : grp;
};

const buildInitialDraftMap = (categoryList: { id: string; label: string }[], map: Record<string, string>): Record<string, string> => {
  const draft: Record<string, string> = { ...map };
  categoryList.forEach((c) => {
    const grp = getEffectiveGroup(c.id, c.label, map);
    if (grp !== UNGROUPED) {
      draft[c.id] = grp;
    }
  });
  return draft;
};

const isCatHidden = (catId: string, catLabel: string, hiddenMap: Record<string, boolean>): boolean => {
  return !!(
    hiddenMap[catId] ||
    hiddenMap[catLabel] ||
    (catId && hiddenMap[catId.toLowerCase()]) ||
    (catLabel && hiddenMap[catLabel.toLowerCase()])
  );
};

export const CategoryGroupModal: React.FC<CategoryGroupModalProps> = ({
  isOpen,
  onClose,
  categoryList,
  categoryGroupMap,
  categoryOrderMap = {},
  categoryDisplayNameMap = {},
  categoryHiddenMap = {},
  onSave,
}) => {
  // Local draft state — only committed to the app (and Firebase) on Save.
  const [draftMap, setDraftMap] = useState<Record<string, string>>(() =>
    buildInitialDraftMap(categoryList, categoryGroupMap)
  );
  const [draftOrderMap, setDraftOrderMap] = useState<Record<string, number>>(categoryOrderMap);
  // Custom, user-shortened Ngành hàng names — overrides the built-in
  // auto-abbreviation dictionary wherever the category is displayed.
  const [draftDisplayNameMap, setDraftDisplayNameMap] = useState<Record<string, string>>(categoryDisplayNameMap);
  // Hidden categories map (catId -> true)
  const [draftHiddenMap, setDraftHiddenMap] = useState<Record<string, boolean>>(() => ({ ...categoryHiddenMap }));
  const [groups, setGroups] = useState<string[]>(() =>
    Array.from(new Set([...Object.values(draftMap), 'CE & GD', 'DỊCH VỤ', 'ICT'])).filter(
      (g) => g !== UNGROUPED && g !== 'Chưa phân nhóm'
    ).sort()
  );
  const [newGroupName, setNewGroupName] = useState('');

  // Drag and drop state
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);

  // Re-seed the draft from the latest saved map every time the modal opens
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    const initialDraft = buildInitialDraftMap(categoryList, categoryGroupMap);
    setDraftMap(initialDraft);
    setDraftOrderMap(categoryOrderMap);
    setDraftDisplayNameMap(categoryDisplayNameMap);
    setDraftHiddenMap({ ...(categoryHiddenMap || {}) });
    setGroups(
      Array.from(new Set([...Object.values(initialDraft), 'CE & GD', 'DỊCH VỤ', 'ICT'])).filter(
        (g) => g !== UNGROUPED && g !== 'Chưa phân nhóm'
      ).sort()
    );
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  if (!isOpen) return null;

  const handleCreateGroup = () => {
    const name = newGroupName.trim();
    if (!name || groups.includes(name)) return;
    setGroups([...groups, name].sort());
    setNewGroupName('');
  };

  const handleDeleteGroup = (group: string) => {
    setGroups(groups.filter((g) => g !== group));
    setDraftMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((cat) => {
        if (next[cat] === group) delete next[cat];
      });
      return next;
    });
  };

  // Auto-sort category list by assigned group first, then by custom order number, then alphabetically
  const sortedCategoryList = [...categoryList].sort((a, b) => {
    const groupA = getEffectiveGroup(a.id, a.label, draftMap);
    const groupB = getEffectiveGroup(b.id, b.label, draftMap);

    if (groupA !== groupB) {
      return groupA.localeCompare(groupB, 'vi');
    }
    const orderA = draftOrderMap[a.id] ?? 999;
    const orderB = draftOrderMap[b.id] ?? 999;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.label.localeCompare(b.label, 'vi');
  });

  // Assign category to a group and re-index STT numbers sequentially
  const handleAssign = (categoryId: string, newGroup: string, insertBeforeCatId?: string) => {
    setDraftMap((prevMap) => {
      const nextMap = { ...prevMap, [categoryId]: newGroup };
      if (newGroup === UNGROUPED) delete nextMap[categoryId];
      return nextMap;
    });

    if (newGroup === UNGROUPED) {
      setDraftOrderMap((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      return;
    }

    setDraftOrderMap((prevOrder) => {
      const nextOrder = { ...prevOrder };
      const groupCats = categoryList.filter((c) => {
        if (c.id === categoryId) return false;
        return (draftMap[c.id] || UNGROUPED) === newGroup;
      });

      groupCats.sort((a, b) => (prevOrder[a.id] ?? 999) - (prevOrder[b.id] ?? 999));

      if (insertBeforeCatId) {
        const insertIdx = groupCats.findIndex((c) => c.id === insertBeforeCatId);
        if (insertIdx >= 0) {
          groupCats.splice(insertIdx, 0, { id: categoryId, label: '' });
        } else {
          groupCats.push({ id: categoryId, label: '' });
        }
      } else {
        groupCats.push({ id: categoryId, label: '' });
      }

      groupCats.forEach((c, idx) => {
        nextOrder[c.id] = idx + 1;
      });

      return nextOrder;
    });
  };

  // Move Up / Move Down handlers
  const handleMoveUp = (catId: string) => {
    const group = draftMap[catId] || UNGROUPED;
    if (group === UNGROUPED) return;

    const groupCats = sortedCategoryList.filter((c) => (draftMap[c.id] || UNGROUPED) === group);
    const idx = groupCats.findIndex((c) => c.id === catId);
    if (idx <= 0) return;

    const newGroupCats = [...groupCats];
    const temp = newGroupCats[idx];
    newGroupCats[idx] = newGroupCats[idx - 1];
    newGroupCats[idx - 1] = temp;

    setDraftOrderMap((prevOrder) => {
      const nextOrder = { ...prevOrder };
      newGroupCats.forEach((c, i) => {
        nextOrder[c.id] = i + 1;
      });
      return nextOrder;
    });
  };

  const handleMoveDown = (catId: string) => {
    const group = draftMap[catId] || UNGROUPED;
    if (group === UNGROUPED) return;

    const groupCats = sortedCategoryList.filter((c) => (draftMap[c.id] || UNGROUPED) === group);
    const idx = groupCats.findIndex((c) => c.id === catId);
    if (idx < 0 || idx >= groupCats.length - 1) return;

    const newGroupCats = [...groupCats];
    const temp = newGroupCats[idx];
    newGroupCats[idx] = newGroupCats[idx + 1];
    newGroupCats[idx + 1] = temp;

    setDraftOrderMap((prevOrder) => {
      const nextOrder = { ...prevOrder };
      newGroupCats.forEach((c, i) => {
        nextOrder[c.id] = i + 1;
      });
      return nextOrder;
    });
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, catId: string) => {
    e.dataTransfer.setData('text/plain', catId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedCatId(catId);
  };

  const handleDragOver = (e: React.DragEvent, catId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCatId !== catId) {
      setDragOverCatId(catId);
    }
  };

  const handleDragLeave = () => {
    setDragOverCatId(null);
  };

  const handleDrop = (e: React.DragEvent, targetCatId: string) => {
    e.preventDefault();
    const sourceCatId = draggedCatId || e.dataTransfer.getData('text/plain');
    setDraggedCatId(null);
    setDragOverCatId(null);

    if (!sourceCatId || sourceCatId === targetCatId) return;

    const sourceGroup = draftMap[sourceCatId] || UNGROUPED;
    const targetGroup = draftMap[targetCatId] || UNGROUPED;

    if (sourceGroup === targetGroup && sourceGroup !== UNGROUPED) {
      const groupCats = sortedCategoryList.filter((c) => (draftMap[c.id] || UNGROUPED) === sourceGroup);
      const sourceIdx = groupCats.findIndex((c) => c.id === sourceCatId);
      const targetIdx = groupCats.findIndex((c) => c.id === targetCatId);

      if (sourceIdx < 0 || targetIdx < 0) return;

      const newGroupCats = [...groupCats];
      const [movedCat] = newGroupCats.splice(sourceIdx, 1);
      newGroupCats.splice(targetIdx, 0, movedCat);

      setDraftOrderMap((prevOrder) => {
        const nextOrder = { ...prevOrder };
        newGroupCats.forEach((c, idx) => {
          nextOrder[c.id] = idx + 1;
        });
        return nextOrder;
      });
    } else if (targetGroup !== UNGROUPED) {
      handleAssign(sourceCatId, targetGroup, targetCatId);
    }
  };

  const handleDragEnd = () => {
    setDraggedCatId(null);
    setDragOverCatId(null);
  };

  // Renames a category's display name. Empty input clears the custom
  // override, falling back to the built-in auto-abbreviation again.
  // Note: Do NOT trim() here, so users can type spaces freely!
  const handleRenameCategory = (catId: string, newName: string) => {
    setDraftDisplayNameMap((prev) => {
      if (newName === '') {
        const next = { ...prev };
        delete next[catId];
        return next;
      }
      return { ...prev, [catId]: newName };
    });
  };

  const handleToggleCategoryVisibility = (catId: string, catLabel: string) => {
    setDraftHiddenMap((prev) => {
      const next = { ...prev };
      const currentlyHidden = isCatHidden(catId, catLabel, next);
      if (currentlyHidden) {
        delete next[catId];
        delete next[catLabel];
        if (catId) delete next[catId.toLowerCase()];
        if (catLabel) delete next[catLabel.toLowerCase()];
      } else {
        next[catId] = true;
      }
      return next;
    });
  };

  const handleToggleGroupVisibility = (groupName: string) => {
    const groupCats = categoryList.filter(
      (c) => getEffectiveGroup(c.id, c.label, draftMap) === groupName
    );
    if (groupCats.length === 0) return;
    const allHidden = groupCats.every((c) => isCatHidden(c.id, c.label, draftHiddenMap));

    setDraftHiddenMap((prev) => {
      const next = { ...prev };
      groupCats.forEach((c) => {
        if (allHidden) {
          delete next[c.id];
          delete next[c.label];
          if (c.id) delete next[c.id.toLowerCase()];
          if (c.label) delete next[c.label.toLowerCase()];
        } else {
          next[c.id] = true;
        }
      });
      return next;
    });
  };

  const handleSave = () => {
    // Clean up trailing spaces only upon saving
    const cleanedDisplayNames: Record<string, string> = {};
    Object.entries(draftDisplayNameMap).forEach(([k, v]) => {
      const trimmed = String(v || '').trim();
      if (trimmed) {
        cleanedDisplayNames[k] = trimmed;
      }
    });
    onSave(draftMap, draftOrderMap, cleanedDisplayNames, draftHiddenMap);
    onClose();
  };

  const getGroupBadgeStyle = (group: string) => {
    if (group === UNGROUPED || !group) {
      return 'bg-slate-100 text-slate-500 border-slate-200';
    }
    const upper = group.toUpperCase();
    if (upper.includes('ICT')) return 'bg-amber-100 text-amber-900 border-amber-300';
    if (upper.includes('DỊCH VỤ') || upper.includes('DICH VU')) return 'bg-green-100 text-green-900 border-green-300';
    if (upper.includes('CE') || upper.includes('GIA DỤNG')) return 'bg-blue-100 text-blue-900 border-blue-300';
    return 'bg-indigo-100 text-indigo-900 border-indigo-300';
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-extrabold text-base">
            <FolderTree className="w-5 h-5 text-indigo-200" />
            QUẢN LÝ NHÓM & VỊ TRÍ (SẮP XẾP KÉO THẢ)
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="p-3 bg-indigo-50/80 border border-indigo-100 rounded-2xl text-xs text-indigo-900 flex items-start gap-2.5">
            <Move className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-extrabold text-indigo-950">Sắp xếp Vị trí, Ẩn/Hiện & Đổi tên rút gọn Ngành Hàng</p>
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                • Cột <span className="font-bold">STT (#1, #2...)</span> tự động nhảy số. Giữ biểu tượng <GripVertical className="w-3 h-3 inline text-slate-500" /> để kéo thả hoặc bấm <span className="font-bold">▲ / ▼</span> để di chuyển.
              </p>
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                • Bấm biểu tượng <Eye className="w-3.5 h-3.5 inline text-indigo-600" /> / <EyeOff className="w-3.5 h-3.5 inline text-rose-500" /> trên từng dòng hoặc từng nhóm để <span className="font-bold">Ẩn / Hiện</span> trên bảng thi đua.
              </p>
              <p className="text-[11px] text-indigo-900 bg-amber-50/80 border border-amber-200 rounded-lg p-1.5 font-medium">
                💡 <span className="font-bold text-amber-900">Độ dài tên ngành hàng:</span> Tiêu đề hỗ trợ độ dài lên đến <span className="font-bold text-amber-900">30 ký tự</span> hiển thị trên 1 dòng (vd: <span className="font-bold">MÁY GIẶT - SẤY - RỬA CHÉN, FLAGSHIP SAMSUNG S/Z...</span>).
              </p>
            </div>
          </div>

          {/* Create new group */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              placeholder="Tên nhóm mới (vd: Điện lạnh, ICT, Tài chính...)"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
            >
              <Plus className="w-4 h-4" /> Tạo nhóm
            </button>
          </div>

          {/* Existing groups */}
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const groupCats = categoryList.filter(
                  (c) => getEffectiveGroup(c.id, c.label, draftMap) === g
                );
                const hiddenInGroupCount = groupCats.filter((c) =>
                  isCatHidden(c.id, c.label, draftHiddenMap)
                ).length;
                const isAllGroupHidden = groupCats.length > 0 && hiddenInGroupCount === groupCats.length;

                return (
                  <div
                    key={g}
                    className={`flex items-center gap-1.5 pl-3 pr-1.5 py-1 border rounded-full text-xs font-bold transition-all ${
                      isAllGroupHidden
                        ? 'bg-slate-100 border-slate-300 text-slate-400 opacity-70'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-800'
                    }`}
                  >
                    <span className={isAllGroupHidden ? 'line-through' : ''}>{g}</span>
                    <span className={`text-[11px] font-semibold ${isAllGroupHidden ? 'text-slate-400' : 'text-indigo-400'}`}>
                      ({groupCats.length - hiddenInGroupCount}/{groupCats.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleGroupVisibility(g)}
                      title={
                        isAllGroupHidden
                          ? `Đang ẩn toàn bộ nhóm "${g}". Bấm để hiện`
                          : `Đang hiện nhóm "${g}". Bấm để ẩn toàn bộ nhóm`
                      }
                      className={`p-1 rounded-full cursor-pointer transition-colors ${
                        isAllGroupHidden
                          ? 'text-rose-500 hover:bg-rose-200/60'
                          : 'text-indigo-500 hover:bg-indigo-200'
                      }`}
                    >
                      {isAllGroupHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(g)}
                      title={`Xóa nhóm "${g}"`}
                      className="p-0.5 rounded-full hover:bg-indigo-200 text-indigo-600 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Per-category assignment & order list */}
          <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-white shadow-2xs">
            <div className="px-3.5 py-2.5 bg-slate-50/90 text-[11px] font-bold text-slate-500 uppercase flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>Ngành hàng ({categoryList.length})</span>
                {categoryList.filter((c) => isCatHidden(c.id, c.label, draftHiddenMap)).length > 0 && (
                  <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-full font-extrabold text-[10px] normal-case">
                    {categoryList.filter((c) => isCatHidden(c.id, c.label, draftHiddenMap)).length} đã ẩn
                  </span>
                )}
                <span>• Kéo thả để thay đổi STT</span>
              </span>
              <span>
                {categoryList.filter((c) => getEffectiveGroup(c.id, c.label, draftMap) === UNGROUPED).length} chưa phân nhóm
              </span>
            </div>
            {sortedCategoryList.map((cat) => {
              const currentGroup = getEffectiveGroup(cat.id, cat.label, draftMap);
              const badgeStyle = getGroupBadgeStyle(currentGroup);
              const currentOrder = draftOrderMap[cat.id] ?? '';
              const isDragging = draggedCatId === cat.id;
              const isDragOver = dragOverCatId === cat.id;
              const isHidden = isCatHidden(cat.id, cat.label, draftHiddenMap);

              const groupCats = sortedCategoryList.filter((c) => getEffectiveGroup(c.id, c.label, draftMap) === currentGroup);
              const catIdx = groupCats.findIndex((c) => c.id === cat.id);
              const isFirstInGroup = catIdx === 0;
              const isLastInGroup = catIdx === groupCats.length - 1;

              const currentVal = draftDisplayNameMap[cat.id] ?? getShortCategoryName(cat.label || cat.id);
              const charCount = currentVal.length;
              const isWarning = charCount > 30;
              const isDanger = charCount > 35;

              return (
                <div
                  key={cat.id}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, cat.id)}
                  onDragOver={(e) => handleDragOver(e, cat.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, cat.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2 transition-all ${
                    isDragging ? 'opacity-30 bg-indigo-100 scale-[0.99] border-dashed border-indigo-400' : ''
                  } ${isDragOver ? 'bg-indigo-50 border-t-2 border-t-indigo-600' : isHidden ? 'opacity-60 bg-slate-50/70 hover:opacity-100' : 'hover:bg-slate-50/80'}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Drag Handle Icon & STT Column */}
                    <div className="flex items-center gap-1 shrink-0">
                      <div
                        className="p-1 text-slate-400 hover:text-indigo-600 cursor-grab active:cursor-grabbing transition-colors"
                        title="Nắm kéo để thay đổi STT vị trí"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>

                      {/* Read-Only STT Badge */}
                      <span className="w-8 h-7 flex items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-xs shadow-2xs">
                        {currentGroup === UNGROUPED ? '--' : `#${currentOrder}`}
                      </span>

                      {/* Quick Move Up/Down Buttons */}
                      <div className="flex flex-col shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(cat.id)}
                          disabled={isFirstInGroup || currentGroup === UNGROUPED}
                          className="p-0.5 hover:bg-indigo-100 text-slate-400 hover:text-indigo-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer rounded"
                          title="Di chuyển lên 1 vị trí"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(cat.id)}
                          disabled={isLastInGroup || currentGroup === UNGROUPED}
                          className="p-0.5 hover:bg-indigo-100 text-slate-400 hover:text-indigo-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer rounded"
                          title="Di chuyển xuống 1 vị trí"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 uppercase tracking-tight ${badgeStyle}`}>
                      {currentGroup === UNGROUPED ? 'Chưa phân nhóm' : currentGroup}
                    </span>

                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <input
                        type="text"
                        maxLength={45}
                        value={currentVal}
                        draggable={false}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => handleRenameCategory(cat.id, e.target.value)}
                        title={`Tên gốc đầy đủ: ${cat.label}\nĐộ dài: ${charCount} ký tự (Khuyến nghị ≤ 30 ký tự để luôn trên 1 dòng)`}
                        placeholder={getShortCategoryName(cat.label || cat.id)}
                        className={`min-w-0 flex-1 bg-transparent border rounded-lg px-2 py-0.5 text-xs font-semibold ${
                          isHidden ? 'line-through text-slate-400' : 'text-slate-800'
                        } focus:outline-hidden focus:ring-2 truncate transition-all ${
                          isDanger
                            ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:ring-rose-400 focus:bg-white'
                            : isWarning
                            ? 'border-amber-400 bg-amber-50/40 text-amber-900 focus:ring-amber-400 focus:bg-white'
                            : 'border-transparent hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:ring-indigo-500'
                        }`}
                      />

                      {/* Hide/Show Toggle Button using Lucide Eye / EyeOff */}
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryVisibility(cat.id, cat.label)}
                        title={isHidden ? 'Đang ẨN trên bảng thi đua — Bấm để Hiện' : 'Đang HIỆN trên bảng thi đua — Bấm để Ẩn'}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                          isHidden
                            ? 'bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-200 shadow-2xs'
                            : 'bg-slate-100/80 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>

                      {/* Character Length Counter & Warning */}
                      <span
                        title={
                          isDanger
                            ? `Độ dài ${charCount} ký tự (Khá dài > 35 ký tự, có nguy cơ tràn chữ trên bảng 4 cột)`
                            : isWarning
                            ? `Độ dài ${charCount} ký tự (Hơi dài > 30 ký tự, nên rút gọn dưới 30 ký tự)`
                            : `Độ dài ${charCount}/30 ký tự (Độ dài đẹp trên 1 dòng)`
                        }
                        className={`text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-0.5 select-none ${
                          isDanger
                            ? 'bg-rose-100 text-rose-700 border border-rose-300'
                            : isWarning
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'text-slate-400 bg-slate-100/70 border border-slate-200'
                        }`}
                      >
                        {charCount}/30
                        {isWarning && <span>⚠️</span>}
                      </span>

                      {draftDisplayNameMap[cat.id] && (
                        <button
                          type="button"
                          onClick={() => handleRenameCategory(cat.id, '')}
                          title="Khôi phục tên mặc định"
                          className="p-0.5 text-slate-300 hover:text-indigo-600 shrink-0 cursor-pointer transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <select
                    value={currentGroup}
                    onChange={(e) => handleAssign(cat.id, e.target.value)}
                    className="w-44 shrink-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value={UNGROUPED}>-- Chưa phân nhóm --</option>
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            {categoryList.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-slate-400 font-semibold">
                Chưa có ngành hàng nào — hãy dán dữ liệu Realtime Thi Đua Tỉnh trước.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Save className="w-4 h-4" /> Lưu & Đồng bộ
          </button>
        </div>
      </div>
    </div>
  );
};
