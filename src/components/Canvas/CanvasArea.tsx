import { useState } from 'react';

function CanvasArea() {
  const [scale, setScale] = useState(1); // 缩放比例，1 = 100%

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.1, 2));  // 最大 200%
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.1, 0.5)); // 最小 50%
  const zoomReset = () => setScale(1);

  return (
    <div className="flex-1 relative bg-gray-100 h-full">
      {/* 画布滚动区域 */}
      <div className="h-full overflow-y-auto p-6 flex justify-center">
        {/* A4 画布，应用缩放 */}
        <div
          className="bg-white shadow-lg p-10 flex flex-col gap-6 origin-top"
          style={{
            width: '794px',
            minHeight: '1123px',
            transform: `scale(${scale})`,
            marginBottom: scale > 1 ? `${(scale - 1) * 1123}px` : '0',
          }}
        >
          <p className="text-gray-300 text-center mt-20">在此处添加简历模块</p>
        </div>
      </div>

      {/* 缩放控件 - 右下角浮动 */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white border border-gray-200 rounded shadow-md px-2 py-1">
        <button
          onClick={zoomOut}
          className="w-5 h-5 flex items-center justify-center text-xs border border-gray-300 rounded hover:bg-gray-100"
        >
          −
        </button>
        <span className="text-xs text-gray-600 w-10 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="w-5 h-5 flex items-center justify-center text-xs border border-gray-300 rounded hover:bg-gray-100"
        >
          +
        </button>
        <button
          onClick={zoomReset}
          className="ml-1 px-1.5 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100"
        >
          重置
        </button>
      </div>
    </div>
  );
}

export default CanvasArea;