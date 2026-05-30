import { create } from 'zustand';
import { getStyleConfig } from './styleRegistry';

export interface ResumeModule {
  id: string;
  type: 'header' | 'module' | 'text' | 'heading' | 'list' | 'image' | 'flex' | 'grid' | 'divider' | 'shape';
  styleId?: string;
  style?: Record<string, string>;
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
  pagePadding: string;
  pageGap: string;
  setPagePadding: (value: string) => void;
  setPageGap: (value: string) => void;
  pagePaddingTop: string;
  setPagePaddingTop: (value: string) => void;

  addModule: (parentId: string | null, type: ResumeModule['type'], styleId?: string) => void;
  addModuleFromTemplate: (parentId: string | null, type: ResumeModule['type'], styleId: string) => void;
  updateModule: (id: string, data: Partial<ResumeModule>) => void;
  removeModule: (id: string) => void;
  moveModule: (id: string, newParentId: string | null, index: number) => void;
  duplicateModule: (sourceId: string) => void;
  select: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  importModules: (newModules: ResumeModule[]) => void;
}

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const MAX_HISTORY = 30;

// ---------- 工具函数 ----------


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

// ---------- Store 实现 ----------

export const useResumeStore = create<ResumeStore>((set, get) => {
  const pushHistory = (currentModules: ResumeModule[]) => {
    const { past } = get();
    const newPast = [...past, currentModules];
    if (newPast.length > MAX_HISTORY) newPast.shift();
    set({ past: newPast, future: [] });
  };

  // 模板递归构建（保留给 addModuleFromTemplate）
  function buildModuleFromTemplate(
    template: import('./styleRegistry').ChildTemplate,
    parentId: string
  ): ResumeModule {
    const config = getStyleConfig(template.type, template.styleId);
    const base = config?.defaultContent || {};
    const id = generateId();
    const module: ResumeModule = {
      id,
      type: template.type,
      styleId: template.styleId,
      style: { ...template.defaultStyle },
      ...base,
      ...template.defaultProps,
      children: [],
      parentId,
    } as ResumeModule;

    if (template.children && template.children.length > 0) {
      module.children = template.children.map(child =>
        buildModuleFromTemplate(child, id)
      );
    }
    return module;
  }

  return {
    modules: [],
    selectedId: null,
    past: [],
    future: [],
    pagePadding: '40px',
    pageGap: '16px',
    pagePaddingTop: '40px',
    setPagePadding: (value: string) => set({ pagePadding: value }),
    setPageGap: (value: string) => set({ pageGap: value }),
    setPagePaddingTop: (value: string) => set({ pagePaddingTop: value }),

    // 基础添加（用于叶子控件）
    addModule: (parentId, type, styleId) => {
      const state = get();
      pushHistory(state.modules);

      const config = getStyleConfig(type, styleId);
      const base: Partial<ResumeModule> = config?.defaultContent || {};
      const newModule: ResumeModule = {
        id: generateId(),
        type,
        styleId,
        style: {},
        ...base,
        children: [],
        parentId: parentId ?? undefined,
      } as ResumeModule;

      const newModules = addModuleRecursive(state.modules, parentId, newModule);
      set({ modules: newModules });
    },

    // 模板添加（保留兼容）
    addModuleFromTemplate: (parentId, type, styleId) => {
      const state = get();
      pushHistory(state.modules);

      const config = getStyleConfig(type, styleId);
      if (!config) return;

      const parentIdGen = generateId();
      const parentModule: ResumeModule = {
        id: parentIdGen,
        type,
        styleId,
        style: { ...config.defaultStyle },
        children: [],
        parentId: parentId ?? undefined,
      } as ResumeModule;

      if (config.defaultChildren && config.defaultChildren.length > 0) {
        parentModule.children = config.defaultChildren.map(child =>
          buildModuleFromTemplate(child, parentIdGen)
        );
      }

      const newModules = addModuleRecursive(state.modules, parentId, parentModule);
      set({ modules: newModules });
    },


    // 更新模块
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

    // 删除模块
    removeModule: (id) => {
      const state = get();
      pushHistory(state.modules);
      set({ modules: removeModuleRecursive(state.modules, id) });
    },

    // 移动模块
    moveModule: (id, newParentId, index) => {
      const state = get();
      pushHistory(state.modules);
      set({ modules: moveModuleRecursive(state.modules, id, newParentId, index) });
    },

    // 复制模块
    duplicateModule: (sourceId: string) => {
      const { modules } = get();
      pushHistory(modules);

      const deepClone = (mod: ResumeModule): ResumeModule => ({
        ...mod,
        id: generateId(),
        style: mod.style ? { ...mod.style } : {},
        children: mod.children ? mod.children.map(deepClone) : [],
        photo: mod.photo,
      });

      let sourceModule: ResumeModule | null = null;
      const findSource = (nodes: ResumeModule[]): void => {
        for (const node of nodes) {
          if (node.id === sourceId) {
            sourceModule = node;
            return;
          }
          if (node.children) findSource(node.children);
        }
      };
      findSource(modules);
      if (!sourceModule) return;

      const newModule = deepClone(sourceModule);

      const insertCloneAfter = (nodes: ResumeModule[]): ResumeModule[] => {
        const result: ResumeModule[] = [];
        for (const node of nodes) {
          if (node.id === sourceId) {
            result.push(node);
            result.push(newModule);
          } else if (node.children) {
            result.push({ ...node, children: insertCloneAfter(node.children) });
          } else {
            result.push(node);
          }
        }
        return result;
      };

      set({ modules: insertCloneAfter(modules) });
    },


    // 选中
    select: (id) => set({ selectedId: id }),

    // 导入
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

    // 撤销 / 重做
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