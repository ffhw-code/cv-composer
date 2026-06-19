import { useCallback, useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import { findModuleById } from '../../utils/moduleUtils';

interface ResizeHandlesProps {
  moduleId: string;
  containerRef: React.RefObject<HTMLElement | null>;
}

interface DragState {
  corner: 'nw' | 'ne' | 'sw' | 'se';
  startX: number;
  startY: number;
  startW: number;
  startH: number;
}

const HANDLE_SIZE = 8;
const MIN_SIZE = 20;

function ResizeHandles({ moduleId, containerRef }: ResizeHandlesProps) {
  const dragRef = useRef<DragState | null>(null);

  const onMouseDown = useCallback((corner: DragState['corner']) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;

    dragRef.current = {
      corner,
      startX: e.clientX,
      startY: e.clientY,
      startW: el.offsetWidth,
      startH: el.offsetHeight,
    };

    const onMouseMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      let newW = d.startW;
      let newH = d.startH;

      switch (d.corner) {
        case 'se': newW = d.startW + dx; newH = d.startH + dy; break;
        case 'sw': newW = d.startW - dx; newH = d.startH + dy; break;
        case 'ne': newW = d.startW + dx; newH = d.startH - dy; break;
        case 'nw': newW = d.startW - dx; newH = d.startH - dy; break;
      }

      newW = Math.max(MIN_SIZE, Math.round(newW));
      newH = Math.max(MIN_SIZE, Math.round(newH));

      const modules = useResumeStore.getState().modules;
      const found = findModuleById(modules, moduleId);
      const currentStyle = found?.style || {};

      useResumeStore.getState().updateModule(moduleId, {
        style: { ...currentStyle, width: `${newW}px`, height: `${newH}px` },
      });
    };

    const onMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [moduleId, containerRef]);

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    background: '#3b82f6',
    border: '2px solid white',
    borderRadius: '2px',
    zIndex: 30,
    pointerEvents: 'auto',
  };

  const corners: { key: DragState['corner']; style: React.CSSProperties }[] = [
    { key: 'nw', style: { ...handleStyle, top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nwse-resize' } },
    { key: 'ne', style: { ...handleStyle, top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nesw-resize' } },
    { key: 'sw', style: { ...handleStyle, bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nesw-resize' } },
    { key: 'se', style: { ...handleStyle, bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nwse-resize' } },
  ];

  return (
    <div className="resize-handles" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}>
      {corners.map(({ key, style }) => (
        <div
          key={key}
          style={style}
          onMouseDown={onMouseDown(key)}
        />
      ))}
    </div>
  );
}

export default ResizeHandles;
