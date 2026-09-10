import { useRef, useEffect, useState } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import { getStylesByType } from '../../styles/styleRegistry';
import { findModuleById } from '../../utils/moduleUtils';

interface StylePanelProps {
  selectedType: string | null;
  width: number;
  onResize: (width: number) => void;
}

function StylePanel({ selectedType, width, onResize }: StylePanelProps) {
  const addModuleFromTemplate = useResumeStore((s) => s.addModuleFromTemplate);
  const selectedId = useResumeStore((s) => s.selectedId);
  const modules = useResumeStore((s) => s.modules);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => setIsDragging(true);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const newWidth = e.clientX - panelRef.current.getBoundingClientRect().left;
      onResize(newWidth);
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize]);

  // 确定目标父容器：优先选中容器，否则根级
  const getTargetParent = (): string | null => {
    if (!selectedId) return null;
    const selected = findModuleById(modules, selectedId);
    if (!selected) return null;
    if (selected.type === 'flex' || selected.type === 'grid' ||
        selected.type === 'header' || selected.type === 'module') {
      return selectedId;
    }
    return null;
  };

  const availableStyles =
    selectedType === 'header'
      ? getStylesByType('header')
      : selectedType === 'module'
      ? getStylesByType('module')
      : [];

  const targetParent = getTargetParent();
  const hint = targetParent ? '将添加到选中容器内' : null;

  return (
    <div
      ref={panelRef}
      className="relative bg-gray-100 border border-gray-300 rounded-lg shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] h-full flex flex-col"
      style={{ width: `${width}px` }}
    >
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 cursor-col-resize z-10 flex items-center justify-center select-none hover:text-blue-500 transition-colors"
        onMouseDown={handleMouseDown}
        style={{ width: '16px', height: '32px' }}
      >
        <span className="text-gray-400 text-lg leading-none">&#x276F;</span>
      </div>

      <div className="flex flex-col flex-1 pr-4 p-3 overflow-hidden">
        <p className="text-xs text-gray-400 mb-2">样式区</p>
        {hint && (
          <p className="text-[10px] text-blue-500 mb-1 text-center">{hint}</p>
        )}
        <div className="flex-1 overflow-y-auto">
          {!selectedType && (
            <p className="text-xs text-gray-300 mt-4 text-center">
              请先在左侧选择控件类型
            </p>
          )}
          {selectedType && availableStyles.length === 0 && (
            <p className="text-xs text-gray-400 mt-4 text-center">暂无可用样式</p>
          )}
          {selectedType && (
            <div className="flex flex-col gap-2">
              {availableStyles.map((item) => (
                <div
                  key={item.style}
                  onClick={() => addModuleFromTemplate(targetParent, item.type, item.style)}
                  className="w-full bg-white border border-gray-200 rounded overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-shadow"
                >
                  <img src={item.thumb} alt={item.label} className="w-full h-auto" />
                  <p className="text-xs text-center text-gray-500 py-1">{item.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StylePanel;
