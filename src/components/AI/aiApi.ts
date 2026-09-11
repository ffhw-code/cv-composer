// 直接 AI API 调用（非 tool-calling 路径），供 skill 和 file import 使用。
//
// 所有请求都经由 postChatCompletions 统一发出，顺带记录 AI 指标埋点
// （渠道、耗时、HTTP 状态、token 用量、注入体积），供 AI 链路回归对比使用。
import { getAiRequestTimeoutMs, getApiConfig, resolveBaseUrl, type ApiConfig } from '../../utils/aiConfig';
import {
  estimateTokens,
  nowMs,
  readUsage,
  recordAiMetrics,
  type AiChannel,
  type AiRoundEvent,
} from '../../utils/aiMetrics';

/** 从服务商错误响应体里提取可读信息（兼容 OpenAI / 百炼的 error.message、error.code） */
export function extractApiErrorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message || parsed.error?.code || parsed.message || '';
  } catch {
    return '';
  }
}

export interface AiErrorInfo {
  /** 机器可读的失败原因，用于聚合统计（如 ECONNRESET、AllocationQuota.FreeTierOnly） */
  errorCode?: string;
  /** 可读说明（截断到 200 字符，不含简历内容与 Key） */
  errorDetail?: string;
}

const MAX_DETAIL = 200;

function trimDetail(text: string): string | undefined {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (!oneLine) return undefined;
  return oneLine.length > MAX_DETAIL ? `${oneLine.slice(0, MAX_DETAIL)}…` : oneLine;
}

/**
 * 归纳网络层失败原因：`fetch failed` 真正的信息藏在 err.cause 里
 * （ECONNRESET / EAI_AGAIN / ETIMEDOUT / UND_ERR_*），不取出来就只能记一个笼统的 network。
 */
export function describeFetchError(err: unknown): AiErrorInfo {
  const codes: string[] = [];
  // 越深越具体：上层的 "fetch failed" 没有信息量，真正的原因在 cause 链末端
  let detail = '';
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const withCode = current as Error & { code?: unknown };
    if (typeof withCode.code === 'string' && withCode.code) codes.push(withCode.code);
    if (current.message) detail = current.message;
    current = (current as Error & { cause?: unknown }).cause;
  }
  const errorCode = codes[0];
  return {
    ...(errorCode ? { errorCode } : {}),
    ...(trimDetail(detail) ? { errorDetail: trimDetail(detail) } : {}),
  };
}

/** 归纳 HTTP 错误原因：优先用服务商给的 error.code，否则退回 error.message */
export function describeHttpError(status: number, body: string): AiErrorInfo {
  let code = '';
  try {
    const parsed = JSON.parse(body);
    const rawCode = parsed?.error?.code ?? parsed?.code;
    code = typeof rawCode === 'string' ? rawCode : '';
    if (!code && typeof parsed?.error?.type === 'string') code = parsed.error.type;
  } catch { /* 非 JSON 响应体，退回状态码 */ }
  const detail = extractApiErrorDetail(body) || body;
  return {
    errorCode: code || `HTTP_${status}`,
    ...(trimDetail(detail) ? { errorDetail: trimDetail(detail) } : {}),
  };
}

export function translateApiError(status: number, body: string, model: string): string {
  const detail = extractApiErrorDetail(body);

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
      return '接口地址不存在（404），模型名或 Base URL 可能填错了，请检查 API 设置。';
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

export interface AiResponseData {
  choices?: { message?: { content?: string } }[];
  usage?: Record<string, unknown>;
}

export interface ChatCallOptions {
  channel: AiChannel;
  config: ApiConfig;
  messages: unknown[];
  /** 覆盖 config.model（例如简历解析使用视觉模型） */
  model?: string;
  /** 传入则启用超时中断 */
  timeoutMs?: number;
  /** 同一轮内的重试序号，0 表示首次请求 */
  retryIndex?: number;
  /** HTTP 非 2xx 时的错误文案（各调用方保持原有措辞） */
  buildHttpError: (status: number, errText: string) => string;
}

/** 只统计文本部分的注入体积：图片 base64 与 token 消耗无关，计进去会淹没该指标 */
function measurePromptChars(messages: unknown[]): number {
  let total = 0;
  for (const message of messages) {
    const content = (message as { content?: unknown }).content;
    if (typeof content === 'string') {
      total += content.length;
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part === 'string') {
        total += part.length;
        continue;
      }
      const p = part as { type?: string; text?: string };
      if (p.type === 'text' && typeof p.text === 'string') total += p.text.length;
    }
  }
  return total;
}

