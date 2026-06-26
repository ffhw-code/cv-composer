/** 生成唯一 ID，优先使用 crypto.randomUUID，回退到时间戳+随机数 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
