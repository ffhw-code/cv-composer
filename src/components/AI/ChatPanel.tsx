import { useCallback, useEffect, useRef, useState } from 'react';
import ApiKeyModal from '../Settings/ApiKeyModal';
import { useAiChat } from './useAiChat';

interface ChatPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

function ChatPanel({ collapsed, onToggle }: ChatPanelProps) {
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [maxTextareaHeight, setMaxTextareaHeight] = useState(200);

  const {
    messages,
    input,
    setInput,
    waiting,
    toolStatus,
    toast,
    handleKeyDown,
    handleExportLayout,
    applySuggestion,
    parsing,
    fileInputRef,
    handleImportClick,
    handleFileChange,
  } = useAiChat();

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, maxTextareaHeight) + 'px';
  }, [maxTextareaHeight]);

  useEffect(() => { autoResize(); }, [input, autoResize, maxTextareaHeight]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMaxTextareaHeight(Math.floor(entry.contentRect.height / 6));
      }
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={panelRef}
      className={`bg-gray-100 border border-gray-300 rounded-lg shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] flex flex-col transition-all duration-300 ${
        collapsed ? 'w-[36px]' : 'w-[295px]'
      }`}
    >
      <div className="p-1 flex justify-end flex-shrink-0">
        <button onClick={onToggle} className="text-gray-500 hover:text-gray-700 text-sm w-5 h-5 flex items-center justify-center" title={collapsed ? '展开 AI 助手' : '折叠 AI 助手'}>
          {collapsed ? '◀' : '▶'}
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col flex-1 overflow-hidden px-2 pb-2">
          <p className="text-xs text-gray-400 mb-2 flex-shrink-0">AI 助手</p>

          <div className="flex-1 overflow-y-auto text-xs text-gray-600 space-y-2 mb-2">
            {waiting && (
              <div className="flex items-center gap-2 bg-blue-50 rounded p-2 text-blue-600">
                <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                <span>{toolStatus || 'AI 思考中…'}</span>
              </div>
            )}
            {messages.length === 0 && (
              <div className="bg-white rounded p-2">上传简历文件或输入指令，我可以帮你生成或修改简历。</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`rounded p-2 ${msg.role === 'user' ? 'bg-blue-50' : 'bg-white'}`}>
                <div>{msg.text}</div>
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {msg.suggestions.map((s, si) => (
                      <button
                        key={si}
                        onClick={() => applySuggestion(s)}
                        className="block w-full text-left px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      >
                        <span className="font-medium">{s.title}</span>
                        <span className="text-gray-400 ml-2">{s.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".png,.jpg,.jpeg,.txt,image/*,text/plain" style={{ display: 'none' }} />

          <div className="flex-shrink-0 mb-1">
            <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
              <button onClick={() => setApiModalVisible(true)} className="flex-shrink-0 h-8 px-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50">API 设置</button>
              <button onClick={handleImportClick} disabled={parsing} className="flex-shrink-0 h-8 px-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50">{parsing ? '解析中…' : '导入简历'}</button>
              <button onClick={handleExportLayout} className="flex-shrink-0 h-8 px-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50">导出布局树</button>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入指令..."
            rows={1}
            style={{ maxHeight: `${maxTextareaHeight}px`, resize: 'none' }}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-200 overflow-y-auto"
          />
        </div>
      )}

      {apiModalVisible && <ApiKeyModal visible={apiModalVisible} onClose={() => setApiModalVisible(false)} />}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-4 py-2 rounded-lg z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}

export default ChatPanel;
