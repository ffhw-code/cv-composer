// ModuleStyle4.tsx
import { useEffect, useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';

export default function ModuleStyle4({ module }: StyleComponentProps) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const editableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editableRef.current) {
      editableRef.current.innerHTML = module.content || '点击此处编辑内容...';
    }
  }, [module.id, module.content]);

  return (
    <div className="py-1">
      <h3
        className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => updateModule(module.id, { title: e.currentTarget.innerText })}
      >
        {module.title}
      </h3>
      <div
        ref={editableRef}
        className="text-sm text-gray-700 min-h-[30px]"
        contentEditable
        suppressContentEditableWarning
        onBlur={() => updateModule(module.id, { content: editableRef.current?.innerHTML })}
      />
    </div>
  );
}