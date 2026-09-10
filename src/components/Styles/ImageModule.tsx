import { useState, useRef, useCallback, useEffect } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../types/resume';
import { buildContainerStyle } from '../../utils/styleHelpers';
import { useEditMode } from '../../hooks/useEditMode';

export default function ImageModule({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setDragging] = useState(false);
  const startPos = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const isEditing = useEditMode();
  const imageData = module.content || '';
  const inline = buildContainerStyle(module.style);
  const width = module.style?.width || 'auto';
  const height = module.style?.height || 'auto';

  const handleClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateModule(module.id, { content: dataUrl });
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  // 拖拽调整尺寸（使用 ref 避免循环依赖）
  const onDragMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const onDragEndRef = useRef<(() => void) | null>(null);

  const onDragMove = useCallback((e: MouseEvent) => {
    if (!startPos.current) return;
    const deltaX = e.clientX - startPos.current.x;
    const deltaY = e.clientY - startPos.current.y;
    const newWidth = Math.max(20, startPos.current.w + deltaX);
    const newHeight = Math.max(20, startPos.current.h + deltaY);
    updateModule(module.id, {
      style: {
        ...module.style,
        width: `${newWidth}px`,
        height: `${newHeight}px`,
      },
    });
  }, [module.id, module.style, updateModule]);

  const onDragEnd = useCallback(() => {
    setDragging(false);
    startPos.current = null;
    window.removeEventListener('mousemove', onDragMoveRef.current!);
    window.removeEventListener('mouseup', onDragEndRef.current!);
  }, []);

  // 同步 ref（在 effect 中更新，不在 render 期间）
  useEffect(() => {
    onDragMoveRef.current = onDragMove;
    onDragEndRef.current = onDragEnd;
  });

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    const img = e.currentTarget.closest('.image-container')?.querySelector('img');
    if (!img) return;
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      w: img.clientWidth,
      h: img.clientHeight,
    };
    window.addEventListener('mousemove', onDragMoveRef.current!);
    window.addEventListener('mouseup', onDragEndRef.current!);
  }, []);

  return (
    <div className="image-container relative inline-block group">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
      {imageData ? (
        <>
          <img
            src={imageData}
            alt="图片"
            style={{ ...inline, width, height, maxWidth: '100%', display: 'block' }}
            className="rounded cursor-pointer"
            onClick={handleClick}
          />
          <div
            className="absolute bottom-0 right-0 w-3 h-3 bg-blue-400 rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={onDragStart}
            title="拖拽调整尺寸"
          />
        </>
      ) : (
        <div
          className="border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center cursor-pointer hover:border-blue-400"
          style={{ ...inline, width: width === 'auto' ? '100px' : width, height: height === 'auto' ? '100px' : height, minWidth: isEditing ? '60px' : '0', minHeight: isEditing ? '60px' : '0' }}
          onClick={handleClick}
        >
          <span className="text-gray-400 text-sm">点击上传图片</span>
        </div>
      )}
    </div>
  );
}
