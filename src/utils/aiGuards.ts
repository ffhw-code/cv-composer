/**
 * AI 链路的守卫与判定（`P0.2` 第 1~3 项）。
 *
 * 这里只放**纯逻辑**（无 React、无 fetch、可单测）：同轮重复调用守卫、轮次收尾判定、
 * 三类静默假成功的识别与清洗。`useAiChat.ts` 负责把它们接进真实链路。
 *
 * 口径纪律（见 `docs/plan/阶段方案-P0.2-链路守卫与请求形状冻结.md`）：
 * - 冗余一律走 `errorKind: 'redundant'`，**不新增枚举值**、不改 `argsStatus` 语义；
 * - 指纹 = 工具名 + 规范化参数（见 `stableStringify.ts`），与采集 harness 同一口径。
 */
import type { AiTurnOutcome } from './aiMetrics';
import { toolCallFingerprint } from './stableStringify';

/** 单轮用户消息内允许的最大工具轮次（轮次上限语义，`P0.2` 冻结点冻结） */
export const MAX_TOOL_ROUNDS = 8;

/** 被守卫拦下时回给模型的错误码（也是采集侧识别「守卫真的拦下过」的凭据） */
export type GuardRejectCode = 'REDUNDANT_CALL' | 'REDUNDANT_MODULE';

export interface GuardRejection {
  redundant: true;
  code: GuardRejectCode;
  fingerprint: string;
  /** 上一次同类调用的结果摘要（结构化错误也原样带回 —— 缺了新信息模型只会盲目重试） */
  priorResult: string;
  message: string;
  fix: string;
}

export type GuardDecision = { redundant: false; fingerprint: string } | GuardRejection;

/** 这些工具执行后画布结构已变，之前记下的「等价调用」不再等价，必须整体失效 */
const CANVAS_RESETTING_TOOLS = new Set(['remove_module', 'delete_modules', 'clear_canvas', 'apply_template']);

/** 回传给模型的摘要上限：够它判断「这条已经做过了」，又不会把请求撑大 */
const MAX_PRIOR_RESULT = 300;

function truncate(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_PRIOR_RESULT ? `${oneLine.slice(0, MAX_PRIOR_RESULT)}…` : oneLine;
}

/**
 * 单轮对话（一次 `handleSend`，含其中的多轮 function-calling 与重试）内的重复调用守卫。
 *
 * 判定粒度是「同工具 + 等价参数」：
 * - 第二次出现即判冗余，**不执行 handler**，并把上一次的结果摘要带回去；
 * - `add_module` 额外做「同名兜底」：本轮已建过同名模块就不再建（模型自造 id / 微调参数时指纹会变，
 *   光靠指纹拦不住）；
 * - 首次调用失败（结构性错误）也记账：拦下的是「一字不差地重试」，那正是历史实测自愈率为 0 的动作。
 */
export class TurnCallGuard {
  /** 指纹 → 上一次结果摘要 */
  private readonly seen = new Map<string, string>();
  /** add_module 的模块标题 → 上一次结果摘要 */
  private readonly addedModuleTitles = new Map<string, string>();

  /** 纯查询：只判有没有重复，不改内部状态（计数由调用方落在 turn 事件里） */
  inspect(toolName: string, args: Record<string, unknown>): GuardDecision {
    const fingerprint = toolCallFingerprint(toolName, args);
    const priorResult = this.seen.get(fingerprint);
    if (priorResult !== undefined) {
      return {
        redundant: true,
        code: 'REDUNDANT_CALL',
        fingerprint,
        priorResult: truncate(priorResult),
        message: `${toolName}: 本轮已经用完全相同的参数调用过，第二次不再执行（上一次结果见 priorResult）。`,
        fix:
          '不要重复调用：改用 priorResult 里的结果继续，或换一个不同的参数；确实需要重做请先删除/清空相关模块。' +
          '若用户明确要求生成多份/多版本（例如「生成多个供选择」「再来两个版本」），那属正常行为：' +
          '请用不同的参数（如加序号、改标题）或复制模块（duplicate_module）来完成，不要原样重复同一次调用。',
      };
    }
    const title = toolName === 'add_module' && typeof args.title === 'string' ? args.title : '';
    const priorTitleResult = title ? this.addedModuleTitles.get(title) : undefined;
    if (priorTitleResult !== undefined) {
      return {
        redundant: true,
        code: 'REDUNDANT_MODULE',
        fingerprint,
        priorResult: truncate(priorTitleResult),
        message: `add_module: 本轮已经创建过标题为「${title}」的模块，不重复创建（上一次结果见 priorResult）。`,
        fix:
          `如果要改这个模块，请直接对 priorResult 里返回的模块 id 调用 set_content / set_style；不要再次 add_module。` +
          '若用户明确要求生成多份/多版本（例如「生成多个供选择」），那属正常行为：' +
          '请用不同的参数（如加序号、改标题）或复制模块（duplicate_module）来完成，不要原样重复同一次调用。',
      };
    }
    return { redundant: false, fingerprint };
  }

