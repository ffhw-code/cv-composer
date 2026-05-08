import { useEffect, useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';

export default function ModuleStyle2({ module }: StyleComponentProps) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const editableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editableRef.current) {
      editableRef.current.innerHTML = module.content || '点击此处编辑内容...';
    }
  }, [module.id, module.content]);

  return (
    <div className="flex gap-3 py-2">
      <div className="w-1 bg-blue-400 rounded-full self-stretch" />
      <div className="flex-1">
        <h3
          className="font-semibold text-base text-gray-800 mb-1"
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => updateModule(module.id, { title: e.currentTarget.innerText })}
        >
          {module.title}
        </h3>
        <div
          ref={editableRef}
          className="text-sm text-gray-600 min-h-[30px]"
          contentEditable
          suppressContentEditableWarning
          onBlur={() => updateModule(module.id, { content: editableRef.current?.innerHTML })}
        />
      </div>
    </div>
  );
}