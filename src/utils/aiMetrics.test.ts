import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_METRICS_KEY,
  AI_METRICS_MAX_EVENTS,
  clearAiMetrics,
  estimateTokens,
  exportAiMetricsJson,
  formatAiMetricsSummary,
  getAiMetrics,
  getAiSessionId,
  readUsage,
  recordAiMetrics,
  summarizeAiMetrics,
  type AiRoundEvent,
  type AiToolEvent,
  type AiTurnEvent,
} from './aiMetrics';

/** 最小可用的 localStorage 替身（Node 测试环境没有原生实现） */
function createFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => { map.clear(); },
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

function roundEvent(overrides: Partial<AiRoundEvent> = {}): AiRoundEvent {
  return {
    kind: 'round',
    ts: 1,
    channel: 'chat',
    model: 'qwen-plus',
    provider: 'dashscope',
    ok: true,
    latencyMs: 1000,
    retryIndex: 0,
    toolRound: 0,
    promptChars: 1300,
    promptTokensEst: 1000,
    toolSchemaChars: 2600,
    toolCallCount: 1,
    ...overrides,
  };
}

function toolEvent(overrides: Partial<AiToolEvent> = {}): AiToolEvent {
  return {
    kind: 'tool',
    ts: 1,
    channel: 'chat',
    name: 'add_text',
    argsStatus: 'ok',
    ok: true,
    ...overrides,
  };
}

function turnEvent(overrides: Partial<AiTurnEvent> = {}): AiTurnEvent {
  return {
    kind: 'turn',
    ts: 1,
    sessionId: 's1',
    userChars: 10,
    outcome: 'success',
    rounds: 1,
    retries: 0,
    toolCalls: 1,
    toolErrors: 0,
    latencyMs: 1200,
    ...overrides,
  };
}

describe('aiMetrics 存储与降级', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createFakeStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('没有 localStorage 时静默降级，不抛错', () => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    expect(getAiMetrics()).toEqual([]);
    expect(recordAiMetrics(roundEvent())).toBe(false);
    expect(() => clearAiMetrics()).not.toThrow();
  });

  it('记录后可按顺序读回', () => {
    recordAiMetrics([roundEvent({ ts: 1 }), toolEvent({ ts: 2 })]);
    const events = getAiMetrics();
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('round');
    expect(events[1].kind).toBe('tool');
  });

  it('支持单条传入', () => {
    expect(recordAiMetrics(roundEvent())).toBe(true);
    expect(getAiMetrics()).toHaveLength(1);
  });

  it('超过上限时只保留最近的事件', () => {
    const events = Array.from({ length: AI_METRICS_MAX_EVENTS + 10 }, (_, i) =>
      roundEvent({ ts: i }),
    );
    recordAiMetrics(events);
    const stored = getAiMetrics();
    expect(stored).toHaveLength(AI_METRICS_MAX_EVENTS);
    expect(stored[0].ts).toBe(10);
    expect(stored[stored.length - 1].ts).toBe(AI_METRICS_MAX_EVENTS + 9);
  });

  it('clearAiMetrics 会清空记录', () => {
    recordAiMetrics(roundEvent());
    clearAiMetrics();
    expect(getAiMetrics()).toEqual([]);
  });

  it('版本不匹配时返回空数组', () => {
    localStorage.setItem(AI_METRICS_KEY, JSON.stringify({ version: 999, events: [roundEvent()] }));
    expect(getAiMetrics()).toEqual([]);
  });

  it('数据损坏时返回空数组且不抛错', () => {
    localStorage.setItem(AI_METRICS_KEY, '{ not json');
    expect(getAiMetrics()).toEqual([]);
  });
});

