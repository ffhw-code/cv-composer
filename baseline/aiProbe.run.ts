/**
 * DeepSeek 官方端点「请求形状」探针（TASK-014-I）
 *
 * 目的：浏览器侧用 DeepSeek 官方端点（`api.deepseek.com`）时收到
 *   `400 {"error":{"message":"Thinking mode does not support this tool_choice"}}`。
 * 本探针用**最小请求**逐项打点，确定「官方端点下哪种请求形状可用」，供 TASK-015 实现，
 * 并回答「该档位是否支持图片输入」。每种形状只打 1 次，出现 4xx 不重试。
 *
 * 与 `baseline/aiBaseline.run.ts` 的关系（刻意不另造一套）：
 *   - 环境变量语义一致：`AI_BASELINE_KEY` / `AI_BASELINE_MODEL` / `AI_BASELINE_BASE_URL` /
 *     `AI_BASELINE_OUT_DIR` / `AI_BASELINE_MAX_TURN_TOKENS`（单轮 token 守卫）；
 *   - `tools` 直接复用 `src/engine/aiPrompt.ts` 的 `aiTools`（与真实链路同一份 schema）；
 *   - 端点解析复用 `src/utils/aiConfig` 的 `resolveBaseUrl` / `PROVIDER_PRESETS`；
 *   - 超时复用 `getAiRequestTimeoutMs()`；错误归因复用 `describeHttpError` / `describeFetchError`；
 *   - 落盘卫生一致：未设 Key 直接失败不落盘；传输层全失败不落盘；Key 字符串整体脱敏。
 *   唯一差异：**不经 React hook**。`useAiChat` 内部写死 `tool_choice`（`src/components/AI/useAiChat.ts:150`），
 *   无法表达「整个字段不发」与「thinking 开关」等形状——这些恰恰是本探针要测的对象。
 *
 * 安全：Key 只从环境变量 `AI_BASELINE_KEY` 读取，绝不写进任何产物（落盘前整体擦除）。
 */
import { afterAll, beforeAll, describe, it } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aiTools } from '../src/engine/aiPrompt';
import { getAiRequestTimeoutMs, PROVIDER_PRESETS, resolveBaseUrl } from '../src/utils/aiConfig';
import { describeFetchError, describeHttpError, type AiErrorInfo } from '../src/components/AI/aiApi';

// ==================== 运行参数 ====================

const API_KEY = process.env.AI_BASELINE_KEY || '';
const OUT_DIR = process.env.AI_BASELINE_OUT_DIR || 'metrics';
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const MODEL = process.env.AI_BASELINE_MODEL || 'deepseek-flash';
const BASE_URL = process.env.AI_BASELINE_BASE_URL || 'https://api.deepseek.com';
const BASE_URL_V1 = `${BASE_URL.replace(/\/+$/, '')}/v1`;
const FALLBACK_MODELS = (process.env.AI_BASELINE_PROBE_FALLBACK_MODELS || 'deepseek-chat,deepseek-reasoner')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ALIYUN_CONTROL_MODEL = process.env.AI_BASELINE_PROBE_ALIYUN_MODEL || 'deepseek-v4-flash-0731';
const ALIYUN_CONTROL_ENABLED = process.env.AI_BASELINE_PROBE_ALIYUN !== '0';
/**
 * 显式开关：只有 `AI_BASELINE_PROBE=1` 时本文件才真的发请求。
 * 理由：`vitest.ai-baseline.config.ts` 的 `include` 是 `baseline/**\/*.run.ts`，
 * 所以 `npm run ai-baseline`（正式采集）会顺带把本探针也跑一遍；
 * 没有开关的话，一次基线采集会平白多花约 7 次请求的额度。
 * 关闭状态下不读 Key、不发请求、不落盘。
 */
