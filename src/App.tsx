function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      {/* A4 简历画布 */}
      <div className="w-[794px] min-h-[1123px] bg-white shadow-lg p-10 flex flex-col gap-6">
        {/* 控件1：教育经历 */}
        <div className="border border-gray-200 rounded p-4" contentEditable suppressContentEditableWarning>
          <h2 className="text-lg font-bold mb-2">教育经历</h2>
          <p>2020 - 2024 某某大学 计算机科学与技术 本科</p>
        </div>

        {/* 控件2：工作经历 */}
        <div className="border border-gray-200 rounded p-4" contentEditable suppressContentEditableWarning>
          <h2 className="text-lg font-bold mb-2">工作经历</h2>
          <p>2024 - 至今 某公司 前端开发实习</p>
        </div>
      </div>
    </div>
  );
}

export default App;