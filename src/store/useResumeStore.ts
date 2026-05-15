import { create } from 'zustand';
import { getStyleConfig } from './styleRegistry';

export interface ResumeModule {
  id: string;
  type: 'header' | 'module' | 'text' | 'heading' | 'list' | 'image' | 'flex' | 'grid';
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

  addModule: (parentId: string | null, type: ResumeModule['type'], styleId?: string) => void;
  addModuleFromTemplate: (parentId: string | null, type: ResumeModule['type'], styleId: string) => void;
  addModuleByDecomposition: (parentId: string | null, type: ResumeModule['type'], styleId: string) => void;
  updateModule: (id: string, data: Partial<ResumeModule>) => void;
  removeModule: (id: string) => void;
  moveModule: (id: string, newParentId: string | null, index: number) => void;
  duplicateModule: (sourceId: string) => void;
  decomposeModule: (id: string) => void;                    // 新增：分解固定组件
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

function findModuleById(modules: ResumeModule[], id: string): ResumeModule | null {
  for (const mod of modules) {
    if (mod.id === id) return mod;
    if (mod.children) {
      const found = findModuleById(mod.children, id);
      if (found) return found;
    }
  }
  return null;
}

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

    // 分解器添加（备用，目前不直接使用，保留以便未来扩展）
    addModuleByDecomposition: (parentId, type, styleId) => {
      const state = get();
      pushHistory(state.modules);

      const config = getStyleConfig(type, styleId);
      if (!config || !config.decomposer) {
        console.warn('无分解器，降级为模板创建');
        get().addModuleFromTemplate(parentId, type, styleId);
        return;
      }

      const parentIdGen = generateId();
      const parentModule: ResumeModule = {
        id: parentIdGen,
        type,
        styleId,
        style: { ...config.defaultStyle },
        children: [],
        parentId: parentId ?? undefined,
      } as ResumeModule;

      const rawChildren = config.decomposer(parentIdGen);
      const fixIds = (nodes: ResumeModule[], parentId: string) => {
        for (const node of nodes) {
          node.id = node.id || generateId();
          node.parentId = parentId;
          if (node.children && node.children.length > 0) {
            fixIds(node.children, node.id);
          }
        }
      };
      fixIds(rawChildren, parentIdGen);
      parentModule.children = rawChildren;

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

    // ========== 新方法：分解固定组件 ==========
    decomposeModule: (id: string) => {
      const state = get();
      const modules = state.modules;
      pushHistory(modules);

      // 查找目标模块
      const target = findModuleById(modules, id);
      if (!target) return;

      const config = getStyleConfig(target.type, target.styleId);
      if (!config || !config.decomposer) {
        console.warn('该样式没有分解器，无法分解');
        return;
      }

      // 调用分解器生成子模块（初步结构）
      const rawChildren = config.decomposer(id);

      // 内容迁移：将旧模块的字段填充到对应的子模块
      const children: ResumeModule[] = rawChildren.map((child) => {
        const filled = { ...child, id: child.id || generateId(), parentId: id };

        // 根据子模块类型和原有字段迁移内容
        if (child.type === 'text' || child.type === 'heading') {
          if (child.name && target.name) {
            filled.content = target.name;
            filled.name = target.name;
          } else if (child.jobTitle && target.jobTitle) {
            filled.content = target.jobTitle;
            filled.jobTitle = target.jobTitle;
          } else if (child.birth && target.birth) {
            filled.content = target.birth;
            filled.birth = target.birth;
          } else if (child.phone && target.phone) {
            filled.content = target.phone;
            filled.phone = target.phone;
          } else if (child.email && target.email) {
            filled.content = target.email;
            filled.email = target.email;
          } else if (child.title && target.title) {
            filled.content = target.title;
            filled.title = target.title;
          } else if (!filled.content) {
            // 保持分解器提供的默认内容
          }
        } else if (child.type === 'image') {
          if (target.photo) {
            filled.content = target.photo;
          }
        }

        // 递归修正嵌套 children 的 id 和 parentId
        if (filled.children && filled.children.length > 0) {
          const fixNested = (nodes: ResumeModule[], parentId: string) => {
            for (const node of nodes) {
              node.id = node.id || generateId();
              node.parentId = parentId;
              if (node.children && node.children.length > 0) {
                fixNested(node.children, node.id);
              }
            }
          };
          fixNested(filled.children, filled.id);
        }

        return filled;
      });

      // 不可变更新：生成新的 modules 树，将目标模块替换为带有 children 的版本，并清除旧字段
      const updateTree = (nodes: ResumeModule[]): ResumeModule[] => {
        return nodes.map((node) => {
          if (node.id === id) {
            // 返回新模块：保留样式，设置 children，移除旧数据字段
            const { name, jobTitle, birth, phone, email, photo, title, content, ...rest } = node;
            return {
              ...rest,
              children,
              // 确保 style 保留
            } as ResumeModule;
          }
          if (node.children) {
            return { ...node, children: updateTree(node.children) };
          }
          return node;
        });
      };

      set({ modules: updateTree(modules) });
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