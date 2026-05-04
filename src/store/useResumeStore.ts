import { create } from 'zustand';

// 单个模块的数据结构
export interface ResumeModule {
  id: string;
  type: 'header' | 'module';
  // 简历头专用字段
  name?: string;
  jobTitle?: string;
  birth?: string;
  phone?: string;
  email?: string;
  photo?: string; // 照片URL，暂时为空
  // 通用模块字段
  title?: string;
  content?: string;
}

interface ResumeStore {
  modules: ResumeModule[];
  addModule: (type: 'header' | 'module') => void;
  updateModule: (id: string, data: Partial<ResumeModule>) => void;
  removeModule: (id: string) => void;
}

let nextId = 1;
const generateId = () => `m${nextId++}`;

export const useResumeStore = create<ResumeStore>((set) => ({
  modules: [],

  addModule: (type) =>
    set((state) => {
      const newModule: ResumeModule =
        type === 'header'
          ? {
              id: generateId(),
              type: 'header',
              name: '姓名',
              jobTitle: '求职意向',
              birth: '出生年月',
              phone: '电话',
              email: '邮箱',
              photo: '',
            }
          : {
              id: generateId(),
              type: 'module',
              title: '模块标题',
              content: '点击此处编辑内容...',
            };
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
}));