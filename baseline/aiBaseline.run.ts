/**
 * AI 调用基线采集 harness（`npm run ai-baseline`）
 *
 * 目的：在真实服务商上把固定场景重复跑若干次，采集「轮次成功率 / 重试轮数 /
 * 延迟 P50·P95 / token 消耗」，作为后续任何 AI 链路改动的对比基线。
 *
 * 与 CI 的关系：本文件不在 `vite.config.ts` 的 `test.include`（`src/**\/*.test.ts`）
 * 内，只有显式执行 `npm run ai-baseline`（用 vitest.ai-baseline.config.ts）才会跑，
 * `npm test` / CI 完全不受影响。
 *
 * 安全：API Key 只从环境变量 `AI_BASELINE_KEY` 读取，仅写进本次进程的
 * sessionStorage；落盘前还会把 Key 字符串整体擦除一遍。
 *
 * 环境变量：
 *   AI_BASELINE_KEY        必填，API Key
 *   AI_BASELINE_PROVIDER   选填，默认 aliyun
 *   AI_BASELINE_MODEL      选填，默认取服务商预设（aliyun 为 qwen-max）
 *   AI_BASELINE_BASE_URL   选填，默认取服务商预设
 *   AI_BASELINE_ITERATIONS 选填，每个场景重复次数，默认 5
 *   AI_BASELINE_OUT_DIR    选填，产物目录，默认 metrics
 *   AI_BASELINE_SCENARIOS  选填，逗号分隔的场景 id，只跑指定场景（默认 5 类全跑）
 *   AI_BASELINE_MAX_TURN_TOKENS 选填，单轮 token 上限，超过即自动终止，默认 30000
 *   AI_BASELINE_MAX_TOTAL_TOKENS 选填，本次采集累计 token 上限，超过即终止并落盘；
 *                          默认 0 ＝ 不限制（显式设置才算开启，与「预算上限由老板确认」一致）
 *
 * 自动终止与落盘：单轮 token 超过上限、或该轮出现网络类失败（`errorKind = network`）
 * 时立即停止后续采集，并把已完成的轮次落盘（报告里 `aborted = true`）。
 * 注意守卫是**跑完一轮之后**判定，无法中断进行中的单轮，该轮自身消耗的 token 仍会花掉；
 * 若服务商不返回 usage，则 token 守卫无从判定（`totalTokens` 恒为 0）。
 *
 * 报告标记（三者独立，互不替代）：
 *   `aborted`    采集被守卫终止（单轮 token / 累计 token / 网络类失败）
 *   `suspect`    传输层失败占比 > 20%，数据受网络污染
 *   `incomplete` 有场景的有效轮数为 0（或没跑满计划轮次），例如某场景 5 轮全部断线
 */
import { afterAll, beforeAll, describe, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildChatRequestBody, isUploadTurn, useAiChat } from '../src/components/AI/useAiChat';
import { useResumeStore } from '../src/store/useResumeStore';
import {
  PROVIDER_PRESETS,
  getAiRequestTimeoutMs,
  getProviderQuirks,
  resolveBaseUrl,
  saveApiConfig,
} from '../src/utils/aiConfig';
import { aiTools } from '../src/engine/aiPrompt';
import { describeFetchError, describeHttpError } from '../src/components/AI/aiApi';
import {
  clearAiMetrics,
  formatAiMetricsSummary,
  getAiMetrics,
  summarizeAiMetrics,
  type AiMetricEvent,
  type AiMetricsSummary,
  type AiRoundEvent,
  type AiToolEvent,
  type AiTurnEvent,
  type AiTurnOutcome,
} from '../src/utils/aiMetrics';
import type { ResumeModule } from '../src/types/resume';

// ==================== 运行参数 ====================

