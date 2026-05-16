// src/components/Styles/MinimalContainer.tsx
import type { ResumeModule } from '../../store/useResumeStore';

function MinimalContainer({ module }: { module: ResumeModule }) {
  const style = module.style || {};
  return (
    <div
      style={{ ...style, minHeight: '60px' }}
      className="border border-dashed border-gray-300 p-2 text-gray-400 text-xs flex items-center justify-center"
    >
      拖入控件或输入指令完善模块
    </div>
  );
}

export default MinimalContainer;