// src/components/AI/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../types/resume';
import ApiKeyModal from '../Settings/ApiKeyModal';
import { buildSystemPrompt, aiTools, toolHandlerMap } from '../../engine/aiPrompt';
import { getFixedConstraints } from '../../engine/ruleBase';
import { executeSkill } from '../../engine/skillExecutor';
import { exportLayoutTree, getCanvasStateSummary } from '../../utils/moduleUtils';
import { getApiConfig, getUploadedFile, getProviderQuirks } from '../../utils/aiConfig';
import { repairTruncatedJson } from '../../utils/jsonRepair';
import { translateApiError, callAiForPolish, callAiForEvaluate, callSmartFill } from './aiApi';
import { useFileImport } from './useFileImport';

interface ChatPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

const MAX_TOOL_ROUNDS = 8;
const AI_REQUEST_TIMEOUT_MS = 120_000;

interface Suggestion {
  title: string;
  description: string;
  tool: string;
  params: Record<string, unknown>;
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  suggestions?: Suggestion[];
}

function ChatPanel({ collapsed, onToggle }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [maxTextareaHeight, setMaxTextareaHeight] = useState(200);

  const { parsing, fileInputRef, handleImportClick, handleFileChange } = useFileImport(setMessages);

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

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, maxTextareaHeight) + 'px';
  }, [maxTextareaHeight]);

  useEffect(() => { autoResize(); }, [input, autoResize, maxTextareaHeight]);

  // ==================== AI 工具调用循环 ====================

  const callAiWithMessages = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    msgs: any[],
    retryCount = 0,
    toolRoundCount = 0,
    createdIds?: Set<string>,
  ): Promise<string> => {
    const config = getApiConfig();
    if (!config || !config.apiKey) return '请先配置 API 服务。';

    if (toolRoundCount >= MAX_TOOL_ROUNDS) {
      return '工具调用次数已达上限，请简化请求后重试。';
    }

    if (msgs.length > 0 && msgs[0].role === 'system') {
      const freshCanvas = getCanvasStateSummary(useResumeStore.getState().modules);
      const freshRules = getFixedConstraints();
      msgs[0] = {
        role: 'system',
        content: buildSystemPrompt() + '\n\n## 必须遵守的规则\n' + freshRules + '\n\n## 当前画布\n' + freshCanvas,
      };
    }

    const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const model = config.model || 'qwen-plus';

    const isUpload = msgs.some((m: { content?: string }) => m.content?.includes('[上传文件]'));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: msgs,
          tools: aiTools,
          tool_choice: isUpload ? 'required' : 'auto',
          temperature: 0.1,
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('请求超时，请稍后重试。', { cause: err });
      }
      console.error('[AI Request] 网络错误:', err);
      throw new Error('无法连接到 AI 服务，请检查网络连接或 Base URL 是否正确。', { cause: err });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('[AI Request] API 报错详情:', response.status, errText);
      throw new Error(translateApiError(response.status, errText, model));
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;

    if (!msg?.tool_calls) {
      console.log('[AI] 纯文本回复 (无工具调用)');

      if (toolRoundCount === 0 && retryCount === 0) {
        const content = msg?.content || '';
        if (/"tool"\s*:\s*"add_/.test(content) || /"action"\s*:\s*"addModule"/.test(content)) {
          throw new Error('该模型不支持 Function Calling，请更换为 qwen-max、qwen-plus-latest 或 gpt-4o。可在 API 设置中修改模型名称。');
        }
      }

      return msg?.content || '';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log('[AI] 收到工具调用:', msg.tool_calls.map((tc: any) => tc.function.name));

    const quirks = getProviderQuirks(config.provider);
    if (quirks.nullContentOnToolCalls) {
      delete msg.content;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: any[] = [];
    let hasError = false;
    const createdIds_ = createdIds || new Set<string>();

    for (const toolCall of msg.tool_calls) {
      const fnName = toolCall.function.name;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let args: any = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        const raw = toolCall.function.arguments || '{}';
        const repaired = repairTruncatedJson(raw);
        try {
          args = JSON.parse(repaired);
          console.warn('[Tool Call] JSON 已修复，原参数不完整:', raw.slice(0, 100));
        } catch {
          console.error(`[Tool Call] 参数 JSON 不合法且无法修复: ${raw.slice(0, 200)}`);
        }
      }

      let resultContent: string;
      try {
        if (fnName === 'execute_skill') {
          const skillResult = await executeSkill(args.name, args.params || {}, {
            get modules() { return useResumeStore.getState().modules; },
            importModules: (mods: ResumeModule[]) => useResumeStore.getState().importModules(mods),
            getCanvasState: () => getCanvasStateSummary(useResumeStore.getState().modules),
            callAiForPolish: async (text: string) => callAiForPolish(text),
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            callAiForEvaluate: async (prompt: string, _state: unknown) => callAiForEvaluate(prompt),
            callAiForSmartFill: async (sysPrompt: string, userPrompt: string) => callSmartFill(sysPrompt, userPrompt),
          });
          setToast(`技能 [${args.name}] 完成`);
          setTimeout(() => setToast(null), 2000);
          resultContent = skillResult;
        } else if (fnName === 'get_uploaded_file') {
          const fileData = getUploadedFile();
          if (fileData) {
            resultContent = JSON.stringify({
              fileName: fileData.fileName,
              fileType: fileData.fileType,
              hasBase64: true,
              message: "文件已就绪。请直接调用 execute_skill 技能 (name: 'import-resume') 来处理此文件，无需在此处传递 base64。",
            });
          } else {
            resultContent = '没有待处理的文件';
          }
        } else {
          if ((fnName === 'set_style' || fnName === 'set_content') && createdIds_.has(args.id)) {
            hasError = true;
            resultContent = JSON.stringify({
              error: 'REDUNDANT_STYLE',
              message: `${fnName}: 模块 ${args.id} 刚刚创建，内容和样式已在创建时传入，无需再次修改。`,
              fix: `请删除此 ${fnName} 调用。add_text/add_heading/add_list 等创建工具已支持一次性传入 content 和 style。`,
            });
            toolResults.push({ role: 'tool', tool_call_id: toolCall.id, name: fnName, content: resultContent });
            continue;
          }

          const handler = toolHandlerMap[fnName];
          if (handler) {
            const currentModules = useResumeStore.getState().modules;
            const toolResult = await handler(args, currentModules);
            if (toolResult.success) {
              const summary = toolResult.summary;
              if (summary && fnName.startsWith('add_')) {
                try {
                  const parsed = JSON.parse(summary);
                  if (parsed.id) createdIds_.add(parsed.id);
                } catch { /* summary 非 JSON 格式时忽略 */ }
              }
              if (fnName === 'set_style' || fnName === 'set_content') {
                if (args.id) createdIds_.add(args.id);
              }
              useResumeStore.getState().importModules(toolResult.newModules);
              resultContent = toolResult.summary || '操作已成功执行。';
            } else {
              hasError = true;
              setToolStatus(`${fnName} ✗`);
              resultContent = JSON.stringify({
                error: toolResult.code,
                message: toolResult.message,
                fix: toolResult.fix,
              });
            }
          } else {
            hasError = true;
            resultContent = `未知工具: ${fnName}`;
          }
        }
      } catch (err) {
        hasError = true;
        resultContent = `工具调用失败: ${(err as Error).message}`;
      }

      toolResults.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: fnName,
        content: resultContent,
      });
    }

    const trailingUserMsg = {
      role: 'user',
      content: hasError ? '请修正错误并重试。' : '工具已执行完毕，请根据结果继续回复用户。',
    };

    if (hasError && retryCount < 2) {
      const newMsgs = [...msgs, msg, ...toolResults, trailingUserMsg];
      return callAiWithMessages(newMsgs, retryCount + 1, toolRoundCount + 1, createdIds_);
    }

    if (hasError) {
      const errorCount = toolResults.filter(t => {
        try { const p = JSON.parse(t.content); return p.error; } catch { return false; }
      }).length;
      const successCount = toolResults.length - errorCount;
      const parts: string[] = [];
      if (successCount > 0) parts.push(`${successCount} 个操作已成功执行`);
      if (errorCount > 0) parts.push(`${errorCount} 个操作失败`);
      return parts.join('，') + '。请简化指令后重试。';
    }

    const newMsgs = [...msgs, msg, ...toolResults, trailingUserMsg];
    return callAiWithMessages(newMsgs, retryCount, toolRoundCount + 1, createdIds_);
  };

  // ==================== 用户交互处理 ====================

  const handleSend = async (overrideMessage?: string) => {
    const userMsg = (overrideMessage ?? input).trim();
    if (!userMsg || waiting) return;
    if (!overrideMessage) setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setWaiting(true);
    setToolStatus(null);

    const config = getApiConfig();
    if (!config || !config.apiKey) {
      setMessages(prev => [...prev, { role: 'ai', text: '请先在 API 设置中配置 AI 服务。' }]);
      setWaiting(false);
      return;
    }

    const canvasSummary = getCanvasStateSummary(useResumeStore.getState().modules);
    const rules = getFixedConstraints();
    const systemContent = buildSystemPrompt() + '\n\n## 必须遵守的规则\n' + rules + '\n\n## 当前画布\n' + canvasSummary;
    const systemMsg = { role: 'system', content: systemContent };
    const historyMsgs = messages.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    const currentMsg = { role: 'user', content: userMsg };

    try {
      console.log('[ChatPanel] 发送消息:', userMsg);
      const aiReply = await callAiWithMessages([systemMsg, ...historyMsgs, currentMsg]);
      console.log('[ChatPanel] AI 回复:', JSON.stringify(aiReply).slice(0, 500));

      if (!aiReply) {
        setMessages(prev => [...prev, { role: 'ai', text: '未收到有效回复，请重试。' }]);
      } else {
        let suggestions: Suggestion[] | undefined;
        let displayText = aiReply;
        try {
          let jsonStr = aiReply.trim();
          const startIdx = jsonStr.indexOf('{');
          const endIdx = jsonStr.lastIndexOf('}');
          if (startIdx !== -1 && endIdx > startIdx) {
            jsonStr = jsonStr.substring(startIdx, endIdx + 1);
          }
          jsonStr = jsonStr.replace(/```json\s*|\s*```/g, '').trim();
          jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
          const parsed = JSON.parse(jsonStr);
          if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
            suggestions = parsed.suggestions;
            displayText = parsed.summary || '评估完成，点击下方建议可直接应用：';
          }
        } catch { /* 非结构化回复，按纯文本显示 */ }
        setMessages(prev => [...prev, { role: 'ai', text: displayText, suggestions }]);
      }
    } catch (err: unknown) {
      const chatErrMsg = err instanceof Error ? err.message : String(err);
      console.error('[ChatPanel] 请求失败:', chatErrMsg);
      setMessages(prev => [...prev, { role: 'ai', text: `出错了: ${chatErrMsg}` }]);
    } finally {
      setWaiting(false);
      setToolStatus(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleExportLayout = () => {
    const modules = useResumeStore.getState().modules;
    const tree = exportLayoutTree(modules);
    console.log("=== 画布布局树 ===");
    console.log(JSON.stringify(tree, null, 2));
    navigator.clipboard.writeText(JSON.stringify(tree, null, 2)).catch(() => {});
    setMessages(prev => [...prev, { role: "ai", text: "布局树已导出到控制台并复制到剪贴板" }]);
  };

  // ==================== UI 渲染 ====================

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
                        onClick={async () => {
                          try {
                            const handler = toolHandlerMap[s.tool];
                            if (!handler) { alert(`未知工具: ${s.tool}`); return; }
                            const currentModules = useResumeStore.getState().modules;
                            const result = await handler(s.params as Record<string, unknown>, currentModules);
                            if (result.success) {
                              useResumeStore.getState().importModules(result.newModules);
                              setMessages(prev => [...prev, { role: 'ai', text: `已应用建议：${s.title}` }]);
                            } else {
                              setMessages(prev => [...prev, { role: 'ai', text: `应用失败：${result.message}` }]);
                            }
                          } catch (err: unknown) {
                            const errMsg = err instanceof Error ? err.message : String(err);
                            setMessages(prev => [...prev, { role: 'ai', text: `应用建议出错：${errMsg}` }]);
                          }
                        }}
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
