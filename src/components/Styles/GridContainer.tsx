import type { ResumeModule } from '../../store/useResumeStore';
import { buildContainerStyle, hasCustomBorder } from '../../utils/styleHelpers';

interface GridContainerProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function GridContainer({ module, children }: GridContainerProps) {
  const columns = module.style?.gridTemplateColumns || '1fr 1fr';
  const rows = module.style?.gridTemplateRows || 'auto';
  const gap = module.style?.gap || '16px';

  const custom = hasCustomBorder(module.style);
  const inline = buildContainerStyle(module.style);

  const containerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: columns,
    gridTemplateRows: rows,
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
        <p className="text-gray-400 text-sm">拖入模块或控件到网格</p>
      )}
    </div>
  );
}

export default GridContainer;
