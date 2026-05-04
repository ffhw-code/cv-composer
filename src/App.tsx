import { useState, useCallback } from 'react';
import Toolbar from './components/Toolbar/Toolbar';
import ModulePanel from './components/Module/ModulePanel';
import CanvasArea from './components/Canvas/CanvasArea';
import StylePanel from './components/Toolbar/StylePanel';

function App() {
  const [selectedControl, setSelectedControl] = useState<string | null>(null);
  const [rightWidth, setRightWidth] = useState(256);
  const [deleteMode, setDeleteMode] = useState(false);

  const handleResize = useCallback((newWidth: number) => {
    setRightWidth(Math.max(200, Math.min(400, newWidth)));
  }, []);

  const enterDeleteMode = () => {
    setDeleteMode(true);
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
  };

  const totalWidth = 150 + 842 + rightWidth;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <div className="bg-white border-b border-gray-200 flex justify-center">
        <div style={{ width: `${totalWidth}px` }}>
          <Toolbar />
        </div>
      </div>

      <div className="flex-1 flex justify-center overflow-hidden">
        <div className="flex h-full" style={{ width: `${totalWidth}px` }}>
          <ModulePanel
            selectedControl={selectedControl}
            onSelectControl={setSelectedControl}
            deleteMode={deleteMode}
            onEnterDeleteMode={enterDeleteMode}
          />
          <CanvasArea
            deleteMode={deleteMode}
            onExitDeleteMode={exitDeleteMode}
          />
          <StylePanel
            selectedType={selectedControl}
            width={rightWidth}
            onResize={handleResize}
          />
        </div>
      </div>
    </div>
  );
}

export default App;