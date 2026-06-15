import { useResumeStore } from '../../store/useResumeStore';
import { findModuleById, findParentById } from '../../utils/moduleUtils';
import type { ResumeModule } from '../../store/useResumeStore';

interface InlineToolbarProps {
  moduleId: string;
}

function InlineToolbar({ moduleId }: InlineToolbarProps) {
  const modules = useResumeStore((s) => s.modules);
  const removeModule = useResumeStore((s) => s.removeModule);
  const duplicateModule = useResumeStore((s) => s.duplicateModule);
  const moveModule = useResumeStore((s) => s.moveModule);
  const addModule = useResumeStore((s) => s.addModule);
  const select = useResumeStore((s) => s.select);

  const mod = findModuleById(modules, moduleId);
  if (!mod) return null;

  const isContainer = mod.type === 'flex' || mod.type === 'grid' || mod.type === 'header' || mod.type === 'module';

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeModule(moduleId);
    select(null);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateModule(moduleId);
  };

  const handleMoveUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const parent = findParentById(modules, moduleId);
    const siblings = parent ? parent.children! : modules;
    const idx = siblings.findIndex((m) => m.id === moduleId);
    if (idx <= 0) return;
    const newParentId = parent?.id || null;
    moveModule(moduleId, newParentId, idx - 1);
  };

  const handleMoveDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const parent = findParentById(modules, moduleId);
    const siblings = parent ? parent.children! : modules;
    const idx = siblings.findIndex((m) => m.id === moduleId);
    if (idx < 0 || idx >= siblings.length - 1) return;
    const newParentId = parent?.id || null;
    moveModule(moduleId, newParentId, idx + 1);
  };

  const handleAddChild = (type: 'text' | 'heading') => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isContainer) {
      addModule(moduleId, type, type + '-default');
    }
  };

  const btnClass = 'w-6 h-6 flex items-center justify-center text-[10px] bg-white border border-gray-300 rounded hover:bg-gray-100 hover:border-gray-400 transition-colors';

  return (
    <div
      className="absolute -top-7 left-0 flex items-center gap-0.5 z-20"
      style={{ pointerEvents: 'auto' }}
    >
      <button onClick={handleMoveUp} className={btnClass} title="上移">↑</button>
      <button onClick={handleMoveDown} className={btnClass} title="下移">↓</button>
      <button onClick={handleDuplicate} className={btnClass} title="复制">⧉</button>
      {isContainer && (
        <>
          <button onClick={handleAddChild('text')} className={btnClass + ' text-blue-600'} title="加文本框">T+</button>
          <button onClick={handleAddChild('heading')} className={btnClass + ' text-blue-600'} title="加标题">H+</button>
        </>
      )}
      <button onClick={handleDelete} className={btnClass + ' text-red-500 hover:bg-red-50'} title="删除">✕</button>
    </div>
  );
}

export default InlineToolbar;
