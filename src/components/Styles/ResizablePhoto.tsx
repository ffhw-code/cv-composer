import { useRef, useCallback, useEffect } from 'react';
import { useResumeStore } from '../../store/useResumeStore';

interface ResizablePhotoProps {
  src: string;
  width: string | number;
  height: string | number;
  moduleId: string;
  className?: string;
}

export default function ResizablePhoto({
  src,
  width,
  height,
  moduleId,
  className = '',
}: ResizablePhotoProps) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const imgRef = useRef<HTMLImageElement>(null);
  const startPos = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const currentWidth = width || 'auto';
  const currentHeight = height || 'auto';

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      w: img.clientWidth,
      h: img.clientHeight,
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!startPos.current) return;
    const deltaX = e.clientX - startPos.current.x;
    const deltaY = e.clientY - startPos.current.y;
    const newWidth = Math.max(20, startPos.current.w + deltaX);
    const newHeight = Math.max(20, startPos.current.h + deltaY);
    const currentModule = useResumeStore
      .getState()
      .modules.find((m) => m.id === moduleId);
    const currentStyle = currentModule?.style || {};
    updateModule(moduleId, {
      style: {
        ...currentStyle,
        photoWidth: `${newWidth}px`,
        photoHeight: `${newHeight}px`,
      },
    });
  }, [moduleId, updateModule]);

  const onMouseUp = useCallback(() => {
    startPos.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div className={`relative inline-block group ${className}`}>
      <img
        ref={imgRef}
        src={src}
        alt="照片"
        style={{
          width: currentWidth,
          height: currentHeight,
          maxWidth: '100%',
          display: 'block',
        }}
        className="object-cover"
      />
      <div
        className="absolute bottom-0 right-0 w-3 h-3 bg-blue-400 rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={onMouseDown}
        title="拖拽调整尺寸"
      />
    </div>
  );
}