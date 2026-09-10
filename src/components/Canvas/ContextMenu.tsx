import { useResumeStore } from '../../store/useResumeStore';
import { findParentById, findModuleById } from '../../utils/moduleUtils';
import type { ResumeModule } from '../../types/resume';

interface ContextMenuProps {
  x: number;
  y: number;
  module: ResumeModule;
  onClose: () => void;
}

function findLastByType(nodes: ResumeModule[], type: string): ResumeModule | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].type === type) return nodes[i];
    if (nodes[i].children) {
      const found = findLastByType(nodes[i].children, type);
      if (found) return found;
    }
  }
  return null;
}

function ContextMenu({ x, y, module, onClose }: ContextMenuProps) {
  const removeModule = useResumeStore((s) => s.removeModule);
  const updateModule = useResumeStore((s) => s.updateModule);
  const addModule = useResumeStore((s) => s.addModule);
  const moveModule = useResumeStore((s) => s.moveModule);

  const handleDelete = () => { removeModule(module.id); onClose(); };

  const handleDuplicate = () => {
    useResumeStore.getState().duplicateModule(module.id);
    onClose();
  };

  const handleSetColor = () => {
    const color = prompt('输入颜色值（如 #ff0000）', module.style?.color || '');
    if (color) {
      updateModule(module.id, { style: { ...module.style, color } });
    }
    onClose();
  };

  const handleSetBg = () => {
    const bg = prompt('输入背景色', module.style?.backgroundColor || '');
    if (bg) {
      updateModule(module.id, { style: { ...module.style, backgroundColor: bg } });
    }
    onClose();
  };

  // 包裹到容器：在当前模块同级创建容器，然后移入
  const handleWrapIn = (containerType: 'flex' | 'grid') => () => {
    const state = useResumeStore.getState();
    const parent = findParentById(state.modules, module.id);
    const parentId = parent?.id || null;

    addModule(parentId, containerType, containerType + '-default');

    // 从更新后的树中查找新创建的容器 ID
    const freshModules = useResumeStore.getState().modules;
    const searchRoot = parentId
      ? (findModuleById(freshModules, parentId)?.children || freshModules)
      : freshModules;
    const newContainer = findLastByType(searchRoot, containerType);

    if (newContainer) {
      moveModule(module.id, newContainer.id, 0);
    }
    onClose();
  };

  const textActions = module.type === 'text' || module.type === 'heading' || module.type === 'list';

  return (
    <div
      className="fixed bg-white border border-gray-300 shadow-lg rounded py-1 z-50 text-sm min-w-[170px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={handleDuplicate} className="block w-full text-left px-3 py-1 hover:bg-gray-100">复制</button>
      <button onClick={handleWrapIn('flex')} className="block w-full text-left px-3 py-1 hover:bg-gray-100">包裹到弹性容器</button>
      <button onClick={handleWrapIn('grid')} className="block w-full text-left px-3 py-1 hover:bg-gray-100">包裹到网格容器</button>
      <div className="border-t border-gray-200 my-0.5" />
      {textActions && (
        <>
          <button onClick={handleSetColor} className="block w-full text-left px-3 py-1 hover:bg-gray-100">文字颜色</button>
          <button onClick={handleSetBg} className="block w-full text-left px-3 py-1 hover:bg-gray-100">背景色</button>
          <div className="border-t border-gray-200 my-0.5" />
        </>
      )}
      <button onClick={handleDelete} className="block w-full text-left px-3 py-1 hover:bg-gray-100 text-red-500">删除</button>
    </div>
  );
}

export default ContextMenu;
