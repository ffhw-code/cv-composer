import { create } from 'zustand';
import { getStyleConfig } from './styleRegistry';

export interface ResumeModule {
  id: string;
  type: 'header' | 'module';
  style?: string;
  name?: string;
  jobTitle?: string;
  birth?: string;
  phone?: string;
  email?: string;
  photo?: string;
  title?: string;
  content?: string;
}

interface ResumeStore {
  modules: ResumeModule[];
  addModule: (type: 'header' | 'module', style?: string) => void;
  updateModule: (id: string, data: Partial<ResumeModule>) => void;
  removeModule: (id: string) => void;
  importModules: (newModules: ResumeModule[]) => void; // 新增
}

let nextId = 1;
const generateId = () => `m${nextId++}`;

export const useResumeStore = create<ResumeStore>((set) => ({
  modules: [],

  addModule: (type, style) =>
    set((state) => {
      // 查找样式的默认内容
      const config = getStyleConfig(type, style);
      const base: Partial<ResumeModule> = config?.defaultContent || {};

      const newModule: ResumeModule = {
        id: generateId(),
        type,
        style,
        ...base, // 用默认值填充
      } as ResumeModule;

      return { modules: [...state.modules, newModule] };
    }),

  updateModule: (id, data) =>
    set((state) => ({
      modules: state.modules.map((mod) =>
        mod.id === id ? { ...mod, ...data } : mod
      ),
    })),

  removeModule: (id) =>
    set((state) => ({
      modules: state.modules.filter((mod) => mod.id !== id),
    })),

  // 大模型批量导入接口：直接替换整个 modules，每个元素可带 style 标识
  importModules: (newModules) =>
    set(() => ({
      modules: newModules.map((mod) => ({
        ...mod,
        id: mod.id || generateId(), // 如果没有 id，自动生成
      })),
    })),
}));