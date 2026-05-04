import { useEffect, useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';

function EditableModule({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const editableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editableRef.current) {
      editableRef.current.innerHTML = module.content || '点击此处编辑内容...';
    }
  }, [module.id]);

  const handleBlur = () => {
    if (editableRef.current) {
      const html = editableRef.current.innerHTML;
      updateModule(module.id, { content: html });
    }
  };

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <h3
        className="font-bold text-lg mb-2"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) =>
          updateModule(module.id, { title: e.currentTarget.innerText })
        }
      >
        {module.title}
      </h3>
      <div
        ref={editableRef}
        className="text-sm text-gray-700 min-h-[40px]"
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBlur}
      />
    </div>
  );
}

export default EditableModule;