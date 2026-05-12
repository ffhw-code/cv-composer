import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';
import InlineEditor from './InlineEditor';

export default function ModuleStyle4({ module }: StyleComponentProps) {
  const updateModule = useResumeStore((s) => s.updateModule);

  return (
    <div style={{ ...module.style }} className="py-1">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
        <InlineEditor
          content={module.title || '标题'}
          onUpdate={(html) => updateModule(module.id, { title: html })}
          className="text-sm font-semibold text-gray-400 uppercase"
        />
      </h3>
      <div className="text-sm text-gray-700 min-h-[30px]">
        <InlineEditor
          content={module.content || '点击此处编辑内容...'}
          onUpdate={(html) => updateModule(module.id, { content: html })}
          className="text-sm text-gray-700"
        />
      </div>
    </div>
  );
}