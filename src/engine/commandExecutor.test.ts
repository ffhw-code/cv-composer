import { describe, it, expect, beforeAll } from 'vitest';
import { executeCommands } from './commandExecutor';
import type { ResumeModule } from '../store/useResumeStore';
import { initStyles } from '../styleInit';

// 初始化样式注册表（commandExecutor 依赖它）
beforeAll(() => {
  initStyles();
});

describe('executeCommands', () => {
  it('addModule：添加一个文本控件', () => {
    const result = executeCommands([], [
      { action: 'addModule', tempId: 't1', params: { type: 'text', styleId: 'text-default', content: 'Hello' } },
    ]);
    expect(result.newModules).toHaveLength(1);
    expect(result.newModules[0].type).toBe('text');
    expect(result.newModules[0].content).toBe('Hello');
    expect(result.errors).toHaveLength(0);
  });

  it('addModule：添加容器模块并嵌套子控件', () => {
    const result = executeCommands([], [
      {
        action: 'addModule',
        tempId: 'flex1',
        params: {
          type: 'flex',
          styleId: 'flex-default',
          children: [
            { action: 'addModule', tempId: 'text1', params: { type: 'text', styleId: 'text-default', content: '内嵌' } },
          ],
        },
      },
    ]);
    expect(result.newModules).toHaveLength(1);
    expect(result.newModules[0].type).toBe('flex');
    expect(result.newModules[0].children).toHaveLength(1);
    expect(result.newModules[0].children![0].content).toBe('内嵌');
  });

  it('removeModule：删除指定模块', () => {
    const modules: ResumeModule[] = [
      { id: 'a', type: 'text', styleId: 'text-default', children: [] },
      { id: 'b', type: 'text', styleId: 'text-default', children: [] },
    ];
    const result = executeCommands(modules, [
      { action: 'removeModule', params: { id: 'a' } },
    ]);
    expect(result.newModules).toHaveLength(1);
    expect(result.newModules[0].id).toBe('b');
    expect(result.errors).toHaveLength(0);
  });

  it('updateModule：修改 content', () => {
    const modules: ResumeModule[] = [
      { id: 'a', type: 'text', styleId: 'text-default', children: [], content: '旧内容' },
    ];
    const result = executeCommands(modules, [
      { action: 'setContent', params: { id: 'a', content: '新内容' } },
    ]);
    expect(result.newModules[0].content).toBe('新内容');
  });

  it('无效指令 action 被静默跳过', () => {
    const result = executeCommands([], [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { action: 'nonexistent' as any, params: {} },
    ]);
    expect(result.newModules).toHaveLength(0);
  });

  it('tempId 引用：后续指令可用 tempId 操作前一条指令创建的模块', () => {
    const result = executeCommands([], [
      { action: 'addModule', tempId: 't1', params: { type: 'text', styleId: 'text-default', content: 'A' } },
      { action: 'setContent', params: { id: 't1', content: 'B' } },
    ]);
    expect(result.newModules).toHaveLength(1);
    expect(result.newModules[0].content).toBe('B');
  });
});
