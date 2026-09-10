import { getStyleConfig } from '../../styles/styleRegistry';
import type { ResumeModule } from '../../types/resume';

function ResumeHeader({ module }: { module: ResumeModule }) {
  const config = getStyleConfig('header', module.styleId);
  const Component = config?.component;
  if (!Component) {
    const fallback = getStyleConfig('header');
    if (fallback?.component) {
      const FallbackComponent = fallback.component;
      return <FallbackComponent module={module} />;
    }
    return <div className="text-red-500">未找到简历头样式</div>;
  }
  return <Component module={module} />;
}

export default ResumeHeader;
