// src/engine/layoutTreeNormalizer.ts
// 对 AI 输出的 LayoutTree 做保守规范化，确保 translateLayoutTree 收到合法数据。
// 原则：不覆盖 AI 已有值，不合并带样式的中间 flex，占位标记 _placeholder。

import type { LayoutTree, LayoutTreeNode, ResumeData } from '../utils/resumeParser';

// ==================== 类型 ====================

/** 规范化后的节点，增加占位标记 */
export interface NormalizedNode extends LayoutTreeNode {
  /** 占位节点：AI 未提供此节点，由规范化层自动插入 */
  _placeholder?: boolean;
}

export interface NormalizedTree {
  header: NormalizedNode;
  modules: NormalizedNode[];
}

// ==================== 常量 ====================

const VALID_TYPES = new Set(['flex', 'grid', 'text', 'heading', 'list', 'image']);

const STYLE_DEFAULTS: Record<string, Record<string, string>> = {
  text: { fontSize: '15px', color: '#334155', lineHeight: '1.6' },
  heading: { fontSize: '20px', fontWeight: '700', color: '#0f172a' },
  list: { fontSize: '15px', color: '#334155', lineHeight: '1.6' },
  image: { width: '100px', height: '130px', borderRadius: '8px', objectFit: 'cover' },
  flex: { display: 'flex', flexDirection: 'column', gap: '8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' },
};



// ==================== Ref 解析 ====================

function resolveRef(ref: string, data?: ResumeData): string {
  if (!data) return '';

  // modules.N.entries.M.field
  const entryMatch = ref.match(/^modules\.(\d+)\.entries\.(\d+)\.(.+)$/);
  if (entryMatch) {
    const modIdx = parseInt(entryMatch[1], 10);
    const entryIdx = parseInt(entryMatch[2], 10);
    const field = entryMatch[3];
    const mod = data.modules?.[modIdx];
    if (!mod?.entries) return '';
    return mod.entries[entryIdx]?.[field] || '';
  }

  // modules.N.field
  const modMatch = ref.match(/^modules\.(\d+)\.(.+)$/);
  if (modMatch) {
    const idx = parseInt(modMatch[1], 10);
    const field = modMatch[2];
    const mod = data.modules?.[idx];
    if (!mod) return '';
    if (field === 'content') return mod.content || '';
    if (field === 'title') return mod.title || '';
    return (mod as unknown as Record<string, string>)[field] || '';
  }

  return (data as Record<string, unknown>)[ref] as string || '';
}

// ==================== 核心规范化 ====================

function normalizeNode(node: LayoutTreeNode, data?: ResumeData): NormalizedNode | null {
  // 0. 记录 AI 是否有自定义 style（默认补全前）
  const hadCustomStyle = !!node.style && Object.keys(node.style).length > 0;

  // 1. 类型裁剪
  if (!node.type || !VALID_TYPES.has(node.type)) {
    node.type = (node.type && VALID_TYPES.has(node.type)) ? node.type : 'text';
  }

  // 2. 补全缺失默认样式（不覆盖已有值）
  const defaults = STYLE_DEFAULTS[node.type] || {};
  const mergedStyle: Record<string, string> = { ...defaults };
  if (node.style) {
    for (const [k, v] of Object.entries(node.style)) {
      mergedStyle[k] = v;
    }
  }
  node.style = mergedStyle;

  // 3. 解析 ref → content
  if (node.ref && !node.content) {
    node.content = resolveRef(node.ref, data);
  }

  // 暂存 AI 原始 style 标记，供父节点合并判断
  (node as NormalizedNode & { _hadCustomStyle?: boolean })._hadCustomStyle = hadCustomStyle;

  // 4. 处理 children
  const isContainer = node.type === 'flex' || node.type === 'grid';
  const rawChildren = node.children || [];
  const normalizedChildren: NormalizedNode[] = [];

  for (const child of rawChildren) {
    const normalized = normalizeNode(child, data);
    if (normalized) normalizedChildren.push(normalized);
  }

  // 5. 递归后合并单子 flex（保守条件：仅合并 AI 未设自定义样式的中间 flex）
  if (isContainer && normalizedChildren.length === 1) {
    const onlyChild = normalizedChildren[0];
    const childHadCustom = (onlyChild as NormalizedNode & { _hadCustomStyle?: boolean })._hadCustomStyle;
    if (onlyChild.type === 'flex' && !childHadCustom && !onlyChild._placeholder) {
      // 将孙子节点提升替换该单子 flex
      node.children = onlyChild.children;
    }
  } else if (isContainer && normalizedChildren.length === 0) {
    // 6. 空容器插入 text 占位
    const placeholder: NormalizedNode = {
      type: 'text',
      content: '',
      style: { fontSize: '15px', color: '#334155' },
      _placeholder: true,
    };
    node.children = [placeholder];
  } else {
    node.children = normalizedChildren;
  }

  return node as NormalizedNode;
}

// ==================== 入口 ====================

export function normalizeLayoutTree(tree: LayoutTree, data?: ResumeData): NormalizedTree {
  return {
    header: normalizeNode(tree.header, data) || {
      type: 'flex',
      direction: 'column',
      style: STYLE_DEFAULTS.flex,
      children: [{ type: 'text', content: '', style: STYLE_DEFAULTS.text, _placeholder: true }] as NormalizedNode[],
    },
    modules: (tree.modules || []).map(m => normalizeNode(m, data)).filter(Boolean) as NormalizedNode[],
  };
}



