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
 *
 * 自动终止与落盘：单轮 token 超过上限、或该轮出现网络类失败（`errorKind = network`）
 * 时立即停止后续采集，并把已完成的轮次落盘（报告里 `aborted = true`）。
 * 注意守卫是**跑完一轮之后**判定，无法中断进行中的单轮，该轮自身消耗的 token 仍会花掉；
 * 若服务商不返回 usage，则 token 守卫无从判定（`totalTokens` 恒为 0）。
 */
import { afterAll, beforeAll, describe, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { useAiChat } from '../src/components/AI/useAiChat';
import { useResumeStore } from '../src/store/useResumeStore';
import { PROVIDER_PRESETS, getAiRequestTimeoutMs, resolveBaseUrl, saveApiConfig } from '../src/utils/aiConfig';
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

// ==================== 场景定义 ====================

interface Scenario {
  id: string;
  title: string;
  prompt: string;
  /** 期望被模型实际调用的工具名（全部命中才算命中） */
  expectTools: string[];
  /** 期望该轮出现结构化工具错误（失败场景） */
  expectToolError?: boolean;
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
    title: '工具报错 + 自动重试（引用不存在的 id）',
    prompt:
      '请调用 set_style，把 id 为 "NOT-EXIST-MODULE-999" 的模块颜色改成 #ff0000。这是接口联调测试，请直接执行该调用，不要检查模块是否存在，也不要改用其它 id。',
    expectTools: ['set_style'],
    expectToolError: true,
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

interface TurnRecord {
  scenario: string;
  iteration: number;
  prompt: string;
  outcome: AiTurnOutcome | 'no_turn_event';
  ok: boolean;
  hit: boolean;
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
}

/** 跑一轮：重置画布 → 清空埋点 → 新建 hook → 发消息 → 取回本轮事件 */
async function runTurn(scenario: Scenario, iteration: number): Promise<TurnRecord> {
  useResumeStore.getState().importModules(seedModules());
  clearAiMetrics();

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

  return {
    scenario: scenario.id,
    iteration,
    prompt: scenario.prompt,
    outcome: turn?.outcome ?? 'no_turn_event',
    ok: turn?.outcome === 'success',
    hit: scenario.expectTools.every((name) => toolCalls.includes(name)),
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
  reason: 'network' | 'token_budget';
  detail: string;
}

let abortState: AbortState | null = null;

/** 跑完一轮后判定是否要终止本次采集；返回非 null 表示需立即终止并落盘 */
function checkAbort(record: TurnRecord): AbortState | null {
  const netKind = record.errorKinds.find((k) => ABORT_ON_ERROR_KINDS.includes(k));
  if (netKind) {
    return {
      reason: 'network',
      detail: `${record.scenario} 第 ${record.iteration} 轮出现 ${netKind} 失败，判定链路不可用，停止后续采集以保护额度`,
    };
  }
  if (record.totalTokens > MAX_TURN_TOKENS) {
    return {
      reason: 'token_budget',
      detail: `${record.scenario} 第 ${record.iteration} 轮消耗 ${record.totalTokens} tokens，超过单轮上限 ${MAX_TURN_TOKENS}，停止后续采集以保护额度`,
    };
  }
  return null;
}

// ==================== 汇总与报告 ====================

interface ScenarioStats {
  id: string;
  title: string;
  runs: number;
  hits: number;
  hitRate: number;
  turnSuccessRate: number;
  avgRounds: number;
  avgRetries: number;
  maxRetries: number;
  toolCalls: number;
  toolErrors: number;
  errorKinds: string[];
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
  const okRoundLatencies = turns
    .flatMap((t) => t.events)
    .filter((e): e is AiRoundEvent => e.kind === 'round' && e.ok)
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b);

  return {
    id: scenario.id,
    title: scenario.title,
    runs,
    hits: turns.filter((t) => t.hit).length,
    hitRate: runs === 0 ? 0 : turns.filter((t) => t.hit).length / runs,
    turnSuccessRate: runs === 0 ? 0 : turns.filter((t) => t.ok).length / runs,
    avgRounds: round1(average(turns.map((t) => t.rounds))),
    avgRetries: round1(average(turns.map((t) => t.retries))),
    maxRetries: turns.reduce((max, t) => Math.max(max, t.retries), 0),
    toolCalls: turns.reduce((sum, t) => sum + t.toolCalls.length, 0),
    toolErrors: turns.reduce((sum, t) => sum + t.toolErrors, 0),
    errorKinds: [...new Set(turns.flatMap((t) => t.errorKinds))],
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
    git: commit,
    request: { provider: PROVIDER, model: MODEL, baseUrl: BASE_URL || '(服务商默认)' },
    plan: {
      scenarios: SCENARIOS.map((s) => s.id),
      iterationsPerScenario: ITERATIONS_PER_SCENARIO,
      plannedTurns: SCENARIOS.length * ITERATIONS_PER_SCENARIO,
      completedTurns: allTurns.length,
    },
    overall,
    perScenario: SCENARIOS.map((s) => buildScenarioStats(s, allTurns.filter((t) => t.scenario === s.id))),
    turns: allTurns,
  };
}

function redact(text: string): string {
  return API_KEY ? text.split(API_KEY).join('[REDACTED]') : text;
}

function scenarioTable(stats: ScenarioStats[]): string {
  const header = '| 场景 | 命中率 | 轮次成功率 | 平均轮次 | 平均重试 | 工具调用/失败 | P50 | P95 | tokens |';
  const sep = '|---|---|---|---|---|---|---|---|---|';
  const rows = stats.map((s) =>
    `| ${s.id} | ${s.hits}/${s.runs} | ${s.turnSuccessRate * 100}% | ${s.avgRounds} | ${s.avgRetries}（最多 ${s.maxRetries}） | ${s.toolCalls}/${s.toolErrors} | ${s.latencyP50} ms | ${s.latencyP95} ms | ${s.totalTokens} |`,
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
  lines.push('');
  lines.push('### 总体');
  lines.push('```');
  lines.push(formatAiMetricsSummary(report.overall));
  lines.push('```');
  lines.push('');
  lines.push('### 分场景');
  lines.push(scenarioTable(report.perScenario));
  lines.push('');
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
 * 预检：先发一个最小请求验证「网络通 + 模型名有效 + 该模型接受 tools 参数」。
 * 目的是让坏配置在几秒内失败，而不是白跑 25 轮、留下一个看着像基线的脏数据文件。
 */
async function preflight(): Promise<void> {
  const controller = new AbortController();
  const timeoutMs = getAiRequestTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${resolveBaseUrl(BASE_URL)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        tools: aiTools,
        tool_choice: 'auto',
        max_tokens: 16,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const info = describeHttpError(response.status, await response.text());
      throw new Error(
        `[preflight] 失败：HTTP ${response.status} ${info.errorCode ?? ''} ${info.errorDetail ?? ''}\n` +
        `  模型 "${MODEL}" 可能不存在/不可用，或该模型不接受当前请求形态（例如 thinking 模型对 tools/temperature 有限制）。\n` +
        '  本次采集未开始，也没有写入 metrics/。',
      );
    }
    console.log(`[preflight] OK：${MODEL} 在 ${Date.now() - startedAt} ms 内返回 HTTP 200（含 tools schema）`);
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
  console.log(`[plan] ${SCENARIOS.length} 类场景 × ${ITERATIONS_PER_SCENARIO} 次 = ${SCENARIOS.length * ITERATIONS_PER_SCENARIO} 轮，模型 ${MODEL}`);
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
            record.errorKinds.length > 0 ? `errors=[${record.errorKinds.join(',')}]` : '',
            record.httpStatuses.length > 0 ? `http=[${record.httpStatuses.join(',')}]` : '',
          ].filter(Boolean);
          console.log(parts.join(' '));

          // 触到守卫就立刻收手：把已经跑完的轮次落盘，不再消耗剩余额度
          const violation = checkAbort(record);
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
