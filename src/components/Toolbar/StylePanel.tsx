import { useRef, useEffect, useState } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import headerThumb1 from '../../assets/images/headerThumb1.png';
import moduleThumb1 from '../../assets/images/moduleThumb1.png';

interface StylePanelProps {
  selectedType: string | null;
  width: number;
  onResize: (width: number) => void;
}

function StylePanel({ selectedType, width, onResize }: StylePanelProps) {
  const addModule = useResumeStore((s) => s.addModule);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const panelRect = panelRef.current.getBoundingClientRect();
      // 新宽度 = 鼠标位置 - 面板左边缘，右边框随鼠标移动
      const newWidth = e.clientX - panelRect.left;
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize]);

  return (
    <div
      ref={panelRef}
      className="relative bg-gray-100 border border-gray-300 rounded-lg shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] h-full flex flex-col"
      style={{ width: `${width}px` }}
    >
      {/* 拖拽手柄 - 右侧边框上，纯箭头 */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 cursor-col-resize z-10 flex items-center justify-center select-none hover:text-blue-500 transition-colors"
        onMouseDown={handleMouseDown}
        style={{ width: '16px', height: '32px' }}
      >
        <span className="text-gray-400 text-lg leading-none">
          &#x276F;
        </span>
      </div>

      {/* 内容区域：右侧留出空间给手柄 */}
      <div className="flex flex-col flex-1 pr-4 p-3 overflow-hidden">
        <p className="text-xs text-gray-400 mb-2">样式区</p>

        <div className="flex-1 overflow-y-auto">
          {!selectedType && (
            <p className="text-xs text-gray-300 mt-4 text-center">
              请先选择控件类型
            </p>
          )}

          {selectedType === 'header' && (
            <div className="flex flex-col gap-2">
              <div
                onClick={() => addModule('header')}
                className="w-full bg-white border border-gray-200 rounded overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-shadow"
              >
                <img
                  src={headerThumb1}
                  alt="简历头样式1"
                  className="w-full h-auto"
                />
              </div>
            </div>
          )}

          {selectedType === 'module' && (
            <div className="flex flex-col gap-2">
              <div
                onClick={() => addModule('module')}
                className="w-full bg-white border border-gray-200 rounded overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-shadow"
              >
                <img
                  src={moduleThumb1}
                  alt="模块样式1"
                  className="w-full h-auto"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StylePanel;