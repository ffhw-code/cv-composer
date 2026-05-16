// src/components/AI/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useResumeStore, type ResumeModule } from '../../store/useResumeStore';
import ApiKeyModal from '../Settings/ApiKeyModal';
import { parseResumeFile } from '../../utils/resumeParser';
import { executeCommands } from '../../engine/commandExecutor';
import { buildSystemPrompt, aiTools } from '../../engine/aiPrompt';
import { retrieveRules } from '../../engine/ruleBase';

interface ChatPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

function getAiConfig() {
  const stored = localStorage.getItem('resume_ai_config');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// 画布状态摘要
function getCanvasState(): string {
  const modules = useResumeStore.getState().modules;
  const summary = modules.map(m => ({
    id: m.id,
    type: m.type,
    styleId: m.styleId,
    name: m.name || m.title || '',
    content: m.content?.substring(0, 100) || '',
    children: m.children?.map(c => ({ id: c.id, type: c.type, styleId: c.styleId })) || [],
  }));
  return JSON.stringify(summary, null, 2);
}

function ChatPanel({ collapsed, onToggle }: ChatPanelProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const importModules = useResumeStore((s) => s.importModules);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [maxTextareaHeight, setMaxTextareaHeight] = useState(200);

  // 输入框自适应高度
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

  useEffect(() => {
    autoResize();
  }, [input, autoResize, maxTextareaHeight]);

  // 尝试从文本中提取指令并执行，返回是否成功执行
  const tryExecuteCommandsFromText = (text: string): boolean => {
  // 从文本中提取所有可能的 JSON 数组
  const results: string[] = [];

  // 1. 提取 Markdown 代码块中的 JSON 数组
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    results.push(match[1].trim());
  }

  // 2. 提取文本中直接出现的 JSON 数组（以 [ 开头，] 结尾）
  const bareArrayRegex = /\[\s*\{[\s\S]*?\}\s*\]/g;
  while ((match = bareArrayRegex.exec(text)) !== null) {
    results.push(match[0]);
  }

  let executedAny = false;
  for (const candidate of results) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        const currentModules = useResumeStore.getState().modules;
        const result = executeCommands(currentModules, parsed);
        useResumeStore.getState().importModules(result.newModules);
        if (result.errors.length > 0) {
          setMessages((prev) => [...prev, { role: 'ai', text: `部分指令执行出错: ${result.errors.join('; ')}` }]);
        } else {
          setMessages((prev) => [...prev, { role: 'ai', text: '指令已执行。' }]);
        }
        executedAny = true;
      }
    } catch {}
  }
  return executedAny;
};

  // 递归调用 AI，支持工具调用循环
  const callAiWithMessages = async (msgs: any[]): Promise<string> => {
    const config = getAiConfig();
    if (!config || !config.apiKey) return '请先配置 API 服务。';

    const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const model = config.model || 'qwen-plus';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: msgs,
        tools: aiTools,
        tool_choice: 'auto',
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API 请求失败: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;

    // 没有工具调用，直接返回文本内容
    if (!msg?.tool_calls) {
      return msg?.content || '';
    }

    // 处理工具调用
    const toolResults: any[] = [];
    for (const toolCall of msg.tool_calls) {
      if (toolCall.function.name === 'get_canvas_state') {
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: getCanvasState(),
        });
      } else if (toolCall.function.name === 'execute_commands') {
        const args = JSON.parse(toolCall.function.arguments);
        const commands = args.commands;
        const currentModules = useResumeStore.getState().modules;
        const result = executeCommands(currentModules, commands);
        useResumeStore.getState().importModules(result.newModules);
        const feedback = result.errors.length > 0
          ? `部分指令执行出错: ${result.errors.join('; ')}`
          : '指令已成功执行。';
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: feedback,
        });
      }
    }

    // 将助手消息和工具结果附加到消息列表，继续对话
    const newMsgs = [
      ...msgs,
      msg,
      ...toolResults,
    ];

    // 递归调用，直到不再有工具调用
    return callAiWithMessages(newMsgs);
  };

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || waiting) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setWaiting(true);

    const config = getAiConfig();
    if (!config || !config.apiKey) {
      setMessages((prev) => [...prev, { role: 'ai', text: '请先在 API 设置中配置 AI 服务。' }]);
      setWaiting(false);
      return;
    }

    const systemMsg = {
      role: 'system',
      content: buildSystemPrompt() + '\n\n## 当前上下文可用规则\n' + retrieveRules(userMsg).join('\n')
    };
    const historyMsgs = messages.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
    const currentMsg = { role: 'user', content: userMsg };

    try {
      const aiReply = await callAiWithMessages([systemMsg, ...historyMsgs, currentMsg]);

      // 尝试从 AI 回复文本中提取指令并执行
      const executed = tryExecuteCommandsFromText(aiReply);
      if (!executed) {
        setMessages((prev) => [...prev, { role: 'ai', text: aiReply || '未收到有效回复。' }]);
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'ai', text: `出错了: ${err.message}` }]);
    } finally {
      setWaiting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseResumeFile(file);
      const modules: ResumeModule[] = [];

      if (parsed.name || parsed.jobTitle || parsed.phone || parsed.email) {
        const headerChildren: ResumeModule[] = [
          {
            id: crypto.randomUUID(),
            type: 'image' as const,
            styleId: 'image-default',
            style: { width: '100px', height: '130px', borderRadius: '8px', objectFit: 'cover' },
            content: parsed.photo || '',
            children: [],
          } as ResumeModule,
          {
            id: crypto.randomUUID(),
            type: 'flex' as const,
            styleId: 'flex-default',
            style: { flexDirection: 'column', gap: '12px', flex: '1' },
            children: [
              {
                id: crypto.randomUUID(),
                type: 'text' as const,
                styleId: 'text-default',
                style: { fontSize: '24px', fontWeight: '700', color: '#1a202c' },
                content: parsed.name || '姓名',
                name: parsed.name,
                children: [],
              } as ResumeModule,
              {
                id: crypto.randomUUID(),
                type: 'grid' as const,
                styleId: 'grid-default',
                style: { gridTemplateColumns: '1fr 1fr', gap: '12px' },
                children: [
                  {
                    id: crypto.randomUUID(),
                    type: 'text' as const,
                    styleId: 'text-default',
                    style: { fontSize: '15px', color: '#4a5568' },
                    content: parsed.jobTitle || '求职意向',
                    jobTitle: parsed.jobTitle,
                    children: [],
                  } as ResumeModule,
                  {
                    id: crypto.randomUUID(),
                    type: 'text' as const,
                    styleId: 'text-default',
                    style: { fontSize: '15px', color: '#4a5568' },
                    content: parsed.birth || '出生年月',
                    birth: parsed.birth,
                    children: [],
                  } as ResumeModule,
                  {
                    id: crypto.randomUUID(),
                    type: 'text' as const,
                    styleId: 'text-default',
                    style: { fontSize: '15px', color: '#4a5568' },
                    content: parsed.phone || '电话',
                    phone: parsed.phone,
                    children: [],
                  } as ResumeModule,
                  {
                    id: crypto.randomUUID(),
                    type: 'text' as const,
                    styleId: 'text-default',
                    style: { fontSize: '15px', color: '#4a5568' },
                    content: parsed.email || '邮箱',
                    email: parsed.email,
                    children: [],
                  } as ResumeModule,
                ],
              } as ResumeModule,
            ],
          } as ResumeModule,
        ];

        modules.push({
          id: crypto.randomUUID(),
          type: 'header',
          styleId: 'header-classic',
          style: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: '20px',
            padding: '24px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e8ecf1',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          },
          children: headerChildren,
        } as ResumeModule);
      }

      if (parsed.modules) {
        for (const mod of parsed.modules) {
          modules.push({
            id: crypto.randomUUID(),
            type: 'module',
            styleId: 'module-card',
            style: {},
            title: mod.title,
            content: mod.content,
            children: [],
          } as ResumeModule);
        }
      }

      importModules(modules);
      setMessages((prev) => [...prev, { role: 'ai', text: '简历已导入，请在画布上编辑。' }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'ai', text: `解析失败: ${err.message}` }]);
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      ref={panelRef}
      className={`bg-gray-100 border border-gray-300 rounded-lg shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] flex flex-col transition-all duration-300 ${
        collapsed ? 'w-[36px]' : 'w-[295px]'
      }`}
    >
      <div className="p-1 flex justify-end flex-shrink-0">
        <button
          onClick={onToggle}
          className="text-gray-500 hover:text-gray-700 text-sm w-5 h-5 flex items-center justify-center"
          title={collapsed ? '展开 AI 助手' : '折叠 AI 助手'}
        >
          {collapsed ? '◀' : '▶'}
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col flex-1 overflow-hidden px-2 pb-2">
          <p className="text-xs text-gray-400 mb-2 flex-shrink-0">AI 助手</p>

          <div className="flex-1 overflow-y-auto text-xs text-gray-600 space-y-2 mb-2">
            {messages.length === 0 && (
              <div className="bg-white rounded p-2">
                上传简历文件或输入指令，我可以帮你生成或修改简历。
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`rounded p-2 ${msg.role === 'user' ? 'bg-blue-50' : 'bg-white'}`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.png,.jpg,.jpeg,.docx,.txt"
            style={{ display: 'none' }}
          />

          <div className="flex-shrink-0 mb-1">
            <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
              <button
                onClick={() => setApiModalVisible(true)}
                className="flex-shrink-0 h-8 px-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                API 设置
              </button>
              <button
                onClick={handleImportClick}
                disabled={parsing}
                className="flex-shrink-0 h-8 px-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                {parsing ? '解析中…' : '导入简历'}
              </button>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入指令..."
            rows={1}
            style={{
              maxHeight: `${maxTextareaHeight}px`,
              resize: 'none',
            }}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-200 overflow-y-auto"
          />
        </div>
      )}

      {apiModalVisible && (
        <ApiKeyModal visible={apiModalVisible} onClose={() => setApiModalVisible(false)} />
      )}
    </div>
  );
}

export default ChatPanel;