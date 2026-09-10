// 基准测试：AI 输出 LayoutTree 的规范化与溢出压缩
//
// 注意：normalizeLayoutTree / applyOverflowCompression 都会就地修改输入，
// 因此每次迭代在 callback 内重新构造一棵树，保证每次测到的都是「首次规范化」路径。
// 构造开销单列一条对照项（「仅构造输入」），净耗时约为两者之差。
import { bench, describe } from 'vitest';
import { applyOverflowCompression, normalizeLayoutTree } from './layoutTreeNormalizer';
import type { LayoutTree, LayoutTreeNode, ResumeData } from '../utils/resumeParser';

const MODULE_COUNT = 8;
const PAGE_PADDING = 48;
const PAGE_GAP = 16;

const data: ResumeData = {
  name: '张三',
  jobTitle: '前端工程师',
  phone: '13800000000',
  email: 'zhangsan@example.com',
  modules: Array.from({ length: MODULE_COUNT }, (_, i) => ({
    title: `模块 ${i}`,
    content: `<p>这是第 ${i} 段内容，用于模拟真实简历中的描述文本，长度接近真实条目。</p>`,
  })),
};

function makeModule(index: number): LayoutTreeNode {
  return {
    type: 'flex',
    direction: 'column',
    gap: '8px',
    style: { padding: '12px' },
    children: [
      { type: 'heading', ref: `modules.${index}.title` },
      { type: 'text', ref: `modules.${index}.content` },
      {
        type: 'grid',
        columns: 2,
        children: [
          { type: 'text', content: `技能 ${index}-A` },
          { type: 'text', content: `技能 ${index}-B` },
        ],
      },
    ],
  };
}

/** 构造一棵典型 AI 输出形态的 LayoutTree（每次调用返回全新对象） */
function makeLayoutTree(): LayoutTree {
  return {
    header: {
      type: 'flex',
      direction: 'row',
      gap: '12px',
      style: { padding: '24px' },
      children: [
        {
          type: 'flex',
          direction: 'column',
          gap: '4px',
          children: [
            { type: 'text', ref: 'name', style: { fontSize: '24px', fontWeight: '700' } },
            { type: 'text', ref: 'jobTitle' },
          ],
        },
        { type: 'image', ref: 'photo' },
      ],
    },
    modules: Array.from({ length: MODULE_COUNT }, (_, i) => makeModule(i)),
  };
}

describe('normalizeLayoutTree 规范化', () => {
  bench('典型简历（含输入构造）', () => {
    normalizeLayoutTree(makeLayoutTree(), data);
  });

  bench('对照：仅构造输入', () => {
    makeLayoutTree();
  });
});

describe('applyOverflowCompression 溢出压缩', () => {
  bench('典型简历（含构造与规范化）', () => {
    const nodes = normalizeLayoutTree(makeLayoutTree(), data).modules;
    applyOverflowCompression(nodes, PAGE_PADDING, PAGE_PADDING, PAGE_GAP);
  });
});
