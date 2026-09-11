/**
 * 工具调用参数解析。
 *
 * 背景：AI 基线（`metrics/ai-baseline-2026-09-11T03-30-25-191Z.json`）显示
 * 53.1% 的工具调用参数无法解析，且全部集中在「参数含嵌套对象」的工具上。
 * 取原始 args 后发现两类坏样本（均来自真实日志）：
 *
 *   1. 嵌套对象的值被模型写成了原生标记或直接缺失：
 *      {"name": "generate-resume", "params": }
 *      {"id": "seed-text-exp", "style": <parameter=fontSize>\n15px}
 *   2. 模型把整个「工具名/参数」原生语法漏进了 valued 位置：
 *      {"id": "x", "style": <parameter=name>set_style, "parameters": "{\"id\": ...}"}
 *
 * 这类输出既不是合法 JSON，也不是「截断」（`repairTruncatedJson` 对括号平衡
 * 但缺值的 JSON 无能为力，基线里 `argsRepaired = 0` 正是这个原因）。
 *
 * 处理策略：**只打捞结构完好的键值，绝不凭空补值**。
 * - 打捞到的键值原样保留（保证类型正确）；
 * - 坏掉的键记录下来，交给「必填键校验」判定；
 * - 必填键缺失 → `invalid`，调用方不要执行 handler，而是把具体原因回传给模型。
 *
 * 「缺值补默认」在这里是危险的：把 `"style": }` 补成 `{}` 会让 set_style 静默
 * 变成一个空操作，用户以为改了其实没改——比直接报错更糟。所以这里只做打捞，
 * 语义层面的兜底（例如 execute_skill 的 params 可缺省）由各自 handler 决定。
 */
import { repairTruncatedJson } from './jsonRepair';

export type ToolArgsStatus = 'ok' | 'repaired' | 'invalid';

export interface ToolArgsParseResult {
  args: Record<string, unknown>;
  status: ToolArgsStatus;
  /** 人类可读的解析说明（会作为 tool result 回传给模型帮助自纠正） */
  detail?: string;
  /** status = invalid 时缺失的必填键 */
  missing?: string[];
}

const MAX_SNIPPET = 120;

function snippet(raw: string): string {
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_SNIPPET ? `${oneLine.slice(0, MAX_SNIPPET)}…` : oneLine;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 返回字符串字面量的结束位置（不含闭合引号之后），未闭合返回 null */
function endOfString(s: string, start: number): number | null {
  let i = start + 1;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '"') return i + 1;
    i += 1;
  }
  return null;
}

/** 从 start 处读取一个合法 JSON 值，失败返回 null */
function readJsonValueAt(s: string, start: number): { value: unknown; end: number } | null {
  const ch = s[start];
  if (ch === undefined) return null;

  if (ch === '"') {
    const end = endOfString(s, start);
    if (end === null) return null;
    try {
      return { value: JSON.parse(s.slice(start, end)), end };
    } catch {
      return null;
    }
  }

  if (ch === '{' || ch === '[') {
    const close = ch === '{' ? '}' : ']';
    let depth = 0;
    let i = start;
    while (i < s.length) {
      const c = s[i];
      if (c === '"') {
        const end = endOfString(s, i);
        if (end === null) return null;
        i = end;
        continue;
      }
      if (c === ch) depth += 1;
      else if (c === close) {
        depth -= 1;
        if (depth === 0) {
          const literal = s.slice(start, i + 1);
          try {
            return { value: JSON.parse(literal), end: i + 1 };
          } catch {
            return null;
          }
        }
      }
      i += 1;
    }
    return null;
  }

  const literal = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(s.slice(start, start + 32));
  if (!literal) return null;
  try {
    return { value: JSON.parse(literal[0]), end: start + literal[0].length };
  } catch {
    return null;
  }
}

/** 跳到当前层级的下一个逗号（跳过字符串与嵌套结构），返回其位置或末尾 */
function skipToNextTopLevelComma(s: string, from: number): number {
  let depth = 0;
  let i = from;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') {
      const end = endOfString(s, i);
      if (end === null) return s.length;
      i = end;
      continue;
    }
    if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') {
      if (depth === 0) return i;
      depth -= 1;
    } else if (c === ',' && depth === 0) return i;
    i += 1;
  }
  return s.length;
}

