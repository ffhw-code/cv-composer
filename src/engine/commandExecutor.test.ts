import { describe, it, expect, beforeAll } from 'vitest';
import { executeCommands } from './commandExecutor';
import type { ResumeModule } from '../types/resume';
import { initStyles } from '../styles/styleInit';

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

  // ====== 结构化错误格式测试 ======

  describe('结构化错误格式', () => {
    it('缺少 children 返回 MISSING_CHILDREN 错误', () => {
      const result = executeCommands([], [
        { action: 'addModule', tempId: 'm1', params: { type: 'flex', styleId: 'flex-default' } },
      ]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_CHILDREN');
      expect(result.errors[0].message).toContain('缺少 children');
      expect(result.errors[0].fix).toBeTruthy();
      expect(result.rolledBack).toBe(false) // 校验阶段未修改模块，无需回退;
    });

    it('无效模块类型返回 INVALID_TYPE 错误', () => {
      const result = executeCommands([], [
        { action: 'addModule', params: { type: 'invalid_type', styleId: 'text-default' } },
      ]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
      expect(result.errors[0].message).toContain('无效的模块类型');
      expect(result.errors[0].fix).toContain('text');
    });

    it('操作不存在的模块返回 MODULE_NOT_FOUND 错误', () => {
      const modules: ResumeModule[] = [
        { id: 'a', type: 'text', styleId: 'text-default', children: [] },
      ];
      const result = executeCommands(modules, [
        { action: 'setContent', params: { id: 'nonexistent', content: 'x' } },
      ]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MODULE_NOT_FOUND');
      expect(result.errors[0].message).toContain('不存在');
      expect(result.errors[0].fix).toContain('当前画布');
    });

    it('JSON 格式错误返回 INVALID_FORMAT 错误', () => {
      // 构造一个会导致 JSON 序列化失败的场景 — 循环引用
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const circular: any = { action: 'addModule', params: { type: 'text' } };
      circular.params.self = circular;
      const result = executeCommands([], [circular]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_FORMAT');
      expect(result.errors[0].fix).toBeTruthy();
    });

    it('执行时异常返回 EXECUTION_ERROR', () => {
      // buildChildren 中 type 无效会抛出异常
      const result = executeCommands([], [
        {
          action: 'addModule',
          tempId: 'bad',
          params: {
            type: 'flex',
            styleId: 'flex-default',
            children: [
              { action: 'addModule', tempId: 'c1', params: { type: 'bad-type' } },
            ],
          },
        },
      ]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('EXECUTION_ERROR');
      expect(result.errors[0].message).toContain('异常');
    });

    it('成功执行时 errors 为空', () => {
      const result = executeCommands([], [
        { action: 'addModule', params: { type: 'text', styleId: 'text-default', content: 'OK' } },
      ]);
      expect(result.errors).toHaveLength(0);
    });

    it('rolledBack 在无错误时为 false', () => {
      const result = executeCommands([], [
        { action: 'addModule', params: { type: 'text', styleId: 'text-default', content: 'OK' } },
      ]);
      expect(result.rolledBack).toBe(false);
    });
  });
