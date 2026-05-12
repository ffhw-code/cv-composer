import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';
import InlineEditor from './InlineEditor';

export default function ModuleStyle1({ module }: StyleComponentProps) {
  const updateModule = useResumeStore((s) => s.updateModule);

  return (
    <div style={{ ...module.style }} className="border border-gray-200 rounded p-4 bg-white">
      <h3 className="font-bold text-lg mb-2">
        <InlineEditor
          content={module.title || '标题'}
          onUpdate={(html) => updateModule(module.id, { title: html })}
          className="font-bold text-lg"
        />
      </h3>
      <div className="text-sm text-gray-700 min-h-[40px]">
        <InlineEditor
          content={module.content || '点击此处编辑内容...'}
          onUpdate={(html) => updateModule(module.id, { content: html })}
          className="text-sm text-gray-700"
        />
      </div>
    </div>
  );
}