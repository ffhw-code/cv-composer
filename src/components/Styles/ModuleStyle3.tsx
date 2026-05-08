// src/components/Styles/ModuleStyle3.tsx
import { useEffect, useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';

export default function ModuleStyle3({ module }: StyleComponentProps) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const editableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editableRef.current) {
      editableRef.current.innerHTML = module.content || '点击此处编辑内容...';
    }
  }, [module.id, module.content]);

  const handleBlur = () => {
    if (editableRef.current) {
      updateModule(module.id, { content: editableRef.current.innerHTML });
    }
  };

  return (
    <div className="border-l-4 border-emerald-400 pl-4 py-2">
      <h3
        className="font-bold text-lg text-gray-800 mb-2"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => updateModule(module.id, { title: e.currentTarget.innerText })}
      >
        {module.title}
      </h3>
      <div
        ref={editableRef}
        className="text-sm text-gray-600 min-h-[40px] leading-relaxed"
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBlur}
      />
    </div>
  );
}