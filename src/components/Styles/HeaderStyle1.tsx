import { useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { StyleComponentProps } from '../../store/styleRegistry';
import InlineEditor from './InlineEditor';
import ResizablePhoto from './ResizablePhoto';

export default function HeaderStyle1({ module }: StyleComponentProps) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateModule(module.id, { photo: dataUrl });
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const photoWidth = module.style?.photoWidth;
  const photoHeight = module.style?.photoHeight;

  // 容器默认尺寸（当未设置自定义尺寸时使用）
  const defaultContainerClass = 'w-24 h-32';
  const containerStyle: React.CSSProperties = {};
  if (photoWidth && photoWidth !== 'auto') containerStyle.width = photoWidth;
  if (photoHeight && photoHeight !== 'auto') containerStyle.height = photoHeight;

  return (
    <div style={{ ...module.style }} className="border border-gray-200 rounded p-4 bg-white">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} />
      <div className="flex gap-4">
        <div
          onClick={handlePhotoClick}
          className={`bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 rounded cursor-pointer hover:border-blue-400 overflow-hidden ${!photoWidth && !photoHeight ? defaultContainerClass : ''}`}
          style={containerStyle}
        >
          {module.photo ? (
            <ResizablePhoto
              src={module.photo}
              width={photoWidth || 'auto'}
              height={photoHeight || 'auto'}
              moduleId={module.id}
              className="rounded"
            />
          ) : (
            '照片'
          )}
        </div>
        <div className="flex-1 space-y-2 text-sm">
          <div className="font-bold text-lg">
            <InlineEditor
              content={module.name || '姓名'}
              onUpdate={(html) => updateModule(module.id, { name: html })}
              className="font-bold text-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <InlineEditor
              content={module.jobTitle || '职位'}
              onUpdate={(html) => updateModule(module.id, { jobTitle: html })}
            />
            <InlineEditor
              content={module.birth || '出生年月'}
              onUpdate={(html) => updateModule(module.id, { birth: html })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <InlineEditor
              content={module.phone || '电话'}
              onUpdate={(html) => updateModule(module.id, { phone: html })}
            />
            <InlineEditor
              content={module.email || '邮箱'}
              onUpdate={(html) => updateModule(module.id, { email: html })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}