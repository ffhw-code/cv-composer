import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../types/resume';
import { buildContainerStyle, hasCustomBorder } from '../../utils/styleHelpers';
import { useOverflowGuard } from '../../hooks/useOverflowGuard';
import { useEditMode } from '../../hooks/useEditMode';

interface MinimalContainerProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function MinimalContainer({ module, children }: MinimalContainerProps) {
  const addModule = useResumeStore((s) => s.addModule);
  const isEditing = useEditMode();

  const styleForBuild = module.style ? { ...module.style } : undefined;
  const userHeight = styleForBuild?.height;
  if (styleForBuild) delete styleForBuild.height;

  const custom = hasCustomBorder(styleForBuild);
  const inline = buildContainerStyle(styleForBuild);
  const { ref, heightStyle, isOverflowing } = useOverflowGuard(userHeight);

  const mergedStyle: React.CSSProperties = {
    ...inline,
    ...heightStyle,
    minHeight: '0px',
  };

  const overflowClass = isOverflowing ? 'ring-2 ring-red-300 rounded' : '';
  const borderClass = (isEditing && !custom) ? 'border border-dashed border-gray-300 ' : '';
  const bgClass = isEditing ? (custom ? 'bg-gray-50/60' : 'bg-gray-50/40') : '';

  if (children) {
    return (
      <div
        ref={ref}
        style={{ ...mergedStyle, width: mergedStyle.width || '100%' }}
        className={`${borderClass}p-0 rounded ${bgClass} ${overflowClass}`}
      >
        {children}
      </div>
    );
  }

  const btnClass = 'px-2 py-0.5 text-[10px] bg-white border border-gray-300 rounded hover:bg-gray-100 hover:border-blue-400 transition-colors';

  return (
    <div ref={ref} style={mergedStyle} className={`${borderClass}p-0 flex flex-col items-center justify-center gap-0 text-gray-400 text-[11px] ${overflowClass}`}>
      <span>拖入控件或快速添加：</span>
      <div className="flex gap-1 flex-wrap justify-center">
        <button
          onClick={(e) => { e.stopPropagation(); addModule(module.id, 'text', 'text-default'); }}
          className={btnClass}
        >文本框</button>
        <button
          onClick={(e) => { e.stopPropagation(); addModule(module.id, 'heading', 'heading-default'); }}
          className={btnClass}
        >标题</button>
        <button
          onClick={(e) => { e.stopPropagation(); addModule(module.id, 'list', 'list-default'); }}
          className={btnClass}
        >列表</button>
      </div>
    </div>
  );
}

export default MinimalContainer;
