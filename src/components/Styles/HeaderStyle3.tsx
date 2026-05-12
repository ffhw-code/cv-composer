import { useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';
import InlineEditor from './InlineEditor';

export default function HeaderStyle3({ module }: StyleComponentProps) {
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
    <div style={{ ...module.style }} className="bg-gray-50 border border-gray-200 rounded-lg p-5 flex items-center gap-6 shadow-sm">
      <div className="flex-1">
        <div className="text-2xl font-bold text-gray-800">
          <InlineEditor
            content={module.name || '姓名'}
            onUpdate={(html) => updateModule(module.id, { name: html })}
            className="text-2xl font-bold text-gray-800"
          />
        </div>
        <div className="text-sm text-blue-600 mt-1">
          <InlineEditor
            content={module.jobTitle || '职位'}
            onUpdate={(html) => updateModule(module.id, { jobTitle: html })}
            className="text-sm text-blue-600"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-500">
          <InlineEditor
            content={module.birth || '出生年月'}
            onUpdate={(html) => updateModule(module.id, { birth: html })}
          />
          <InlineEditor
            content={module.phone || '电话'}
            onUpdate={(html) => updateModule(module.id, { phone: html })}
          />
          <div className="col-span-2">
            <InlineEditor
              content={module.email || '邮箱'}
              onUpdate={(html) => updateModule(module.id, { email: html })}
            />
          </div>
        </div>
      </div>
      <div
        onClick={handlePhotoClick}
        className="w-20 h-20 rounded-full bg-gray-200 border-2 border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 cursor-pointer hover:border-blue-400 overflow-hidden"
      >
        {module.photo ? <img src={module.photo} alt="照片" className="w-full h-full object-cover" /> : '照片'}
      </div>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} />
    </div>
  );
}