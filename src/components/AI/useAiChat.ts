// AI 会话编排 Hook：把「与模型的多轮 function-calling 循环 + 技能/工具执行 + 文件导入」
// 从 ChatPanel 组件中抽离出来，组件只负责渲染与用户交互转发。
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../types/resume';
import { buildSystemPrompt, aiTools, toolHandlerMap, getRequiredToolArgs } from '../../engine/aiPrompt';
import { getFixedConstraints } from '../../engine/ruleBase';
import { executeSkill } from '../../engine/skillExecutor';
import { exportLayoutTree, getCanvasStateSummary } from '../../utils/moduleUtils';
import {
  getAiRequestTimeoutMs,
  getApiConfig,
  getUploadedFile,
  getProviderQuirks,
  resolveBaseUrl,
  type ProviderQuirks,
} from '../../utils/aiConfig';
import { parseToolArguments } from '../../utils/toolArgsParser';
import {
  CORRECTION_INSTRUCTION,
  FAKE_SUCCESS_NOTICE,
  MAX_TOOL_ROUNDS,
  TurnCallGuard,
  inspectToolLessReply,
  needsCorrectionRetry,
  resolveTurnOutcome,
} from '../../utils/aiGuards';
import {
  estimateTokens,
  exportAiMetricsJson,
  formatAiMetricsSummary,
  getAiSessionId,
  getAiMetrics,
  nowMs,
  readUsage,
  recordAiMetrics,
  summarizeAiMetrics,
  type AiArgsStatus,
  type AiErrorKind,
  type AiRoundEvent,
  type AiTurnOutcome,
} from '../../utils/aiMetrics';
import {
  translateApiError,
  callAiForPolish,
  callAiForEvaluate,
  callSmartFill,
  describeFetchError,
  describeHttpError,
} from './aiApi';
import { useFileImport } from './useFileImport';

export interface ChatRequestBodyOptions {
  model: string;
  messages: unknown[];
  tools: unknown[];
  /** 上传轮次需要强制模型调用工具（tool_choice:'required'） */
  isUpload: boolean;
  quirks: ProviderQuirks;
}

/**
 * 判定本轮是否属于「上传轮次」：只认**用户消息**里的 `[上传文件]` 标记。
 * 不能对全部消息做字符串匹配 —— system 消息正文（`buildSystemPrompt()`）本身也含 `[上传文件]` 字面量，
 * 而它每轮都在请求里，按旧写法 `isUpload` 恒为真（DeepSeek 官端因此每轮都发 'required' 并撞上 400）。
 */
export function isUploadTurn(msgs: Array<{ role?: string; content?: unknown }>): boolean {
  return msgs.some(m => m.role === 'user'
    && typeof m.content === 'string'
    && m.content.includes('[上传文件]'));
}

/**
 * 组装 /chat/completions 的请求体。
 * 抽成纯函数是为了让「某个字段发不发」可以被单元测试直接断言 —— 各服务商对 tool_choice / thinking
 * 的接受度不同（DeepSeek 官方端点思考模式下拒绝显式 tool_choice），这些差异只能由 quirks 决定。
 * 字段顺序固定为 model → messages → tools → tool_choice → temperature：阿里云 / OpenAI 的请求体
 * 必须与改造前逐字节相同，随意调整插入位置会让「行为不变」无法逐字节核对。
 */
export function buildChatRequestBody({
  model,
  messages,
  tools,
  isUpload,
  quirks,
}: ChatRequestBodyOptions): Record<string, unknown> {
  const body: Record<string, unknown> = { model, messages, tools };
  if (isUpload) {
    body.tool_choice = 'required';
    if (quirks.disableThinkingWithRequiredToolChoice) body.thinking = { type: 'disabled' };
  } else if (!quirks.omitAutoToolChoice) {
    body.tool_choice = 'auto';
  }
  body.temperature = 0.1;
  return body;
}

/** 单轮用户对话的埋点累加器（贯穿多轮 function-calling 与重试） */
interface TurnAccumulator {
  sessionId: string;
  startedAt: number;
  rounds: number;
  retries: number;
  toolCalls: number;
  toolErrors: number;
  /** 被同轮重复调用守卫拦下的次数（P0.2 第 2 项） */
  redundantCalls: number;
  /** 打满 MAX_TOOL_ROUNDS（改前会静默记成 success） */
  hitRoundLimit: boolean;
  /** 命中过静默假成功（P0.2 第 3 项） */
  fakeSuccess: boolean;
}

