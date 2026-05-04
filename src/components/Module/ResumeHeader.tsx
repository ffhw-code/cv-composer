import { useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';

function ResumeHeader({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        updateModule(module.id, { photo: dataUrl });
      }
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />

      <div className="flex gap-4">
        <div
          onClick={handlePhotoClick}
          className="w-24 h-32 bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 rounded cursor-pointer hover:border-blue-400 overflow-hidden"
        >
          {module.photo ? (
            <img src={module.photo} alt="照片" className="w-full h-full object-cover" />
          ) : (
            '照片'
          )}
        </div>

        {/* 信息区域保持不变 */}
        <div className="flex-1 space-y-2 text-sm">
          <div
            className="font-bold text-lg"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => updateModule(module.id, { name: e.currentTarget.innerText })}
          >
            {module.name}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <span contentEditable suppressContentEditableWarning onBlur={(e) => updateModule(module.id, { jobTitle: e.currentTarget.innerText })}>
              {module.jobTitle}
            </span>
            <span contentEditable suppressContentEditableWarning onBlur={(e) => updateModule(module.id, { birth: e.currentTarget.innerText })}>
              {module.birth}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <span contentEditable suppressContentEditableWarning onBlur={(e) => updateModule(module.id, { phone: e.currentTarget.innerText })}>
              {module.phone}
            </span>
            <span contentEditable suppressContentEditableWarning onBlur={(e) => updateModule(module.id, { email: e.currentTarget.innerText })}>
              {module.email}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResumeHeader;