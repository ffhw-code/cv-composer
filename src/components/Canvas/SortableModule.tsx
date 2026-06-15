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
  renderToolbar?: React.ReactNode;
  disableDrag?: boolean;
  'data-id'?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function SortableModule({
  id,
  children,
  isSelected,
  onSelect,
  onEditFocus,
  renderToolbar,
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

  const containerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    border: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
    borderRadius: '4px',
    cursor: isDragging ? 'grabbing' : 'default',
    paddingTop: isSelected && renderToolbar ? '20px' : '0',
  };

  const borderHandleStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 10,
    background: 'transparent',
  };

  const dragProps = disableDrag ? {} : { ...attributes, ...listeners };

  return (
    <div ref={setNodeRef} style={containerStyle} {...rest}>
      {isSelected && renderToolbar && (
        <div className="absolute top-0.5 left-0.5 right-0.5 z-20">{renderToolbar}</div>
      )}
      {/* 四个边框手柄 */}
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
    </div>
  );
}

export default SortableModule;
