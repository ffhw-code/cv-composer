import { useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';

export default function HeaderStyle2({ module }: StyleComponentProps) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('图片不能超过5MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateModule(module.id, { photo: ev.target?.result as string });
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-6 p-4 bg-gradient-to-r from-blue-50 to-white rounded">
      <div className="flex-1 space-y-3">
        <div
          className="text-2xl font-bold text-gray-800"
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => updateModule(module.id, { name: e.currentTarget.innerText })}
        >
          {module.name}
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
          <span contentEditable suppressContentEditableWarning onBlur={(e) => updateModule(module.id, { jobTitle: e.currentTarget.innerText })}>{module.jobTitle}</span>
          <span contentEditable suppressContentEditableWarning onBlur={(e) => updateModule(module.id, { birth: e.currentTarget.innerText })}>{module.birth}</span>
          <span contentEditable suppressContentEditableWarning onBlur={(e) => updateModule(module.id, { phone: e.currentTarget.innerText })}>{module.phone}</span>
          <span contentEditable suppressContentEditableWarning onBlur={(e) => updateModule(module.id, { email: e.currentTarget.innerText })}>{module.email}</span>
        </div>
      </div>
      <div
        onClick={handlePhotoClick}
        className="w-24 h-32 bg-gray-100 border border-dashed border-gray-300 rounded-full flex items-center justify-center text-xs text-gray-400 cursor-pointer hover:border-blue-400 overflow-hidden"
      >
        {module.photo ? <img src={module.photo} alt="照片" className="w-full h-full object-cover rounded-full" /> : '照片'}
      </div>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} />
    </div>
  );
}