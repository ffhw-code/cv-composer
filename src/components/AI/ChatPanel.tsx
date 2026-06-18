// src/components/AI/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useResumeStore, type ResumeModule } from '../../store/useResumeStore';
import ApiKeyModal from '../Settings/ApiKeyModal';
import { buildSystemPrompt, aiTools } from '../../engine/aiPrompt';
import { getFixedConstraints } from '../../engine/ruleBase';
import { toolHandlerMap } from '../../engine/toolHandlers';
import { executeSkill } from '../../engine/skillExecutor';
import { exportLayoutTree } from '../../utils/moduleUtils';
import { getApiConfig, setUploadedFile, getUploadedFile, getProviderQuirks } from '../../utils/aiConfig';

interface ChatPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

const MAX_TOOL_ROUNDS = 4;
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

const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    callAiForEvaluate: async (prompt: string, _state: unknown) => {
      const config = getApiConfig();
      if (!config?.apiKey) throw new Error('API 未配置');
      const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      const model = config.model || 'qwen-plus';
      const messages = [{ role: 'user' as const, content: prompt }];
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.1 }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`评估 API 请求失败: ${response.status} ${errText}`);
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('评估未返回有效内容');
      return content;
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
      replaceImportStatusMessage(`导入失败：${importErrMsg}\n\n<details><summary>诊断信息</summary>请检查：1. 视觉模型是否支持图片解析 2. API 是否有限流 3. 图片是否清晰可读</details>`);
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

const getCanvasStateSummary = (): string => {
  const modules = useResumeStore.getState().modules;
  if (modules.length === 0) return '（画布为空）';

  const MAX_TOKENS = 3000;

  const lines: string[] = [];
  let estimatedTokens = 0;

  const estimateTokens = (text: string): number => Math.ceil(text.length / 1.3);

  const formatNode = (node: ResumeModule, depth: number, isLast: boolean): string => {
    const indent = '  '.repeat(depth);
    const prefix = isLast ? '└─ ' : '├─ ';
    const contentSnippet = node.content
      ? node.content.replace(/<[^>]+>/g, '').substring(0, 100)
      : '';
    const line = `${indent}${prefix}${node.id} (${node.type}${node.styleId ? ', ' + node.styleId : ''})${contentSnippet ? ': ' + JSON.stringify(contentSnippet) : ''}`;
    const tokenEst = estimateTokens(line);
    if (estimatedTokens + tokenEst > MAX_TOKENS) {
      return '__TRUNCATED__';
    }
    estimatedTokens += tokenEst;
    return line;
  };

  const totalModules = countAll(modules);

  const walk = (nodes: ResumeModule[], depth: number): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      const isLast = i === nodes.length - 1;
      const line = formatNode(nodes[i], depth, isLast);
      if (line === '__TRUNCATED__') {
        lines.push(`  `.repeat(depth) + `... (共 ${totalModules} 个模块，已截断)`);
        return true;
      }
      lines.push(line);
      if (nodes[i].children && nodes[i].children.length > 0) {
        const wasTruncated = walk(nodes[i].children, depth + 1);
        if (wasTruncated) return true;
      }
    }
    return false;
  };

  walk(modules, 0);
  return lines.join('\n');
};

function countAll(nodes: ResumeModule[]): number {
  let count = nodes.length;
  for (const n of nodes) {
    if (n.children) count += countAll(n.children);
  }
  return count;
}




