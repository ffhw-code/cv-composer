import { create } from 'zustand';
import { getStyleConfig } from './styleRegistry';

export interface ResumeModule {
  id: string;
  type: 'header' | 'module' | 'text' | 'heading' | 'list' | 'flex' | 'grid';
  styleId?: string;                    // 样式注册标识，如 'header-style-1'
  style?: Record<string, string>;      // 内联样式属性，如 { color: 'red' }
  name?: string;
  jobTitle?: string;
  birth?: string;
  phone?: string;
  email?: string;
  photo?: string;
  title?: string;
  content?: string;
  children: ResumeModule[];
  parentId?: string;
  width?: number;
  height?: number;
}

interface ResumeStore {
  modules: ResumeModule[];
  selectedId: string | null;
  past: ResumeModule[][];
  future: ResumeModule[][];

  addModule: (parentId: string | null, type: ResumeModule['type'], styleId?: string) => void;
  updateModule: (id: string, data: Partial<ResumeModule>) => void;
  removeModule: (id: string) => void;
  moveModule: (id: string, newParentId: string | null, index: number) => void;
  select: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  importModules: (newModules: ResumeModule[]) => void;
}

let nextId = 1;
const generateId = () => `m${nextId++}`;

const MAX_HISTORY = 30;

// 辅助递归函数
function removeModuleRecursive(modules: ResumeModule[], id: string): ResumeModule[] {
  return modules
    .filter((mod) => mod.id !== id)
    .map((mod) => ({
      ...mod,
      children: removeModuleRecursive(mod.children || [], id),
    }));
}

function addModuleRecursive(
  modules: ResumeModule[],
  parentId: string | null,
  newModule: ResumeModule
): ResumeModule[] {
  if (parentId === null) {
    return [...modules, newModule];
  }
  return modules.map((mod) => {
    if (mod.id === parentId) {
      return {
        ...mod,
        children: [...(mod.children || []), newModule],
      };
    }
    if (mod.children) {
      return {
        ...mod,
        children: addModuleRecursive(mod.children, parentId, newModule),
      };
    }
    return mod;
  });
}

function moveModuleRecursive(
  modules: ResumeModule[],
  id: string,
  newParentId: string | null,
  index: number
): ResumeModule[] {
  let removed: ResumeModule | null = null;
  const removeFrom = (nodes: ResumeModule[]): ResumeModule[] => {
    return nodes
      .filter((node) => {
        if (node.id === id) {
          removed = node;
          return false;
        }
        return true;
      })
      .map((node) => ({
        ...node,
        children: node.children ? removeFrom(node.children) : [],
      }));
  };
  const cleanedModules = removeFrom(modules);
  if (!removed) return modules;

  const insertInto = (nodes: ResumeModule[]): ResumeModule[] => {
    if (newParentId === null) {
      const newNodes = [...nodes];
      newNodes.splice(index, 0, removed!);
      return newNodes;
    }
    return nodes.map((node) => {
      if (node.id === newParentId) {
        const children = [...(node.children || [])];
        children.splice(index, 0, removed!);
        return { ...node, children };
      }
      return node.children ? { ...node, children: insertInto(node.children) } : node;
    });
  };
  return insertInto(cleanedModules);
}

export const useResumeStore = create<ResumeStore>((set, get) => {
  const pushHistory = (currentModules: ResumeModule[]) => {
    const { past } = get();
    const newPast = [...past, currentModules];
    if (newPast.length > MAX_HISTORY) newPast.shift();
    set({ past: newPast, future: [] });
  };

  return {
    modules: [],
    selectedId: null,
    past: [],
    future: [],

    addModule: (parentId, type, styleId) => {
      const state = get();
      pushHistory(state.modules);

      const config = getStyleConfig(type, styleId);
      const base: Partial<ResumeModule> = config?.defaultContent || {};
      const newModule: ResumeModule = {
        id: generateId(),
        type,
        styleId,
        style: {},                     // 内联样式初始为空
        ...base,
        children: [],
        parentId: parentId ?? undefined,
      } as ResumeModule;

      const newModules = addModuleRecursive(state.modules, parentId, newModule);
      set({ modules: newModules });
    },

    updateModule: (id, data) => {
      const state = get();
      pushHistory(state.modules);
      const update = (nodes: ResumeModule[]): ResumeModule[] =>
        nodes.map((node) => {
          if (node.id === id) return { ...node, ...data };
          return node.children ? { ...node, children: update(node.children) } : node;
        });
      set({ modules: update(state.modules) });
    },

    removeModule: (id) => {
      const state = get();
      pushHistory(state.modules);
      set({ modules: removeModuleRecursive(state.modules, id) });
    },

    moveModule: (id, newParentId, index) => {
      const state = get();
      pushHistory(state.modules);
      set({ modules: moveModuleRecursive(state.modules, id, newParentId, index) });
    },

    select: (id) => set({ selectedId: id }),

    importModules: (newModules) => {
      const state = get();
      pushHistory(state.modules);
      set({
        modules: newModules.map((mod) => ({
          ...mod,
          id: mod.id || generateId(),
          children: mod.children || [],
        })),
      });
    },

    undo: () => {
      const { past, modules } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, -1);
      set({
        past: newPast,
        future: [modules, ...get().future],
        modules: previous,
      });
    },

    redo: () => {
      const { future, modules } = get();
      if (future.length === 0) return;
      const next = future[0];
      const newFuture = future.slice(1);
      set({
        future: newFuture,
        past: [...get().past, modules],
        modules: next,
      });
    },
  };
});