const ITERATIONS = Number(process.env.AI_BASELINE_ITERATIONS || 5);
const ITERATIONS_PER_SCENARIO = Number.isFinite(ITERATIONS) && ITERATIONS > 0 ? ITERATIONS : 5;
const OUT_DIR = process.env.AI_BASELINE_OUT_DIR || 'metrics';
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const API_KEY = process.env.AI_BASELINE_KEY || '';
const PROVIDER = process.env.AI_BASELINE_PROVIDER || 'aliyun';
const PRESET = PROVIDER_PRESETS[PROVIDER] ?? PROVIDER_PRESETS.custom;
const MODEL = process.env.AI_BASELINE_MODEL || PRESET.model || 'qwen-plus';
const BASE_URL = process.env.AI_BASELINE_BASE_URL ?? PRESET.baseUrl;
const PREFLIGHT_ENABLED = process.env.AI_BASELINE_PREFLIGHT !== '0';
/** 传输层失败占比超过该值就认为这次采集被网络污染，不能用于正式对比 */
const SUSPECT_TRANSPORT_RATIO = 0.2;
/** 逗号分隔的场景 id 白名单；为空表示 5 类场景全跑 */
const SCENARIOS_FILTER = (process.env.AI_BASELINE_SCENARIOS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/** 单轮 token 上限：超过就自动终止，避免在被网络/坏场景卡住时白烧额度 */
const MAX_TURN_TOKENS = ((): number => {
  const raw = Number(process.env.AI_BASELINE_MAX_TURN_TOKENS || 30000);
  return Number.isFinite(raw) && raw > 0 ? raw : 30000;
})();
/**
 * 本次采集累计 token 上限（`P0.2` 第 6 项）。
 * 默认 0 ＝ 不限制：这个值应当等于老板当场确认的预算上限，只能由人显式设置，
 * 悄悄给个默认值会让「预算上限」这条红线形同虚设。
 */
const MAX_TOTAL_TOKENS = ((): number => {
  const raw = Number(process.env.AI_BASELINE_MAX_TOTAL_TOKENS || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
})();

// ==================== 场景定义 ====================

interface Scenario {
  id: string;
  title: string;
  prompt: string;
  /** 期望被模型实际调用的工具名（全部命中才算命中） */
  expectTools: string[];
  /** 期望在工具结果里出现的结构化错误码（命中任一即算命中；报告里另记实际观察到的码） */
  expectErrorCodes?: string[];
}

const ALL_SCENARIOS: Scenario[] = [
  {
    id: 'generate-resume',
    title: '整份生成（execute_skill → generate-resume）',
    prompt:
      '请直接调用 execute_skill（name 为 "generate-resume"，params 里 template 用 "simple"），一键生成一份完整简历模板。请立刻执行，不要先询问我。',
    expectTools: ['execute_skill'],
  },
  {
    id: 'add_module',
    title: '新增模块（add_module）',
    prompt:
      '请在画布末尾新增一个模块：title 为「专业技能」，styleId 用 "module-card"，content 为 "<p>Java、Python、C++、数据结构与算法、计算机网络</p>"。请直接执行，不要询问。',
    expectTools: ['add_module'],
  },
  {
    id: 'set_content',
    title: '修改内容（set_content）',
    prompt:
      '请调用 set_content，把 id 为 "seed-text-edu" 的模块内容改为 "<p>清华大学 · 计算机科学与技术 · 本科（2022-2026）</p>"。请直接执行，不要询问。',
    expectTools: ['set_content'],
  },
  {
    id: 'set_style',
    title: '修改样式（set_style）',
    prompt:
      '请调用 set_style，把 id 为 "seed-text-exp" 的模块字号设为 15px、颜色设为 #334155。请直接执行，不要询问。',
    expectTools: ['set_style'],
  },
  {
    id: 'tool-error-retry',
    title: '工具报错 + 自动重试（模块存在但参数类型不对）',
    // 旧写法要求模型拿「不存在的 id」调 set_style，glm-5.2 / deepseek 会直接拒绝这种
    // 语义上不可能的调用（命中率 0/3），量不到「工具报错 → 结构化错误 → 自愈」这条链。
    // 改成同样确定会报错、但语义上可行的输入：id 真实存在，只有参数类型不对
    // （style 要对象却传字符串）⇒ handler 返回 EMPTY_STYLE。
    prompt:
      '这是一次异常参数联调测试：请调用 set_style，把 id 为 "seed-text-exp" 的模块的 style 参数传成字符串 "fontSize:15px"（故意传错类型，不要改成对象，也不要补全成合法样式）。请直接执行该调用，不要先询问我。',
    expectTools: ['set_style'],
    expectErrorCodes: ['EMPTY_STYLE'],
  },
];

/** 实际要跑的场景：按 `AI_BASELINE_SCENARIOS` 过滤，未设置时等于全量 */
const SCENARIOS: Scenario[] = SCENARIOS_FILTER.length === 0
  ? ALL_SCENARIOS
  : ALL_SCENARIOS.filter((s) => SCENARIOS_FILTER.includes(s.id));

// 场景名校验必须在模块顶层做：写在 beforeAll 里的话，场景全写错时一个 describe 都注册不上，
// vitest 只会报一句 "No test suite found"，看不出真正原因
const UNKNOWN_SCENARIOS = SCENARIOS_FILTER.filter((id) => !ALL_SCENARIOS.some((s) => s.id === id));
if (UNKNOWN_SCENARIOS.length > 0) {
  throw new Error(
    `AI_BASELINE_SCENARIOS 含未知场景：${UNKNOWN_SCENARIOS.join('、')}\n` +
    `  可选值：${ALL_SCENARIOS.map((s) => s.id).join('、')}`,
  );
}

// ==================== 画布种子 ====================

/** 固定 id 的种子画布：保证每轮的 system prompt（当前画布）完全一致 */
function seedModules(): ResumeModule[] {
  return [
    {
      id: 'seed-mod-edu',
      type: 'module',
      styleId: 'module-card',
      title: '教育背景',
      children: [
        { id: 'seed-head-edu', type: 'heading', content: '教育背景', children: [] },
        { id: 'seed-text-edu', type: 'text', content: '<p>某大学 · 计算机科学与技术 · 本科</p>', children: [] },
      ],
    },
    {
      id: 'seed-mod-exp',
      type: 'module',
      styleId: 'module-card',
      title: '工作经历',
      children: [
        { id: 'seed-head-exp', type: 'heading', content: '工作经历', children: [] },
        { id: 'seed-text-exp', type: 'text', content: '<p>某公司 · 后端开发实习生</p>', children: [] },
      ],
    },
  ];
}

// ==================== 单轮采集 ====================

// ---------------- 结构化工具错误码观察 ----------------

/**
 * 结构化工具错误码（如 `EMPTY_STYLE` / `INVALID_ARGS`）只出现在「回传给模型的 tool 消息」
 * 里，埋点事件（`AiToolEvent`）没有这个字段；而 `P0.2` 第 8 项要求把 `expectToolError`
 * 细化为**期望错误码**。这里用一层 fetch 观察者把它捞出来：只读 `role: 'tool'` 消息 content
 * 里的 `error` 字段，**不保存 prompt、正文或 Key**，也不改动请求与响应。
 */
const observedToolErrorCodes: string[] = [];

function collectToolErrorCodes(body: unknown): void {
  if (typeof body !== 'string') return;
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return; }
  const messages = (parsed as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return;
  for (const message of messages) {
    const msg = message as { role?: unknown; content?: unknown };
    if (msg.role !== 'tool' || typeof msg.content !== 'string') continue;
    try {
      const result = JSON.parse(msg.content) as { error?: unknown };
      if (typeof result.error === 'string' && result.error && !observedToolErrorCodes.includes(result.error)) {
        observedToolErrorCodes.push(result.error);
      }
    } catch { /* 非 JSON 的工具结果（如 execute_skill 的纯文本摘要）没有错误码，跳过 */ }
  }
}

function installFetchObserver(): void {
  const original = globalThis.fetch;
  if (typeof original !== 'function') return;
  const patched = ((input: Parameters<typeof original>[0], init?: Parameters<typeof original>[1]) => {
    collectToolErrorCodes(init?.body);
    return original(input, init);
  }) as typeof original;
  globalThis.fetch = patched;
}
installFetchObserver();

interface TurnRecord {
  scenario: string;
  iteration: number;
  prompt: string;
  outcome: AiTurnOutcome | 'no_turn_event';
  ok: boolean;
  hit: boolean;
  /** 该轮工具结果里实际出现的结构化错误码（去重） */
  toolErrorCodes: string[];
  /** 是否命中 `scenario.expectErrorCodes` 中的至少一个码 */
  hitExpectedError: boolean;
  rounds: number;
  retries: number;
  toolCalls: string[];
  toolErrors: number;
  errorKinds: string[];
  httpStatuses: number[];
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  roundsWithUsage: number;
  events: AiMetricEvent[];
  /** 该轮是否「有效」：至少有一次成功的 HTTP 请求（服务商真的答了话） */
  valid: boolean;
}

/** 跑一轮：重置画布 → 清空埋点 → 新建 hook → 发消息 → 取回本轮事件 */
async function runTurn(scenario: Scenario, iteration: number): Promise<TurnRecord> {
  useResumeStore.getState().importModules(seedModules());
  clearAiMetrics();
  observedToolErrorCodes.length = 0;

  const { result, unmount } = renderHook(useAiChat);
  try {
    await act(async () => {
      await result.current.handleSend(scenario.prompt);
    });
  } finally {
    unmount();
  }

  const events = getAiMetrics();
  const roundEvents = events.filter((e): e is AiRoundEvent => e.kind === 'round');
  const toolEvents = events.filter((e): e is AiToolEvent => e.kind === 'tool');
  const turnEvents = events.filter((e): e is AiTurnEvent => e.kind === 'turn');
  const turn = turnEvents.length > 0 ? turnEvents[turnEvents.length - 1] : undefined;

  const toolCalls = toolEvents.map((t) => t.name);
  const usedRounds = roundEvents.filter((r) => r.usage);
  const totalTokens = usedRounds.reduce((sum, r) => sum + (r.usage?.totalTokens ?? 0), 0);
  const toolErrorCodes = [...observedToolErrorCodes];
  const expectErrorCodes = scenario.expectErrorCodes ?? [];

  return {
    scenario: scenario.id,
    iteration,
    prompt: scenario.prompt,
    outcome: turn?.outcome ?? 'no_turn_event',
    ok: turn?.outcome === 'success',
    hit: scenario.expectTools.every((name) => toolCalls.includes(name)),
    toolErrorCodes,
    hitExpectedError: expectErrorCodes.length > 0 && expectErrorCodes.some((code) => toolErrorCodes.includes(code)),
    rounds: turn?.rounds ?? roundEvents.length,
    retries: turn?.retries ?? 0,
    toolCalls,
    toolErrors: turn?.toolErrors ?? toolEvents.filter((t) => !t.ok).length,
    errorKinds: [...new Set(roundEvents.filter((r) => !r.ok).map((r) => r.errorKind ?? 'unknown'))],
    httpStatuses: [...new Set(roundEvents.map((r) => r.httpStatus).filter((s): s is number => typeof s === 'number'))],
    latencyMs: turn?.latencyMs ?? 0,
    promptTokens: usedRounds.reduce((sum, r) => sum + (r.usage?.promptTokens ?? 0), 0),
    completionTokens: usedRounds.reduce((sum, r) => sum + (r.usage?.completionTokens ?? 0), 0),
    totalTokens,
    roundsWithUsage: usedRounds.length,
    events,
    valid: roundEvents.some((r) => r.ok),
  };
}

// ==================== 自动终止守卫 ====================

/**
 * 触发即终止的错误类型。只列 `network`（连不上 / 连接被重置 / 连接超时）：
 * 继续跑只会重复白烧额度。
 *
 * 刻意**不列 `timeout`**：`set_style` 这类场景按设计就会以单请求超时收尾，
 * 把它也算进来会让这些场景永远采不到数据。
 */
const ABORT_ON_ERROR_KINDS = ['network'];

interface AbortState {
  reason: 'network' | 'turn_token_budget' | 'total_token_budget';
  detail: string;
}

let abortState: AbortState | null = null;

/**
 * 跑完一轮后判定是否要终止本次采集；返回非 null 表示需立即终止并落盘。
 * `cumulativeTokens` 是含本轮在内的累计消耗，用于总额度守卫（`P0.2` 第 6 项）。
 */
function checkAbort(record: TurnRecord, cumulativeTokens: number): AbortState | null {
  const netKind = record.errorKinds.find((k) => ABORT_ON_ERROR_KINDS.includes(k));
  if (netKind) {
    return {
      reason: 'network',
      detail: `${record.scenario} 第 ${record.iteration} 轮出现 ${netKind} 失败，判定链路不可用，停止后续采集以保护额度`,
    };
  }
  if (record.totalTokens > MAX_TURN_TOKENS) {
    return {
      reason: 'turn_token_budget',
      detail: `${record.scenario} 第 ${record.iteration} 轮消耗 ${record.totalTokens} tokens，超过单轮上限 ${MAX_TURN_TOKENS}，停止后续采集以保护额度`,
    };
  }
  if (MAX_TOTAL_TOKENS > 0 && cumulativeTokens > MAX_TOTAL_TOKENS) {
    return {
      reason: 'total_token_budget',
      detail: `累计消耗 ${cumulativeTokens} tokens 超过本次上限 ${MAX_TOTAL_TOKENS}（老板确认的预算），停止后续采集并落盘已完成轮次`,
    };
  }
  return null;
}

// ==================== 汇总与报告 ====================

interface ScenarioStats {
  id: string;
  title: string;
  runs: number;
  /** 有效轮数：至少有一次成功 HTTP 请求的轮次（服务商真的答了话） */
  validTurns: number;
  hits: number;
  hitRate: number;
  turnSuccessRate: number;
  avgRounds: number;
  avgRetries: number;
  maxRetries: number;
  toolCalls: number;
  toolErrors: number;
  errorKinds: string[];
  /** 该场景声明的期望结构化错误码（无则为空数组） */
  expectErrorCodes: string[];
  /** 命中期望错误码的轮次数 */
  errorCodeHits: number;
  /** 实际观察到的结构化错误码（去重） */
  observedErrorCodes: string[];
  /** 有效轮数为 0 或没跑满计划轮次 ⇒ 该场景数据不完整 */
  incomplete: boolean;
  latencyP50: number;
  latencyP95: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  roundsWithUsage: number;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[index];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildScenarioStats(scenario: Scenario, turns: TurnRecord[]): ScenarioStats {
  const runs = turns.length;
  const validTurns = turns.filter((t) => t.valid).length;
  const expectErrorCodes = scenario.expectErrorCodes ?? [];
  const okRoundLatencies = turns
    .flatMap((t) => t.events)
    .filter((e): e is AiRoundEvent => e.kind === 'round' && e.ok)
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b);

  return {
    id: scenario.id,
    title: scenario.title,
    runs,
    validTurns,
    hits: turns.filter((t) => t.hit).length,
    hitRate: runs === 0 ? 0 : turns.filter((t) => t.hit).length / runs,
    turnSuccessRate: runs === 0 ? 0 : turns.filter((t) => t.ok).length / runs,
    avgRounds: round1(average(turns.map((t) => t.rounds))),
    avgRetries: round1(average(turns.map((t) => t.retries))),
    maxRetries: turns.reduce((max, t) => Math.max(max, t.retries), 0),
    toolCalls: turns.reduce((sum, t) => sum + t.toolCalls.length, 0),
    toolErrors: turns.reduce((sum, t) => sum + t.toolErrors, 0),
    errorKinds: [...new Set(turns.flatMap((t) => t.errorKinds))],
    expectErrorCodes,
    errorCodeHits: expectErrorCodes.length === 0 ? 0 : turns.filter((t) => t.hitExpectedError).length,
    observedErrorCodes: [...new Set(turns.flatMap((t) => t.toolErrorCodes))],
    incomplete: runs < ITERATIONS_PER_SCENARIO || validTurns === 0,
    latencyP50: Math.round(percentile(okRoundLatencies, 0.5)),
    latencyP95: Math.round(percentile(okRoundLatencies, 0.95)),
    promptTokens: turns.reduce((sum, t) => sum + t.promptTokens, 0),
    completionTokens: turns.reduce((sum, t) => sum + t.completionTokens, 0),
    totalTokens: turns.reduce((sum, t) => sum + t.totalTokens, 0),
    roundsWithUsage: turns.reduce((sum, t) => sum + t.roundsWithUsage, 0),
  };
}

/** 直接读 .git 目录取 commit：vitest worker 里 spawn git 不一定可用，这里做兜底 */
function readCommitFromFiles(): string | null {
  try {
    const gitDir = join(process.cwd(), '.git');
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head.slice(0, 7) || null;
    const ref = head.slice(5).trim();
    try {
      return readFileSync(join(gitDir, ref), 'utf8').trim().slice(0, 7) || null;
    } catch {
      const packed = readFileSync(join(gitDir, 'packed-refs'), 'utf8');
      const line = packed.split('\n').find((l) => l.endsWith(` ${ref}`));
      return line ? line.slice(0, 7) : null;
    }
  } catch {
    return null;
  }
}

function gitInfo(): { commit: string; dirty: boolean | null } {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    return { commit, dirty };
  } catch {
    return { commit: readCommitFromFiles() ?? 'unknown', dirty: null };
  }
}

const allTurns: TurnRecord[] = [];

interface BaselineReport {
  harness: 'ai-baseline';
  version: number;
  runId: string;
  generatedAt: string;
  finished: boolean;
  /** 触发自动终止条件时为 true：计划没跑满，数据不完整 */
  aborted: boolean;
  abortReason?: string;
  abortDetail?: string;
  /** 传输层失败占比过高时为 true：本次数据受网络污染，不要用于正式对比 */
  suspect: boolean;
  suspectReason?: string;
  /**
   * 有场景的有效轮数为 0（或没跑满计划轮次）时为 true。
   * 与 `aborted` / `suspect` **三者独立**：`2fb9652` 那轮传输失败占比 15.8% 未触发
   * `suspect`，但 `add_module` 实际 0 条数据 —— 单看总比例会漏掉「某个场景全废」。
   */
  incomplete: boolean;
  incompleteReason?: string;
  incompleteScenarios: string[];
  /** 本次生效的额度守卫（0 ＝ 不限制） */
  limits: { maxTurnTokens: number; maxTotalTokens: number };
  git: { commit: string; dirty: boolean | null };
  request: { provider: string; model: string; baseUrl: string };
  plan: { scenarios: string[]; iterationsPerScenario: number; plannedTurns: number; completedTurns: number };
  overall: AiMetricsSummary;
  perScenario: ScenarioStats[];
  turns: TurnRecord[];
}

function buildReport(finished: boolean): BaselineReport {
  const commit = gitInfo();
  const allEvents = allTurns.flatMap((t) => t.events);
  const overall = summarizeAiMetrics(allEvents);
  const roundEvents = allEvents.filter((e): e is AiRoundEvent => e.kind === 'round');
  const transportFailures = roundEvents.filter((r) => !r.ok && (r.errorKind === 'network' || r.errorKind === 'timeout')).length;
  const transportRatio = roundEvents.length === 0 ? 0 : transportFailures / roundEvents.length;
  const suspect = roundEvents.length > 0 && transportRatio > SUSPECT_TRANSPORT_RATIO;
  const perScenario = SCENARIOS.map((s) => buildScenarioStats(s, allTurns.filter((t) => t.scenario === s.id)));
  const incompleteScenarios = perScenario.filter((s) => s.incomplete).map((s) => s.id);
  const incomplete = incompleteScenarios.length > 0;
  const plannedTurns = SCENARIOS.length * ITERATIONS_PER_SCENARIO;
  return {
    harness: 'ai-baseline',
    version: 1,
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    finished,
    aborted: abortState !== null,
    ...(abortState ? { abortReason: abortState.reason, abortDetail: abortState.detail } : {}),
    suspect,
    ...(suspect
      ? { suspectReason: `传输层失败 ${transportFailures}/${roundEvents.length}（${Math.round(transportRatio * 100)}%）超过 ${SUSPECT_TRANSPORT_RATIO * 100}%，本次数据不适合作为正式对比基线` }
      : {}),
    incomplete,
    ...(incomplete
      ? {
          incompleteReason:
            `以下场景不完整（有效轮数为 0，或未跑满 ${ITERATIONS_PER_SCENARIO} 轮）：${incompleteScenarios.join('、')}` +
            `；计划 ${plannedTurns} 轮，实际完成 ${allTurns.length} 轮。这些场景的数据不得单独引用。`,
        }
      : {}),
    incompleteScenarios,
    limits: { maxTurnTokens: MAX_TURN_TOKENS, maxTotalTokens: MAX_TOTAL_TOKENS },
    git: commit,
    request: { provider: PROVIDER, model: MODEL, baseUrl: BASE_URL || '(服务商默认)' },
    plan: {
      scenarios: SCENARIOS.map((s) => s.id),
      iterationsPerScenario: ITERATIONS_PER_SCENARIO,
      plannedTurns,
      completedTurns: allTurns.length,
    },
    overall,
    perScenario,
    turns: allTurns,
  };
}

function redact(text: string): string {
  return API_KEY ? text.split(API_KEY).join('[REDACTED]') : text;
}

function scenarioTable(stats: ScenarioStats[]): string {
  const header = '| 场景 | 有效轮 | 命中率 | 轮次成功率 | 平均轮次 | 平均重试 | 工具调用/失败 | P50 | P95 | tokens |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|';
  const rows = stats.map((s) =>
    `| ${s.id} | ${s.validTurns}/${s.runs} | ${s.hits}/${s.runs} | ${s.turnSuccessRate * 100}% | ${s.avgRounds} | ${s.avgRetries}（最多 ${s.maxRetries}） | ${s.toolCalls}/${s.toolErrors} | ${s.latencyP50} ms | ${s.latencyP95} ms | ${s.totalTokens} |`,
  );
  return [header, sep, ...rows].join('\n');
}

function buildSummaryMarkdown(report: BaselineReport): string {
  const lines: string[] = [];
  lines.push(`## AI 调用基线（${report.runId}）`);
  lines.push('');
  lines.push('- 采集时间：' + report.generatedAt);
  const dirtyNote = report.git.dirty === null ? '（工作区状态未知）' : report.git.dirty ? '（工作区有未提交改动）' : '';
  lines.push(`- 代码版本：\`${report.git.commit}\`${dirtyNote}`);
  lines.push(`- 服务商/模型：${report.request.provider} / ${report.request.model}（baseUrl: ${report.request.baseUrl}）`);
  lines.push(`- 规模：${report.perScenario.length} 类场景 × ${report.plan.iterationsPerScenario} 次 = 计划 ${report.plan.plannedTurns} 轮，实际完成 ${report.plan.completedTurns} 轮`);
  if (report.aborted) {
    lines.push(`- ⛔ **本次采集被自动终止（${report.abortReason}）**：${report.abortDetail}`);
    lines.push('  后续场景未采集，本文件只包含已完成轮次的数据。');
  }
  if (report.suspect) {
    lines.push(`- ⚠️ **本次数据受网络污染，不能作为正式对比基线**：${report.suspectReason}`);
  }
  if (report.incomplete) {
    lines.push(`- ⚠️ **本次数据不完整（与 aborted / suspect 独立）**：${report.incompleteReason}`);
  }
  lines.push(
    `- 额度守卫：单轮 ${report.limits.maxTurnTokens} tokens / ` +
    (report.limits.maxTotalTokens > 0
      ? `累计 ${report.limits.maxTotalTokens} tokens`
      : '累计不限制（未设 `AI_BASELINE_MAX_TOTAL_TOKENS`）'),
  );
  lines.push('');
  lines.push('### 总体');
  lines.push('```');
  lines.push(formatAiMetricsSummary(report.overall));
  lines.push('```');
  lines.push('');
  lines.push('### 分场景');
  lines.push(scenarioTable(report.perScenario));
  lines.push('');
  const withExpectedErrors = report.perScenario.filter((s) => s.expectErrorCodes.length > 0);
  if (withExpectedErrors.length > 0) {
    lines.push('### 结构化工具错误（期望错误码）');
    lines.push('');
    lines.push('| 场景 | 期望错误码 | 命中轮次 | 实际观察到的错误码 |');
    lines.push('|---|---|---|---|');
    for (const s of withExpectedErrors) {
      lines.push(
        `| ${s.id} | ${s.expectErrorCodes.join(' / ')} | ${s.errorCodeHits}/${s.runs} | ` +
        `${s.observedErrorCodes.length > 0 ? s.observedErrorCodes.join(' / ') : '（无）'} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

function flush(finished: boolean): { jsonPath: string; summaryPath: string } | null {
  // 一轮都没采到（预检失败、模型 400 全废、被中断）时不落盘，避免污染 metrics/
  if (allTurns.length === 0) return null;
  const outDir = resolve(process.cwd(), OUT_DIR);
  mkdirSync(outDir, { recursive: true });
  const report = buildReport(finished);
  const summary = buildSummaryMarkdown(report);
  const jsonPath = join(outDir, `ai-baseline-${RUN_ID}.json`);
  const summaryPath = join(outDir, `ai-baseline-${RUN_ID}.summary.md`);
  writeFileSync(jsonPath, redact(JSON.stringify(report, null, 2)), 'utf8');
  writeFileSync(summaryPath, redact(summary), 'utf8');
  return { jsonPath, summaryPath };
}

/**
 * 预检请求体：**与浏览器链路共用同一个 `buildChatRequestBody` 开关**（`P0.2` 第 5 项）。
 *
 * 历史上 harness 自己写死 `tool_choice:'auto'`，而产品侧已按服务商 quirks 决定「发不发该字段」，
 * 于是官方端点下 harness 与真实链路形状不一致（DeepSeek 官端会直接 400，采不到数据）。
 * 这里不再手写任何字段：`isUpload` 也用产品同一个 `isUploadTurn` 推导。
 */
function buildPreflightBody(): { body: Record<string, unknown>; toolChoiceNote: string } {
  const messages = [{ role: 'user', content: 'ping' }];
  const body = buildChatRequestBody({
    model: MODEL,
    messages,
    tools: aiTools,
    isUpload: isUploadTurn(messages),
    quirks: getProviderQuirks(PROVIDER),
  });
  const toolChoiceNote = 'tool_choice' in body ? `tool_choice=${String(body.tool_choice)}` : 'tool_choice=(不发该字段)';
  return { body: { ...body, max_tokens: 16 }, toolChoiceNote };
}

/** 预检失败时按服务商 `error.code` / 原文分流提示（`P0.2` 第 6 项） */
function preflightFailureHint(status: number, errorCode: string, errorDetail: string): string {
  const haystack = `${errorCode} ${errorDetail}`.toLowerCase();
  if (haystack.includes('quota') || haystack.includes('balance') || haystack.includes('insufficient')) {
    return '  判定：该账号额度不足（例如仅剩免费额度）—— 请换渠道或充值后重跑，不要靠改模型名绕开。';
  }
  if (status === 401 || haystack.includes('api_key') || haystack.includes('authentication')) {
    return '  判定：Key 无效，或该 Key 与当前渠道不匹配（两本账）—— 检查 AI_BASELINE_KEY 与 AI_BASELINE_PROVIDER/BASE_URL 是否同源。';
  }
  if (haystack.includes('thinking') || haystack.includes('tool_choice')) {
    return '  判定：该档位不接受当前请求形状（如「思考模式 + 显式 tool_choice」）—— 检查 src/utils/aiConfig.ts 的服务商 quirks 是否配对。';
  }
  if (status === 404 || haystack.includes('model_not_found') || haystack.includes('does not exist')) {
    return `  判定：模型 "${MODEL}" 或端点路径不对 —— 检查 AI_BASELINE_MODEL 与 AI_BASELINE_BASE_URL。`;
  }
  if (status === 400) {
    return '  判定：请求形态被拒（400）—— 先看上面 error 原文；若提到 tools/temperature，检查该档位是否支持 function calling。';
  }
  return '  判定：未知错误 —— 把上面的 HTTP 状态与 error 原文原样报给老板，不要自行改配置重试。';
}

/**
 * 预检：先发一个最小请求验证「网络通 + 模型名有效 + 该模型接受 tools 参数」。
 * 目的是让坏配置在几秒内失败，而不是白跑 25 轮、留下一个看着像基线的脏数据文件。
 */
async function preflight(): Promise<void> {
  const controller = new AbortController();
  const timeoutMs = getAiRequestTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const { body, toolChoiceNote } = buildPreflightBody();
  try {
    const response = await fetch(`${resolveBaseUrl(BASE_URL)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const info = describeHttpError(response.status, await response.text());
      throw new Error(
        `[preflight] 失败：HTTP ${response.status} error.code=${info.errorCode ?? '(无)'} ${info.errorDetail ?? ''}\n` +
        preflightFailureHint(response.status, info.errorCode ?? '', info.errorDetail ?? '') + '\n' +
        '  本次采集未开始，也没有写入 metrics/。',
      );
    }
    console.log(
      `[preflight] OK：${PROVIDER}/${MODEL} 在 ${Date.now() - startedAt} ms 内返回 HTTP 200（含 tools schema；${toolChoiceNote}）`,
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `[preflight] 超时：${timeoutMs} ms 内没有响应，网络很可能不可用。\n` +
        '  本次采集未开始，也没有写入 metrics/。请换稳定网络后重跑。',
        { cause: err },
      );
    }
    if (err instanceof Error && err.message.startsWith('[preflight]')) throw err;
    const info = describeFetchError(err);
    throw new Error(
      `[preflight] 网络失败：${info.errorCode ?? 'unknown'} ${info.errorDetail ?? ''}\n` +
      '  本次采集未开始，也没有写入 metrics/。请换稳定网络后重跑。',
      { cause: err },
    );
  } finally {
    clearTimeout(timer);
  }
}

// ==================== 执行 ====================

beforeAll(async () => {
  if (!API_KEY) {
    throw new Error(
      '未设置 AI_BASELINE_KEY。请在终端执行：AI_BASELINE_KEY=<你的 Key> npm run ai-baseline',
    );
  }
  saveApiConfig({ provider: PROVIDER, apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL, visionModel: PRESET.visionModel || MODEL });
  if (PREFLIGHT_ENABLED) {
    await preflight();
  }
  console.log(
    `[plan] ${SCENARIOS.length} 类场景 × ${ITERATIONS_PER_SCENARIO} 次 = ${SCENARIOS.length * ITERATIONS_PER_SCENARIO} 轮，模型 ${MODEL}` +
    `；守卫：单轮 ${MAX_TURN_TOKENS} tokens / ` +
    (MAX_TOTAL_TOKENS > 0 ? `累计 ${MAX_TOTAL_TOKENS} tokens` : '累计不限制（未设 AI_BASELINE_MAX_TOTAL_TOKENS）'),
  );
});

for (const scenario of SCENARIOS) {
  describe(scenario.id, () => {
    it(
      scenario.title,
      async () => {
        if (abortState) {
          console.log(`[${scenario.id}] 跳过：本次采集已终止（${abortState.reason}）`);
          return;
        }
        for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i += 1) {
          const record = await runTurn(scenario, i);
          allTurns.push(record);
          const parts = [
            `[${scenario.id} ${i}/${ITERATIONS_PER_SCENARIO}]`,
            `outcome=${record.outcome}`,
            `hit=${record.hit}`,
            `rounds=${record.rounds}`,
            `retries=${record.retries}`,
            `tools=[${record.toolCalls.join(',')}]`,
            `latency=${record.latencyMs}ms`,
            `tokens=${record.totalTokens}`,
            record.toolErrorCodes.length > 0 ? `toolErrorsCodes=[${record.toolErrorCodes.join(',')}]` : '',
            record.errorKinds.length > 0 ? `errors=[${record.errorKinds.join(',')}]` : '',
            record.httpStatuses.length > 0 ? `http=[${record.httpStatuses.join(',')}]` : '',
          ].filter(Boolean);
          console.log(parts.join(' '));

          // 触到守卫就立刻收手：把已经跑完的轮次落盘，不再消耗剩余额度
          const cumulativeTokens = allTurns.reduce((sum, t) => sum + t.totalTokens, 0);
          const violation = checkAbort(record, cumulativeTokens);
          if (violation) {
            abortState = violation;
            const paths = flush(false);
            console.log(`[abort] 触发终止条件（${violation.reason}）：${violation.detail}`);
            console.log(`[abort] 已停止采集，落盘 ${allTurns.length} 轮${paths ? `：${paths.jsonPath}` : ''}`);
            return;
          }
        }
        // 每个场景结束就落盘一次，便于中途 Ctrl+C 也保留已采集数据
        flush(false);
      },
    );
  });
}

afterAll(() => {
  // 被守卫终止时不算「跑完」：finished 保持 false，避免下游把它当完整基线
  const completed = abortState === null;
  const paths = flush(completed);
  if (!paths) {
    console.log('本次没有采集到任何数据（预检失败或全部轮次未完成），未写入 metrics/。');
    return;
  }
  console.log('');
  console.log(buildSummaryMarkdown(buildReport(completed)));
  console.log(`原始数据：${paths.jsonPath}`);
  console.log(`文本摘要：${paths.summaryPath}`);
});