describe('summarizeAiMetrics', () => {
  it('空数据返回全 0 且不产生 NaN', () => {
    const summary = summarizeAiMetrics([]);
    expect(summary.rounds).toBe(0);
    expect(summary.roundSuccessRate).toBe(0);
    expect(summary.tools.successRate).toBe(0);
    expect(summary.retries.avgPerTurn).toBe(0);
    expect(summary.latency.p50).toBe(0);
    expect(summary.usage.avgPromptTokens).toBe(0);
    expect(Number.isNaN(summary.prompt.avgChars)).toBe(false);
  });

  it('统计请求成功率与失败分类', () => {
    const summary = summarizeAiMetrics([
      roundEvent(),
      roundEvent(),
      roundEvent({ ok: false, errorKind: 'http' }),
    ]);
    expect(summary.rounds).toBe(3);
    expect(summary.roundsOk).toBe(2);
    expect(summary.roundSuccessRate).toBeCloseTo(2 / 3);
    expect(summary.roundErrors).toEqual({ http: 1 });
  });

  it('按失败原因码聚合（区分网络重置与超时）', () => {
    const summary = summarizeAiMetrics([
      roundEvent(),
      roundEvent({ ok: false, errorKind: 'network', errorCode: 'ECONNRESET' }),
      roundEvent({ ok: false, errorKind: 'network', errorCode: 'ECONNRESET' }),
      roundEvent({ ok: false, errorKind: 'network', errorCode: 'EAI_AGAIN' }),
      roundEvent({ ok: false, errorKind: 'timeout', errorCode: 'TIMEOUT' }),
      roundEvent({ ok: false, errorKind: 'http', errorCode: 'AllocationQuota.FreeTierOnly' }),
    ]);
    expect(summary.roundErrorCodes).toEqual({
      ECONNRESET: 2,
      EAI_AGAIN: 1,
      TIMEOUT: 1,
      'AllocationQuota.FreeTierOnly': 1,
    });
    // 没有 errorCode 的旧事件退回用 errorKind 计数
    expect(summarizeAiMetrics([roundEvent({ ok: false, errorKind: 'network' })]).roundErrorCodes).toEqual({ network: 1 });
  });

  it('统计工具调用成功率与参数解析比例', () => {
    const summary = summarizeAiMetrics([
      toolEvent(),
      toolEvent({ argsStatus: 'ok' }),
      toolEvent({ argsStatus: 'repaired' }),
      toolEvent({ name: 'execute_skill', argsStatus: 'invalid', ok: false, errorKind: 'unknown_skill' }),
    ]);
    expect(summary.tools.calls).toBe(4);
    expect(summary.tools.ok).toBe(3);
    expect(summary.tools.successRate).toBeCloseTo(0.75);
    expect(summary.tools.argsOk).toBe(2);
    expect(summary.tools.argsRepaired).toBe(1);
    expect(summary.tools.argsInvalid).toBe(1);
    expect(summary.tools.byName.execute_skill).toEqual({ calls: 1, errors: 1 });
  });

  it('统计重试次数与对话结果分布', () => {
    const summary = summarizeAiMetrics([
      turnEvent({ retries: 0, outcome: 'success' }),
      turnEvent({ sessionId: 's2', retries: 2, outcome: 'partial' }),
      turnEvent({ sessionId: 's2', retries: 1, outcome: 'failed' }),
      roundEvent({ retryIndex: 1 }),
    ]);
    expect(summary.sessions).toBe(2);
    expect(summary.turns).toBe(3);
    expect(summary.turnOutcomes).toEqual({ success: 1, partial: 1, failed: 1 });
    expect(summary.retries.avgPerTurn).toBeCloseTo(1);
    expect(summary.retries.maxPerTurn).toBe(2);
    expect(summary.retries.roundsWithRetry).toBe(1);
  });

  it('延迟只统计成功请求，避免超时值污染分位数', () => {
    const summary = summarizeAiMetrics([
      roundEvent({ latencyMs: 1000 }),
      roundEvent({ latencyMs: 3000 }),
      roundEvent({ latencyMs: 99999, ok: false, errorKind: 'timeout' }),
    ]);
    expect(summary.latency.p50).toBe(1000);
    expect(summary.latency.p95).toBe(3000);
    expect(summary.latency.max).toBe(3000);
  });

  it('统计 token 用量与 prompt 注入体积', () => {
    const summary = summarizeAiMetrics([
      roundEvent({ usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } }),
      roundEvent({
        channel: 'polish',
        promptChars: 2600,
        toolSchemaChars: 0,
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      }),
    ]);
    expect(summary.usage.roundsWithUsage).toBe(2);
    expect(summary.usage.avgPromptTokens).toBe(150);
    expect(summary.usage.avgCompletionTokens).toBe(75);
    expect(summary.usage.totalTokens).toBe(450);
    expect(summary.prompt.avgChars).toBe(1950);
    expect(summary.prompt.schemaRounds).toBe(1);
    expect(summary.prompt.avgToolSchemaChars).toBe(2600);
    expect(summary.channels).toEqual({ chat: 1, polish: 1 });
  });
});

describe('输出', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createFakeStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('estimateTokens 与 moduleUtils 口径一致', () => {
    expect(estimateTokens(13)).toBe(10);
    expect(estimateTokens(0)).toBe(0);
  });

  it('getAiSessionId 在同一次页面加载内保持稳定', () => {
    const first = getAiSessionId();
    expect(first).toBe(getAiSessionId());
    expect(first.length).toBeGreaterThan(0);
  });

  it('readUsage 解析服务商用量字段', () => {
    expect(readUsage({ usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }))
      .toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120 });
  });

  it('readUsage 在字段缺失或全为 0 时返回 undefined', () => {
    expect(readUsage({})).toBeUndefined();
    expect(readUsage(null)).toBeUndefined();
    expect(readUsage({ usage: { prompt_tokens: 0, completion_tokens: 0 } })).toBeUndefined();
  });

  it('readUsage 在缺少 total 时按 prompt+completion 补齐', () => {
    expect(readUsage({ usage: { prompt_tokens: 30, completion_tokens: 12 } }))
      .toEqual({ promptTokens: 30, completionTokens: 12, totalTokens: 42 });
  });

  it('空数据时给出明确提示', () => {
    expect(formatAiMetricsSummary(summarizeAiMetrics([]))).toContain('暂无数据');
  });

  it('文本摘要包含关键指标', () => {
    const text = formatAiMetricsSummary(summarizeAiMetrics([
      roundEvent({ latencyMs: 1200, usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } }),
      toolEvent(),
      turnEvent({ retries: 1, outcome: 'partial' }),
    ]));
    expect(text).toContain('AI 指标摘要');
    expect(text).toContain('成功率 100.0%');
    expect(text).toContain('重试：平均 1.00 次/轮');
    expect(text).toContain('P50 1.20s');
    expect(text).toContain('累计 120');
    expect(text).toContain('按渠道：chat 1');
  });

  it('文本摘要列出失败原因码', () => {
    const text = formatAiMetricsSummary(summarizeAiMetrics([
      roundEvent({ ok: false, errorKind: 'network', errorCode: 'ECONNRESET' }),
      roundEvent({ ok: false, errorKind: 'timeout', errorCode: 'TIMEOUT' }),
    ]));
    expect(text).toContain('失败原因码：');
    expect(text).toContain('ECONNRESET 1');
    expect(text).toContain('TIMEOUT 1');
  });

  it('导出的 JSON 同时包含原始事件与摘要', () => {
    recordAiMetrics([roundEvent(), turnEvent()]);
    const parsed = JSON.parse(exportAiMetricsJson());
    expect(parsed.key).toBe(AI_METRICS_KEY);
    expect(parsed.eventCount).toBe(2);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.summary.rounds).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
  });
});
