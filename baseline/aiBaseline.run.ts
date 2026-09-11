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
 */
import { afterAll, beforeAll, describe, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { useAiChat } from '../src/components/AI/useAiChat';
import { useResumeStore } from '../src/store/useResumeStore';
import { PROVIDER_PRESETS, saveApiConfig } from '../src/utils/aiConfig';
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

const SCENARIOS: Scenario[] = [
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
  return {
    harness: 'ai-baseline',
    version: 1,
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    finished,
    git: commit,
    request: { provider: PROVIDER, model: MODEL, baseUrl: BASE_URL || '(服务商默认)' },
    plan: {
      scenarios: SCENARIOS.map((s) => s.id),
      iterationsPerScenario: ITERATIONS_PER_SCENARIO,
      plannedTurns: SCENARIOS.length * ITERATIONS_PER_SCENARIO,
      completedTurns: allTurns.length,
    },
    overall: summarizeAiMetrics(allEvents),
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

function flush(finished: boolean): { jsonPath: string; summaryPath: string } {
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

// ==================== 执行 ====================

beforeAll(() => {
  if (!API_KEY) {
    throw new Error(
      '未设置 AI_BASELINE_KEY。请在终端执行：AI_BASELINE_KEY=<你的 Key> npm run ai-baseline',
    );
  }
  saveApiConfig({ provider: PROVIDER, apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL, visionModel: PRESET.visionModel || MODEL });
});

for (const scenario of SCENARIOS) {
  describe(scenario.id, () => {
    it(
      scenario.title,
      async () => {
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
        }
        // 每个场景结束就落盘一次，便于中途 Ctrl+C 也保留已采集数据
        flush(false);
      },
    );
  });
}

afterAll(() => {
  const { jsonPath, summaryPath } = flush(true);
  console.log('');
  console.log(buildSummaryMarkdown(buildReport(true)));
  console.log(`原始数据：${jsonPath}`);
  console.log(`文本摘要：${summaryPath}`);
});
