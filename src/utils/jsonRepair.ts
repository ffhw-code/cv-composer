/** 修复模型截断的 JSON：补全缺失的括号和引号 */
export function repairTruncatedJson(raw: string): string {
  let s = raw.trim();
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === "\"") { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braceCount++;
    if (ch === "}") braceCount--;
    if (ch === "[") bracketCount++;
    if (ch === "]") bracketCount--;
  }
  if (inString) s += "\"";
  while (bracketCount > 0) { s += "]"; bracketCount--; }
  while (braceCount > 0) { s += "}"; braceCount--; }
  return s;
}
