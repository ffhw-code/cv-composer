// EditableModule.tsx
import { getStyleConfig } from '../../store/styleRegistry';
import type { ResumeModule } from '../../store/useResumeStore';
function EditableModule({ module }: { module: ResumeModule }) {
  const config = getStyleConfig('module', module.style);
  const Component = config?.component;
  if (!Component) {
    const fallback = getStyleConfig('module');
    if (fallback?.component) {
      const FallbackComponent = fallback.component;
      return <FallbackComponent module={module} />;
    }
    return <div className="text-red-500">未找到模块样式</div>;
  }
  return <Component module={module} />;
}

export default EditableModule;