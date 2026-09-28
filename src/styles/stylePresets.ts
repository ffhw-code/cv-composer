// 样式预设的**单一真源**（`P1` 缺口 2 = 口径 A）。
//
// 为什么集中：预设 id 原先以字面量散落在 `styleInit` / `skillExecutor` / `templates` / `aiPrompt`，
// 新增或改名一个预设要改 4~5 处，漏一处只有用户点到才发现。现在 id 与中文名只在这里写一次，
// 各处是否同源由 `src/styles/stylePresets.test.ts` 守着。
//
// ⚠️ **冻结面**：`aiPrompt` 的两条 `styleId` 描述由下面的 `*_STYLE_EXAMPLES` 拼出，
//    必须与 `P0.2` 请求形状冻结点的锁测试（`src/engine/aiPrompt.schema.test.ts`：8,776 字符与 4 个哈希）
//    逐字节一致 —— 只许把字面量换成引用，不许改文案；改文案要走解冻流程。

export interface StylePreset {
  id: string;
  label: string;
}

/** 简历头预设 */
export const HEADER_STYLE = {
  classic: { id: 'header-classic', label: '经典分栏' },
  gradient: { id: 'header-gradient', label: '蓝色渐变' },
  business: { id: 'header-business', label: '名片风格' },
} as const;

/** 内容模块预设 */
export const MODULE_STYLE = {
  card: { id: 'module-card', label: '卡片样式' },
  timeline: { id: 'module-timeline', label: '时间线样式' },
  list: { id: 'module-list', label: '简洁列表' },
  plain: { id: 'module-plain', label: '简约无边框' },
} as const;

/** 预设清单（顺序 = 注册顺序 = 样式面板展示顺序） */
export const HEADER_STYLE_PRESETS: readonly StylePreset[] = [
  HEADER_STYLE.classic,
  HEADER_STYLE.gradient,
  HEADER_STYLE.business,
];

export const MODULE_STYLE_PRESETS: readonly StylePreset[] = [
  MODULE_STYLE.card,
  MODULE_STYLE.timeline,
  MODULE_STYLE.list,
  MODULE_STYLE.plain,
];

/** 给 AI 的「如 xxx、yyy」示例串（顺序即文案顺序；改动等于改请求形状 ⇒ 走解冻流程） */
export const HEADER_STYLE_EXAMPLES = [
  HEADER_STYLE.classic.id,
  HEADER_STYLE.gradient.id,
  HEADER_STYLE.business.id,
] as const;

/** 模块样式示例串：只有两个（`P0.2` 冻结的文案就是这么写的） */
export const MODULE_STYLE_EXAMPLES = [MODULE_STYLE.card.id, MODULE_STYLE.timeline.id] as const;

/** `smart-fill` 技能给 AI 的模块样式候选：id 同源，label 带适用场景 */
export const MODULE_STYLE_CHOICES: readonly StylePreset[] = [
  { id: MODULE_STYLE.card.id, label: `${MODULE_STYLE.card.label}（通用）` },
  { id: MODULE_STYLE.timeline.id, label: `${MODULE_STYLE.timeline.label}（适合经历）` },
  { id: MODULE_STYLE.list.id, label: `${MODULE_STYLE.list.label}（适合技能）` },
  { id: MODULE_STYLE.plain.id, label: `${MODULE_STYLE.plain.label}（适合简介）` },
];
