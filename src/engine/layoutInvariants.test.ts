// P1 优化项 2：网页文档流自动排版的不变量测试（标准 1 缺口 1 = 口径 A）
//
// 为什么是「不变量」而不是像素比对：项目没有 UI 自动化测试（无 playwright / cypress），
// 这里只覆盖**排版纯函数**的可判定性质 —— 分页守恒、越界、缩放边界、压缩边界。
// 真实渲染、拖拽手势、跨浏览器差异不在此列（见 `docs/plan/阶段方案-P1-编辑地基达标.md` 第九节）。
//
// 口径：不变量以现有实现为准逐条校准；实现不满足某条 ⇒ 记为缺陷，**不得为让测试变绿而放松断言**。
// 已按此抓到并修掉 `D-3`（见 `src/engine/layoutIdempotency.test.ts`）。

import { describe, it, expect } from 'vitest';
import { computeLayout } from './layoutEngine';
import {
  A4_HEIGHT_PX,
  applyOverflowCompression,
  estimateNodeHeight,
  normalizeLayoutTree,
  type NormalizedNode,
} from './layoutTreeNormalizer';
import { scaleLayoutToFit, TARGET_WIDTH } from './layoutScaler';
import type { ResumeModule } from '../types/resume';
import type { LayoutTree } from '../utils/resumeParser';

const PAGE_PADDING_TOP = 48;
const PAGE_PADDING_BOTTOM = 48;
const PAGE_GAP = 16;

function totalHeight(nodes: NormalizedNode[], padTop: number, padBottom: number, gap: number): number {
  let h = padTop + padBottom;
  for (const node of nodes) h += estimateNodeHeight(node);
  return h + gap * Math.max(0, nodes.length - 1);
}

function makeTree(modules: LayoutTree['modules']): LayoutTree {
  return {
    header: { type: 'flex', style: { padding: '0' }, children: [{ type: 'text', content: '张三' }] },
    modules,
  };
}

const SHORT_TREE = makeTree([
  { type: 'heading', content: '实习经历' },
  { type: 'text', content: '公司 A · 前端实习生' },
]);

/** 单节点自带 2000px 内边距 ⇒ 必然溢出 A4（1123px），且 padding 属于可压缩键 */
const OVERFLOW_TREE = makeTree([
  { type: 'text', content: '超长模块', style: { padding: '2000px', color: '#123456' } },
  { type: 'heading', content: '技能' },
]);

describe('文档流不变量：A4 分页（computeLayout）', () => {
  const geometry = [
    { id: 'a', height: 100 },
    { id: 'b', height: 900 },
    { id: 'c', height: 50 },
    { id: 'd', height: 1400 },
    { id: 'e', height: 300 },
    { id: 'f', height: 200 },
  ];

  it('每个模块恰好出现一次，且顺序与画布顺序一致（分页不丢模块、不重排）', () => {
    const { pages } = computeLayout(geometry, A4_HEIGHT_PX, PAGE_GAP);
    expect(pages.flat()).toEqual(geometry.map((m) => m.id));
  });

  it('空输入 ⇒ 一页空白，且不需要更多页', () => {
    expect(computeLayout([], A4_HEIGHT_PX, PAGE_GAP)).toEqual({ pages: [[]], needsMorePages: false });
  });

  it('每页高度不超页容量，除非该页只有 1 个模块、且它本身高于页容量', () => {
    const heights = new Map(geometry.map((m) => [m.id, m.height]));
    const { pages } = computeLayout(geometry, A4_HEIGHT_PX, PAGE_GAP);

    for (const page of pages) {
      const sum = page.reduce((acc, id) => acc + (heights.get(id) ?? 0), 0) + PAGE_GAP * Math.max(0, page.length - 1);
      const single = page.length === 1 && (heights.get(page[0]) ?? 0) > A4_HEIGHT_PX;
      expect(sum <= A4_HEIGHT_PX || single).toBe(true);
    }
  });

  it('needsMorePages 与页数一致：单页 false、多页 true', () => {
    const single = computeLayout([{ id: 'a', height: 100 }], A4_HEIGHT_PX, PAGE_GAP);
    expect(single.pages).toHaveLength(1);
    expect(single.needsMorePages).toBe(false);

    const multi = computeLayout(geometry, A4_HEIGHT_PX, PAGE_GAP);
    expect(multi.pages.length).toBeGreaterThan(1);
    expect(multi.needsMorePages).toBe(true);
  });
});