export interface Suggestion {
  title: string;
  description: string;
  tool: string;
  params: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  suggestions?: Suggestion[];
}

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { parsing, fileInputRef, handleImportClick, handleFileChange } = useFileImport(setMessages);

  // ==================== AI 工具调用循环 ====================

  const callAiWithMessages = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    msgs: any[],
    turn: TurnAccumulator,
    retryCount = 0,
    toolRoundCount = 0,
    createdIds: Set<string> | undefined,
    guard: TurnCallGuard,
    correctionCount = 0,
  ): Promise<string> => {
    const config = getApiConfig();
    if (!config || !config.apiKey) return '请先配置 API 服务。';

    if (toolRoundCount >= MAX_TOOL_ROUNDS) {
      // 改前这里静默返回一段文本，turn.outcome 仍是 success —— 打满轮次必须记为 partial
      turn.hitRoundLimit = true;
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

    const baseUrl = resolveBaseUrl(config.baseUrl);
    const model = config.model || 'qwen-plus';

    const isUpload = isUploadTurn(msgs);
    const quirks = getProviderQuirks(config.provider);

    const promptChars = JSON.stringify(msgs).length;
    const toolSchemaChars = JSON.stringify(aiTools).length;
    const startedAt = nowMs();

    /** 记录一次 HTTP 轮次；任何异常都被 recordAiMetrics 内部吞掉，不影响主流程 */
    const recordRound = (ok: boolean, extra: Partial<AiRoundEvent> = {}): void => {
      recordAiMetrics({
        kind: 'round',
        ts: Date.now(),
        channel: 'chat',
        model,
        provider: config.provider,
        retryIndex: retryCount,
        toolRound: toolRoundCount,
        promptChars,
        promptTokensEst: estimateTokens(promptChars),
        toolSchemaChars,
        toolCallCount: 0,
        latencyMs: nowMs() - startedAt,
        ok,
        ...extra,
      });
      turn.rounds += 1;
      turn.retries = Math.max(turn.retries, retryCount);
    };

    const requestTimeoutMs = getAiRequestTimeoutMs();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildChatRequestBody({
          model,
          messages: msgs,
          tools: aiTools,
          isUpload,
          quirks,
        })),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      recordRound(false, {
        errorKind: isTimeout ? 'timeout' : 'network',
        ...(isTimeout ? { errorCode: 'TIMEOUT', errorDetail: `超过 ${requestTimeoutMs} ms 未响应` } : describeFetchError(err)),
      });
      if (isTimeout) {
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
      recordRound(false, { httpStatus: response.status, errorKind: 'http', ...describeHttpError(response.status, errText) });
      throw new Error(translateApiError(response.status, errText, model));
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      recordRound(false, { httpStatus: response.status, errorKind: 'http', errorCode: 'INVALID_JSON_RESPONSE' });
      throw err;
    }
    const msg = data.choices?.[0]?.message;

    recordRound(true, {
      toolCallCount: msg?.tool_calls?.length ?? 0,
      usage: readUsage(data),
    });

    if (!msg?.tool_calls) {
      console.log('[AI] 纯文本回复 (无工具调用)');

      // P0.2 第 3 项：三类静默假成功（声称已改却没调工具 / 把工具调用写成 JSON 文本 / </think> 泄漏）
      const { text, findings } = inspectToolLessReply(msg?.content || '', { toolCallsInTurn: turn.toolCalls });

      if (toolRoundCount === 0 && retryCount === 0 && findings.includes('TOOL_JSON_AS_TEXT')) {
        throw new Error('该模型不支持 Function Calling，请更换为 qwen-max、qwen-plus-latest 或 gpt-4o。可在 API 设置中修改模型名称。');
      }

      if (findings.length > 0) {
        turn.fakeSuccess = true;
        if (needsCorrectionRetry(findings) && correctionCount < 1) {
          // 只纠正一次：给模型一次机会真正调用工具，避免无限空转烧额度
          return callAiWithMessages(
            [...msgs, { role: 'assistant', content: text }, { role: 'user', content: CORRECTION_INSTRUCTION }],
            turn,
            retryCount,
            toolRoundCount + 1,
            createdIds,
            guard,
            correctionCount + 1,
          );
        }
        if (needsCorrectionRetry(findings)) {
          return `${FAKE_SUCCESS_NOTICE}\n\n${text}`;
        }
      }
      return text;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log('[AI] 收到工具调用:', msg.tool_calls.map((tc: any) => tc.function.name));

    if (quirks.nullContentOnToolCalls) {
      delete msg.content;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: any[] = [];
    let hasError = false;
    /** 最近一次「参数不可用」的具体原因，回传给模型帮助它自纠正 */
    let argsErrorDetail = '';
    const createdIds_ = createdIds || new Set<string>();

    for (const toolCall of msg.tool_calls) {
      const fnName = toolCall.function.name;
      const parsedArgs = parseToolArguments(toolCall.function.arguments, getRequiredToolArgs(fnName));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args: any = parsedArgs.args;
      const argsStatus: AiArgsStatus = parsedArgs.status;
      if (argsStatus === 'repaired') {
        console.warn('[Tool Call] 参数已打捞/补齐:', parsedArgs.detail ?? '');
      } else if (argsStatus === 'invalid') {
        console.error(`[Tool Call] 参数不可用: ${parsedArgs.detail ?? ''}`);
      }

      // 参数解析失败时即便工具「没抛错」也不算成功
      let toolOk = argsStatus !== 'invalid';
      let toolErrorKind: AiErrorKind | undefined = argsStatus === 'invalid' ? 'invalid_args' : undefined;
      if (argsStatus === 'invalid') argsErrorDetail = parsedArgs.detail ?? '';

      const recordTool = (ok: boolean, errorKind?: AiErrorKind): void => {
        recordAiMetrics({
          kind: 'tool',
          ts: Date.now(),
          channel: 'chat',
          name: fnName,
          argsStatus,
          ok,
          ...(errorKind ? { errorKind } : {}),
        });
        turn.toolCalls += 1;
        if (!ok) turn.toolErrors += 1;
      };

      let resultContent: string;
      try {
        if (argsStatus === 'invalid') {
          // 参数不可用时不执行 handler：避免用 {} 或残缺参数产生误导性报错 / 空操作
          hasError = true;
          toolOk = false;
          toolErrorKind = 'invalid_args';
          setToolStatus(`${fnName} ✗ 参数不可用`);
          resultContent = JSON.stringify({
            error: 'INVALID_ARGS',
            message: `${fnName} 的参数无法解析：${argsErrorDetail}`,
            fix: '请重新调用该工具，arguments 必须是一个合法 JSON 对象：键和字符串值都要用双引号、不能省略嵌套对象的值、不要输出 <parameter=xxx> 之类的标记。',
          });
        } else if (fnName === 'execute_skill') {
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
            turn.redundantCalls += 1;
            resultContent = JSON.stringify({
              error: 'REDUNDANT_STYLE',
              message: `${fnName}: 模块 ${args.id} 刚刚创建，内容和样式已在创建时传入，无需再次修改。`,
              fix: `请删除此 ${fnName} 调用。add_text/add_heading/add_list 等创建工具已支持一次性传入 content 和 style。`,
            });
            toolResults.push({ role: 'tool', tool_call_id: toolCall.id, name: fnName, content: resultContent });
            recordTool(false, 'redundant');
            continue;
          }

          // P0.2 第 1 项：同轮重复调用守卫（同工具 + 等价参数；第二次不执行 handler）
          const decision = guard.inspect(fnName, args);
          if (decision.redundant) {
            hasError = true;
            turn.redundantCalls += 1;
            setToolStatus(`${fnName} ✗ 重复调用`);
            resultContent = JSON.stringify({
              error: decision.code,
              message: decision.message,
              fix: decision.fix,
              priorResult: decision.priorResult,
            });
            toolResults.push({ role: 'tool', tool_call_id: toolCall.id, name: fnName, content: resultContent });
            recordTool(false, 'redundant');
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
              toolOk = false;
              toolErrorKind = 'handler_error';
              setToolStatus(`${fnName} ✗`);
              resultContent = JSON.stringify({
                error: toolResult.code,
                message: toolResult.message,
                fix: toolResult.fix,
              });
            }
          } else {
            hasError = true;
            toolOk = false;
            toolErrorKind = 'unknown_tool';
            resultContent = `未知工具: ${fnName}`;
          }
        }
      } catch (err) {
        hasError = true;
        const message = (err as Error).message;
        toolOk = false;
        toolErrorKind = message.includes('未知技能')
          ? 'unknown_skill'
          : message.includes('未知工具') ? 'unknown_tool' : 'handler_error';
        resultContent = `工具调用失败: ${message}`;
      }

      // 真正执行过的调用才记账（含结构化失败）：拦下「一字不差地重试」正是守卫的目标
      guard.record(fnName, args, resultContent);

      toolResults.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: fnName,
        content: resultContent,
      });
      recordTool(toolOk, toolErrorKind);
    }

    const trailingUserMsg = {
      role: 'user',
      content: hasError
        ? (argsErrorDetail
            ? `请修正错误并重试。注意：工具参数必须是合法 JSON 对象（键与字符串值加双引号、嵌套对象的值不能省略），禁止使用 <parameter=xxx> 这类标记。失败详情：${argsErrorDetail}`
            : '请修正错误并重试。')
        : '工具已执行完毕，请根据结果继续回复用户。',
    };

    if (hasError && retryCount < 2) {
      const newMsgs = [...msgs, msg, ...toolResults, trailingUserMsg];
      return callAiWithMessages(newMsgs, turn, retryCount + 1, toolRoundCount + 1, createdIds_, guard, correctionCount);
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
    return callAiWithMessages(newMsgs, turn, retryCount, toolRoundCount + 1, createdIds_, guard, correctionCount);
  };

  // ==================== 用户交互 ====================

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

    const turn: TurnAccumulator = {
      sessionId: getAiSessionId(),
      startedAt: nowMs(),
      rounds: 0,
      retries: 0,
      toolCalls: 0,
      toolErrors: 0,
      redundantCalls: 0,
      hitRoundLimit: false,
      fakeSuccess: false,
    };
    const guard = new TurnCallGuard();
    let outcome: AiTurnOutcome = 'success';

    const canvasSummary = getCanvasStateSummary(useResumeStore.getState().modules);
    const rules = getFixedConstraints();
    const systemContent = buildSystemPrompt() + '\n\n## 必须遵守的规则\n' + rules + '\n\n## 当前画布\n' + canvasSummary;
    const systemMsg = { role: 'system', content: systemContent };
    const historyMsgs = messages.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    const currentMsg = { role: 'user', content: userMsg };

    try {
      console.log('[ChatPanel] 发送消息:', userMsg);
      const aiReply = await callAiWithMessages([systemMsg, ...historyMsgs, currentMsg], turn, 0, 0, undefined, guard);
      console.log('[ChatPanel] AI 回复:', JSON.stringify(aiReply).slice(0, 500));

      if (!aiReply) {
        outcome = 'failed';
        setMessages(prev => [...prev, { role: 'ai', text: '未收到有效回复，请重试。' }]);
      } else {
        let suggestions: Suggestion[] | undefined;
        let displayText = aiReply;
        // 假成功提示是给用户看的显式告警，绝不能被「建议 JSON」解析吞掉
        try {
          if (aiReply.startsWith(FAKE_SUCCESS_NOTICE)) throw new Error('skip-json-parse');
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
      outcome = 'failed';
      const chatErrMsg = err instanceof Error ? err.message : String(err);
      console.error('[ChatPanel] 请求失败:', chatErrMsg);
      setMessages(prev => [...prev, { role: 'ai', text: `出错了: ${chatErrMsg}` }]);
    } finally {
      // P0.2 第 2 项：打满轮次 / 工具错误 / 静默假成功都不得再记 success
      outcome = resolveTurnOutcome({
        failed: outcome === 'failed',
        hitRoundLimit: turn.hitRoundLimit,
        toolErrors: turn.toolErrors,
        fakeSuccess: turn.fakeSuccess,
      });
      recordAiMetrics({
        kind: 'turn',
        ts: Date.now(),
        sessionId: turn.sessionId,
        userChars: userMsg.length,
        outcome,
        rounds: turn.rounds,
        retries: turn.retries,
        toolCalls: turn.toolCalls,
        toolErrors: turn.toolErrors,
        redundantCalls: turn.redundantCalls,
        latencyMs: nowMs() - turn.startedAt,
      });
      setWaiting(false);
      setToolStatus(null);
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
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

  /** 导出 AI 指标：下载 JSON（含原始事件与摘要），并把文本摘要复制到剪贴板 */
  const handleExportMetrics = () => {
    const events = getAiMetrics();
    const summaryText = formatAiMetricsSummary(summarizeAiMetrics(events));
    const blob = new Blob([exportAiMetricsJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-metrics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    navigator.clipboard.writeText(summaryText).catch(() => {});
    setToast(`已导出 AI 指标（${events.length} 条事件），摘要已复制到剪贴板`);
    setTimeout(() => setToast(null), 2500);
  };

  const applySuggestion = async (suggestion: Suggestion) => {
    try {
      const handler = toolHandlerMap[suggestion.tool];
      if (!handler) { alert(`未知工具: ${suggestion.tool}`); return; }
      const currentModules = useResumeStore.getState().modules;
      const result = await handler(suggestion.params as Record<string, unknown>, currentModules);
      if (result.success) {
        useResumeStore.getState().importModules(result.newModules);
        setMessages(prev => [...prev, { role: 'ai', text: `已应用建议：${suggestion.title}` }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: `应用失败：${result.message}` }]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { role: 'ai', text: `应用建议出错：${errMsg}` }]);
    }
  };

  return {
    messages,
    input,
    setInput,
    waiting,
    toolStatus,
    toast,
    handleKeyDown,
    handleSend,
    handleExportLayout,
    handleExportMetrics,
    applySuggestion,
    parsing,
    fileInputRef,
    handleImportClick,
    handleFileChange,
  };
}
