import { useState, useEffect, useCallback } from 'react';
import { useResumeStore, type ResumeModule } from '../../store/useResumeStore';
import EditableModule from '../Module/EditableModule';
import SortableModule from './SortableModule';
import ContextMenu from './ContextMenu';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { DragOverEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

const PAGE_HEIGHT = 1123;

interface CanvasAreaProps {
  deleteMode: boolean;
  onExitDeleteMode: () => void;
}

function findModuleRecursive(modules: ResumeModule[], id: string): ResumeModule | null {
  for (const mod of modules) {
    if (mod.id === id) return mod;
    if (mod.children) {
      const found = findModuleRecursive(mod.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getAllSortableIds(modules: ResumeModule[]): string[] {
  let ids: string[] = [];
  for (const mod of modules) {
    ids.push(mod.id);
    if (mod.children) ids = ids.concat(getAllSortableIds(mod.children));
  }
  return ids;
}

function CanvasArea({ deleteMode, onExitDeleteMode }: CanvasAreaProps) {
  const modules = useResumeStore((s) => s.modules);
  const selectedId = useResumeStore((s) => s.selectedId);
  const pagePadding = useResumeStore((s) => s.pagePadding);
  const pageGap = useResumeStore((s) => s.pageGap);
  const select = useResumeStore((s) => s.select);
  const removeModule = useResumeStore((s) => s.removeModule);
  const moveModule = useResumeStore((s) => s.moveModule);

  const [scale, setScale] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ module: ResumeModule; x: number; y: number } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteMode) {
      setSelectedIds(new Set());
      select(null);
    }
  }, [deleteMode, select]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.1, 2));
  const zoomOut = () => setScale((s) => Math.max(s - 0.1, 0.5));
  const zoomReset = () => setScale(1);

  const handleDelete = () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`确定要删除选中的 ${selectedIds.size} 个模块吗？`);
    if (confirmed) {
      selectedIds.forEach((id) => removeModule(id));
      setSelectedIds(new Set());
      onExitDeleteMode();
    }
  };
  const handleExit = () => onExitDeleteMode();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setDropTargetId(null);
      return;
    }
    const overModule = findModuleRecursive(modules, over.id as string);
    if (
      overModule &&
      (overModule.type === 'flex' || overModule.type === 'grid') &&
      overModule.children.length > 0
    ) {
      setDropTargetId(over.id as string);
    } else {
      setDropTargetId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDropTargetId(null);
    if (!over || active.id === over.id) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;
    const activeModule = findModuleRecursive(modules, activeIdStr);
    const overModule = findModuleRecursive(modules, overIdStr);
    if (!activeModule || !overModule) return;

    const activeRect = active.rect.current.translated;
    const overRect = over.rect;

    let newParentId: string | null = null;
    let newIndex = 0;

    const isContainer =
      overModule.type === 'flex' ||
      overModule.type === 'grid' ||
      (overModule.children && overModule.children.length > 0);

    if (isContainer) {
      newParentId = overIdStr;
      const childrenCount = overModule.children?.length || 0;
      if (activeRect && overRect) {
        const activeCenterY = activeRect.top + activeRect.height / 2;
        const overTop = overRect.top;
        const overHeight = overRect.height;
        const relativeY = (activeCenterY - overTop) / overHeight;
        newIndex = Math.round(relativeY * childrenCount);
        if (newIndex < 0) newIndex = 0;
        if (newIndex > childrenCount) newIndex = childrenCount;
      } else {
        newIndex = childrenCount;
      }
    } else {
      const parent = findParentInModules(modules, overIdStr);
      const parentList: ResumeModule[] = parent ? parent.children! : modules;
      const listWithoutActive = parentList.filter(item => item.id !== activeIdStr);
      const overIndexInNewList = listWithoutActive.findIndex(item => item.id === overIdStr);
      if (overIndexInNewList === -1) return;

      if (activeRect && overRect) {
        const activeCenterY = activeRect.top + activeRect.height / 2;
        const overCenterY = overRect.top + overRect.height / 2;
        if (activeCenterY > overCenterY) {
          newIndex = overIndexInNewList + 1;
        } else {
          newIndex = overIndexInNewList;
        }
      } else {
        newIndex = overIndexInNewList;
      }
      newParentId = parent ? parent.id : null;
    }

    moveModule(activeIdStr, newParentId, newIndex);
  };

  function findParentInModules(modules: ResumeModule[], id: string): ResumeModule | null {
    for (const mod of modules) {
      if (mod.children && mod.children.some(c => c.id === id)) return mod;
      if (mod.children) {
        const found = findParentInModules(mod.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  const handleContextMenu = (e: React.MouseEvent, modId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const mod = findModuleRecursive(modules, modId);
    if (mod) {
      select(modId);
      setContextMenu({ module: mod, x: e.clientX, y: e.clientY });
    }
  };
  const closeContextMenu = () => setContextMenu(null);

  const renderModuleRecursive = useCallback(
    (mod: ResumeModule): React.ReactNode => {
      const isSelected = selectedId === mod.id;
      const isDropHighlight = mod.id === dropTargetId;

      const isContainer =
        mod.type === 'flex' ||
        mod.type === 'grid' ||
        (mod.children && mod.children.length > 0);

      if (isContainer) {
        // 处理布局方向，断言为正确的类型
        const style = mod.style || {};
        const display = style.display || (mod.type === 'grid' ? 'grid' : 'flex');
        const flexDirection =
          mod.type === 'grid'
            ? undefined
            : ((style.flexDirection as 'row' | 'column' | 'row-reverse' | 'column-reverse') || 'column');
        const gap = style.gap || '16px';

        const containerStyle: React.CSSProperties = {
          display,
          flexDirection,
          gap,
          ...mod.style,
        };

        // 强制 module 容器使用弹性列布局
        if (mod.type === 'module') {
          containerStyle.display = 'flex';
          containerStyle.flexDirection = containerStyle.flexDirection || 'column';
        }

        const highlightClass = isDropHighlight
          ? 'ring-2 ring-blue-400 ring-offset-2'
          : '';

        return (
          <SortableModule
            key={mod.id}
            id={mod.id}
            module={mod}
            isSelected={isSelected}
            onSelect={() => select(mod.id)}
            onEditFocus={() => select(null)}
            disableDrag={deleteMode}
            data-id={mod.id}
            onContextMenu={(e) => handleContextMenu(e, mod.id)}
          >
            {deleteMode && (
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      next.has(mod.id) ? next.delete(mod.id) : next.add(mod.id);
                      return next;
                    });
                  }}
                  className={`w-6 h-6 p-0 border-2 rounded-full transition-all duration-75 flex items-center justify-center
                    ${selectedIds.has(mod.id) ? 'bg-blue-500 border-blue-600 shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] translate-y-[1px]' : 'bg-white border-gray-300 hover:border-blue-400 shadow-[0_2px_4px_rgba(0,0,0,0.1)]'}
                    active:scale-95`}
                >
                  {selectedIds.has(mod.id) && <span className="text-white text-xs font-bold">✓</span>}
                </button>
              </div>
            )}
            <div
              className={`border border-dashed border-gray-300 min-h-[60px] p-2 ${highlightClass} ${mod.type === 'module' ? 'flex flex-col' : ''}`}
              style={containerStyle}
              data-id={mod.id}
            >
              {mod.children && mod.children.length > 0 ? (
                <SortableContext items={mod.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {mod.children.map((child) => renderModuleRecursive(child))}
                </SortableContext>
              ) : (
                <p className="text-gray-400 text-sm">拖入模块或控件</p>
              )}
            </div>
          </SortableModule>
        );
      }

      // 叶子模块
      return (
        <SortableModule
          key={mod.id}
          id={mod.id}
          module={mod}
          isSelected={isSelected}
          onSelect={() => select(mod.id)}
          onEditFocus={() => select(null)}
          disableDrag={deleteMode}
          data-id={mod.id}
          onContextMenu={(e) => handleContextMenu(e, mod.id)}
        >
          {deleteMode && (
            <div className="absolute -left-8 top-1/2 -translate-y-1/2 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.has(mod.id) ? next.delete(mod.id) : next.add(mod.id);
                    return next;
                  });
                }}
                className={`w-6 h-6 p-0 border-2 rounded-full transition-all duration-75 flex items-center justify-center
                  ${selectedIds.has(mod.id) ? 'bg-blue-500 border-blue-600 shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] translate-y-[1px]' : 'bg-white border-gray-300 hover:border-blue-400 shadow-[0_2px_4px_rgba(0,0,0,0.1)]'}
                  active:scale-95`}
              >
                {selectedIds.has(mod.id) && <span className="text-white text-xs font-bold">✓</span>}
              </button>
            </div>
          )}
          <EditableModule module={mod} />
        </SortableModule>
      );
    },
    [selectedId, deleteMode, selectedIds, select, handleContextMenu, dropTargetId]
  );

  const allIds = getAllSortableIds(modules);

  return (
    <div
      className="relative bg-gray-100 h-full"
      style={{ width: '842px' }}
      onClick={(e) => {
        closeContextMenu();
        if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('[data-id]')) {
          select(null);
        }
      }}
    >
      <div className="h-full overflow-y-auto p-6 flex justify-center">
        <div
          id="resume-preview"
          className="bg-white shadow-lg flex flex-col"
          style={{
            width: '794px',
            minHeight: `${PAGE_HEIGHT}px`,
            padding: pagePadding,
            gap: pageGap,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            marginBottom: scale > 1 ? `${(scale - 1) * PAGE_HEIGHT}px` : '0',
          }}
        >
          {modules.length === 0 && (
            <p className="text-gray-300 text-center mt-20">从左侧选择控件添加到画布</p>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => setDropTargetId(null)}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
              {modules.map((mod) => renderModuleRecursive(mod))}
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} module={contextMenu.module} onClose={closeContextMenu} />
      )}

      <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end">
        {deleteMode && (
          <button
            onClick={selectedIds.size > 0 ? handleDelete : handleExit}
            className={`w-32 h-[60px] px-2 py-1.5 text-sm font-medium rounded-lg transition-all duration-75
              ${selectedIds.size > 0
                ? 'text-gray-700 bg-gradient-to-b from-red-50 to-red-100 border border-red-300 shadow-[inset_0_1px_0_#fff,0_2px_0_#fca5a5,0_3px_6px_rgba(0,0,0,0.1)] active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] active:translate-y-[2px]'
                : 'text-gray-700 bg-gradient-to-b from-green-50 to-green-100 border border-green-300 shadow-[inset_0_1px_0_#fff,0_2px_0_#86efac,0_3px_6px_rgba(0,0,0,0.1)] active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] active:translate-y-[2px]'
              }`}
          >
            {selectedIds.size > 0 ? '删除' : '退出'}
          </button>
        )}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded shadow-md px-2 py-1">
          <button onClick={zoomOut} className="w-5 h-5 flex items-center justify-center text-xs border border-gray-300 rounded hover:bg-gray-100">−</button>
          <span className="text-xs text-gray-600 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="w-5 h-5 flex items-center justify-center text-xs border border-gray-300 rounded hover:bg-gray-100">+</button>
          <button onClick={zoomReset} className="ml-1 px-1.5 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100">重置</button>
        </div>
      </div>
    </div>
  );
}

export default CanvasArea;