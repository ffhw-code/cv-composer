import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';
import { buildContainerStyle, hasCustomBorder } from '../../utils/styleHelpers';
import { useOverflowGuard } from '../../hooks/useOverflowGuard';
import { useEditMode } from '../../hooks/useEditMode';

interface GridContainerProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function GridContainer({ module, children }: GridContainerProps) {
  const addModule = useResumeStore((s) => s.addModule);
  const isEditing = useEditMode();
  const columns = module.style?.gridTemplateColumns || '1fr 1fr';
  const rows = module.style?.gridTemplateRows || 'auto';
  const gap = module.style?.gap || '0px';

  const styleForBuild = module.style ? { ...module.style } : undefined;
  const userHeight = styleForBuild?.height;
  if (styleForBuild) delete styleForBuild.height;

  const custom = hasCustomBorder(styleForBuild);
  const inline = buildContainerStyle(styleForBuild);
  const { ref, heightStyle, isOverflowing } = useOverflowGuard(userHeight);

  const containerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: columns,
    gridTemplateRows: rows,
    gap,
    ...inline,
    ...heightStyle,
  };

  const overflowClass = isOverflowing ? 'ring-2 ring-red-300 rounded' : '';

  if (children) {
    return (
      <div
        ref={ref}
        className={`${custom
          ? (isEditing ? 'min-h-[20px] p-0 bg-gray-50/60' : 'p-0')
          : (isEditing ? 'border border-dashed border-gray-300 min-h-[20px] p-0 bg-gray-50/40' : 'p-0')} rounded ${overflowClass}`}
        style={{ ...containerStyle, width: containerStyle.width || '100%' }}
        data-id={module.id}
      >
        {children}
      </div>
    );
  }

  const btnClass = 'px-2 py-1 text-[10px] bg-white border border-gray-300 rounded hover:bg-gray-100 hover:border-blue-400 transition-colors';

  return (
    <div
      ref={ref}
      className={`${isEditing ? 'border border-dashed border-gray-300 min-h-[60px]' : ''} p-0 flex flex-col items-center justify-center gap-0 ${overflowClass}`}
      style={containerStyle}
      data-id={module.id}
    >
      <p className="text-gray-400 text-[11px]">空网格 — 快速添加：</p>
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

export default GridContainer;
