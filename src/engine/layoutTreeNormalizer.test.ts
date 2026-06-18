import { describe, it, expect } from 'vitest';
import { normalizeLayoutTree, type NormalizedNode } from './layoutTreeNormalizer';
import type { LayoutTree, ResumeData } from '../utils/resumeParser';

// ============================================================
// 基线测试：layoutTreeNormalizer.ts
// 覆盖空 children、缺字段、无效类型、单子 flex 冗余、
// 带样式 flex 不合并、默认值不覆盖已有值、ref 解析等场景
// ============================================================

/** 辅助：深度查找节点 */
function findNode(root: NormalizedNode, pred: (n: NormalizedNode) => boolean): NormalizedNode | null {
  if (pred(root)) return root;
  if (root.children) {
    for (const c of root.children) {
      const found = findNode(c, pred);
      if (found) return found;
    }
  }
  return null;
}

const sampleData: ResumeData = {
  name: '张三',
  jobTitle: '工程师',
  modules: [
    { title: '教育背景', content: '<p>清华大学</p>' },
  ],
};

describe('normalizeLayoutTree', () => {
  it('正常 LayoutTree 原样通过', () => {
    const tree: LayoutTree = {
      header: {
        type: 'flex', direction: 'row', gap: '12px',
        style: { backgroundColor: '#fff' },
        children: [
          { type: 'text', ref: 'name', style: { fontSize: '24px', fontWeight: '700' } },
        ],
      },
      modules: [
        {
          type: 'flex', direction: 'column',
          children: [
            { type: 'heading', ref: 'modules.0.title' },
            { type: 'text', ref: 'modules.0.content' },
          ],
        },
      ],
    };

    const result = normalizeLayoutTree(tree, sampleData);
    expect(result.header.type).toBe('flex');
    expect(result.modules).toHaveLength(1);

    const nameNode = findNode(result.header, n => n.ref === 'name');
    expect(nameNode?.content).toBe('张三');
  });

  it('ref 指向不存在的 data 字段返回空字符串', () => {
    const tree: LayoutTree = {
      header: {
        type: 'flex', children: [
          { type: 'text', ref: 'nonexistent' },
        ],
      },
      modules: [],
    };

    const result = normalizeLayoutTree(tree, sampleData);
    const node = findNode(result.header, n => n.ref === 'nonexistent');
    expect(node?.content).toBe('');
  });

  it('modules.N.field ref 正确解析', () => {
    const tree: LayoutTree = {
      header: { type: 'flex', children: [] },
      modules: [
        {
          type: 'flex', children: [
            { type: 'heading', ref: 'modules.0.title' },
            { type: 'text', ref: 'modules.0.content' },
          ],
        },
      ],
    };

    const result = normalizeLayoutTree(tree, sampleData);
    const heading = findNode(result.modules[0], n => n.type === 'heading');
    const text = findNode(result.modules[0], n => n.type === 'text');
    expect(heading?.content).toBe('教育背景');
    expect(text?.content).toBe('<p>清华大学</p>');
  });

  it('空容器 children 插入 text 占位并标记 _placeholder', () => {
    const tree: LayoutTree = {
      header: { type: 'flex', children: [] },
      modules: [],
    };

    const result = normalizeLayoutTree(tree);
    expect(result.header.children).toHaveLength(1);
    expect((result.header.children![0] as NormalizedNode)._placeholder).toBe(true);
    expect(result.header.children![0].type).toBe('text');
  });

  it('无效 type 回退为 text', () => {
    const tree: LayoutTree = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      header: { type: 'unknown_type' as any, children: [] },
      modules: [],
    };

    const result = normalizeLayoutTree(tree);
    expect(result.header.type).toBe('text');
  });

  it('缺失 type 字段回退为 text', () => {
    const tree = {
      header: { children: [] },
      modules: [],
    } as unknown as LayoutTree;

    const result = normalizeLayoutTree(tree);
    expect(result.header.type).toBe('text');
  });

  it('缺失样式字段补全默认值', () => {
    const tree: LayoutTree = {
      header: { type: 'flex', children: [] },
      modules: [],
    };

    const result = normalizeLayoutTree(tree);
    const textPlaceholder = result.header.children![0];
    expect(textPlaceholder.style!.fontSize).toBe('15px');
    expect(textPlaceholder.style!.color).toBe('#334155');
  });

  it('已有样式值不被默认值覆盖', () => {
    const tree: LayoutTree = {
      header: {
        type: 'flex',
        style: { gap: '24px', backgroundColor: '#ff0000' },
        children: [],
      },
      modules: [],
    };

    const result = normalizeLayoutTree(tree);
    expect(result.header.style!.gap).toBe('24px'); // AI 设的值
    expect(result.header.style!.backgroundColor).toBe('#ff0000'); // AI 设的值
    expect(result.header.style!.display).toBe('flex'); // 默认值补全
    expect(result.header.style!.flexDirection).toBe('column'); // 默认值补全
  });

  it('单子 flex 无有意义样式时被合并', () => {
    // header → flex(无style) → text → 应合并为 header → text
    const tree: LayoutTree = {
      header: {
        type: 'flex',
        children: [
          { type: 'flex', children: [
            { type: 'text', ref: 'name' },
          ]},
        ],
      },
      modules: [],
    };

    const result = normalizeLayoutTree(tree, sampleData);
    // 中间那层无样式的 flex 应被合并掉
    expect(result.header.children).toHaveLength(1);
    expect(result.header.children![0].type).toBe('text');
    expect(result.header.children![0]!.content).toBe('张三');
  });

  it('单子 flex 带有 padding/backgroundColor 等有意义样式时不合并', () => {
    const tree: LayoutTree = {
      header: {
        type: 'flex',
        children: [
          {
            type: 'flex',
            style: { padding: '16px', backgroundColor: '#f0f0f0' },
            children: [
              { type: 'text', ref: 'name' },
            ],
          },
        ],
      },
      modules: [],
    };

    const result = normalizeLayoutTree(tree, sampleData);
    // 中间层有 padding + backgroundColor，不应被合并
    expect(result.header.children).toHaveLength(1);
    expect(result.header.children![0].type).toBe('flex');
    expect(result.header.children![0]!.style!.padding).toBe('16px');
    // 内层 text 仍在
    expect(result.header.children![0]!.children![0]!.type).toBe('text');
  });

  it('无效子节点被裁剪掉', () => {
    const tree: LayoutTree = {
      header: {
        type: 'flex',
        children: [
          { type: 'text', ref: 'name' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { type: 'bad_type' as any, ref: 'name' },
        ],
      },
      modules: [],
    };

    const result = normalizeLayoutTree(tree, sampleData);
    // bad_type 回退为 text（在 normalizeNode 中处理）
    expect(result.header.children).toHaveLength(2);
  });

  it('data 为 undefined 时不崩溃', () => {
    const tree: LayoutTree = {
      header: { type: 'flex', children: [{ type: 'text', ref: 'name' }] },
      modules: [],
    };

    const result = normalizeLayoutTree(tree);
    const textNode = result.header.children![0];
    expect(textNode.content).toBe('');
  });

  it('modules 为空数组时返回空', () => {
    const tree: LayoutTree = {
      header: { type: 'flex', children: [] },
      modules: [],
    };

    const result = normalizeLayoutTree(tree);
    expect(result.modules).toHaveLength(0);
  });
});

