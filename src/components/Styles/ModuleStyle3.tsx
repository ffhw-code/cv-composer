import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';
import InlineEditor from './InlineEditor';

export default function ModuleStyle3({ module }: StyleComponentProps) {
  const updateModule = useResumeStore((s) => s.updateModule);

  return (
    <div style={{ ...module.style }} className="border-l-4 border-emerald-400 pl-4 py-2">
      <h3 className="font-bold text-lg text-gray-800 mb-2">
        <InlineEditor
          content={module.title || '标题'}
          onUpdate={(html) => updateModule(module.id, { title: html })}
          className="font-bold text-lg text-gray-800"
        />
      </h3>
      <div className="text-sm text-gray-600 min-h-[40px] leading-relaxed">
        <InlineEditor
          content={module.content || '点击此处编辑内容...'}
          onUpdate={(html) => updateModule(module.id, { content: html })}
          className="text-sm text-gray-600"
        />
      </div>
    </div>
  );
}