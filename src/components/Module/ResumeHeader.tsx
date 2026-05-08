// ResumeHeader.tsx
import { getStyleConfig } from '../../store/styleRegistry';
import type { ResumeModule } from '../../store/useResumeStore';

function ResumeHeader({ module }: { module: ResumeModule }) {
  const config = getStyleConfig('header', module.style);
  const Component = config?.component;
  if (!Component) {
    // 兜底：使用默认样式（第一个注册的）
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