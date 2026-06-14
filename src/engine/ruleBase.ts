// src/engine/ruleBase.ts
// 声明式固定约束清单，始终注入 system prompt。
// 删除关键词匹配逻辑和 retrieveRules 函数。

/** 固定约束规则，始终生效 */
const FIXED_RULES = [
  '1. 修改已有模块时，id 必须来自「当前画布」列表，禁止编造',
  '2. 创建 resume header 使用 add_header，创建内容模块使用 add_module，禁止手动构造它们的 children',
  '3. 样式属性仅使用: fontSize, fontWeight, color, backgroundColor, padding, margin, borderRadius, border, boxShadow, display, flexDirection, alignItems, justifyContent, gap, gridTemplateColumns, width, height, lineHeight, textAlign, objectFit',
  '4. 颜色值统一用 #rrggbb，尺寸值统一用 px 单位',
  '5. 单次回复可调用多个 tool，但须等待 tool 结果后再决定下一步',
  '6. add_flex / add_grid 仅用于包装已存在的子模块；创建新的容器+子控件组合时使用 add_flex_inline / add_grid_inline',
  '7. 单次用户消息最多重试 3 次 tool 调用；连续同一 tool 失败 2 次后不得再试，改为向用户报告具体错误并附原始 AI 输出供诊断',
  '8. add_text/add_heading/add_list 创建后禁止立即调 set_style/set_property——创建工具本身支持 style 参数，所有样式必须在创建时一次性传入。只有响应用户修改已有模块的要求时才使用 set_style/set_property。违反此规则将造成不必要的 tool 调用浪费。',
] as const;

/** 返回格式化的约束规则文本，用于注入 system prompt */
export function getFixedConstraints(): string {
  return FIXED_RULES.join('\n');
}

/** 返回约束数组，供测试验证结构完整性 */
export function getConstraintList(): readonly string[] {
  return FIXED_RULES;
}
