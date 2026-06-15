import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';
import { buildContainerStyle, hasCustomBorder } from '../../utils/styleHelpers';

interface MinimalContainerProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function MinimalContainer({ module, children }: MinimalContainerProps) {
  const addModule = useResumeStore((s) => s.addModule);
  const custom = hasCustomBorder(module.style);
  const inline = buildContainerStyle(module.style);

  const mergedStyle: React.CSSProperties = {
    ...inline,
    minHeight: '60px',
  };

  const borderClass = custom ? '' : 'border border-dashed border-gray-300 ';

  if (children) {
    return <div style={mergedStyle} className={borderClass + 'p-2'}>{children}</div>;
  }

  const btnClass = 'px-2 py-0.5 text-[10px] bg-white border border-gray-300 rounded hover:bg-gray-100 hover:border-blue-400 transition-colors';

  return (
    <div style={mergedStyle} className={borderClass + 'p-2 flex flex-col items-center justify-center gap-1.5 text-gray-400 text-[11px]'}>
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