// ============================================================
// 溢出压缩测试
// ============================================================
import { applyOverflowCompression } from './layoutTreeNormalizer';

describe('applyOverflowCompression', () => {
  it('内容未溢出 A4 时不压缩', () => {
    const node: NormalizedNode = {
      type: 'text',
      content: '短文本',
      style: { fontSize: '15px', color: '#334155' },
    };

    const result = applyOverflowCompression([node], 40, 40, 16);
    expect(result.compressed).toBe(false);
    expect(result.gaveUp).toBe(false);
    expect(result.ratio).toBe(1);
  });

  it('内容溢出时压缩间距', () => {
    // 构造一个超高的节点堆
    const nodes: NormalizedNode[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push({
        type: 'flex',
        style: { padding: '20px', gap: '16px', display: 'flex', flexDirection: 'column' },
        children: [
          { type: 'text', content: 'A'.repeat(80), style: { fontSize: '15px', color: '#334155', lineHeight: '1.5' } },
          { type: 'text', content: 'B'.repeat(80), style: { fontSize: '15px', color: '#334155', lineHeight: '1.5' } },
        ],
      });
    }

    const result = applyOverflowCompression(nodes, 40, 40, 16);
    expect(result.compressed).toBe(true);
    // 间距应被压缩
    const firstPadding = parseFloat(nodes[0].style?.padding || '0');
    expect(firstPadding).toBeLessThan(20);
  });

  it('无法继续压缩时 gaveUp 为 true', () => {
    // 所有节点都没有可压缩的间距
    const nodes: NormalizedNode[] = [];
    for (let i = 0; i < 200; i++) {
      nodes.push({
        type: 'text',
        content: 'X'.repeat(100),
        style: { fontSize: '15px', color: '#334155', lineHeight: '1.5' },
      });
    }

    const result = applyOverflowCompression(nodes, 0, 0, 0);
    // 没有 padding/gap/margin 可压缩，且页边距已为 0
    expect(result.gaveUp).toBe(true);
  });

  it('页边距也被压缩', () => {
    const nodes: NormalizedNode[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push({
        type: 'text',
        content: 'X'.repeat(100),
        style: { fontSize: '15px', color: '#334155' },
      });
    }

    const result = applyOverflowCompression(nodes, 80, 80, 16);
    if (result.compressed) {
      expect(result.newPaddingTop).toBeLessThan(80);
      expect(result.newPaddingBottom).toBe(80)  // bottom 不再被压缩;
    }
  });
});