  /** 记录一次**真正执行过**的调用（成功或结构化失败都记） */
  record(toolName: string, args: Record<string, unknown>, resultSummary: string): void {
    this.seen.set(toolCallFingerprint(toolName, args), resultSummary);
    if (toolName === 'add_module' && typeof args.title === 'string' && args.title) {
      this.addedModuleTitles.set(args.title, resultSummary);
    }
    if (CANVAS_RESETTING_TOOLS.has(toolName)) {
      this.seen.clear();
      this.addedModuleTitles.clear();
    }
  }
}

// ==================== 轮次收尾判定 ====================

export interface TurnSignals {
  /** 请求抛异常 / 空回复 */
  failed: boolean;
  /** 打满 `MAX_TOOL_ROUNDS`（改前会静默记成 success） */
  hitRoundLimit: boolean;
  toolErrors: number;
  /** 命中过静默假成功（哪怕随后被纠正也算：这一轮不干净） */
  fakeSuccess: boolean;
}

/** 一次用户对话的最终 outcome（改前只有「失败」或「有工具错误＝partial」两条规则） */
export function resolveTurnOutcome(signals: TurnSignals): AiTurnOutcome {
  if (signals.failed) return 'failed';
  if (signals.hitRoundLimit || signals.toolErrors > 0 || signals.fakeSuccess) return 'partial';
  return 'success';
}

// ==================== 三类静默假成功 ====================

export type FakeSuccessCode = 'FAKE_EDIT_CLAIM' | 'TOOL_JSON_AS_TEXT' | 'THINK_LEAK';

/**
 * 去掉思考链泄漏：部分思考模型会把 `</think>` 连同思维链一起混进正文。
 * 只保留最后一个闭合标签之后的内容 —— 之前的部分是思维链，不是给用户看的正文。
 */
export function stripThinkLeak(content: string): { text: string; leaked: boolean } {
  const idx = content.lastIndexOf('</think');
  if (idx === -1) return { text: content, leaked: false };
  const close = content.indexOf('>', idx);
  if (close === -1) return { text: content, leaked: false };
  return { text: content.slice(close + 1).trimStart(), leaked: true };
}

/**
 * 「声称已修改」但本轮一个工具都没调过 —— 静默假成功的典型形态（用户以为改了，其实没改）。
 * 只认明确的操作动词，且排除「刚才 / 之前 / 上一轮」这类**回述历史**的措辞（那是在答用户的问题，不是假成功）。
 */
const EDIT_CLAIM = /(?:已|已经)[^。！？!?；;\n]{0,8}?(?:添加|新增|创建|删除|移除|修改|调整|改好|更新|设置|清空|移动|复制|应用|替换)|(?:添加|新增|创建|删除|移除|修改|调整|更新|设置)(?:完成|好了|成功)/;
const HISTORY_FRAME = /(?:刚才|之前|上一轮|上一步|此前|先前|早先)/;

export function looksLikeEditClaim(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  if (HISTORY_FRAME.test(text)) return false;
  return EDIT_CLAIM.test(text);
}

/** 模型把「工具调用」当成 JSON 文本吐了出来（不是真正的 function calling） */
export function looksLikeToolCallJson(content: string): boolean {
  const text = content.trim();
  if (!text.includes('{') || !text.includes('}')) return false;
  if (/"action"\s*:/.test(text)) return true;
  if (/"tool(_calls?)?"\s*:/.test(text)) return true;
  return /"name"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|parameters|params)"\s*:/.test(text);
}

/**
 * 对一条**没有任何 tool_calls** 的模型回复做三类检查。
 * 返回需要纠正的项（`THINK_LEAK` 已顺手清洗，见 `text`）。
 */
export function inspectToolLessReply(
  content: string,
  options: { toolCallsInTurn: number },
): { text: string; findings: FakeSuccessCode[] } {
  const findings: FakeSuccessCode[] = [];
  const think = stripThinkLeak(content);
  if (think.leaked) findings.push('THINK_LEAK');

  const text = think.text;
  if (looksLikeToolCallJson(text)) {
    findings.push('TOOL_JSON_AS_TEXT');
  } else if (options.toolCallsInTurn === 0 && looksLikeEditClaim(text)) {
    findings.push('FAKE_EDIT_CLAIM');
  }
  return { text, findings };
}

/** 纠正无果时给用户看的显式提示：宁可让用户看到「没执行」，也不能静默假装成功 */
export const FAKE_SUCCESS_NOTICE =
  '⚠️ 本轮没有实际执行任何工具调用，上一句里的「已完成」可能是模型的口头承诺，请确认后让我重新执行。';

/** 需要再发一轮请求去纠正的项（`THINK_LEAK` 只清洗、不重试：重试换不回格式更好的回复） */
export function needsCorrectionRetry(findings: readonly FakeSuccessCode[]): boolean {
  return findings.some(f => f === 'FAKE_EDIT_CLAIM' || f === 'TOOL_JSON_AS_TEXT');
}

/** 纠正轮的追加指令 */
export const CORRECTION_INSTRUCTION =
  '你上一条回复没有调用任何工具，却声称已经完成了修改；或者把工具调用写成了 JSON 文本。请改为：需要改动画布就实际调用相应工具；不需要改动画布就直接回答，并且不要声称你已修改。';