/**
 * 在根对象里逐键扫描，打捞「值本身合法」的键值对，记录值坏掉的键。
 * 不做任何猜测性补全。
 */
function salvageTopLevel(raw: string): { found: Record<string, unknown>; broken: string[] } {
  const found: Record<string, unknown> = {};
  const broken: string[] = [];

  let i = raw.indexOf('{');
  if (i === -1) return { found, broken };
  i += 1;

  while (i < raw.length) {
    while (i < raw.length && (/\s/.test(raw[i]) || raw[i] === ',')) i += 1;
    if (i >= raw.length || raw[i] === '}') break;

    if (raw[i] !== '"') {
      const next = skipToNextTopLevelComma(raw, i);
      i = next <= i ? i + 1 : next;
      continue;
    }

    const keyEnd = endOfString(raw, i);
    if (keyEnd === null) break;
    let key: string | null;
    try {
      key = JSON.parse(raw.slice(i, keyEnd)) as string;
    } catch {
      key = null;
    }
    i = keyEnd;

    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (raw[i] !== ':') continue;
    i += 1;
    while (i < raw.length && /\s/.test(raw[i])) i += 1;

    const parsed = readJsonValueAt(raw, i);
    if (parsed) {
      if (key !== null) found[key] = parsed.value;
      i = parsed.end;
      continue;
    }

    if (key !== null && !(key in found)) broken.push(key);
    const next = skipToNextTopLevelComma(raw, i);
    i = next <= i ? i + 1 : next;
  }

  return { found, broken };
}

/**
 * 解析模型返回的工具参数。
 *
 * @param raw `tool_call.function.arguments` 原文
 * @param requiredKeys 该工具的必填参数名（来自 schema），用于判定打捞结果是否可用
 */
export function parseToolArguments(
  raw: string | undefined,
  requiredKeys: readonly string[] = [],
): ToolArgsParseResult {
  const text = (raw ?? '').trim();

  if (!text) {
    return requiredKeys.length > 0
      ? { args: {}, status: 'invalid', missing: [...requiredKeys], detail: '模型没有返回任何参数' }
      : { args: {}, status: 'ok' };
  }

  const tryParse = (candidate: string): Record<string, unknown> | null => {
    try {
      const value: unknown = JSON.parse(candidate);
      return isPlainObject(value) ? value : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct) {
    const missing = requiredKeys.filter((k) => !(k in direct));
    if (missing.length === 0) return { args: direct, status: 'ok' };
    return {
      args: direct,
      status: 'invalid',
      missing,
      detail: `缺少必填参数 ${missing.map((k) => `"${k}"`).join('、')}`,
    };
  }

  const repaired = tryParse(repairTruncatedJson(text));
  if (repaired) {
    const missing = requiredKeys.filter((k) => !(k in repaired));
    if (missing.length === 0) return { args: repaired, status: 'repaired' };
    return {
      args: repaired,
      status: 'invalid',
      missing,
      detail: `补齐截断后仍缺少必填参数 ${missing.map((k) => `"${k}"`).join('、')}`,
    };
  }

  const { found, broken } = salvageTopLevel(text);
  const missing = requiredKeys.filter((k) => !(k in found));
  const brokenNote = broken.length > 0
    ? `参数 ${broken.map((k) => `"${k}"`).join('、')} 的值不是合法 JSON（原文片段：${snippet(text)}）`
    : `参数不是合法 JSON 对象（原文片段：${snippet(text)}）`;

  // 必填项齐了（或本来就没有必填项）就可以继续执行；打捞不完整的原因放在 detail 里回传
  if (missing.length === 0) {
    return { args: found, status: 'repaired', detail: brokenNote };
  }

  const missingNote = missing.length > 0
    ? `，缺少必填参数 ${missing.map((k) => `"${k}"`).join('、')}`
    : '';
  return {
    args: found,
    status: 'invalid',
    missing,
    detail: `${brokenNote}${missingNote}`,
  };
}
