import type { ResumeModule } from '../store/useResumeStore';

// ========== 树查找工具 ==========

export function findModuleById(
  nodes: ResumeModule[],
  id: string,
): ResumeModule | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findModuleById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParentById(
  nodes: ResumeModule[],
  id: string,
  parent?: ResumeModule,
): ResumeModule | null {
  for (const node of nodes) {
    if (node.id === id) return parent || null;
    if (node.children?.length) {
      const found = findParentById(node.children, id, node);
      if (found) return found;
    }
  }
  return null;
}

export function getAllModuleIds(nodes: ResumeModule[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children?.length) {
      ids.push(...getAllModuleIds(node.children));
    }
  }
  return ids;
}

// ========== 布局树导出（诊断用） ==========

interface ExportedNode {
  type: string;
  styleId?: string;
  content?: string;
  style?: Record<string, string>;
  children?: ExportedNode[];
}

/** 将画布模块树导出为类 LayoutTree JSON 结构 */
export function exportLayoutTree(modules: ResumeModule[]): ExportedNode[] {
  function convert(node: ResumeModule): ExportedNode {
    const result: ExportedNode = {
      type: node.type,
      styleId: node.styleId,
      content: node.content
        ? node.content.replace(/<[^>]+>/g, '').substring(0, 200)
        : '',
      style: Object.keys(node.style || {}).length > 0
        ? { ...node.style }
        : undefined,
    };
    if (node.children && node.children.length > 0) {
      result.children = node.children.map(convert);
    }
    return result;
  }
  return modules.map(convert);
}

// ========== 画布状态摘要（给 AI 注入用） ==========

function countAll(nodes: ResumeModule[]): number {
  let count = nodes.length;
  for (const n of nodes) {
    if (n.children) count += countAll(n.children);
  }
  return count;
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 1.3);

/** 将画布模块树格式化为树状文本，带 token 预算截断 */
export function getCanvasStateSummary(modules: ResumeModule[]): string {
  if (modules.length === 0) return '（画布为空）';

  const MAX_TOKENS = 3000;
  const lines: string[] = [];
  let estimatedTokens = 0;

  const formatNode = (node: ResumeModule, depth: number, isLast: boolean): string => {
    const indent = '  '.repeat(depth);
    const prefix = isLast ? '└─ ' : '├─ ';
    const contentSnippet = node.content
      ? node.content.replace(/<[^>]+>/g, '').substring(0, 100)
      : '';
    const line = `${indent}${prefix}${node.id} (${node.type}${node.styleId ? ', ' + node.styleId : ''})${contentSnippet ? ': ' + JSON.stringify(contentSnippet) : ''}`;
    const tokenEst = estimateTokens(line);
    if (estimatedTokens + tokenEst > MAX_TOKENS) {
      return '__TRUNCATED__';
    }
    estimatedTokens += tokenEst;
    return line;
  };

  const totalModules = countAll(modules);

  const walk = (nodes: ResumeModule[], depth: number): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      const isLast = i === nodes.length - 1;
      const line = formatNode(nodes[i], depth, isLast);
      if (line === '__TRUNCATED__') {
        lines.push('  '.repeat(depth) + `... (共 ${totalModules} 个模块，已截断)`);
        return true;
      }
      lines.push(line);
      if (nodes[i].children && nodes[i].children.length > 0) {
        const wasTruncated = walk(nodes[i].children, depth + 1);
        if (wasTruncated) return true;
      }
    }
    return false;
  };

  walk(modules, 0);
  return lines.join('\n');
}