describe('文档流不变量：宽度自适应（scaleLayoutToFit）', () => {
  const px = (value?: string): number =>
    value && /^\d+(\.\d+)?px$/.test(value) ? parseFloat(value) : 0;

  function maxExplicitWidth(modules: ResumeModule[]): number {
    let max = 0;
    const walk = (m: ResumeModule) => {
      const s = m.style || {};
      const ml = px(s.marginLeft) || px(s.margin);
      const mr = px(s.marginRight) || px(s.margin);
      max = Math.max(max, px(s.width) + ml + mr);
      m.children.forEach(walk);
    };
    modules.forEach(walk);
    return max;
  }

  const makeWide = (): ResumeModule[] => [
    {
      id: 'wide',
      type: 'text',
      styleId: 'text-default',
      style: { width: '1200px', fontSize: '20px', color: '#123456', display: 'flex' },
      children: [],
    },
  ];

  it('不超 A4 宽度 ⇒ 不缩放，且一个字节都不改模块', () => {
    const modules: ResumeModule[] = [
      { id: 'fit', type: 'text', styleId: 'text-default', style: { width: '700px' }, children: [] },
    ];
    const before = JSON.stringify(modules);

    expect(scaleLayoutToFit(modules)).toEqual({ scale: 1, scaledCount: 0 });
    expect(JSON.stringify(modules)).toBe(before);
  });

  it('超 A4 宽度 ⇒ 缩到 A4 宽度以内（缩放后不再溢出）', () => {
    const modules = makeWide();
    const result = scaleLayoutToFit(modules);

    expect(result.scale).toBeGreaterThan(0);
    expect(result.scale).toBeLessThan(1);
    expect(maxExplicitWidth(modules)).toBeLessThanOrEqual(TARGET_WIDTH);
  });

  it('缩放只改尺寸类属性：颜色 / display / 内容不受影响', () => {
    const modules = makeWide();
    scaleLayoutToFit(modules);

    // 该模块只有一个子属性白名单内的 fontSize 会被缩放（20 × 0.6617 ≈ 13）
    expect(modules[0].style?.fontSize).toBe('13px');
    expect(modules[0].style?.color).toBe('#123456');
    expect(modules[0].style?.display).toBe('flex');
  });
});

describe('文档流不变量：溢出压缩（applyOverflowCompression）', () => {
  const nodesOf = (tree: LayoutTree): NormalizedNode[] => normalizeLayoutTree(tree).modules;

  it('不溢出 ⇒ 不压缩、页面参数原样返回、节点未被改动', () => {
    const nodes = nodesOf(SHORT_TREE);
    expect(totalHeight(nodes, PAGE_PADDING_TOP, PAGE_PADDING_BOTTOM, PAGE_GAP)).toBeLessThanOrEqual(A4_HEIGHT_PX);
    const before = JSON.stringify(nodes);

    const result = applyOverflowCompression(nodes, PAGE_PADDING_TOP, PAGE_PADDING_BOTTOM, PAGE_GAP);

    expect(result).toEqual({
      compressed: false,
      ratio: 1,
      newPaddingTop: PAGE_PADDING_TOP,
      newPaddingBottom: PAGE_PADDING_BOTTOM,
      newPageGap: PAGE_GAP,
      gaveUp: false,
    });
    expect(JSON.stringify(nodes)).toBe(before);
  });

  it('溢出 ⇒ 压缩后总高回到一页内；压不下去时如实报 gaveUp', () => {
    const nodes = nodesOf(OVERFLOW_TREE);
    const before = totalHeight(nodes, PAGE_PADDING_TOP, PAGE_PADDING_BOTTOM, PAGE_GAP);
    expect(before).toBeGreaterThan(A4_HEIGHT_PX);

    const result = applyOverflowCompression(nodes, PAGE_PADDING_TOP, PAGE_PADDING_BOTTOM, PAGE_GAP);
    const after = totalHeight(nodes, result.newPaddingTop, result.newPaddingBottom, result.newPageGap);

    expect(result.compressed).toBe(true);
    expect(after).toBeLessThanOrEqual(before);
    expect(after <= A4_HEIGHT_PX || result.gaveUp).toBe(true);
  });

  it('压缩只动间距类属性：结构、顺序、内容、非间距样式一概不变', () => {
    const nodes = nodesOf(OVERFLOW_TREE);
    const shape = (ns: NormalizedNode[]): unknown =>
      ns.map((n) => ({ type: n.type, content: n.content, children: shape(n.children || []) }));
    const beforeShape = JSON.stringify(shape(nodes));
    const beforeColor = nodes[0].style?.color;

    applyOverflowCompression(nodes, PAGE_PADDING_TOP, PAGE_PADDING_BOTTOM, PAGE_GAP);

    expect(JSON.stringify(shape(nodes))).toBe(beforeShape);
    expect(nodes[0].style?.color).toBe(beforeColor);
  });
});
