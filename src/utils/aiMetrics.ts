// ========== AI 调用指标埋点 ==========
//
// 目的：为「AI 工具调用可靠性」提供可对比的量化数据（成功率、重试轮数、
// 单轮延迟、token 消耗、每轮注入体积），用于判断某次改动是否真的改善了
// AI 链路，以及沉淀项目描述用的数字。
//
// 脱敏原则：只记录「体量与结果」，不记录 prompt、回复正文或 API Key。
// 因此可以安全地落在本地存储里，也不会把简历内容写进日志。
//
// 读写的降级策略与 resumePersistence 一致：localStorage 不可用（Node 测试
// 环境、隐私模式、配额满）时静默丢弃，绝不影响主流程。

import { generateId } from './idUtils';

export const AI_METRICS_KEY = 'cv-composer:ai-metrics:v1';
export const AI_METRICS_MAX_EVENTS = 500;

const AI_METRICS_VERSION = 1;

export type AiChannel = 'chat' | 'smart-fill' | 'evaluate' | 'polish' | 'import-parse';

/** 工具调用参数的解析状态 */
export type AiArgsStatus = 'ok' | 'repaired' | 'invalid';

export type AiErrorKind =
  | 'timeout'
  | 'network'
  | 'http'
  | 'unknown_skill'
  | 'unknown_tool'
  | 'redundant'
  | 'handler_error'
  | 'invalid_args';

export type AiTurnOutcome = 'success' | 'partial' | 'failed';

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 一次 HTTP 请求（一轮 function-calling）的指标 */
export interface AiRoundEvent {
  kind: 'round';
  ts: number;
  channel: AiChannel;
  model: string;
  provider: string;
  ok: boolean;
  latencyMs: number;
  httpStatus?: number;
  errorKind?: AiErrorKind;
  /** 失败原因的机器可读码（如 ECONNRESET、EAI_AGAIN、AllocationQuota.FreeTierOnly、HTTP_400） */
  errorCode?: string;
  /** 失败原因的可读说明（已截断，不含简历内容与 Key） */
  errorDetail?: string;
  /** 同一轮对话内的重试序号，0 表示首次请求 */
  retryIndex: number;
  toolRound: number;
  promptChars: number;
  promptTokensEst: number;
  toolSchemaChars: number;
  toolCallCount: number;
  usage?: AiUsage;
}

/** 一次工具调用的指标 */
export interface AiToolEvent {
  kind: 'tool';
  ts: number;
  channel: AiChannel;
  name: string;
  argsStatus: AiArgsStatus;
  ok: boolean;
  errorKind?: AiErrorKind;
}

/** 一次用户对话（可能包含多轮请求与重试）的汇总指标 */
export interface AiTurnEvent {
  kind: 'turn';
  ts: number;
  sessionId: string;
  userChars: number;
  outcome: AiTurnOutcome;
  rounds: number;
  retries: number;
  toolCalls: number;
  toolErrors: number;
  latencyMs: number;
}

export type AiMetricEvent = AiRoundEvent | AiToolEvent | AiTurnEvent;

interface AiMetricsSnapshot {
  version: number;
  events: AiMetricEvent[];
}

// ==================== 存储 ====================

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isEvent(value: unknown): value is AiMetricEvent {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'round' || kind === 'tool' || kind === 'turn';
}

export function getAiMetrics(): AiMetricEvent[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(AI_METRICS_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return [];
    const snapshot = data as Partial<AiMetricsSnapshot>;
    if (snapshot.version !== AI_METRICS_VERSION || !Array.isArray(snapshot.events)) return [];
    return snapshot.events.filter(isEvent);
  } catch {
    return [];
  }
}

function writeEvents(events: AiMetricEvent[]): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const snapshot: AiMetricsSnapshot = {
      version: AI_METRICS_VERSION,
      events: events.slice(-AI_METRICS_MAX_EVENTS),
    };
    storage.setItem(AI_METRICS_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

/** 追加事件（超出上限时丢弃最旧的）。任何异常都被吞掉，不影响调用方。 */
export function recordAiMetrics(events: AiMetricEvent | AiMetricEvent[]): boolean {
  try {
    const incoming = Array.isArray(events) ? events : [events];
    if (incoming.length === 0) return true;
    return writeEvents([...getAiMetrics(), ...incoming]);
  } catch {
    return false;
  }
}

export function clearAiMetrics(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(AI_METRICS_KEY);
  } catch { /* 忽略 */ }
}

// ==================== 工具函数 ====================

/** 单调时钟，用于测量耗时（不用于时间戳） */
export function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

let currentSessionId: string | null = null;

