import { useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';
import InlineEditor from './InlineEditor';
import ResizablePhoto from './ResizablePhoto';

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

  const photoWidth = module.style?.photoWidth;
  const photoHeight = module.style?.photoHeight;

  const defaultContainerClass = 'w-24 h-32';
  const containerStyle: React.CSSProperties = {};
  if (photoWidth && photoWidth !== 'auto') containerStyle.width = photoWidth;
  if (photoHeight && photoHeight !== 'auto') containerStyle.height = photoHeight;

  return (
    <div style={{ ...module.style }} className="flex items-center gap-6 p-4 bg-gradient-to-r from-blue-50 to-white rounded">
      <div className="flex-1 space-y-3">
        <div className="text-2xl font-bold text-gray-800">
          <InlineEditor
            content={module.name || '姓名'}
            onUpdate={(html) => updateModule(module.id, { name: html })}
            className="text-2xl font-bold text-gray-800"
          />
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
          <InlineEditor content={module.jobTitle || '职位'} onUpdate={(html) => updateModule(module.id, { jobTitle: html })} />
          <InlineEditor content={module.birth || '出生年月'} onUpdate={(html) => updateModule(module.id, { birth: html })} />
          <InlineEditor content={module.phone || '电话'} onUpdate={(html) => updateModule(module.id, { phone: html })} />
          <InlineEditor content={module.email || '邮箱'} onUpdate={(html) => updateModule(module.id, { email: html })} />
        </div>
      </div>
      <div
        onClick={handlePhotoClick}
        className={`bg-gray-100 border border-dashed border-gray-300 rounded-full flex items-center justify-center text-xs text-gray-400 cursor-pointer hover:border-blue-400 overflow-hidden ${!photoWidth && !photoHeight ? defaultContainerClass : ''}`}
        style={containerStyle}
      >
        {module.photo ? (
          <ResizablePhoto
            src={module.photo}
            width={photoWidth || 'auto'}
            height={photoHeight || 'auto'}
            moduleId={module.id}
            className="rounded-full"
          />
        ) : (
          '照片'
        )}
      </div>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} />
    </div>
  );
}