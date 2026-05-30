import type { ResumeModule } from '../../store/useResumeStore';

function DividerControl({ module }: { module: ResumeModule }) {
  const style = module.style || {};

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: style.width || '100%',
    height: style.height || 'auto',
    margin: style.margin || '8px 0',
    padding: style.padding || '0',
  };

  const lineStyle: React.CSSProperties = {
    width: style.lineWidth || '100%',
    height: style.lineHeight || '2px',
    backgroundColor: style.lineColor || style.color || '#e2e8f0',
    border: 'none',
    borderRadius: style.borderRadius || '0',
    borderStyle: (style.lineStyle as any) || 'solid',
  };

  // 如果 lineStyle 是 dashed/dotted，用 border 模拟
  if (style.lineStyle === 'dashed' || style.lineStyle === 'dotted') {
    lineStyle.backgroundColor = 'transparent';
    lineStyle.borderTop = `${lineStyle.height} ${style.lineStyle} ${style.lineColor || style.color || '#e2e8f0'}`;
    lineStyle.height = '0';
  }

  return (
    <div style={containerStyle}>
      <div style={lineStyle} />
    </div>
  );
}

export default DividerControl;
