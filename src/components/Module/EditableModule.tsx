import { getStyleConfig } from '../../store/styleRegistry';
import type { ResumeModule } from '../../types/resume';

interface EditableModuleProps {
  module: ResumeModule;
  children?: React.ReactNode;
}

function EditableModule({ module, children }: EditableModuleProps) {
  const config = getStyleConfig(module.type, module.styleId);
  const Component = config?.component;

  if (!Component) {
    const fallback = getStyleConfig(module.type);
    if (fallback?.component) {
      const FallbackComponent = fallback.component;
      return <FallbackComponent module={module}>{children}</FallbackComponent>;
    }
    if (children) {
      return <>{children}</>;
    }
    return <div className="text-red-500">未找到样式 (type: {module.type})</div>;
  }

  return <Component module={module}>{children}</Component>;
}

export default EditableModule;
