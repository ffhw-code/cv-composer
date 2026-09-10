// 基准测试：模块树遍历与画布摘要生成
//
// getCanvasStateSummary 是 AI 请求链路的热路径——每轮对话都要把整棵
// 画布树格式化成文本注入 system prompt，因此单独覆盖典型与触发截断两种规模。
import { bench, describe } from 'vitest';
import {
  exportLayoutTree,
  findModuleById,
  findParentById,
  getAllModuleIds,
  getCanvasStateSummary,
} from './moduleUtils';
import type { ResumeModule } from '../types/resume';

/** 构造一份典型简历模块树（约 40 个节点，含嵌套容器） */
function makeResume(): ResumeModule[] {
  const header: ResumeModule = {
    id: 'header-1',
    type: 'header',
    styleId: 'header-classic',
    name: '张三',
    jobTitle: '前端工程师',
    phone: '13800000000',
    email: 'zhangsan@example.com',
    children: [
      { id: 'name-1', type: 'text', content: '张三', children: [] },
      { id: 'title-1', type: 'text', content: '前端工程师', children: [] },
    ],
  };

  const modules: ResumeModule[] = Array.from({ length: 8 }, (_, i): ResumeModule => ({
    id: `mod-${i}`,
    type: 'module',
    styleId: 'module-card',
    title: `模块 ${i}`,
    children: [
      { id: `h-${i}`, type: 'heading', content: `模块 ${i}`, children: [] },
      {
        id: `t-${i}`,
        type: 'text',
        content: `<p>这是第 ${i} 段描述文本，用于模拟真实简历内容，长度接近实际情况。</p>`,
        children: [],
      },
      {
        id: `g-${i}`,
        type: 'grid',
        children: Array.from({ length: 4 }, (_, j): ResumeModule => ({
          id: `g-${i}-${j}`,
          type: 'text',
          content: `技能项 ${i}-${j}`,
          children: [],
        })),
      },
    ],
  }));

  return [header, ...modules];
}

/** 长简历：用于触发 getCanvasStateSummary 的 token 预算截断分支 */
function makeLargeResume(): ResumeModule[] {
  return Array.from({ length: 40 }, (_, i): ResumeModule => ({
    id: `big-${i}`,
    type: 'module',
    styleId: 'module-timeline',
    title: `经历 ${i}`,
    children: [
      { id: `big-h-${i}`, type: 'heading', content: `经历 ${i}`, children: [] },
      {
        id: `big-t-${i}`,
        type: 'text',
        content: `<p>第 ${i} 段经历描述文本，包含职责、技术栈与产出说明，用于模拟真实简历中较长的条目内容。</p>`,
        children: [],
      },
    ],
  }));
}

const resume = makeResume();
const largeResume = makeLargeResume();
const allIds = getAllModuleIds(resume);
const deepestId = allIds[allIds.length - 1];

describe('moduleUtils 树操作', () => {
  bench('findModuleById（命中最后一个节点）', () => {
    findModuleById(resume, deepestId);
  });

  bench('findParentById（命中最后一个节点）', () => {
    findParentById(resume, deepestId);
  });

  bench('getAllModuleIds', () => {
    getAllModuleIds(resume);
  });

  bench('exportLayoutTree', () => {
    exportLayoutTree(resume);
  });

  bench('getCanvasStateSummary（典型，约 40 节点）', () => {
    getCanvasStateSummary(resume);
  });

  bench('getCanvasStateSummary（长简历，触发截断）', () => {
    getCanvasStateSummary(largeResume);
  });
});