/** 修复模型截断的 JSON：补全缺失的括号和引号 */
function repairTruncatedJson(raw: string): string {
  let s = raw.trim();
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === "\"") { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braceCount++;
    if (ch === "}") braceCount--;
    if (ch === "[") bracketCount++;
    if (ch === "]") bracketCount--;
  }
  if (inString) s += "\"";
  while (bracketCount > 0) { s += "]"; bracketCount--; }
  while (braceCount > 0) { s += "}"; braceCount--; }
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callAiWithMessages = async (msgs: any[], retryCount = 0, toolRoundCount = 0, createdIds?: Set<string>): Promise<string> => {
  const config = getApiConfig();
  if (!config || !config.apiKey) return '请先配置 API 服务。';

  if (toolRoundCount >= MAX_TOOL_ROUNDS) {
    return '工具调用次数已达上限，请简化请求后重试。';
  }

  // 每次 API 调用前刷新画布状态，确保 AI 看到最新的模块 ID
  if (msgs.length > 0 && msgs[0].role === 'system') {
    const freshCanvas = getCanvasStateSummary();
    const freshRules = getFixedConstraints();
    msgs[0] = {
      role: 'system',
      content: buildSystemPrompt() + '\n\n## 必须遵守的规则\n' + freshRules + '\n\n## 当前画布\n' + freshCanvas,
    };
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

    // 模型在首轮对话中将 tool 输出为 JSON 文本而非走 tool_calls 通道 → 不支持 function calling
    if (toolRoundCount === 0 && retryCount === 0) {
      const content = msg?.content || '';
      if (/"tool"\s*:\s*"add_/.test(content) || /"action"\s*:\s*"addModule/.test(content)) {
        throw new Error('该模型不支持 Function Calling，请更换为 qwen-max、qwen-plus-latest 或 gpt-4o。可在 API 设置中修改模型名称。');
      }
    }

    return msg?.content || '';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
console.log('[AI] 收到工具调用:', msg.tool_calls.map((tc: any) => tc.function.name));
  // Provider 差异：部分 API（如阿里百炼）要求 tool_calls 消息中 content 为 null
  const quirks = getProviderQuirks(config.provider);
  if (quirks.nullContentOnToolCalls) {
    delete msg.content;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolResults: any[] = [];
  let hasError = false;
  /** 本用户消息中已创建/修改的模块 ID，用于拦截冗余的 set_style/set_property/set_content */
  const createdIds_ = createdIds || new Set<string>();

  for (const toolCall of msg.tool_calls) {
    const fnName = toolCall.function.name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let args: any = {};
    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch {
      // 模型可能截断 JSON，尝试修复缺失的括号
      const raw = toolCall.function.arguments || '{}';
      const repaired = repairTruncatedJson(raw);
      try {
        args = JSON.parse(repaired);
        console.warn('[Tool Call] JSON 已修复，原参数不完整:', raw.slice(0, 100));
      } catch {
        const parseError = `参数 JSON 不合法且无法修复: ${raw.slice(0, 200)}`;
        console.error(`[Tool Call] ${parseError}`);
      }
    }

    let resultContent: string;
    try {
      if (fnName === 'execute_skill') {
        const skillResult = await executeSkill(args.name, args.params || {}, buildSkillContext());
        setToast(`技能 [${args.name}] 完成`);
        setTimeout(() => setToast(null), 2000);
        resultContent = skillResult;
      } else if (fnName === 'get_uploaded_file') {
        const fileData = getUploadedFile();
        if (fileData) {
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
      } else {
        // 拦截冗余样式修改：set_style/set_content 会整体替换，同一轮重复调用无意义
        // set_property 只改一个属性，允许多次调用不同属性
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

        // 通过 toolHandlerMap 路由所有新工具
        const handler = toolHandlerMap[fnName];
        if (handler) {
          const currentModules = useResumeStore.getState().modules;
          const toolResult = await handler(args, currentModules);
          if (toolResult.success) {
            // 记录本轮创建的模块 ID
            const summary = toolResult.summary;
            if (summary && fnName.startsWith('add_')) {
              try {
                const parsed = JSON.parse(summary);
                if (parsed.id) createdIds_.add(parsed.id);
              } catch { /* summary 非 JSON 格式时忽略 */ }
            }
            // 追踪被 set_style/set_content 修改的模块，防止同一轮内重复
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
    return callAiWithMessages(newMsgs, retryCount + 1, toolRoundCount + 1, createdIds_);
  }

  // 重试次数已尽，汇总结果返回（不再递归）
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

    const canvasSummary = getCanvasStateSummary();
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
        // 尝试解析结构化建议
        let suggestions: Suggestion[] | undefined;
        let displayText = aiReply;
        try {
          // 提取 JSON：先找 { 到 } 的范围，再去掉 markdown 包裹
          let jsonStr = aiReply.trim();
          const startIdx = jsonStr.indexOf('{');
          const endIdx = jsonStr.lastIndexOf('}');
          if (startIdx !== -1 && endIdx > startIdx) {
            jsonStr = jsonStr.substring(startIdx, endIdx + 1);
          }
          jsonStr = jsonStr.replace(/```json\s*|\s*```/g, '').trim();
          // 修复尾部逗号
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

  // [临时] 导出画布布局树，用于对比 AI 生成 vs 手动复原
  const handleExportLayout = () => {
    const modules = useResumeStore.getState().modules;
    const tree = exportLayoutTree(modules);
    console.log("=== 画布布局树 ===");
    console.log(JSON.stringify(tree, null, 2));
    navigator.clipboard.writeText(JSON.stringify(tree, null, 2)).catch(() => {});
    setMessages(prev => [...prev, { role: "ai", text: "布局树已导出到控制台并复制到剪贴板" }]);
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