/**
 * 当前页面会话的 ID：同一次页面加载内的所有对话共用一个，
 * 用于统计「会话数」而不是把每轮对话都算成一个会话。
 */
export function getAiSessionId(): string {
  if (!currentSessionId) currentSessionId = generateId();
  return currentSessionId;
}

/** 与 moduleUtils 的估算口径保持一致：约 1 token ≈ 1.3 字符 */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 1.3);
}

/** 从服务商响应体读取 token 用量（字段缺失或全 0 时返回 undefined） */
export function readUsage(data: unknown): AiUsage | undefined {
  const usage = (data as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage) return undefined;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const promptTokens = num(usage.prompt_tokens);
  const completionTokens = num(usage.completion_tokens);
  const totalTokens = num(usage.total_tokens) || promptTokens + completionTokens;
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) return undefined;
  return { promptTokens, completionTokens, totalTokens };
}

// ==================== 汇总 ====================

export interface AiMetricsSummary {
  sessions: number;
  turns: number;
  turnOutcomes: { success: number; partial: number; failed: number };
  rounds: number;
  roundsOk: number;
  roundSuccessRate: number;
  roundErrors: Record<string, number>;
  /** 失败原因码 → 次数（诊断链路问题时最关键的一列） */
  roundErrorCodes: Record<string, number>;
  channels: Record<string, number>;
  tools: {
    calls: number;
    ok: number;
    successRate: number;
    argsOk: number;
    argsRepaired: number;
    argsInvalid: number;
    byName: Record<string, { calls: number; errors: number }>;
  };
  retries: { avgPerTurn: number; maxPerTurn: number; roundsWithRetry: number };
  latency: { p50: number; p95: number; max: number };
  usage: {
    roundsWithUsage: number;
    avgPromptTokens: number;
    avgCompletionTokens: number;
    totalTokens: number;
  };
  prompt: {
    avgChars: number;
    avgTokensEst: number;
    schemaRounds: number;
    avgToolSchemaChars: number;
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[index];
}

export function summarizeAiMetrics(events: AiMetricEvent[] = getAiMetrics()): AiMetricsSummary {
  const rounds = events.filter((e): e is AiRoundEvent => e.kind === 'round');
  const tools = events.filter((e): e is AiToolEvent => e.kind === 'tool');
  const turns = events.filter((e): e is AiTurnEvent => e.kind === 'turn');

  const okRounds = rounds.filter(r => r.ok);
  const roundErrors: Record<string, number> = {};
  const roundErrorCodes: Record<string, number> = {};
  for (const r of rounds) {
    if (r.ok) continue;
    const key = r.errorKind || 'unknown';
    roundErrors[key] = (roundErrors[key] || 0) + 1;
    const codeKey = r.errorCode || key;
    roundErrorCodes[codeKey] = (roundErrorCodes[codeKey] || 0) + 1;
  }

  const channels: Record<string, number> = {};
  for (const r of rounds) {
    channels[r.channel] = (channels[r.channel] || 0) + 1;
  }

  const byName: Record<string, { calls: number; errors: number }> = {};
  let toolsOk = 0;
  let argsOk = 0;
  let argsRepaired = 0;
  let argsInvalid = 0;
  for (const t of tools) {
    if (t.ok) toolsOk++;
    if (t.argsStatus === 'ok') argsOk++;
    else if (t.argsStatus === 'repaired') argsRepaired++;
    else argsInvalid++;
    const entry = byName[t.name] || { calls: 0, errors: 0 };
    entry.calls++;
    if (!t.ok) entry.errors++;
    byName[t.name] = entry;
  }

  const turnOutcomes = {
    success: turns.filter(t => t.outcome === 'success').length,
    partial: turns.filter(t => t.outcome === 'partial').length,
    failed: turns.filter(t => t.outcome === 'failed').length,
  };

  const retryCounts = turns.map(t => t.retries);
  const latencySamples = okRounds.map(r => r.latencyMs).sort((a, b) => a - b);
  const usedRounds = rounds.filter(r => r.usage);
  const schemaRounds = rounds.filter(r => r.toolSchemaChars > 0);

  return {
    sessions: new Set(turns.map(t => t.sessionId)).size,
    turns: turns.length,
    turnOutcomes,
    rounds: rounds.length,
    roundsOk: okRounds.length,
    roundSuccessRate: rounds.length === 0 ? 0 : okRounds.length / rounds.length,
    roundErrors,
    roundErrorCodes,
    channels,
    tools: {
      calls: tools.length,
      ok: toolsOk,
      successRate: tools.length === 0 ? 0 : toolsOk / tools.length,
      argsOk,
      argsRepaired,
      argsInvalid,
      byName,
    },
    retries: {
      avgPerTurn: average(retryCounts),
      maxPerTurn: retryCounts.length === 0 ? 0 : Math.max(...retryCounts),
      roundsWithRetry: rounds.filter(r => r.retryIndex > 0).length,
    },
    latency: {
      p50: percentile(latencySamples, 0.5),
      p95: percentile(latencySamples, 0.95),
      max: latencySamples.length === 0 ? 0 : latencySamples[latencySamples.length - 1],
    },
    usage: {
      roundsWithUsage: usedRounds.length,
      avgPromptTokens: Math.round(average(usedRounds.map(r => r.usage!.promptTokens))),
      avgCompletionTokens: Math.round(average(usedRounds.map(r => r.usage!.completionTokens))),
      totalTokens: usedRounds.reduce((sum, r) => sum + r.usage!.totalTokens, 0),
    },
    prompt: {
      avgChars: Math.round(average(rounds.map(r => r.promptChars))),
      avgTokensEst: Math.round(average(rounds.map(r => r.promptTokensEst))),
      schemaRounds: schemaRounds.length,
      avgToolSchemaChars: Math.round(average(schemaRounds.map(r => r.toolSchemaChars))),
    },
  };
}

// ==================== 输出 ====================

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

/** 生成可直接粘贴进 METRICS.md 的文本摘要 */
export function formatAiMetricsSummary(summary: AiMetricsSummary): string {
  const { turnOutcomes } = summary;
  const lines: string[] = ['AI 指标摘要'];

  if (summary.turns === 0 && summary.rounds === 0 && summary.tools.calls === 0) {
    lines.push('- 暂无数据');
    return lines.join('\n');
  }

  lines.push(`- 会话/对话：${summary.sessions} 个会话，${summary.turns} 轮（成功 ${turnOutcomes.success} / 部分 ${turnOutcomes.partial} / 失败 ${turnOutcomes.failed}）`);

  const roundErrDetail = Object.entries(summary.roundErrors)
    .map(([kind, count]) => `${kind} ${count}`)
    .join('、');
  const errorCodeDetail = Object.entries(summary.roundErrorCodes)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => `${code} ${count}`)
    .join('、');
  lines.push(`- 请求：${summary.rounds} 次，成功率 ${pct(summary.roundSuccessRate)}${roundErrDetail ? `（失败：${roundErrDetail}）` : ''}`);
  if (errorCodeDetail) lines.push(`- 失败原因码：${errorCodeDetail}`);

