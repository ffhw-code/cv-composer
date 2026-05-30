import type { ResumeModule } from '../../store/useResumeStore';

function ShapeControl({ module }: { module: ResumeModule }) {
  const style = module.style || {};

  const shape = style.shape || 'rectangle';
  const size = parseInt(style.size || '80', 10);

  const containerStyle: React.CSSProperties = {
    width: style.width || `${size}px`,
    height: style.height || `${size}px`,
    backgroundColor: style.backgroundColor || style.color || '#3b82f6',
    borderRadius: shape === 'circle' ? '50%' : (style.borderRadius || '4px'),
    opacity: style.opacity ? parseFloat(style.opacity) : 1,
    margin: style.margin || '0',
  };

  return <div style={containerStyle} />;
}

export default ShapeControl;
