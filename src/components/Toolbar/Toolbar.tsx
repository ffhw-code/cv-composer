import { useState } from 'react';

function Toolbar() {
  const [activeTool, setActiveTool] = useState<'edit' | 'insert'>('edit');

  // 键帽风格按钮样式（小尺寸版）
  const keycapStyle =
    'px-3 py-1.5 text-sm font-medium text-gray-700 ' +
    'bg-gradient-to-b from-white to-gray-100 ' +
    'border border-gray-300 ' +
    'rounded-lg ' +
    'shadow-[inset_0_1px_0_#fff,0_2px_0_#d1d5db,0_3px_6px_rgba(0,0,0,0.1)] ' +
    'active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] ' +
    'active:translate-y-[2px] ' +
    'transition-all duration-75';

  // 激活状态下的键帽样式（按下效果）
  const keycapActiveStyle =
    'px-3 py-1.5 text-sm font-medium text-gray-700 ' +
    'bg-gradient-to-b from-blue-50 to-blue-100 ' +
    'border border-blue-300 ' +
    'rounded-lg ' +
    'shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] ' +
    'translate-y-[2px] ' +
    'transition-all duration-75';

  return (
    <div className="w-full bg-white flex items-center h-10 px-4 gap-2">
      {/* 左侧按钮组 */}
      <div className="flex items-center gap-2">
        {/* 保存按钮 */}
        <button className={keycapStyle}>
          保存
        </button>

        {/* 插入按钮 */}
        <button
          onClick={() => setActiveTool('insert')}
          className={activeTool === 'insert' ? keycapActiveStyle : keycapStyle}
        >
          插入
        </button>

        {/* 编辑按钮 */}
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
            <button className="px-2 py-1 text-xs hover:bg-gray-100 rounded">加粗</button>
            <button className="px-2 py-1 text-xs hover:bg-gray-100 rounded">斜体</button>
            <button className="px-2 py-1 text-xs hover:bg-gray-100 rounded">字号</button>
            <button className="px-2 py-1 text-xs hover:bg-gray-100 rounded">颜色</button>
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