  const t = summary.tools;
  if (t.calls > 0) {
    lines.push(
      `- 工具调用：${t.calls} 次，成功率 ${pct(t.successRate)}；参数解析 正常 ${pct(t.argsOk / t.calls)} / 修复 ${pct(t.argsRepaired / t.calls)} / 不可用 ${pct(t.argsInvalid / t.calls)}`,
    );
  }

  lines.push(`- 重试：平均 ${summary.retries.avgPerTurn.toFixed(2)} 次/轮，最多 ${summary.retries.maxPerTurn} 次，涉及 ${summary.retries.roundsWithRetry} 次请求`);
  lines.push(`- 单轮延迟（成功请求）：P50 ${seconds(summary.latency.p50)} / P95 ${seconds(summary.latency.p95)} / 最大 ${seconds(summary.latency.max)}`);

  if (summary.usage.roundsWithUsage > 0) {
    lines.push(
      `- Token：${summary.usage.roundsWithUsage} 次请求带用量，平均 prompt ${summary.usage.avgPromptTokens} / completion ${summary.usage.avgCompletionTokens}，累计 ${summary.usage.totalTokens}`,
    );
  } else {
    lines.push('- Token：无用量数据（服务商未返回 usage）');
  }

  const schemaPart = summary.prompt.schemaRounds > 0
    ? `；工具 schema 平均 ${summary.prompt.avgToolSchemaChars} 字符（${summary.prompt.schemaRounds} 次）`
    : '';
  lines.push(`- Prompt 注入：平均 ${summary.prompt.avgChars} 字符（≈${summary.prompt.avgTokensEst} tokens）${schemaPart}`);

  const channelPart = Object.entries(summary.channels)
    .map(([name, count]) => `${name} ${count}`)
    .join(' / ');
  if (channelPart) lines.push(`- 按渠道：${channelPart}`);

  return lines.join('\n');
}

/** 导出为 JSON 字符串（含原始事件与摘要），供下载或粘贴分析 */
export function exportAiMetricsJson(): string {
  const events = getAiMetrics();
  return JSON.stringify(
    {
      key: AI_METRICS_KEY,
      exportedAt: new Date().toISOString(),
      eventCount: events.length,
      summary: summarizeAiMetrics(events),
      events,
    },
    null,
    2,
  );
}
