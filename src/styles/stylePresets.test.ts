// P1 优化项 3：样式预设「单一真源」的一致性测试（标准 1 缺口 2 = 口径 A）
//
// 守的是什么：预设清单（`./stylePresets`）与**消费者**是否同源 ——
//   ① 注册表（`styleRegistry`，样式面板 / 渲染靠它）
//   ② 模板库（`../engine/templates`）
//   ③ AI 工具 schema 的 `styleId` 描述（`../engine/aiPrompt`；这两条文案属 P0.2 冻结面）
//   ④ smart-fill 技能的样式候选（`../engine/skillExecutor`）
// 任何一处改名 / 漏改 / 写错，这里就会红。

import { beforeAll, describe, expect, it } from 'vitest';
import { aiTools } from '../engine/aiPrompt';
import { templates, type TemplateModule } from '../engine/templates';
import { getStyleConfig, getStylesByType, type ModuleType } from './styleRegistry';
import { initStyles } from './styleInit';
import {
  HEADER_STYLE_EXAMPLES,
  HEADER_STYLE_PRESETS,
  MODULE_STYLE_CHOICES,
  MODULE_STYLE_EXAMPLES,
  MODULE_STYLE_PRESETS,
} from './stylePresets';

beforeAll(() => {
  initStyles();
});

const MODULE_TYPES: ModuleType[] = ['header', 'module', 'text', 'heading', 'list', 'image', 'flex', 'grid'];

function registeredPreset(id: string): boolean {
  return MODULE_TYPES.some((type) => getStyleConfig(type, id) !== undefined);
}

function collectTemplateStyleIds(): string[] {
  const used = new Set<string>();
  const walk = (nodes: TemplateModule[]) => {
    for (const node of nodes) {
      if (node.styleId) used.add(node.styleId);
      if (node.children?.length) walk(node.children);
    }
  };
  for (const template of Object.values(templates)) walk(template.modules);
  return [...used];
}

function collectStyleIdDescriptions(): string[] {
  type LooseTool = { function?: { parameters?: { properties?: Record<string, { description?: string }> } } };
  const out: string[] = [];
  for (const tool of aiTools as unknown as LooseTool[]) {
    const description = tool.function?.parameters?.properties?.styleId?.description;
    if (description) out.push(description);
  }
  return out;
}

describe('样式预设单一真源', () => {
  it('注册表的模块预设与清单一致（id、中文名、顺序都一致）', () => {
    const registered = getStylesByType('module').map((item) => ({ id: item.style, label: item.label }));
    expect(registered).toEqual(MODULE_STYLE_PRESETS.map((preset) => ({ id: preset.id, label: preset.label })));
  });

  it('注册表的简历头预设与清单一致', () => {
    const registered = getStylesByType('header').map((item) => ({ id: item.style, label: item.label }));
    expect(registered).toEqual(HEADER_STYLE_PRESETS.map((preset) => ({ id: preset.id, label: preset.label })));
  });

  it('模板里用到的每个 styleId 都已在注册表注册（改名 / 写错即红）', () => {
    const used = collectTemplateStyleIds();
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((id) => !registeredPreset(id))).toEqual([]);
  });

  it('AI 工具 schema 的两条 styleId 描述由清单拼出，且示例都在清单里', () => {
    const descriptions = collectStyleIdDescriptions();

    expect(descriptions).toContain(`简历头样式 ID，如 ${HEADER_STYLE_EXAMPLES.join('、')}`);
    expect(descriptions).toContain(`模块样式 ID，如 ${MODULE_STYLE_EXAMPLES.join('、')}`);
    expect(HEADER_STYLE_EXAMPLES.every((id) => HEADER_STYLE_PRESETS.some((preset) => preset.id === id))).toBe(true);
    expect(MODULE_STYLE_EXAMPLES.every((id) => MODULE_STYLE_PRESETS.some((preset) => preset.id === id))).toBe(true);
  });

  it('smart-fill 的模块样式候选与预设清单同源（id 与顺序一致）', () => {
    expect(MODULE_STYLE_CHOICES.map((choice) => choice.id)).toEqual(MODULE_STYLE_PRESETS.map((preset) => preset.id));
  });
});
