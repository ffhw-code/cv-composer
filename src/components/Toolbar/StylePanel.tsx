interface StylePanelProps {
  selectedType: string | null;
}

function StylePanel({ selectedType }: StylePanelProps) {
  return (
    <div className="w-48 bg-gray-100 border border-gray-300 rounded-lg shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] p-3 h-full flex flex-col">
      <p className="text-xs text-gray-400 mb-2">样式区</p>

      {/* 初始为空，有类型时显示对应缩略图 */}
      {!selectedType && (
        <p className="text-xs text-gray-300 mt-4 text-center">
          请先选择控件类型
        </p>
      )}

      {selectedType === 'header' && (
        <div className="flex flex-col gap-2">
          <div className="w-full h-20 bg-white border border-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
            简历头样式1
          </div>
          <div className="w-full h-20 bg-white border border-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
            简历头样式2
          </div>
          <div className="w-full h-20 bg-white border border-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
            简历头样式3
          </div>
        </div>
      )}

      {selectedType === 'module' && (
        <div className="flex flex-col gap-2">
          <div className="w-full h-20 bg-white border border-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
            模块样式1
          </div>
          <div className="w-full h-20 bg-white border border-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
            模块样式2
          </div>
          <div className="w-full h-20 bg-white border border-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
            模块样式3
          </div>
        </div>
      )}
    </div>
  );
}

export default StylePanel;