/**
 * 统一的 chat/completions 调用：负责计时、token 用量记录与错误抛出。
 * 埋点只记录体量与结果，不记录 prompt 与回复正文。
 */
export async function postChatCompletions(options: ChatCallOptions): Promise<AiResponseData> {
  const { channel, config, messages, model: modelOverride, timeoutMs, retryIndex = 0, buildHttpError } = options;
  const baseUrl = resolveBaseUrl(config.baseUrl);
  const model = modelOverride || config.model || 'qwen-plus';
  const promptChars = measurePromptChars(messages);
  const startedAt = nowMs();

  const record = (ok: boolean, extra: Partial<AiRoundEvent> = {}): void => {
    recordAiMetrics({
      kind: 'round',
      ts: Date.now(),
      channel,
      model,
      provider: config.provider,
      retryIndex,
      toolRound: 0,
      promptChars,
      promptTokensEst: estimateTokens(promptChars),
      toolSchemaChars: 0,
      toolCallCount: 0,
      latencyMs: nowMs() - startedAt,
      ok,
      ...extra,
    });
  };

  // 未显式传超时就走统一默认值：宁可失败得快，也不要挂死
  const requestTimeoutMs = timeoutMs ?? getAiRequestTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.1 }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    record(false, {
      errorKind: isTimeout ? 'timeout' : 'network',
      ...(isTimeout ? { errorCode: 'TIMEOUT', errorDetail: `超过 ${requestTimeoutMs} ms 未响应` } : describeFetchError(err)),
    });
    if (isTimeout) throw new Error('请求超时，请稍后重试。', { cause: err });
    throw new Error('无法连接到 AI 服务，请检查网络连接或 Base URL 是否正确。', { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    record(false, { httpStatus: response.status, errorKind: 'http', ...describeHttpError(response.status, errText) });
    throw new Error(buildHttpError(response.status, errText));
  }

  let data: AiResponseData;
  try {
    data = await response.json();
  } catch (err) {
    record(false, { httpStatus: response.status, errorKind: 'http' });
    throw err;
  }

  record(true, { usage: readUsage(data) });
  return data;
}

export async function callSmartFill(sysPrompt: string, userPrompt: string): Promise<string> {
  const config = getApiConfig();
  if (!config || !config.apiKey) throw new Error('API 未配置');
  const messages = [
    {
      role: 'user' as const,
      content: `${sysPrompt}\n\n${userPrompt}`,
    },
  ];

  const data = await postChatCompletions({
    channel: 'smart-fill',
    config,
    messages,
    buildHttpError: (status, errText) => `smart-fill API 请求失败: ${status} ${errText}`,
  });

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('smart-fill 未返回有效内容');
  return content;
}

export async function callAiForEvaluate(prompt: string): Promise<string> {
  const config = getApiConfig();
  if (!config?.apiKey) throw new Error('API 未配置');

  const data = await postChatCompletions({
    channel: 'evaluate',
    config,
    messages: [{ role: 'user' as const, content: prompt }],
    buildHttpError: (status, errText) => `评估 API 请求失败: ${status} ${errText}`,
  });

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('评估未返回有效内容');
  return content;
}

export async function callAiForPolish(text: string): Promise<string> {
  const config = getApiConfig();
  if (!config?.apiKey) throw new Error('API 未配置');

  const polishMsgs = [
    { role: 'system' as const, content: '请优化以下文本，保持原意但使表达更专业、简洁。直接返回优化后文本，不要解释。' },
    { role: 'user' as const, content: text },
  ];

  const data = await postChatCompletions({
    channel: 'polish',
    config,
    messages: polishMsgs,
    buildHttpError: (status, errText) => `润色 API 请求失败: ${status} ${errText}`,
  });

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('润色未返回有效内容');
  return content;
}
