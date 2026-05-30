import type { ResumeModule } from '../../store/useResumeStore';
import { buildContainerStyle, hasCustomBorder } from '../../utils/styleHelpers';

interface FlexContainerProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function FlexContainer({ module, children }: FlexContainerProps) {
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

  return (
    <div
      className={custom ? 'min-h-[60px] p-2' : 'border border-dashed border-gray-300 min-h-[60px] p-2'}
      style={containerStyle}
      data-id={module.id}
    >
      {children ? (
        children
      ) : (
        <p className="text-gray-400 text-sm">拖入模块或控件</p>
      )}
    </div>
  );
}

export default FlexContainer;
