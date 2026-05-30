import type { ResumeModule } from '../../store/useResumeStore';
import { buildContainerStyle, hasCustomBorder } from '../../utils/styleHelpers';

interface MinimalContainerProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function MinimalContainer({ module, children }: MinimalContainerProps) {
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

  return (
    <div style={mergedStyle} className={borderClass + 'p-2 text-gray-400 text-xs flex items-center justify-center'}>
      拖入控件或输入指令完善模块
    </div>
  );
}

export default MinimalContainer;
