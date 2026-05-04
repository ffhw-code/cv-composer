import { useState } from 'react';

function Toolbar() {
  const [activeTool, setActiveTool] = useState<'edit' | 'insert'>('edit');

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

  // 通用的富文本操作命令，防止焦点丢失
  const execCmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  // 处理字号变化
  const handleFontSize = (e: React.ChangeEvent<HTMLSelectElement>) => {
    execCmd('fontSize', e.target.value);
  };

  // 处理颜色变化
  const handleColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    execCmd('foreColor', e.target.value);
  };

  return (
    <div className="w-full bg-white flex items-center h-10 px-4 gap-2">
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

      {/* 右侧操作容器（根据激活工具显示不同操作） */}
      <div className="flex-1 h-full flex items-center bg-gray-50 border-l border-gray-200 px-3 gap-2">
        {activeTool === 'edit' && (
          <>
            {/* 加粗 */}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('bold');
              }}
              className="px-2 py-1 text-xs font-bold hover:bg-gray-200 rounded"
            >
              B
            </button>
            {/* 斜体 */}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('italic');
              }}
              className="px-2 py-1 text-xs italic hover:bg-gray-200 rounded"
            >
              I
            </button>
            {/* 下划线 */}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('underline');
              }}
              className="px-2 py-1 text-xs underline hover:bg-gray-200 rounded"
            >
              U
            </button>

            {/* 字号下拉 */}
            <select
              onChange={handleFontSize}
              className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white"
              defaultValue=""
            >
              <option value="" disabled>字号</option>
              <option value="1">极小</option>
              <option value="2">小</option>
              <option value="3">正常</option>
              <option value="4">大</option>
              <option value="5">特大</option>
              <option value="6">极大</option>
              <option value="7">巨大</option>
            </select>

            {/* 颜色选择器 */}
            <input
              type="color"
              onChange={handleColor}
              className="w-6 h-6 border border-gray-300 rounded cursor-pointer"
              title="文字颜色"
            />
          </>
        )}

        {activeTool === 'insert' && (
          <>
            <button className="px-2 py-1 text-xs hover:bg-gray-100 rounded">图片</button>
            <button className="px-2 py-1 text-xs hover:bg-gray-100 rounded">超链接</button>
          </>
        )}
      </div>
    </div>
  );
}

export default Toolbar;