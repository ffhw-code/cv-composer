import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';

function ResumeHeader({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <div className="flex gap-4">
        {/* 左侧照片区域 */}
        <div className="w-24 h-32 bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 rounded">
          照片
        </div>

        {/* 右侧信息区 */}
        <div className="flex-1 space-y-2 text-sm">
          {/* 姓名行 */}
          <div
            className="font-bold text-lg"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) =>
              updateModule(module.id, {
                name: e.currentTarget.innerText,
              })
            }
          >
            {module.name}
          </div>

          {/* 求职意向 | 出生年月 */}
          <div className="grid grid-cols-2 gap-4">
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                updateModule(module.id, {
                  jobTitle: e.currentTarget.innerText,
                })
              }
            >
              {module.jobTitle}
            </span>
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                updateModule(module.id, {
                  birth: e.currentTarget.innerText,
                })
              }
            >
              {module.birth}
            </span>
          </div>

          {/* 电话 | 邮箱 */}
          <div className="grid grid-cols-2 gap-4">
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                updateModule(module.id, {
                  phone: e.currentTarget.innerText,
                })
              }
            >
              {module.phone}
            </span>
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                updateModule(module.id, {
                  email: e.currentTarget.innerText,
                })
              }
            >
              {module.email}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResumeHeader;