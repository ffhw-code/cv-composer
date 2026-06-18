import { useState } from 'react';
import { exportPDF } from '../../utils/export';
import { useResumeStore } from '../../store/useResumeStore';
import { findModuleById, findParentById } from '../../utils/moduleUtils';

interface ModulePanelProps {
  selectedControl: string | null;
  onSelectControl: (type: string) => void;
  deleteMode: boolean;
  onEnterDeleteMode: () => void;
}

type ControlType = 'text' | 'heading' | 'list' | 'image' | 'flex' | 'grid';

const CONTROLS: { type: ControlType; label: string; styleId: string }[] = [
  { type: 'text', label: '文本框', styleId: 'text-default' },
  { type: 'heading', label: '标题', styleId: 'heading-default' },
  { type: 'list', label: '列表', styleId: 'list-default' },
  { type: 'image', label: '图片', styleId: 'image-default' },
  { type: 'flex', label: '弹性容器', styleId: 'flex-default' },
  { type: 'grid', label: '网格容器', styleId: 'grid-default' },
];

function ModulePanel({
  selectedControl,
  onSelectControl,
  deleteMode,
  onEnterDeleteMode,
}: ModulePanelProps) {
  const addModule = useResumeStore((s) => s.addModule);
  const importModules = useResumeStore((s) => s.importModules);
  const selectedId = useResumeStore((s) => s.selectedId);
  const modules = useResumeStore((s) => s.modules);

  const [componentOpen, setComponentOpen] = useState(false);
  const [controlOpen, setControlOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const keycapStyle =
    'w-full h-[45px] px-1 py-1 text-xs font-medium text-gray-700 ' +
    'bg-gradient-to-b from-white to-gray-100 ' +
    'border border-gray-300 ' +
    'rounded-lg ' +
    'shadow-[inset_0_1px_0_#fff,0_2px_0_#d1d5db,0_3px_6px_rgba(0,0,0,0.1)] ' +
    'active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] ' +
    'active:translate-y-[2px] ' +
    'transition-all duration-75 truncate';

  const keycapActiveStyle =
    'w-full h-[45px] px-1 py-1 text-xs font-medium text-gray-700 ' +
    'bg-gradient-to-b from-blue-50 to-blue-100 ' +
    'border border-blue-300 ' +
    'rounded-lg ' +
    'shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] ' +
    'translate-y-[2px] ' +
    'transition-all duration-75 truncate';

  const handleClearCanvas = () => {
    const confirmed = window.confirm('确定要清空画布吗？所有模块将被删除，此操作不可撤销。');
    if (confirmed) {
      importModules([]);
      onSelectControl('');
    }
  };

  const handleExportPDF = () => {
    exportPDF();
    setExportOpen(false);
  };

  // 确定添加控件的目标父容器
  const getAddTargetParent = (): string | null => {
    if (!selectedId) return null;
    const selected = findModuleById(modules, selectedId);
    if (!selected) return null;
    // 容器类型 → 添加到容器内部；叶子控件 → 添加到同级
    if (selected.type === 'flex' || selected.type === 'grid' ||
        selected.type === 'header' || selected.type === 'module') {
      return selectedId;
    }
    const parent = findParentById(modules, selectedId);
    return parent?.id || null;
  };

  const handleAddControl = (type: string, styleId: string) => {
    addModule(getAddTargetParent(), type as 'text' | 'heading' | 'list' | 'image' | 'flex' | 'grid', styleId);
  };

  const toggleComponent = () => {
    setComponentOpen(!componentOpen);
    setControlOpen(false);
  };

  const toggleControl = () => {
    setControlOpen(!controlOpen);
    setComponentOpen(false);
  };

  const selectedModule = selectedId ? findModuleById(modules, selectedId) : null;
  const targetParent = getAddTargetParent();
  const addHint = targetParent
    ? (selectedModule?.type === 'header' ? '→ 简历头内' :
       selectedModule?.type === 'module' ? '→ 模块内' :
       selectedModule?.type === 'flex' || selectedModule?.type === 'grid' ? '→ 容器内' :
       '→ 同级后')
    : '';

  return (
    <div className="w-[75px] bg-gray-100 border border-gray-300 rounded-lg shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] p-1 flex flex-col gap-1">
      {/* 添加组件 */}
      <button onClick={toggleComponent} className={keycapStyle}>
        添加组件
      </button>

      {componentOpen && (
        <div className="flex flex-col gap-1 w-full">
          <button
            onClick={() => onSelectControl('header')}
            className={`w-full h-[45px] px-1 py-1 text-xs border rounded hover:bg-gray-50 truncate ${
              selectedControl === 'header'
                ? 'bg-blue-50 border-blue-300'
                : 'bg-white border-gray-300'
            }`}
          >
            简历头
          </button>
          <button
            onClick={() => onSelectControl('module')}
            className={`w-full h-[45px] px-1 py-1 text-xs border rounded hover:bg-gray-50 truncate ${
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
      <div className="relative">
        <button onClick={toggleControl} className={keycapStyle}>
          添加控件
        </button>
        {addHint && (
          <span className="absolute -bottom-0.5 left-0 right-0 text-[8px] text-blue-500 text-center truncate leading-none">{addHint}</span>
        )}
      </div>

      {controlOpen && (
        <div className="flex flex-col gap-1 w-full">
          {CONTROLS.map(({ type, label, styleId }) => (
            <button
              key={type}
              onClick={() => handleAddControl(type, styleId)}
              className="w-full h-[45px] px-1 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 truncate"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 删除控件按钮 */}
      <button
        onClick={onEnterDeleteMode}
        className={deleteMode ? keycapActiveStyle : keycapStyle}
      >
        删除控件
      </button>

      {/* 清空画布按钮 */}
      <button
        onClick={handleClearCanvas}
        className={keycapStyle}
      >
        清空画布
      </button>

      {/* 导出按钮 */}
      <button onClick={() => setExportOpen(!exportOpen)} className={keycapStyle}>
        导出
      </button>

      {exportOpen && (
        <div className="flex flex-col gap-1 w-full">
          <button
            onClick={handleExportPDF}
            className="w-full h-[45px] px-1 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 truncate"
          >
            导出 PDF
          </button>
        </div>
      )}
    </div>
  );
}

export default ModulePanel;