const PROBE_ENABLED = process.env.AI_BASELINE_PROBE === '1';
const ONLY = (process.env.AI_BASELINE_PROBE_ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/** 单轮 token 守卫：累计用量超过该值就停止后续探针（语义同 aiBaseline.run.ts） */
const MAX_TURN_TOKENS = ((): number => {
  const raw = Number(process.env.AI_BASELINE_MAX_TURN_TOKENS || 30000);
  return Number.isFinite(raw) && raw > 0 ? raw : 30000;
})();
/** 单次输出上限：探针只看「能不能发起、返回什么形状」，不需要长回复，也顺带兜住思考 token 风险 */
const PROBE_MAX_TOKENS = 512;
const PROMPT = '调用 add_module，在画布末尾新增标题为「技能」、content 为 "<p>Java</p>" 的模块。直接执行，不要询问。';
const IMAGE_PROMPT = '这张图是什么颜色？一句话回答。';
/** 图片探针的预期答案（PNG 为纯红色 1x1 像素） */
const IMAGE_EXPECTED_COLOR = 'red';
const IMAGE_COLOR_PATTERN = /红|red/i;
/** 1x1 红色 RGBA PNG（70 B）：node zlib + CRC32 生成，已自校验签名 / IHDR / IDAT 展开长度 */
const TINY_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

// ==================== 探针矩阵 ====================

interface ProbeSpec {
  id: string;
  title: string;
  /** 缺省用 AI_BASELINE_MODEL */
  model?: string;
  /** 缺省用 AI_BASELINE_BASE_URL */
  baseUrl?: string;
  /** 缺省表示请求体里**根本不发** `tool_choice` 字段 */
  toolChoice?: 'auto' | 'required';
  /** 附加请求体（例如关闭思考的传参） */
  extraBody?: Record<string, unknown>;
  /** 用带图片的 user 消息，探测视觉输入支持 */
  withImage?: boolean;
  /** 仅当主档位被端点拒绝时才执行 */
  onlyIfModelRejected?: boolean;
}

const PRIMARY_PROBES: ProbeSpec[] = [
  { id: 'official-auto', title: 'tool_choice="auto"（浏览器现在的形状）', toolChoice: 'auto' },
  { id: 'official-no-tool-choice', title: '整个 tool_choice 字段不发', },
  { id: 'official-required', title: 'tool_choice="required"（上传场景的形状）', toolChoice: 'required' },
  {
    id: 'official-required-thinking-disabled',
    title: 'tool_choice="required" + thinking 显式关闭',
    toolChoice: 'required',
    extraBody: { thinking: { type: 'disabled' } },
  },
  {
    id: 'official-auto-thinking-disabled',
    title: 'tool_choice="auto" + thinking 显式关闭',
    toolChoice: 'auto',
    extraBody: { thinking: { type: 'disabled' } },
  },
  {
    id: 'official-no-tool-choice-thinking-disabled',
    title: '不发 tool_choice + thinking 显式关闭',
    extraBody: { thinking: { type: 'disabled' } },
  },
  { id: 'official-image', title: '图片输入（不发 tool_choice，带 1x1 PNG）', withImage: true },
];

const FALLBACK_PROBES: ProbeSpec[] = FALLBACK_MODELS.map((model) => ({
  id: `official-fallback-${model}`,
  title: `兜底档位 ${model}（tool_choice="auto"）`,
  model,
  toolChoice: 'auto' as const,
  onlyIfModelRejected: true,
}));

const CONTROL_PROBES: ProbeSpec[] = ALIYUN_CONTROL_ENABLED
  ? [
      {
        id: 'aliyun-control-auto',
        title: `渠道对照：百炼 ${ALIYUN_CONTROL_MODEL}（tool_choice="auto"）`,
        baseUrl: PROVIDER_PRESETS.aliyun.baseUrl,
        model: ALIYUN_CONTROL_MODEL,
        toolChoice: 'auto',
      },
    ]
  : [];

// ==================== 打点 ====================

interface ProbeResult {
  id: string;
  title: string;
  url: string;
  model: string;
  toolChoice: string;
  extraBody?: Record<string, unknown>;
  withImage: boolean;
  /** 官方端点 404 后按卡内要求改试 `/v1` 时为 true */
  endpointFallback: boolean;
  status: number | null;
  ok: boolean;
  latencyMs: number;
  errorCode?: string;
  errorDetail?: string;
  /** 响应体原文（截断，已脱敏）——仅错误响应保留，用于「错误码与原文」取证 */
  responseBody?: string;
  finishReason?: string;
  toolCallNames?: string[];
  contentChars?: number;
  /** 思考内容字符数（只记长度，不落正文） */
  reasoningChars?: number;
  /** 视觉输入判定（仅图片探针）：回复里是否命中预期颜色，并附 120 字符以内的应答摘要 */
  imageCheck?: { expectedColor: string; colorMentioned: boolean; excerpt: string };
  usage?: Record<string, unknown>;
  transportError?: AiErrorInfo;
}

const results: ProbeResult[] = [];
let tokenGuardTrip: { total: number; limit: number } | null = null;
let modelRejected = false;

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function messageOf(data: Record<string, unknown> | null): Record<string, unknown> | null {
  const choices = data?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (first === null || typeof first !== 'object') return null;
  const message = (first as Record<string, unknown>).message;
  return message !== null && typeof message === 'object' ? (message as Record<string, unknown>) : null;
}

function toolCallNamesOf(message: Record<string, unknown> | null): string[] {
  const calls = message?.tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.map((call) => {
    const fn = call !== null && typeof call === 'object' ? (call as Record<string, unknown>).function : null;
    const name = fn !== null && typeof fn === 'object' ? (fn as Record<string, unknown>).name : undefined;
    return typeof name === 'string' ? name : '(未命名)';
  });
}

function strLen(value: unknown): number {
  return typeof value === 'string' ? value.length : 0;
}

function describeModelRejection(result: ProbeResult): boolean {
  if (result.status !== 400 && result.status !== 404) return false;
  return /model/i.test(`${result.errorCode ?? ''} ${result.errorDetail ?? ''}`);
}

async function sendProbe(spec: ProbeSpec, url: string, endpointFallback: boolean): Promise<ProbeResult> {
  const model = spec.model ?? MODEL;
  const body: Record<string, unknown> = {
    model,
    messages: [
      spec.withImage
        ? {
            role: 'user',
            content: [
              { type: 'text', text: IMAGE_PROMPT },
              { type: 'image_url', image_url: { url: TINY_PNG_DATA_URI } },
            ],
          }
        : { role: 'user', content: PROMPT },
    ],
    tools: aiTools,
    temperature: 0.1,
    max_tokens: PROBE_MAX_TOKENS,
  };
  if (spec.toolChoice) body.tool_choice = spec.toolChoice;
  if (spec.extraBody) Object.assign(body, spec.extraBody);

  const controller = new AbortController();
  const timeoutMs = getAiRequestTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const base: ProbeResult = {
    id: spec.id,
    title: spec.title,
    url,
    model,
    toolChoice: spec.toolChoice ?? '(字段未发送)',
    ...(spec.extraBody ? { extraBody: spec.extraBody } : {}),
    withImage: spec.withImage === true,
    endpointFallback,
    status: null,
    ok: false,
    latencyMs: 0,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    let text = '';
    try {
      text = await response.text();
    } catch (err) {
      const info = describeFetchError(err);
      return { ...base, latencyMs, transportError: info, errorCode: 'RESPONSE_BODY_READ_FAILED', errorDetail: info.errorDetail };
    }
    const data = parseJsonObject(text);
    const message = messageOf(data);
    const usage = data?.usage;
    if (!response.ok) {
      const info = describeHttpError(response.status, text);
      return {
        ...base,
        status: response.status,
        latencyMs,
        errorCode: info.errorCode,
        errorDetail: info.errorDetail,
        responseBody: text.slice(0, 600),
      };
    }
    const finishReason = (() => {
      const choices = data?.choices;
      if (!Array.isArray(choices) || choices.length === 0) return undefined;
      const first = choices[0];
      const value = first !== null && typeof first === 'object' ? (first as Record<string, unknown>).finish_reason : undefined;
      return typeof value === 'string' ? value : undefined;
    })();
    const toolCallNames = toolCallNamesOf(message);
    const content = typeof message?.content === 'string' ? message.content : '';
    return {
      ...base,
      status: response.status,
      ok: true,
      latencyMs,
      ...(finishReason ? { finishReason } : {}),
      toolCallNames,
      contentChars: strLen(message?.content),
      ...(spec.withImage
        ? {
            imageCheck: {
              expectedColor: IMAGE_EXPECTED_COLOR,
              colorMentioned: IMAGE_COLOR_PATTERN.test(content),
              excerpt: content.replace(/\s+/g, ' ').trim().slice(0, 120),
            },
          }
        : {}),
      reasoningChars: strLen(message?.reasoning_content),
      ...(usage !== null && typeof usage === 'object' ? { usage: usage as Record<string, unknown> } : {}),
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    if (err instanceof Error && err.name === 'AbortError') {
      return { ...base, latencyMs, transportError: { errorCode: 'TIMEOUT', errorDetail: `超过 ${timeoutMs} ms 未响应` } };
    }
    return { ...base, latencyMs, transportError: describeFetchError(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function runProbe(spec: ProbeSpec): Promise<void> {
  const url = `${resolveBaseUrl(spec.baseUrl ?? BASE_URL)}/chat/completions`;
  let result = await sendProbe(spec, url, false);
  // 卡内要求：官方端点 404 时改试 `/v1`（仅此一种情况重试，4xx 其余原样记录）
  if (result.status === 404 && !spec.baseUrl) {
    const retry = await sendProbe(spec, `${BASE_URL_V1}/chat/completions`, true);
    results.push(result);
    result = retry;
  }
  results.push(result);
  if (describeModelRejection(result)) modelRejected = true;

  const usageTotal = Number(result.usage?.total_tokens ?? 0);
  const spent = results.reduce((sum, r) => sum + Number(r.usage?.total_tokens ?? 0), 0);
  console.log(
    `[probe] ${result.id.padEnd(38)} ${result.endpointFallback ? '[v1]' : '    '} ` +
      `status=${result.status ?? 'transport-error'} ${result.latencyMs} ms ` +
      `tool_calls=${result.toolCallNames?.length ?? 0} usage=${usageTotal > 0 ? usageTotal : 'n/a'} 累计=${spent}`,
  );
  if (result.transportError || (result.status !== null && result.status >= 400)) {
    console.log(`         └ ${result.errorCode ?? result.transportError?.errorCode ?? ''} ${result.errorDetail ?? ''}`);
  }
  if (spent > MAX_TURN_TOKENS) {
    tokenGuardTrip = { total: spent, limit: MAX_TURN_TOKENS };
    console.log(`[guard] 累计 token ${spent} 超过上限 ${MAX_TURN_TOKENS}，停止后续探针`);
  }
}

// ==================== 落盘 ====================

function gitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function redact(text: string): string {
  return API_KEY ? text.split(API_KEY).join('[REDACTED]') : text;
}

function buildSummary(): string {
  const lines: string[] = [];
  lines.push(`## DeepSeek 端点请求形状探针（${RUN_ID}）`);
  lines.push('');
  lines.push(`- 执行时间：${new Date().toISOString()}`);
  lines.push(`- commit：\`${gitCommit()}\``);
  lines.push(`- 主档位：\`${MODEL}\`；官方端点：\`${BASE_URL}\`（404 时改试 \`${BASE_URL_V1}\`）`);
  lines.push(`- 计数：发出 ${results.length} 次请求（含 404 后的 \`/v1\` 重试次数），单次上限 max_tokens=${PROBE_MAX_TOKENS}`);
  const spent = results.reduce((sum, r) => sum + Number(r.usage?.total_tokens ?? 0), 0);
  lines.push(`- token 用量：${spent}（守卫上限 ${MAX_TURN_TOKENS}${tokenGuardTrip ? '，已触发' : '，未触发'}）`);
  lines.push('');
  lines.push('| # | 形状 | 端点 | 档位 | tool_choice | HTTP | 延迟 (ms) | tool_calls | prompt/completion | 错误码 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  results.forEach((r, index) => {
    const usage = r.usage ?? {};
    const tokens = r.usage ? `${usage.prompt_tokens ?? '?'}/${usage.completion_tokens ?? '?'}` : 'n/a';
    lines.push(
      `| ${index + 1} | ${r.id} | ${r.endpointFallback ? '/v1' : '默认'} | ${r.model} | ${r.toolChoice} | ` +
        `${r.status ?? '传输失败'} | ${r.latencyMs} | ${r.toolCallNames?.length ?? 0} | ${tokens} | ${r.errorCode ?? '-'} |`,
    );
  });
  lines.push('');
  const imageChecks = results.filter((r) => r.imageCheck);
  for (const r of imageChecks) {
    lines.push(
      `- 视觉输入判定（${r.id}）：HTTP ${r.status}；回复是否命中预期颜色「${r.imageCheck?.expectedColor}」= ${r.imageCheck?.colorMentioned}；` +
        `应答摘要（≤120 字符）：${r.imageCheck?.excerpt ?? ''}`,
    );
  }
  if (imageChecks.length > 0) lines.push('');
  lines.push('> 明细（`extraBody`、`finish_reason`、思考内容长度、`usage` 全量、错误原文）见同目录 JSON。');
  return lines.join('\n');
}

function flush(): { jsonPath: string; summaryPath: string } | null {
  const answered = results.filter((r) => r.status !== null);
  // 传输层全失败（Key 无效网络不通）时不落盘，避免产出看着像结论的空数据
  if (answered.length === 0) return null;
  const outDir = resolve(process.cwd(), OUT_DIR);
  mkdirSync(outDir, { recursive: true });
  const payload = {
    probe: 'deepseek-request-shape',
    version: 1,
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    git: gitCommit(),
    request: { primaryModel: MODEL, baseUrl: BASE_URL, baseUrlV1: BASE_URL_V1, maxTokensPerProbe: PROBE_MAX_TOKENS },
    guard: { maxTurnTokens: MAX_TURN_TOKENS, tripped: tokenGuardTrip !== null, ...(tokenGuardTrip ?? {}) },
    modelRejected,
    results,
  };
  const jsonPath = join(outDir, `deepseek-probe-${RUN_ID}.json`);
  const summaryPath = join(outDir, `deepseek-probe-${RUN_ID}.summary.md`);
  writeFileSync(jsonPath, redact(JSON.stringify(payload, null, 2)), 'utf8');
  writeFileSync(summaryPath, redact(buildSummary()), 'utf8');
  return { jsonPath, summaryPath };
}

// ==================== 执行 ====================

beforeAll(() => {
  if (!PROBE_ENABLED) {
    console.log('[skip] 未设置 AI_BASELINE_PROBE=1：探针不执行（避免被 npm run ai-baseline 顺带跑掉）');
    return;
  }
  if (!API_KEY) {
    throw new Error(
      '未设置 AI_BASELINE_KEY（本次未发起任何请求，也没有写入 metrics/）。' +
        '请在终端执行：AI_BASELINE_KEY=<你的 Key> npx vitest run --config vitest.ai-baseline.config.ts',
    );
  }
  console.log(`[plan] 主档位 ${MODEL} @ ${BASE_URL}；矩阵 ${PRIMARY_PROBES.length} 项 + 兜底 ${FALLBACK_PROBES.length} 项 + 对照 ${CONTROL_PROBES.length} 项`);
});

describe('deepseek-request-shape', () => {
  it('按矩阵逐项打点（每形状 1 次，4xx 不重试）', async () => {
    if (!PROBE_ENABLED) return;
    const wanted = (spec: ProbeSpec) => ONLY.length === 0 || ONLY.includes(spec.id);
    for (const spec of PRIMARY_PROBES) {
      if (tokenGuardTrip) break;
      if (!wanted(spec)) continue;
      await runProbe(spec);
    }
    for (const spec of [...FALLBACK_PROBES, ...CONTROL_PROBES]) {
      if (tokenGuardTrip) break;
      if (!wanted(spec)) continue;
      if (spec.onlyIfModelRejected && !modelRejected) {
        console.log(`[probe] ${spec.id} 跳过：主档位未被端点拒绝（未触发兜底条件）`);
        continue;
      }
      await runProbe(spec);
    }
  });
});

afterAll(() => {
  const written = flush();
  if (!written) {
    console.log('[flush] 无有效结果（未执行 / 传输层全失败），未写入 metrics/（卫生规则：不落盘）');
    return;
  }
  console.log(`[flush] ${written.jsonPath}`);
  console.log(`[flush] ${written.summaryPath}`);
});
