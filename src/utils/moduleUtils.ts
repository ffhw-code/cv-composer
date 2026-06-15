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
