// src/components/AI/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useResumeStore, type ResumeModule } from '../../store/useResumeStore';
import ApiKeyModal from '../Settings/ApiKeyModal';
import { executeCommands } from '../../engine/commandExecutor';
import { executeSkill } from '../../engine/skillExecutor';
import { buildSystemPrompt, aiTools } from '../../engine/aiPrompt';
import { retrieveRules } from '../../engine/ruleBase';
import { getApiConfig, setUploadedFile, getUploadedFile } from '../../utils/aiConfig';

interface ChatPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

const MAX_TOOL_ROUNDS = 8;
const AI_REQUEST_TIMEOUT_MS = 120_000;
const UNSUPPORTED_FILE_MSG = 'PDF/Word 文件暂不支持，请先将简历转为 PNG 或 JPG 图片后上传。';


function isSupportedUploadFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  if (file.type === 'text/plain') return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'txt' || ['png', 'jpg', 'jpeg'].includes(ext ?? '');
}

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
  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [maxTextareaHeight, setMaxTextareaHeight] = useState(200);

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

  // 从文本中提取 JSON 数组并执行（支持括号计数 + JSON5 修复，并过滤太短的指令）
const tryExecuteCommandsFromText = async (text: string): Promise<boolean> => {
  if (!text) return false;

  const extractJsonArrays = (str: string): string[] => {
    const results: string[] = [];
    let i = 0;
    while (i < str.length) {
      if (str[i] === '[') {
        let depth = 0, inString = false, escape = false;
        let j = i;
        while (j < str.length) {
          const ch = str[j];
          if (escape) { escape = false; j++; continue; }
          if (ch === '\\') { escape = true; j++; continue; }
          if (ch === '"') { inString = !inString; j++; continue; }
          if (!inString) {
            if (ch === '[') depth++;
            if (ch === ']') depth--;
            if (depth === 0) { results.push(str.substring(i, j + 1)); i = j + 1; break; }
          }
          j++;
        }
        if (depth !== 0) i++;
      } else i++;
    }
    return results;
  };

  const fixJson = (jsonStr: string): string => {
    let fixed = jsonStr.replace(/,\s*([}\]])/g, '$1');
    fixed = fixed.replace(/("\s*\n\s*")/g, '",\n"');
    fixed = fixed.replace(/(}\s*\n\s*{)/g, '},\n{');
    fixed = fixed.replace(/(]\s*\n\s*{)/g, '],\n{');
    fixed = fixed.replace(/(}\s*\n\s*")/g, '},\n"');
    fixed = fixed.replace(/("\s*\n\s*{)/g, '",\n{');
    return fixed;
  };

  const candidates = extractJsonArrays(text);
  let executedAny = false;
  for (const candidate of candidates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try { parsed = JSON.parse(candidate); } catch {
      try { parsed = JSON.parse(fixJson(candidate)); } catch { /* ignore parse errors */ }
    }
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) continue;

    // 分离 execute_skill 命令（交给 skillExecutor）和普通命令（交给 commandExecutor）
    // 兼容 AI 用 action 或 name 字段表达 execute_skill
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
const skillCmds = parsed.filter((c: any) => c.action === 'execute_skill' || c.name === 'execute_skill');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalCmds = parsed.filter((c: any) => c.action !== 'execute_skill' && c.name !== 'execute_skill');

    // 执行普通指令
    if (normalCmds.length > 0) {
      const currentModules = useResumeStore.getState().modules;
      const result = executeCommands(currentModules, normalCmds);
      useResumeStore.getState().importModules(result.newModules);
      if (result.errors.length > 0) {
        setMessages(prev => [...prev, { role: 'ai', text: `部分指令执行出错: ${result.errors.join('; ')}` }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: '指令已执行。' }]);
      }
    }

    // 执行技能指令
    for (const sc of skillCmds) {
      try {
        // AI 可能把 skill name 放在 sc.name 或 sc.params.name 或 sc.params.skill
        let skillName = sc.name || sc.params?.name || sc.params?.skill;
        // 防御：AI 把 action 名和 skill 名混淆时，从参数推断真实技能
        if (!skillName || skillName === 'execute_skill') {
          if (sc.params?.template || sc.template) skillName = 'generate-resume';
          else if (sc.params?.info) skillName = 'smart-fill';
          else if (sc.params?.moduleId) skillName = 'polish-text';
        }
        // AI 可能把 template 放在 sc.params.template 或直接放在 sc.template
        const skillParams = sc.params?.params || (sc.params?.template || sc.template) ? { template: sc.params?.template || sc.template } : {};
        const skillResult = await executeSkill(skillName, skillParams, buildSkillContext());
        setToast(`技能 [${sc.params?.name}] 完成`);
        setTimeout(() => setToast(null), 2000);
        setMessages(prev => [...prev, { role: 'ai', text: skillResult }]);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages(prev => [...prev, { role: 'ai', text: `技能执行失败: ${errMsg}` }]);
      }
    }

    executedAny = true;
  }
  return executedAny;
};

  // 统一的 smart-fill 调用函数（自适应视觉模型格式）
  // 替换原来的 callSmartFill 函数
