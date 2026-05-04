import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';

function EditableModule({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);

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
        className="text-sm text-gray-700 min-h-[40px]"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) =>
          updateModule(module.id, { content: e.currentTarget.innerText })
        }
      >
        {module.content}
      </div>
    </div>
  );
}

export default EditableModule;