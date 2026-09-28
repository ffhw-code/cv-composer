// P1 优化项 1：布局幂等性（标准 1 二档判定项 C）
//
// 口径（`docs/plan/验收口径-交付标准与达标判定.md` 第二节）：
// 「同一操作序列重复执行后，exportLayoutTree 的结果是否逐字节一致」。
// 本文件只覆盖**纯函数层与指令层**——项目没有 UI 自动化测试（无 playwright / cypress），
// 真实 DOM 渲染与拖拽手势不在此列（见 `docs/plan/阶段方案-P1-编辑地基达标.md` 第九节）。
//
// 为什么不比 id：`exportLayoutTree` 不导出 id，而 `executeCommands` 每次执行都会 `generateId()`，
// 所以「逐字节一致」针对的是**导出结果**，不是内部 id。

import { describe, it, expect, beforeAll } from 'vitest';
import { executeCommands, type Command } from './commandExecutor';
import { exportLayoutTree } from '../utils/moduleUtils';
import { stableStringify } from '../utils/stableStringify';
import { applyOverflowCompression, normalizeLayoutTree } from './layoutTreeNormalizer';
import { computeLayout } from './layoutEngine';
import { scaleLayoutToFit } from './layoutScaler';
import { initStyles } from '../styles/styleInit';
import type { ResumeModule } from '../types/resume';
import type { LayoutTree } from '../utils/resumeParser';

beforeAll(() => {
  initStyles();
});

const BASE: ResumeModule[] = [
  {
    id: 'seed-text-edu',
    type: 'text',
    styleId: 'text-default',
    content: '<p>教育背景</p>',
    style: { fontSize: '15px' },
    children: [],
  },
  {
    id: 'seed-mod-exp',
    type: 'module',
    styleId: 'module-card',
    title: '实习经历',
    children: [
      {
        id: 'seed-exp-1',
        type: 'text',
        styleId: 'text-default',
        content: '<p>公司 A</p>',
        children: [],
        parentId: 'seed-mod-exp',
      },
    ],
  },
];

/** 覆盖「新增 + 嵌套」「改样式与内容」「拖动排序（move_module）」「删除」四类操作 */
const SEQUENCES: { name: string; commands: Command[] }[] = [
  {
    name: '新增与嵌套',
    commands: [
      {
        action: 'addModule',
        tempId: 't1',
        params: {
          type: 'flex',
          styleId: 'flex-default',
          children: [
            { action: 'addModule', tempId: 't2', params: { type: 'text', styleId: 'text-default', content: '<p>A</p>' } },
            { action: 'addModule', tempId: 't3', params: { type: 'heading', styleId: 'heading-default', content: 'B' } },
          ],
        },
      },
      {
        action: 'addModule',
        tempId: 't4',
        params: {
          type: 'module',
          styleId: 'module-card',
          title: '技能',
          children: [
            { action: 'addModule', tempId: 't5', params: { type: 'list', styleId: 'list-default', content: '<li>x</li>' } },
          ],
        },
      },
    ],
  },
  {
    name: '改样式与内容',
    commands: [
      { action: 'setStyle', params: { id: 'seed-text-edu', style: { fontSize: '17px', color: '#111111' } } },
      { action: 'setContent', params: { id: 'seed-text-edu', content: '<p>教育背景（改）</p>' } },
      { action: 'updateModule', params: { id: 'seed-exp-1', data: { content: '<p>公司 B</p>' } } },
    ],
  },
  {
    name: '拖动排序',
    commands: [
      { action: 'moveModule', params: { id: 'seed-mod-exp', newParentId: null, index: 0 } },
      { action: 'moveModule', params: { id: 'seed-text-edu', newParentId: null, index: 1 } },
    ],
  },
  {
    name: '删除',
    commands: [
      { action: 'removeModule', params: { id: 'seed-exp-1' } },
      { action: 'removeModule', params: { id: 'seed-text-edu' } },
    ],
  },
];

function replay(commands: Command[]): { snapshot: string; errors: number } {
  const result = executeCommands(BASE, commands);
  expect(result.rolledBack).toBe(false);
  return { snapshot: stableStringify(exportLayoutTree(result.newModules)), errors: result.errors.length };
}

describe('布局幂等性：指令序列重放（标准 1 二档）', () => {
  const baseline = stableStringify(exportLayoutTree(BASE));

  for (const seq of SEQUENCES) {
    it(`「${seq.name}」：同一初始状态重放两次，导出结果逐字节一致`, () => {
      const first = replay(seq.commands);
      const second = replay(seq.commands);

      expect(first.errors).toBe(0);
      // 先证明这条序列**确实改变了画布**，否则「一致」只能说明测试是空跑
      expect(first.snapshot).not.toBe(baseline);
      expect(second.snapshot).toBe(first.snapshot);
    });
  }
});

describe('布局幂等性：纯函数层（同输入 → 同输出）', () => {
  const TREE: LayoutTree = {
    header: {
      type: 'flex',
      style: { padding: '20px' },
      children: [{ type: 'text', style: { fontSize: '24px' }, content: '张三' }],
    },
    modules: [
      {
        type: 'flex',
        style: { gap: '12px' },
        children: [
          { type: 'heading', content: '实习经历' },
          { type: 'text', content: '公司 A · 前端' },
          { type: 'grid', columns: 2, children: [{ type: 'text', content: 'a' }, { type: 'text', content: 'b' }] },
        ],
      },
    ],
  };

  it('normalizeLayoutTree：同一输入对象连调两次结果一致，且不破坏输入（无原地副作用）', () => {
    const tree = JSON.parse(JSON.stringify(TREE)) as LayoutTree;
    const before = JSON.stringify(tree);
    const first = stableStringify(normalizeLayoutTree(tree));
    const second = stableStringify(normalizeLayoutTree(tree));

    expect(second).toBe(first);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it('computeLayout：同一几何输入连调两次结果一致', () => {
    const geometry = [
      { id: 'a', height: 300 },
      { id: 'b', height: 300 },
      { id: 'c', height: 400 },
      { id: 'd', height: 200 },
    ];
    const first = computeLayout(geometry, 1123, 16);
    const second = computeLayout(geometry, 1123, 16);

    expect(second).toEqual(first);
    expect(stableStringify(second)).toBe(stableStringify(first));
  });

  it('scaleLayoutToFit：已缩放过的模块树再调一次是空操作（缩放幂等）', () => {
    const modules: ResumeModule[] = [
      {
        id: 'wide',
        type: 'text',
        styleId: 'text-default',
        style: { width: '1200px', fontSize: '20px' },
        children: [],
      },
    ];

    const first = scaleLayoutToFit(modules);
    expect(first.scale).toBeLessThan(1);
    const afterFirst = stableStringify(modules);

    const second = scaleLayoutToFit(modules);
    expect(second).toEqual({ scale: 1, scaledCount: 0 });
    expect(stableStringify(modules)).toBe(afterFirst);
  });

  it('applyOverflowCompression：同一输入连调两次结果一致', () => {
    const makeNodes = () => normalizeLayoutTree(JSON.parse(JSON.stringify(TREE)) as LayoutTree).modules;
    const first = applyOverflowCompression(makeNodes(), 48, 48, 16);
    const second = applyOverflowCompression(makeNodes(), 48, 48, 16);

    expect(second).toEqual(first);
  });
});
