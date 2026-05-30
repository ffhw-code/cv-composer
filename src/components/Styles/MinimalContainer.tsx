import type { ResumeModule } from '../../store/useResumeStore';

interface MinimalContainerProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function MinimalContainer({ module, children }: MinimalContainerProps) {
  const style = module.style || {};

  // 保留所有样式属性（包括布局属性），MinimalContainer 现在负责完整渲染
  const mergedStyle: React.CSSProperties = {
    ...style,
    minHeight: '60px',
  };

  if (children) {
    return <div style={mergedStyle}>{children}</div>;
  }

  return (
    <div
      style={mergedStyle}
      className="border border-dashed border-gray-300 p-2 text-gray-400 text-xs flex items-center justify-center"
    >
      拖入控件或输入指令完善模块
    </div>
  );
}

export default MinimalContainer;
