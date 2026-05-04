import { useState } from 'react';
import Toolbar from './components/Toolbar/Toolbar';
import ModulePanel from './components/Module/ModulePanel';
import CanvasArea from './components/Canvas/CanvasArea';
import StylePanel from './components/Toolbar/StylePanel';

function App() {
  // 当前选中的控件类型：'header' | 'module' | null
  const [selectedControl, setSelectedControl] = useState<string | null>(null);

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="bg-white border-b border-gray-200 flex justify-center">
        <div style={{ width: '1184px' }}>
          <Toolbar />
        </div>
      </div>

      {/* 主体区域 */}
      <div className="flex-1 flex justify-center overflow-hidden">
        <div className="flex h-full" style={{ width: '1184px' }}>
          <ModulePanel
            selectedControl={selectedControl}
            onSelectControl={setSelectedControl}
          />
          <CanvasArea />
          <StylePanel selectedType={selectedControl} />
        </div>
      </div>
    </div>
  );
}

export default App;