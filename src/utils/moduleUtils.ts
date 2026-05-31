import type { ResumeModule } from '../store/useResumeStore';

/** 在模块树中递归查找指定 id 的模块 */
export function findModuleById(modules: ResumeModule[], id: string): ResumeModule | null {
  for (const mod of modules) {
    if (mod.id === id) return mod;
    if (mod.children) {
      const found = findModuleById(mod.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 查找指定 id 的父模块 */
export function findParentById(modules: ResumeModule[], id: string): ResumeModule | null {
  for (const mod of modules) {
    if (mod.children && mod.children.some((c) => c.id === id)) return mod;
    if (mod.children) {
      const found = findParentById(mod.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 收集所有模块的 id（用于拖拽排序上下文） */
export function getAllModuleIds(modules: ResumeModule[]): string[] {
  let ids: string[] = [];
  for (const mod of modules) {
    ids.push(mod.id);
    if (mod.children) ids = ids.concat(getAllModuleIds(mod.children));
  }
  return ids;
}
