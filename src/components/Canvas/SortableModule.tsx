import { useState, useEffect, useRef, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ResumeModule } from '../../types/resume';
import { useResumeStore } from '../../store/useResumeStore';
import { useEditMode } from '../../hooks/useEditMode';
import { findModuleById } from '../../utils/moduleUtils';
import ResizeHandles from './ResizeHandles';

interface SortableModuleProps {
  id: string;
  module: ResumeModule;
  children: React.ReactNode;
  isSelected: boolean;
  onSelect: () => void;
  onEditFocus?: () => void;
  renderToolbar?: React.ReactNode;
  disableDrag?: boolean;
  'data-id'?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const PADDING_STEP = 4;
const MARGIN_STEP = 4;

function SortableModule({
  id,
  module,
  children,
  isSelected,
  onSelect,
  onEditFocus,
  renderToolbar,
  disableDrag,
  ...rest
}: SortableModuleProps) {
  const selectedId = useResumeStore((s) => s.selectedId);
  const modules = useResumeStore((s) => s.modules);
  const updateModule = useResumeStore((s) => s.updateModule);
  const isEditing = useEditMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: disableDrag });

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [setNodeRef]
  );

  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = 'grabbing';
    } else {
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  // 方向键微调间距
  useEffect(() => {
    if (!isSelected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 选中后显示键盘操作提示是 UI 交互需求
    setShowKeyboardHint(true);
    const timer = setTimeout(() => setShowKeyboardHint(false), 3000);

    const onKeyDown = (e: KeyboardEvent) => {
      // 忽略在输入框/cotenteditable 中
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.closest('[contenteditable]') || target.closest('.ProseMirror')) {
        return;
      }

      if (!selectedId) return;
      const mod = findModuleById(modules, selectedId);
      if (!mod) return;
      const style = mod.style || {};

      if (e.shiftKey) {
        // Shift + 方向键: 调整 padding
        const key = 'padding';
        const parts = (style[key] || '0 0 0 0').split(' ').map(s => parseInt(s, 10) || 0);
        while (parts.length < 4) parts.push(parts[parts.length - 1] || 0);
        const [top, right, bottom, left] = parts;

        switch (e.key) {
          case 'ArrowUp': parts[0] = Math.max(0, top + PADDING_STEP); break;
          case 'ArrowDown': parts[2] = Math.max(0, bottom - PADDING_STEP);
                          parts[2] = Math.max(0, parts[2]); break;
          case 'ArrowRight': parts[1] = Math.max(0, right + PADDING_STEP); break;
          case 'ArrowLeft': parts[3] = Math.max(0, left - PADDING_STEP);
                         parts[3] = Math.max(0, parts[3]); break;
          default: return;
        }
        e.preventDefault();
        const val = `${parts[0]}px ${parts[1]}px ${parts[2]}px ${parts[3]}px`;
        updateModule(selectedId, { style: { ...style, [key]: val } });
        setShowKeyboardHint(true);
        clearTimeout(timer);
        setTimeout(() => setShowKeyboardHint(false), 1500);
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl + 方向键: 调整 margin
        const key = 'margin';
        const parts = (style[key] || '0 0 0 0').split(' ').map(s => parseInt(s, 10) || 0);
        while (parts.length < 4) parts.push(parts[parts.length - 1] || 0);
        const [top, right, bottom, left] = parts;

        switch (e.key) {
          case 'ArrowUp': parts[0] = Math.max(0, top + MARGIN_STEP); break;
          case 'ArrowDown': parts[2] = Math.max(0, bottom - MARGIN_STEP);
                          parts[2] = Math.max(0, parts[2]); break;
          case 'ArrowRight': parts[1] = Math.max(0, right + MARGIN_STEP); break;
          case 'ArrowLeft': parts[3] = Math.max(0, left - MARGIN_STEP);
                         parts[3] = Math.max(0, parts[3]); break;
          default: return;
        }
        e.preventDefault();
        const val = `${parts[0]}px ${parts[1]}px ${parts[2]}px ${parts[3]}px`;
        updateModule(selectedId, { style: { ...style, [key]: val } });
        setShowKeyboardHint(true);
        clearTimeout(timer);
        setTimeout(() => setShowKeyboardHint(false), 1500);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(timer);
    };
  }, [isSelected, selectedId, modules, updateModule]);

  const containerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    border: isEditing ? ((isEditing && isSelected) ? '2px solid #3b82f6' : '2px solid transparent') : 'none',
    borderRadius: '4px',
    cursor: isDragging ? 'grabbing' : 'default',
    paddingTop: (isEditing && isSelected && renderToolbar) ? '20px' : '0',
  };

  const borderHandleStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 10,
    background: 'transparent',
  };

  const dragProps = disableDrag ? {} : { ...attributes, ...listeners };

  const leafTypes = ['text', 'heading', 'list', 'image'];
  const showResizeHandles = isSelected && leafTypes.includes(module.type);

  return (
    <div ref={mergedRef} style={containerStyle} {...rest}>
      {isEditing && isSelected && renderToolbar && (
        <div className="absolute top-0.5 left-0.5 right-0.5 z-20">{renderToolbar}</div>
      )}
      {/* 四个边框手柄 */}
      <div
        style={{
          ...borderHandleStyle,
          top: 0, left: 0, right: 0, height: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        {...dragProps}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      />
      <div
        style={{
          ...borderHandleStyle,
          bottom: 0, left: 0, right: 0, height: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        {...dragProps}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      />
      <div
        style={{
          ...borderHandleStyle,
          left: 0, top: 0, bottom: 0, width: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        {...dragProps}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      />
      <div
        style={{
          ...borderHandleStyle,
          right: 0, top: 0, bottom: 0, width: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        {...dragProps}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      />

      <div
        style={{ cursor: isDragging ? 'grabbing' : 'auto' }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.isContentEditable ||
            target.closest('[contenteditable]') ||
            target.closest('.ProseMirror')
          ) {
            onEditFocus?.();
          } else {
            onSelect();
          }
        }}
        onContextMenu={rest.onContextMenu}
      >
        {children}
      </div>

      {/* 缩放把手（叶子组件） */}
      {isEditing && showResizeHandles && (
        <ResizeHandles moduleId={id} containerRef={containerRef} />
      )}

      {/* 快捷键提示条 */}
      {isEditing && isSelected && showKeyboardHint && (
        <div
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-30 px-3 py-1 text-[11px] bg-gray-800 text-white rounded whitespace-nowrap pointer-events-none shadow-lg"
        >
          ⇧方向键: 内边距 &nbsp;|&nbsp; Ctrl方向键: 外边距
        </div>
      )}
    </div>
  );
}

export default SortableModule;