// ==================== LayoutTree 层级溢出压缩 ====================

const A4_HEIGHT_PX = 1123;

function estimateNodeHeight(node: NormalizedNode): number {
  const s = node.style;
  let h = 0;

  const px = (key: string): number => {
    const v = s?.[key];
    if (!v) return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const paddingTop = px('paddingTop') || px('padding') || 0;
  const paddingBottom = px('paddingBottom') || px('padding') || 0;
  const gap = px('gap') || 0;

  switch (node.type) {
    case 'text':
    case 'heading':
    case 'list': {
      const fontSize = px('fontSize') || 15;
      const lineHeight = parseFloat(s?.lineHeight || '1.5');
      const text = (node.content || '').replace(/<[^>]+>/g, '');
      const charWidth = 14;
      const containerWidth = 650;
      const charsPerLine = Math.max(1, Math.floor(containerWidth / charWidth));
      const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
      h = fontSize * lineHeight * lines + paddingTop + paddingBottom;
      break;
    }
    case 'image': {
      h = px('height') || 100;
      break;
    }
    case 'flex':
    case 'grid': {
      let childrenH = 0;
      if (node.children) {
        for (const c of node.children) childrenH += estimateNodeHeight(c);
      }
      const childCount = node.children?.length || 1;
      h = childrenH + gap * (childCount - 1) + paddingTop + paddingBottom;
      break;
    }
  }
  return h;
}

const COMPRESS_KEYS = ['padding', 'paddingTop', 'paddingBottom', 'gap', 'margin', 'marginTop', 'marginBottom'];

function canCompress(node: NormalizedNode): boolean {
  const s = node.style;
  if (!s) return false;
  for (const k of COMPRESS_KEYS) {
    const v = s[k];
    if (!v) continue;
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return true;
  }
  if (node.children) return node.children.some(canCompress);
  return false;
}

function compressNode(node: NormalizedNode, ratio: number): void {
  for (const k of COMPRESS_KEYS) {
    const v = node.style?.[k];
    if (!v) continue;
    const num = parseFloat(v);
    if (isNaN(num)) continue;
    const compressed = Math.max(0, Math.round(num * ratio));
    if (node.style) node.style[k] = compressed + 'px';
  }
  if (node.children) {
    for (const c of node.children) compressNode(c, ratio);
  }
}

export interface CompressionResult {
  compressed: boolean;
  ratio: number;
  newPaddingTop: number;
  newPaddingBottom: number;
  newPageGap: number;
  gaveUp: boolean;
}

/**
 * 分阶段溢出压缩，优先级：内部间距 → 模块间距 → 页面上边距
 * 压缩强度与溢出程度成正比，每阶段均可降至 0
 */
export function applyOverflowCompression(
  nodes: NormalizedNode[],
  pagePaddingTop: number,
  pagePaddingBottom: number,
  pageGap: number,
): CompressionResult {
  const MAX_ITER_PER_STAGE = 5;
  let padTop = pagePaddingTop;
  const padBottom = pagePaddingBottom;
  let gap = pageGap;
  let compressed = false;
  let finalRatio = 1;

  function currentTotal(): number {
    let h = padTop + padBottom;
    for (const node of nodes) h += estimateNodeHeight(node);
    h += gap * Math.max(0, nodes.length - 1);
    return h;
  }

  // Stage 1: 仅压缩内部间距（可降至 0）
  for (let iter = 0; iter < MAX_ITER_PER_STAGE; iter++) {
    if (currentTotal() <= A4_HEIGHT_PX) break;
    if (!nodes.some(canCompress)) break;

    const ratio = A4_HEIGHT_PX / currentTotal() * 0.95;
    finalRatio = ratio;
    for (const node of nodes) compressNode(node, ratio);
    compressed = true;
  }

  // Stage 2: 再加上模块间距 pageGap
  if (currentTotal() > A4_HEIGHT_PX && (nodes.some(canCompress) || gap > 0)) {
    for (let iter = 0; iter < MAX_ITER_PER_STAGE; iter++) {
      if (currentTotal() <= A4_HEIGHT_PX) break;
      if (!nodes.some(canCompress) && gap === 0) break;

      const ratio = A4_HEIGHT_PX / currentTotal() * 0.95;
      finalRatio = ratio;
      for (const node of nodes) compressNode(node, ratio);
      gap = Math.max(0, Math.round(gap * ratio));
      compressed = true;
    }
  }

  // Stage 3: 再加上页面上边距
  if (currentTotal() > A4_HEIGHT_PX && (nodes.some(canCompress) || gap > 0 || padTop > 0)) {
    for (let iter = 0; iter < MAX_ITER_PER_STAGE; iter++) {
      if (currentTotal() <= A4_HEIGHT_PX) break;
      if (!nodes.some(canCompress) && gap === 0 && padTop === 0) break;

      const ratio = A4_HEIGHT_PX / currentTotal() * 0.95;
      finalRatio = ratio;
      for (const node of nodes) compressNode(node, ratio);
      gap = Math.max(0, Math.round(gap * ratio));
      padTop = Math.max(0, Math.round(padTop * ratio));
      compressed = true;
    }
  }

  const stillOverflows = currentTotal() > A4_HEIGHT_PX;

  return {
    compressed,
    ratio: finalRatio,
    newPaddingTop: padTop,
    newPaddingBottom: padBottom,
    newPageGap: gap,
    gaveUp: stillOverflows,
  };
}
