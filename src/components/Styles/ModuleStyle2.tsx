import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';
import InlineEditor from './InlineEditor';

export default function ModuleStyle2({ module }: StyleComponentProps) {
  const updateModule = useResumeStore((s) => s.updateModule);

  return (
    <div style={{ ...module.style }} className="flex gap-3 py-2">
      <div className="w-1 bg-blue-400 rounded-full self-stretch" />
      <div className="flex-1">
        <h3 className="font-semibold text-base text-gray-800 mb-1">
          <InlineEditor
            content={module.title || '标题'}
            onUpdate={(html) => updateModule(module.id, { title: html })}
            className="font-semibold text-base text-gray-800"
          />
        </h3>
        <div className="text-sm text-gray-600 min-h-[30px]">
          <InlineEditor
            content={module.content || '点击此处编辑内容...'}
            onUpdate={(html) => updateModule(module.id, { content: html })}
            className="text-sm text-gray-600"
          />
        </div>
      </div>
    </div>
  );
}