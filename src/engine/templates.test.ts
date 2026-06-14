import { describe, it, expect } from 'vitest';
import { loadTemplate, templates, type ResumeTemplate, type TemplateModule } from './templates';

// ============================================================
// 基线测试：templates.ts
// 目标：确保模板结构完整性，所有容器节点都有非空 children
// ============================================================

/** 递归收集所有 module 节点，返回 { node, path } */
function collectAllModules(
  modules: TemplateModule[],
  path: string = '',
): { node: TemplateModule; path: string }[] {
  const result: { node: TemplateModule; path: string }[] = [];
  for (const mod of modules) {
    const currentPath = path ? `${path} > ${mod.tempId}` : mod.tempId;
    result.push({ node: mod, path: currentPath });
    if (mod.children && mod.children.length > 0) {
      result.push(...collectAllModules(mod.children, currentPath));
    }
  }
  return result;
}

const CONTAINER_TYPES = new Set(['header', 'module', 'flex', 'grid']);

describe('loadTemplate', () => {
  it('返回 simple 模板', () => {
    const tmpl = loadTemplate('simple');
    expect(tmpl).toBeDefined();
    expect(tmpl!.meta.name).toBe('简约简历');
    expect(tmpl!.meta.version).toBeTruthy();
    expect(tmpl!.modules.length).toBeGreaterThanOrEqual(2);
  });

  it('返回 classic 模板', () => {
    const tmpl = loadTemplate('classic');
    expect(tmpl).toBeDefined();
    expect(tmpl!.meta.name).toBe('经典简历');
    expect(tmpl!.meta.version).toBeTruthy();
    expect(tmpl!.modules.length).toBeGreaterThanOrEqual(2);
  });

  it('不存在的模板返回 undefined', () => {
    expect(loadTemplate('nonexistent')).toBeUndefined();
    expect(loadTemplate('')).toBeUndefined();
  });

  it('simple 和 classic 是不同的对象引用', () => {
    const s = loadTemplate('simple');
    const c = loadTemplate('classic');
    expect(s).not.toBe(c);
    expect(s!.modules).not.toBe(c!.modules);
  });
});

describe('模板结构完整性', () => {
  const templateNames = Object.keys(templates);

  for (const name of templateNames) {
    describe(`${name} 模板`, () => {
      let tmpl: ResumeTemplate;

      // 每个 describe 内重新加载，避免跨模板污染
      const load = () => {
        tmpl = loadTemplate(name)!;
        expect(tmpl).toBeDefined();
      };

      it('meta 字段非空', () => {
        load();
        expect(tmpl.meta.name).toBeTruthy();
        expect(tmpl.meta.version).toBeTruthy();
      });

      it('顶层 modules 数组非空', () => {
        load();
        expect(tmpl.modules.length).toBeGreaterThan(0);
      });

      it('容器节点（header/module/flex/grid）都有非空 children', () => {
        load();
        const all = collectAllModules(tmpl.modules);
        for (const { node, path } of all) {
          if (CONTAINER_TYPES.has(node.type)) {
            expect(
              node.children,
              `${path} (type: ${node.type}) 缺少 children`
            ).toBeDefined();
            expect(
              node.children!.length,
              `${path} (type: ${node.type}) children 为空数组`
            ).toBeGreaterThan(0);
          }
        }
      });

      it('所有节点的 type 字段非空', () => {
        load();
        const all = collectAllModules(tmpl.modules);
        for (const { node, path } of all) {
          expect(node.type, `${path} 缺少 type`).toBeTruthy();
          expect(typeof node.type, `${path} type 不是字符串`).toBe('string');
        }
      });

      it('所有 tempId 唯一且非空', () => {
        load();
        const all = collectAllModules(tmpl.modules);
        const ids = all.map(a => a.node.tempId);
        for (const id of ids) {
          expect(id).toBeTruthy();
        }
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('叶子节点（text/heading/list/image）不含 children', () => {
        load();
        const LEAF_TYPES = new Set(['text', 'heading', 'list', 'image']);
        const all = collectAllModules(tmpl.modules);
        for (const { node, path } of all) {
          if (LEAF_TYPES.has(node.type)) {
            expect(
              node.children || [],
              `${path} (type: ${node.type}) 不应有 children`
            ).toHaveLength(0);
          }
        }
      });

      it('模板可通过 JSON 序列化/反序列化保持结构一致', () => {
        load();
        const json = JSON.stringify(tmpl);
        const restored = JSON.parse(json) as ResumeTemplate;
        expect(restored.meta.name).toBe(tmpl.meta.name);
        expect(restored.modules.length).toBe(tmpl.modules.length);
        // 深度验证 children 树完整性
        const restoredAll = collectAllModules(restored.modules);
        const originalAll = collectAllModules(tmpl.modules);
        expect(restoredAll.length).toBe(originalAll.length);
      });
    });
  }
});

describe('templates 注册表', () => {
  it('simple 和 classic 都在注册表中', () => {
    expect(templates).toHaveProperty('simple');
    expect(templates).toHaveProperty('classic');
  });

  it('注册表中每个模板都可被 loadTemplate 加载', () => {
    for (const name of Object.keys(templates)) {
      expect(loadTemplate(name)).toBeDefined();
    }
  });
});
