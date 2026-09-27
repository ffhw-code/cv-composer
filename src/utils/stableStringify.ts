/**
 * 工具调用参数的规范化序列化（`P0.2` 第 1 项：同轮重复调用守卫的地基）。
 *
 * 为什么要「规范化」而不是直接 `JSON.stringify`：JSON 对象里键的书写顺序不影响语义，
 * 模型两次调用可能只差键序（`{"id":"a","style":{...}}` / `{"style":{...},"id":"a"}`），
 * 直接序列化会得到两个不同字符串，守卫就拦不住。
 *
 * 口径（与 `baseline/aiBaseline.run.ts` 的 `stableJson` 完全一致，两侧说的必须是同一件事）：
 * - 对象：键名排序、剔除值为 `undefined` 的键；
 * - 数组：**保序**（`children`、`ids` 的顺序有语义）；
 * - 其它：走 `JSON.stringify`，`undefined` / 函数 / `Symbol` 归一为 `'null'`。
 */

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 调用指纹 = 工具名 + 规范化参数（只用于内存内判等价，不落盘、不含简历正文） */
export function toolCallFingerprint(toolName: string, args: unknown): string {
  return `${toolName}:${stableStringify(args)}`;
}