const callSmartFill = async (sysPrompt: string, userPrompt: string): Promise<string> => {
  const config = getApiConfig();
  if (!config || !config.apiKey) throw new Error('API 未配置');
  const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const model = config.model || 'qwen-plus';
  const messages = [
    {
      role: 'user' as const,
      content: `${sysPrompt}\n\n${userPrompt}`, // 纯文本永远用字符串
    },
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.1 }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`smart-fill API 请求失败: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('smart-fill 未返回有效内容');
  return content;
};

  const buildSkillContext = () => ({
    get modules() { return useResumeStore.getState().modules; },
    importModules: (mods: ResumeModule[]) => useResumeStore.getState().importModules(mods),
    getCanvasState,
    callAiForPolish: async (text: string) => {
      const polishMsgs = [
        { role: 'system', content: '请优化以下文本，保持原意但使表达更专业、简洁。直接返回优化后文本，不要解释。' },
        { role: 'user', content: text },
      ];
      return await callAiWithMessages(polishMsgs);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callAiForEvaluate: async (state: any) => {
      const evalMsgs = [
        { role: 'system', content: '请根据以下简历状态评估质量，给出优点、改进建议。' },
        { role: 'user', content: JSON.stringify(state) },
      ];
      return await callAiWithMessages(evalMsgs);
    },
    callAiForSmartFill: callSmartFill,
  });

  const replaceImportStatusMessage = (text: string) => {
    setMessages(prev => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'ai' && next[i].text === '正在解析简历…') {
          next[i] = { role: 'ai', text };
          return next;
        }
      }
      return [...prev, { role: 'ai', text }];
    });
  };

  const runAutoImport = async (fileName: string, fileType: string) => {
    const userMsg = `[上传文件] 文件名: ${fileName}, 类型: ${fileType}, 请导入此简历`;
    setMessages(prev => [
      ...prev,
      { role: 'user', text: userMsg },
      { role: 'ai', text: '正在解析简历…' },
    ]);

    const config = getApiConfig();
    if (!config || !config.apiKey) {
      replaceImportStatusMessage('请先配置 API 服务后再导入简历。');
      return;
    }

    try {
      const result = await executeSkill('import-resume', {}, buildSkillContext());
      replaceImportStatusMessage(result);
    } catch (err: unknown) {
      const importErrMsg = err instanceof Error ? err.message : String(err);
      replaceImportStatusMessage(`导入失败：${importErrMsg}`);
    }
  };

    // 带工具调用循环和重试的 AI 请求

/** 将 API 错误转为用户可读的中文提示 */
function translateApiError(status: number, body: string, model: string): string {
  // 尝试从响应体中提取有用信息
  let detail = '';
  try {
    const parsed = JSON.parse(body);
    detail = parsed.error?.message || parsed.error?.code || parsed.message || '';
  } catch { /* ignore parse errors */ }

  const lowerDetail = detail.toLowerCase();

  switch (status) {
    case 400:
      if (lowerDetail.includes('model') || lowerDetail.includes('not found') || lowerDetail.includes('does not exist')) {
        return `模型 "${model}" 不存在或不可用，请检查 API 设置中的模型名称是否正确。`;
      }
      if (lowerDetail.includes('invalid')) {
        return `请求参数有误：${detail || '请检查 API 设置'}。`;
      }
      return `请求格式错误${detail ? '：' + detail : '，请检查 API 设置中的模型名称和 Base URL。'}`;
    case 401:
      return 'API Key 无效，请在 API 设置中重新填写。';
    case 403:
      return 'API Key 没有访问权限，请检查该 Key 是否已开通所需模型的调用权限。';
    case 404:
      return `接口地址不存在（404），模型名或 Base URL 可能填错了，请检查 API 设置。`;
    case 429:
      return '请求过于频繁，请稍后重试。';
    case 500:
    case 502:
    case 503:
      return 'AI 服务暂时不可用，请稍后重试。';
    default:
      return `AI 服务返回错误 (${status})${detail ? '：' + detail : '，请稍后重试。'}`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callAiWithMessages = async (msgs: any[], retryCount = 0, toolRoundCount = 0): Promise<string> => {
  const config = getApiConfig();
  if (!config || !config.apiKey) return '请先配置 API 服务。';

  if (toolRoundCount >= MAX_TOOL_ROUNDS) {
    return '工具调用次数已达上限，请简化请求后重试。';
  }

  const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const model = config.model || 'qwen-plus';

  // 检查消息中是否包含上传文件指令，强制调用工具
  const isUpload = msgs.some(m => m.content?.includes('[上传文件]'));

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
      // eslint-disable-next-line preserve-caught-error
      throw new Error('请求超时，请稍后重试。');
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
    return msg?.content || '';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
console.log('[AI] 收到工具调用:', msg.tool_calls.map((tc: any) => tc.function.name));
  // 百炼 API 严格要求：当 assistant 返回 tool_calls 时，content 必须为 null
  msg.content = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolResults: any[] = [];
  let hasError = false;

  for (const toolCall of msg.tool_calls) {
    const fnName = toolCall.function.name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let args: any = {};
    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch {
      console.error(`[Tool Call] 解析参数失败: ${toolCall.function.arguments}`);
    }

    let resultContent = '';
    try {
      if (fnName === 'get_canvas_state') {
        resultContent = getCanvasState();
      } else if (fnName === 'execute_commands') {
        const commands = args.commands;
        const currentModules = useResumeStore.getState().modules;
        const result = executeCommands(currentModules, commands);
        useResumeStore.getState().importModules(result.newModules);

        if (result.errors.length > 0) {
          hasError = true;
          resultContent = `指令执行失败: ${result.errors.join('; ')}。请修正后重试。`;
        } else {
          resultContent = '指令已成功执行。';
        }
      } else if (fnName === 'execute_skill') {
        const skillResult = await executeSkill(args.name, args.params || {}, buildSkillContext());
        setToast(`技能 [${args.name}] 完成`);
        setTimeout(() => setToast(null), 2000);
        resultContent = skillResult;
      } else if (fnName === 'get_uploaded_file') {
        const fileData = getUploadedFile();
        if (fileData) {
          // 只返回元信息，不返回 base64，防止 context 爆炸，让技能自己去全局取
          const meta = { 
            fileName: fileData.fileName, 
            fileType: fileData.fileType, 
            hasBase64: true,
            message: "文件已就绪。请直接调用 execute_skill 技能 (name: 'import-resume') 来处理此文件，无需在此处传递 base64。"
          };
          resultContent = JSON.stringify(meta);
        } else {
          resultContent = '没有待处理的文件';
        }
      }
    } catch (err) {
      hasError = true;
      resultContent = `工具调用失败: ${(err as Error).message}`;
    }

    // 百炼 API 的 tool 消息必须包含 name 字段（即函数名）
    toolResults.push({ 
      role: 'tool', 
      tool_call_id: toolCall.id, 
      name: fnName, 
      content: resultContent 
    });
  }

  // 在 tool 消息后强制追加 user 消息，防止消息链以 tool 结尾
  const trailingUserMsg = { 
    role: 'user', 
    content: hasError ? '请修正错误并重试。' : '工具已执行完毕，请根据结果继续回复用户。' 
  };

  if (hasError && retryCount < 2) {
    const newMsgs = [...msgs, msg, ...toolResults, trailingUserMsg];
    return callAiWithMessages(newMsgs, retryCount + 1, toolRoundCount + 1);
  }

  // 重试次数已尽，返回最终错误（不再递归）
  if (hasError) {
    const finalContent = toolResults.map(t => t.content).join('\n') || '多次尝试后工具调用仍失败，请简化指令或稍后重试。';
    return finalContent;
  }

  const newMsgs = [...msgs, msg, ...toolResults, trailingUserMsg];
  return callAiWithMessages(newMsgs, retryCount, toolRoundCount + 1);
};



  const handleSend = async (overrideMessage?: string) => {
    const userMsg = (overrideMessage ?? input).trim();
    if (!userMsg || waiting) return;
    if (!overrideMessage) setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setWaiting(true);

    const config = getApiConfig();
    if (!config || !config.apiKey) {
      setMessages(prev => [...prev, { role: 'ai', text: '请先在 API 设置中配置 AI 服务。' }]);
      setWaiting(false);
      return;
    }

    const systemContent = buildSystemPrompt() + '\n\n## 当前可用规则参考\n' + retrieveRules(userMsg).join('\n');
    const systemMsg = { role: 'system', content: systemContent };
    const historyMsgs = messages.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    const currentMsg = { role: 'user', content: userMsg };

    try {
      console.log('[ChatPanel] 发送消息:', userMsg);
      const aiReply = await callAiWithMessages([systemMsg, ...historyMsgs, currentMsg]);
      console.log('[ChatPanel] AI 原始回复:', JSON.stringify(aiReply).slice(0, 500));

      // 防御：AI 幻觉输出 [上传文件] 格式时，静默重试
      if (!aiReply || aiReply.startsWith('[上传文件]')) {
        console.warn('[ChatPanel] AI 幻觉上传格式，静默重试…');
        const retryReply = await callAiWithMessages([
          ...([systemMsg, ...historyMsgs, currentMsg]),
          { role: 'assistant', content: aiReply },
          { role: 'user', content: '请直接调用 execute_skill(name: "generate-resume") 或 execute_commands 完成请求。不要输出 "[上传文件]" 格式。' },
        ]);
        const executed2 = await tryExecuteCommandsFromText(retryReply);
        if (!executed2) {
          setMessages(prev => [...prev, { role: 'ai', text: retryReply || '抱歉，请重新描述您的需求。' }]);
        }
      } else {
        const executed = await tryExecuteCommandsFromText(aiReply);
        console.log('[ChatPanel] 内联指令执行:', executed ? '是' : '否');
        if (!executed) {
          setMessages(prev => [...prev, { role: 'ai', text: aiReply || '未收到有效回复。' }]);
        }
      }
    } catch (err: unknown) {
      const chatErrMsg = err instanceof Error ? err.message : String(err);
      console.error('[ChatPanel] 请求失败:', chatErrMsg);
      setMessages(prev => [...prev, { role: 'ai', text: `出错了: ${chatErrMsg}` }]);
    } finally {
      setWaiting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!isSupportedUploadFile(file)) {
    setMessages(prev => [...prev, { role: 'ai', text: UNSUPPORTED_FILE_MSG }]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    return;
  }

  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    setMessages(prev => [...prev, { role: 'ai', text: '文件过大，请压缩到 5MB 以内或转为图片后上传。' }]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    return;
  }

  setParsing(true);
  try {
    let base64: string;
    if (file.type.startsWith('image/')) {
      base64 = await compressImage(file);
    } else {
      const reader = new FileReader();
      base64 = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    // ★ 清理 base64：去除所有空白，确保长度为4的倍数
    base64 = base64.replace(/\s/g, '');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    setUploadedFile({ base64, fileName: file.name, fileType: file.type });
    await runAutoImport(file.name, file.type);
  } catch (err: unknown) {
    const fileErrMsg = err instanceof Error ? err.message : String(err);
    setMessages(prev => [...prev, { role: 'ai', text: `文件读取失败: ${fileErrMsg}` }]);
  } finally {
    setParsing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
};

  // 辅助：canvas 压缩图片
  function compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const maxWidth = 1600;
        const maxHeight = 1600;
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('图片加载失败'));
      };
      img.src = objectUrl;
    });
  }


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
            {messages.length === 0 && (
              <div className="bg-white rounded p-2">上传简历文件或输入指令，我可以帮你生成或修改简历。</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`rounded p-2 ${msg.role === 'user' ? 'bg-blue-50' : 'bg-white'}`}>{msg.text}</div>
            ))}
          </div>

          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".png,.jpg,.jpeg,.txt,image/*,text/plain" style={{ display: 'none' }} />

          <div className="flex-shrink-0 mb-1">
            <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
              <button onClick={() => setApiModalVisible(true)} className="flex-shrink-0 h-8 px-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50">API 设置</button>
              <button onClick={handleImportClick} disabled={parsing} className="flex-shrink-0 h-8 px-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50">{parsing ? '解析中…' : '导入简历'}</button>
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