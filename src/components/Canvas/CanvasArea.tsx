import { useState, useEffect } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import ResumeHeader from '../Module/ResumeHeader';
import EditableModule from '../Module/EditableModule';

interface CanvasAreaProps {
  deleteMode: boolean;
  onExitDeleteMode: () => void;
}

function CanvasArea({ deleteMode, onExitDeleteMode }: CanvasAreaProps) {
  const [scale, setScale] = useState(1);
  const modules = useResumeStore((s) => s.modules);
  const removeModule = useResumeStore((s) => s.removeModule);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!deleteMode) {
      setSelectedIds(new Set());
    }
  }, [deleteMode]);

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.1, 2));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.1, 0.5));
  const zoomReset = () => setScale(1);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) return;
    // 二次确认
    const confirmed = window.confirm(
      `确定要删除选中的 ${selectedIds.size} 个模块吗？`
    );
    if (confirmed) {
      selectedIds.forEach((id) => removeModule(id));
      setSelectedIds(new Set());
      // 删除后自动退出删除模式？用户可以选择留在删除模式继续操作，需求未强制，我们保留当前模式，让用户手动点退出。
      // 但是按钮变回“退出”，因为 selectedIds 已为空。
    }
  };

  const handleExit = () => {
    onExitDeleteMode();
  };

  const hasSelected = selectedIds.size > 0;

  return (
    <div className="relative bg-gray-100 h-full" style={{ width: '842px' }}>
      <div className="h-full overflow-y-auto p-6 flex justify-center">
        <div
          className="bg-white shadow-lg p-10 flex flex-col gap-4 origin-top"
          style={{
            width: '794px',
            minHeight: '1123px',
            transform: `scale(${scale})`,
            marginBottom: scale > 1 ? `${(scale - 1) * 1123}px` : '0',
          }}
        >
          {modules.length === 0 && (
            <p className="text-gray-300 text-center mt-20">
              从左侧选择控件添加到画布
            </p>
          )}

          {modules.map((mod) => (
            <div key={mod.id} className="relative">
              {deleteMode && (
                <div className="absolute -left-8 top-1/2 -translate-y-1/2 z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(mod.id);
                    }}
                    className={`w-6 h-6 p-0 border-2 rounded-full transition-all duration-75 flex items-center justify-center
                      ${
                        selectedIds.has(mod.id)
                          ? 'bg-blue-500 border-blue-600 shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] translate-y-[1px]'
                          : 'bg-white border-gray-300 hover:border-blue-400 shadow-[0_2px_4px_rgba(0,0,0,0.1)]'
                      }
                      active:scale-95`}
                  >
                    {selectedIds.has(mod.id) && (
                      <span className="text-white text-xs font-bold">✓</span>
                    )}
                  </button>
                </div>
              )}

              {mod.type === 'header' ? (
                <ResumeHeader module={mod} />
              ) : (
                <EditableModule module={mod} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 右下角控制区 */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end">
        {/* 删除模式下的按钮：根据是否有选中切换 */}
        {deleteMode && (
          <button
            onClick={hasSelected ? handleDelete : handleExit}
            className={`w-32 h-[60px] px-2 py-1.5 text-sm font-medium rounded-lg transition-all duration-75
              ${
                hasSelected
                  ? 'text-gray-700 bg-gradient-to-b from-red-50 to-red-100 border border-red-300 shadow-[inset_0_1px_0_#fff,0_2px_0_#fca5a5,0_3px_6px_rgba(0,0,0,0.1)] active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] active:translate-y-[2px]'
                  : 'text-gray-700 bg-gradient-to-b from-white to-gray-100 border border-gray-300 shadow-[inset_0_1px_0_#fff,0_2px_0_#d1d5db,0_3px_6px_rgba(0,0,0,0.1)] active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] active:translate-y-[2px]'
              }
            `}
          >
            {hasSelected ? '删除' : '退出'}
          </button>
        )}

        {/* 缩放控件 */}
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