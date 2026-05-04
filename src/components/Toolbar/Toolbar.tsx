import { useState, useRef } from 'react';

function Toolbar() {
  const [activeTool, setActiveTool] = useState<'edit' | 'insert'>('edit');
  const [color, setColor] = useState('#000000');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const keycapStyle =
    'px-3 py-1.5 text-sm font-medium text-gray-700 ' +
    'bg-gradient-to-b from-white to-gray-100 ' +
    'border border-gray-300 ' +
    'rounded-lg ' +
    'shadow-[inset_0_1px_0_#fff,0_2px_0_#d1d5db,0_3px_6px_rgba(0,0,0,0.1)] ' +
    'active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] ' +
    'active:translate-y-[2px] ' +
    'transition-all duration-75';

  const keycapActiveStyle =
    'px-3 py-1.5 text-sm font-medium text-gray-700 ' +
    'bg-gradient-to-b from-blue-50 to-blue-100 ' +
    'border border-blue-300 ' +
    'rounded-lg ' +
    'shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] ' +
    'translate-y-[2px] ' +
    'transition-all duration-75';

  const execCmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  const fontSizeMap = [
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '4', value: '4' },
    { label: '5', value: '5' },
    { label: '6', value: '6' },
    { label: '7', value: '7' },
  ];

  const ensureEditableFocus = (): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      alert('请先在模块内容中点击定位光标');
      return false;
    }
    const node = sel?.anchorNode;
    if (!node) return false;
    let parent: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
    while (parent) {
      if (parent.getAttribute?.('contenteditable') === 'true' || parent.isContentEditable) {
        return true;
      }
      parent = parent.parentElement;
    }
    alert('请先点击模块内容区域定位光标');
    return false;
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        execCmd('insertHTML', `<img src="${dataUrl}" style="max-width:100%; height:auto; display:block;" />`);
      }
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const insertImage = () => {
    if (!ensureEditableFocus()) return;
    fileInputRef.current?.click();
  };

  const insertLink = () => {
    if (!ensureEditableFocus()) return;
    const url = window.prompt('请输入链接地址（例如 https://...）：');
    if (!url) return;
    const sel = window.getSelection();
    const selectedText = sel?.toString() || '';
    if (selectedText) {
      execCmd('createLink', url);
    } else {
      const text = window.prompt('请输入链接显示文字：', '链接文字');
      if (text) {
        execCmd('insertHTML', `<a href="${url}" target="_blank">${text}</a>`);
      }
    }
  };

  return (
    <div className="w-full bg-white flex items-center h-10 px-4 gap-2">
      {/* 隐藏的文件输入：用于本地图片选择 */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {/* 左侧按钮组 */}
      <div className="flex items-center gap-2">
        <button className={keycapStyle}>保存</button>
        <button
          onClick={() => setActiveTool('insert')}
          className={activeTool === 'insert' ? keycapActiveStyle : keycapStyle}
        >
          插入
        </button>
        <button
          onClick={() => setActiveTool('edit')}
          className={activeTool === 'edit' ? keycapActiveStyle : keycapStyle}
        >
          编辑
        </button>
      </div>

      {/* 右侧操作容器 */}
      <div className="flex-1 h-full flex items-center bg-gray-50 border-l border-gray-200 px-3 gap-2">
        {activeTool === 'edit' && (
          <>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('bold');
              }}
              className="px-2 py-1 text-xs font-bold hover:bg-gray-200 rounded"
            >
              B
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('italic');
              }}
              className="px-2 py-1 text-xs italic hover:bg-gray-200 rounded"
            >
              I
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('underline');
              }}
              className="px-2 py-1 text-xs underline hover:bg-gray-200 rounded"
            >
              U
            </button>

            <span className="text-gray-300 text-xs">|</span>

            {fontSizeMap.map((fs) => (
              <button
                key={fs.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  execCmd('fontSize', fs.value);
                }}
                className="px-1.5 py-0.5 text-xs hover:bg-gray-200 rounded border border-transparent hover:border-gray-300"
                title={`字号${fs.label}`}
              >
                {fs.label}
              </button>
            ))}

            <span className="text-gray-300 text-xs">|</span>

            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6 border border-gray-300 rounded cursor-pointer"
              title="选择颜色"
            />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('foreColor', color);
              }}
              className="px-2 py-1 text-xs hover:bg-gray-200 rounded border border-gray-300"
              title="应用颜色"
            >
              应用
            </button>
          </>
        )}

        {activeTool === 'insert' && (
          <>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                insertImage();
              }}
              className="px-2 py-1 text-xs hover:bg-gray-100 rounded"
            >
              图片
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                insertLink();
              }}
              className="px-2 py-1 text-xs hover:bg-gray-100 rounded"
            >
              超链接
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default Toolbar;