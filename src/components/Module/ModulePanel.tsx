import { useState } from 'react';
import { exportPDF } from '../../utils/export';
import { useResumeStore } from '../../store/useResumeStore';

interface ModulePanelProps {
  selectedControl: string | null;
  onSelectControl: (type: string) => void;
  deleteMode: boolean;
  onEnterDeleteMode: () => void;
}

function ModulePanel({
  selectedControl,
  onSelectControl,
  deleteMode,
  onEnterDeleteMode,
}: ModulePanelProps) {
  const addModule = useResumeStore((s) => s.addModule);
  const [componentOpen, setComponentOpen] = useState(false);
  const [controlOpen, setControlOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const keycapStyle =
    'w-full h-[60px] px-2 py-1.5 text-sm font-medium text-gray-700 ' +
    'bg-gradient-to-b from-white to-gray-100 ' +
    'border border-gray-300 ' +
    'rounded-lg ' +
    'shadow-[inset_0_1px_0_#fff,0_2px_0_#d1d5db,0_3px_6px_rgba(0,0,0,0.1)] ' +
    'active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] ' +
    'active:translate-y-[2px] ' +
    'transition-all duration-75';

  const keycapActiveStyle =
    'w-full h-[60px] px-2 py-1.5 text-sm font-medium text-gray-700 ' +
    'bg-gradient-to-b from-blue-50 to-blue-100 ' +
    'border border-blue-300 ' +
    'rounded-lg ' +
    'shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] ' +
    'translate-y-[2px] ' +
    'transition-all duration-75';

  const handleExportPDF = () => {
    exportPDF();
    setExportOpen(false);
  };

  const toggleComponent = () => {
    setComponentOpen(!componentOpen);
    setControlOpen(false);
  };

  const toggleControl = () => {
    setControlOpen(!controlOpen);
    setComponentOpen(false);
  };

  return (
    <div className="w-[150px] bg-gray-100 border border-gray-300 rounded-lg shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] p-2 flex flex-col gap-1">
      {/* 添加组件 */}
      <button onClick={toggleComponent} className={keycapStyle}>
        添加组件
      </button>

      {componentOpen && (
        <div className="flex flex-col gap-1 w-full">
          <button
            onClick={() => onSelectControl('header')}
            className={`w-full h-[60px] px-2 py-1.5 text-sm border rounded hover:bg-gray-50 ${
              selectedControl === 'header'
                ? 'bg-blue-50 border-blue-300'
                : 'bg-white border-gray-300'
            }`}
          >
            简历头
          </button>
          <button
            onClick={() => onSelectControl('module')}
            className={`w-full h-[60px] px-2 py-1.5 text-sm border rounded hover:bg-gray-50 ${
              selectedControl === 'module'
                ? 'bg-blue-50 border-blue-300'
                : 'bg-white border-gray-300'
            }`}
          >
            模块
          </button>
        </div>
      )}

      {/* 添加控件 */}
      <button onClick={toggleControl} className={keycapStyle}>
        添加控件
      </button>

      {controlOpen && (
        <div className="flex flex-col gap-1 w-full">
          <button
            onClick={() => addModule(null, 'text', 'text-default')}
            className="w-full h-[60px] px-2 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            文本框
          </button>
          <button
            onClick={() => addModule(null, 'heading', 'heading-default')}
            className="w-full h-[60px] px-2 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            标题
          </button>
          <button
            onClick={() => addModule(null, 'list', 'list-default')}
            className="w-full h-[60px] px-2 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            列表
          </button>
          <button
            onClick={() => addModule(null, 'image', 'image-default')}
            className="w-full h-[60px] px-2 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            图片
          </button>
          <button
            onClick={() => addModule(null, 'flex', 'flex-default')}
            className="w-full h-[60px] px-2 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            弹性容器
          </button>
        </div>
      )}

      {/* 删除控件按钮 */}
      <button
        onClick={onEnterDeleteMode}
        className={deleteMode ? keycapActiveStyle : keycapStyle}
      >
        删除控件
      </button>

      {/* 导出按钮 */}
      <button onClick={() => setExportOpen(!exportOpen)} className={keycapStyle}>
        导出
      </button>

      {exportOpen && (
        <div className="flex flex-col gap-1 w-full">
          <button
            onClick={handleExportPDF}
            className="w-full h-[60px] px-2 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            导出 PDF
          </button>
        </div>
      )}
    </div>
  );
}

export default ModulePanel;