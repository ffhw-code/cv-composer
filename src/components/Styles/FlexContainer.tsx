import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';
import { buildContainerStyle, hasCustomBorder } from '../../utils/styleHelpers';

interface FlexContainerProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function FlexContainer({ module, children }: FlexContainerProps) {
  const addModule = useResumeStore((s) => s.addModule);
  const direction = (module.style?.flexDirection as 'row' | 'column') || 'column';
  const gap = module.style?.gap || '16px';

  const custom = hasCustomBorder(module.style);
  const inline = buildContainerStyle(module.style);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    gap,
    ...inline,
  };

  if (children) {
    return (
      <div
        className={custom ? 'min-h-[60px] p-2' : 'border border-dashed border-gray-300 min-h-[60px] p-2'}
        style={containerStyle}
        data-id={module.id}
      >
        {children}
      </div>
    );
  }

  const btnClass = 'px-2 py-1 text-[10px] bg-white border border-gray-300 rounded hover:bg-gray-100 hover:border-blue-400 transition-colors';

  return (
    <div
      className="border border-dashed border-gray-300 min-h-[60px] p-2 flex flex-col items-center justify-center gap-1.5"
      style={containerStyle}
      data-id={module.id}
    >
      <p className="text-gray-400 text-[11px]">空容器 — 快速添加：</p>
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

export default FlexContainer;
