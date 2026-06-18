import { useState, useEffect } from 'react';
import { useResumeStore, type ResumeModule } from '../../store/useResumeStore';
import { findModuleById, findParentById, getAllModuleIds } from '../../utils/moduleUtils';
import EditableModule from '../Module/EditableModule';
import SortableModule from './SortableModule';
import ContextMenu from './ContextMenu';
import InlineToolbar from './InlineToolbar';
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

interface DropTarget {
  id: string;
  index: number;
}

function CanvasArea({ deleteMode, onExitDeleteMode }: CanvasAreaProps) {
  const modules = useResumeStore((s) => s.modules);
  const selectedId = useResumeStore((s) => s.selectedId);
  const pagePadding = useResumeStore((s) => s.pagePadding);
  const pagePaddingTop = useResumeStore((s) => s.pagePaddingTop);
  const pageGap = useResumeStore((s) => s.pageGap);
  const select = useResumeStore((s) => s.select);
  const removeModule = useResumeStore((s) => s.removeModule);
  const moveModule = useResumeStore((s) => s.moveModule);

  const [scale, setScale] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ module: ResumeModule; x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    if (!deleteMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDropTarget(null);
      return;
    }
    const overModule = findModuleById(modules, over.id as string);
    if (!overModule) {
      setDropTarget(null);
      return;
    }

    const isContainer =
      overModule.type === 'flex' ||
      overModule.type === 'grid' ||
      (overModule.children && overModule.children.length > 0);

    if (!isContainer) {
      setDropTarget(null);
      return;
    }

    const activeRect = active.rect.current.translated;
    const overRect = over.rect;
    const childrenCount = overModule.children?.length || 0;

    let newIndex: number;
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

    setDropTarget({ id: over.id as string, index: newIndex });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDropTarget(null);
    if (!over || active.id === over.id) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;
    const activeModule = findModuleById(modules, activeIdStr);
    const overModule = findModuleById(modules, overIdStr);
    if (!activeModule || !overModule) return;

    const activeRect = active.rect.current.translated;
    const overRect = over.rect;

    let newParentId: string | null;
    let newIndex: number;

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
      const parent = findParentById(modules, overIdStr);
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

  const handleContextMenu = (e: React.MouseEvent, modId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const mod = findModuleById(modules, modId);
    if (mod) {
      select(modId);
      setContextMenu({ module: mod, x: e.clientX, y: e.clientY });
    }
  };
  const closeContextMenu = () => setContextMenu(null);

  function renderInsertIndicator() {
    return (
      <div className="relative h-1 my-0.5">
        <div className="absolute inset-0 bg-blue-400 rounded-full opacity-70 animate-pulse" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
      </div>
    );
  }

  function renderModuleRecursive(mod: ResumeModule): React.ReactNode {
    const isSelected = selectedId === mod.id;
    const isDropTarget = dropTarget?.id === mod.id;
    const insertIndex = isDropTarget ? dropTarget!.index : -1;

    const isContainer =
      mod.type === 'flex' ||
      mod.type === 'grid' ||
      (mod.children && mod.children.length > 0);

    if (isContainer) {
      const highlightClass = isDropTarget
        ? 'ring-2 ring-blue-400 ring-offset-1 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
        : '';

      return (
        <SortableModule
          renderToolbar={isSelected && !deleteMode ? (
            <InlineToolbar moduleId={mod.id} />
          ) : null}
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
                    if (next.has(mod.id)) {
                      next.delete(mod.id);
                    } else {
                      next.add(mod.id);
                    }
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
          <div className={highlightClass}>
            <EditableModule module={mod}>
              {mod.children && mod.children.length > 0 ? (
                <SortableContext items={mod.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {mod.children.flatMap((child, i) => {
                    const elements: React.ReactNode[] = [];
                    if (isDropTarget && i === insertIndex) {
                      elements.push(
                        <div key={`insert-${i}`}>
                          {renderInsertIndicator()}
                        </div>
                      );
                    }
                    elements.push(renderModuleRecursive(child));
                    return elements;
                  })}
                  {isDropTarget && insertIndex >= (mod.children?.length || 0) && (
                    <div key="insert-end">
                      {renderInsertIndicator()}
                    </div>
                  )}
                </SortableContext>
              ) : (
                <p className="text-gray-400 text-sm">拖入模块或控件</p>
              )}
            </EditableModule>
          </div>
        </SortableModule>
      );
    }

    // 叶子模块
    return (
      <SortableModule
        renderToolbar={isSelected && !deleteMode ? (
          <InlineToolbar moduleId={mod.id} />
        ) : null}
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
                  if (next.has(mod.id)) {
                    next.delete(mod.id);
                  } else {
                    next.add(mod.id);
                  }
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
  }

  const allIds = getAllModuleIds(modules);

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
            padding: `${pagePaddingTop} ${pagePadding} ${pagePadding} ${pagePadding}`,
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
            onDragStart={() => setDropTarget(null)}
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
