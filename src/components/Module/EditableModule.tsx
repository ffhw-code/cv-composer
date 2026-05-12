import { getStyleConfig } from '../../store/styleRegistry';
import type { ResumeModule } from '../../store/useResumeStore';

function EditableModule({ module }: { module: ResumeModule }) {
  if (module.type === 'flex' || module.type === 'grid') {
    return null; // 由 CanvasArea 处理
  }

  const config = getStyleConfig(module.type, module.styleId);
  const Component = config?.component;

  if (!Component) {
    const fallback = getStyleConfig(module.type);
    if (fallback?.component) {
      const FallbackComponent = fallback.component;
      return <FallbackComponent module={module} />;
    }
    return <div className="text-red-500">未找到样式 (type: {module.type})</div>;
  }

  return <Component module={module} />;
}

export default EditableModule;