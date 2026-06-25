import { useState, useCallback, useEffect } from 'react';
import { ActiveEditorProvider } from './hooks/useActiveEditor';
import { EditModeProvider } from './hooks/useEditMode';
import Toolbar from './components/Toolbar/Toolbar';
import ModulePanel from './components/Module/ModulePanel';
import CanvasArea from './components/Canvas/CanvasArea';
import StylePanel from './components/Toolbar/StylePanel';
import ChatPanel from './components/AI/ChatPanel';
import { initStyles } from './styleInit';

initStyles();

function App() {
  const [selectedControl, setSelectedControl] = useState<string | null>(null);
  const [rightWidth, setRightWidth] = useState(256);
  const [deleteMode, setDeleteMode] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [isEditing, setIsEditing] = useState(true);

  const handleResize = useCallback((newWidth: number) => {
    setRightWidth(Math.max(200, Math.min(400, newWidth)));
  }, []);

  const enterDeleteMode = () => setDeleteMode(true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditing) {
        setIsEditing(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditing]);
  const exitDeleteMode = () => setDeleteMode(false);

  const chatWidth = chatCollapsed ? 36 : 295; // 折叠36，展开295

  const totalWidth = chatWidth + 75 + 842 + rightWidth; // 75 是新的 ModulePanel 宽度

  return (
    <EditModeProvider value={isEditing}>
    <ActiveEditorProvider>
      <div className="h-screen flex flex-col bg-white overflow-hidden">
        <div className="bg-white border-b border-gray-200 flex justify-center">
          <div style={{ width: `${totalWidth}px` }}>
            <Toolbar isEditing={isEditing} onToggleEdit={() => setIsEditing((v) => !v)} />
          </div>
        </div>

        <div className="flex-1 flex justify-center overflow-hidden">
          <div className="flex h-full" style={{ width: `${totalWidth}px` }}>
            <ChatPanel
              collapsed={chatCollapsed}
              onToggle={() => setChatCollapsed(!chatCollapsed)}
            />
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
    </ActiveEditorProvider>
    </EditModeProvider>
  );
}

export default App;