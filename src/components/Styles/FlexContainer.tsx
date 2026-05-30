import type { ResumeModule } from '../../store/useResumeStore';

interface FlexContainerProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function FlexContainer({ module, children }: FlexContainerProps) {
  const direction = (module.style?.flexDirection as 'row' | 'column') || 'column';
  const gap = module.style?.gap || '16px';

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    gap,
    ...module.style,
  };


  // 使用 children prop（由 CanvasArea 通过 EditableModule 传入）
  // 兜底：如果没有 children prop，显示占位提示
  return (
    <div
      className="border border-dashed border-gray-300 min-h-[60px] p-2"
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
