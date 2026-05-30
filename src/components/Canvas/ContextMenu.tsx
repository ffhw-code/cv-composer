// src/components/Canvas/ContextMenu.tsx
import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';

interface ContextMenuProps {
  x: number;
  y: number;
  module: ResumeModule;
  onClose: () => void;
}

function ContextMenu({ x, y, module, onClose }: ContextMenuProps) {
  const removeModule = useResumeStore((s) => s.removeModule);
  const updateModule = useResumeStore((s) => s.updateModule);

  const handleDelete = () => { removeModule(module.id); onClose(); };

  const handleDuplicate = () => {
    useResumeStore.getState().duplicateModule(module.id);
    onClose();
  };


  const handleSetColor = () => {
    const color = prompt('输入颜色值（如 red 或 #ff0000）', module.style?.color || '');
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

  const textActions = module.type === 'text' || module.type === 'heading' || module.type === 'list';

  return (
    <div
      className="fixed bg-white border border-gray-300 shadow-lg rounded py-1 z-50 text-sm"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={handleDelete} className="block w-full text-left px-3 py-1 hover:bg-gray-100">删除</button>
      <button onClick={handleDuplicate} className="block w-full text-left px-3 py-1 hover:bg-gray-100">复制</button>
      {textActions && (
        <>
          <button onClick={handleSetColor} className="block w-full text-left px-3 py-1 hover:bg-gray-100">修改文字颜色</button>
          <button onClick={handleSetBg} className="block w-full text-left px-3 py-1 hover:bg-gray-100">修改背景色</button>
        </>
      )}
      <button onClick={onClose} className="block w-full text-left px-3 py-1 hover:bg-gray-100 text-gray-400">取消</button>
    </div>
  );
}

export default ContextMenu;