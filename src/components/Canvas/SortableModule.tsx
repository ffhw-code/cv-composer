import { useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ResumeModule } from '../../store/useResumeStore';

interface SortableModuleProps {
  id: string;
  module: ResumeModule;
  children: React.ReactNode;
  isSelected: boolean;
  onSelect: () => void;
  onEditFocus?: () => void;
  disableDrag?: boolean;
  'data-id'?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function SortableModule({
  id,
  module,
  children,
  isSelected,
  onSelect,
  onEditFocus,
  disableDrag,
  ...rest
}: SortableModuleProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: disableDrag });

  // 拖拽时全局光标握拳，结束后恢复
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

  // ✨ 修改1：容器在拖拽时同步显示 grabbing 光标
  const containerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    border: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
    borderRadius: '4px',
    cursor: isDragging ? 'grabbing' : 'default', // 原来是写死的 default
  };

  const borderHandleStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 10,
    background: 'transparent',
  };

  const dragProps = disableDrag ? {} : { ...attributes, ...listeners };

  return (
    <div ref={setNodeRef} style={containerStyle} {...rest}>
      {/* 四个边框手柄，仅用于拖拽，也响应点击来选中 */}
      {/* 上 */}
      <div
        style={{
          ...borderHandleStyle,
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        {...dragProps}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {/* 下 */}
      <div
        style={{
          ...borderHandleStyle,
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        {...dragProps}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {/* 左 */}
      <div
        style={{
          ...borderHandleStyle,
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        {...dragProps}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {/* 右 */}
      <div
        style={{
          ...borderHandleStyle,
          right: 0,
          top: 0,
          bottom: 0,
          width: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        {...dragProps}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />

      {/* ✨ 修改2：内容区域光标跟随拖拽状态，点击空白处可选中模块 */}
      <div
        style={{ cursor: isDragging ? 'grabbing' : 'auto' }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.isContentEditable ||
            target.closest('[contenteditable]') ||
            target.closest('.ProseMirror')
          ) {
            // 点击可编辑区域：取消选中并进入编辑
            onEditFocus?.();
          } else {
            // 点击其他区域：选中当前模块
            onSelect();
          }
        }}
        onContextMenu={rest.onContextMenu}
      >
        {children}
      </div>
    </div>
  );
}

export default SortableModule;