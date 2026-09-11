import { describe, it, expect, beforeAll } from 'vitest';
import type { ResumeModule } from '../types/resume';
import { initStyles } from '../styles/styleInit';
import {
  handleAddText,
  handleAddHeading,
  handleAddList,
  handleAddImage,
  handleAddFlex,
  handleAddGrid,
  handleAddFlexInline,
  handleAddGridInline,
  handleAddHeader,
  handleAddModule,
  handleSetContent,
  handleSetStyle,
  handleSetProperty,
  handleSetField,
  handleSetStyleByType,
  handleRemoveModule,
  handleDeleteModules,
  handleClearCanvas,
  handleMoveModule,
  handleDuplicateModule,
  handleApplyTemplate,
  type ToolResult,
} from './toolHandlers';
import { toolHandlerMap } from './aiPrompt';

beforeAll(() => {
  initStyles();
});

// ============================================================
// 辅助：成功断言
// ============================================================
function expectSuccess(result: ToolResult): ResumeModule[] {
  if (!result.success) {
    throw new Error(`Expected success but got error: ${result.code} - ${result.message}`);
  }
  return result.newModules;
}

function expectError(result: ToolResult): { code: string; message: string; fix: string } {
  if (result.success) {
    throw new Error('Expected error but got success');
  }
  return { code: result.code, message: result.message, fix: result.fix };
}

// ============================================================
// 基础控件 handler
// ============================================================
describe('handleAddText', () => {
  it('创建文本框并返回正确类型和内容', () => {
    const result = expectSuccess(handleAddText({ content: '<p>Hello</p>' }, []));
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('text');
    expect(result[0]!.content).toBe('<p>Hello</p>');
    expect(result[0]!.styleId).toBe('text-default');
  });

  it('自定义样式被应用', () => {
    const result = expectSuccess(handleAddText({
      content: 'X',
      style: { fontSize: '18px', color: '#ff0000' },
    }, []));
    expect(result[0]!.style).toMatchObject({ fontSize: '18px', color: '#ff0000' });
  });
});

describe('handleAddHeading', () => {
  it('创建标题并应用默认样式', () => {
    const result = expectSuccess(handleAddHeading({ content: '教育背景' }, []));
    expect(result[0]!.type).toBe('heading');
    expect(result[0]!.content).toBe('教育背景');
    expect(result[0]!.style!.fontSize).toBe('20px');
    expect(result[0]!.style!.fontWeight).toBe('700');
  });
});

describe('handleAddList', () => {
  it('创建列表', () => {
    const result = expectSuccess(handleAddList({
      content: '<ul><li>A</li><li>B</li></ul>',
    }, []));
    expect(result[0]!.type).toBe('list');
    expect(result[0]!.content).toContain('<li>A</li>');
  });
});

describe('handleAddImage', () => {
  it('创建图片（空内容）', () => {
    const result = expectSuccess(handleAddImage({}, []));
    expect(result[0]!.type).toBe('image');
    expect(result[0]!.content).toBe('');
    expect(result[0]!.style!.width).toBe('100px');
  });
});

// ============================================================
// 容器 handler（已有子模块引用）
// ============================================================
describe('handleAddFlex', () => {
  it('空 children 返回 MISSING_CHILDREN 错误', () => {
    const err = expectError(handleAddFlex({ children: [] }, []));
    expect(err.code).toBe('MISSING_CHILDREN');
  });

  it('引用不存在的子模块返回 MODULE_NOT_FOUND', () => {
    const err = expectError(handleAddFlex({ children: ['nonexistent'] }, []));
    expect(err.code).toBe('MODULE_NOT_FOUND');
  });

  it('正确包装已有模块到 flex 容器', () => {
    // 先创建子模块
    const withText = expectSuccess(handleAddText({ content: 'A' }, []));
    const childId = withText[0]!.id;

    const result = expectSuccess(handleAddFlex({
      children: [childId],
      direction: 'row',
      gap: '16px',
    }, withText));

    // 应包含一个 flex 容器，内部有子模块
    const flex = result.find(m => m.type === 'flex');
    expect(flex).toBeDefined();
    expect(flex!.children).toHaveLength(1);
    expect(flex!.children![0].content).toBe('A');
  });
});

describe('handleAddGrid', () => {
  it('正确包装已有模块到 grid 容器', () => {
    const withText = expectSuccess(handleAddText({ content: 'Grid item' }, []));
    const childId = withText[0]!.id;

    const result = expectSuccess(handleAddGrid({
      children: [childId],
      columns: 3,
    }, withText));

    const grid = result.find(m => m.type === 'grid');
    expect(grid).toBeDefined();
    expect(grid!.style!.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });
});

// ============================================================
// 内联容器 handler
// ============================================================
describe('handleAddFlexInline', () => {
  it('一次调用创建容器和所有子控件', () => {
    const result = expectSuccess(handleAddFlexInline({
      children: [
        { type: 'text', content: '子控件1' },
        { type: 'heading', content: '标题2' },
      ],
      direction: 'column',
    }, []));

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('flex');
    expect(result[0]!.children).toHaveLength(2);
    expect(result[0]!.children![0].type).toBe('text');
    expect(result[0]!.children![1].type).toBe('heading');
    expect(result[0]!.children![0].content).toBe('子控件1');
  });

  it('空 children 仍然创建容器（通过 commandExecutor 校验）', () => {
    // Inline children 为空数组时，commandExecutor 会在 validateCommands 中拒绝
    // 但我们的 handler 不提前检查，依赖 commandExecutor
    const result = handleAddFlexInline({ children: [] }, []);
    expect(result.success).toBe(false);
  });
});

describe('handleAddGridInline', () => {
  it('创建网格容器并包含内联子控件', () => {
    const result = expectSuccess(handleAddGridInline({
      children: [
        { type: 'text', content: '列1' },
        { type: 'text', content: '列2' },
      ],
      columns: 2,
    }, []));

    expect(result[0]!.type).toBe('grid');
    expect(result[0]!.children).toHaveLength(2);
    expect(result[0]!.style!.gridTemplateColumns).toBe('repeat(2, 1fr)');
  });
});

// ============================================================
// 简历头和模块 handler（自动生成 children）
// ============================================================
describe('handleAddHeader', () => {
  it('创建简历头并自动生成 photo + info 子控件', () => {
    const result = expectSuccess(handleAddHeader({ styleId: 'header-classic' }, []));
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('header');
    expect(result[0]!.styleId).toBe('header-classic');
    // 应包含 photo 和 info 容器
    const children = result[0]!.children || [];
    expect(children.length).toBeGreaterThanOrEqual(1);
    const imageChild = children.find(c => c.type === 'image');
    expect(imageChild).toBeDefined();
  });
});

describe('handleAddModule', () => {
  it('创建模块并自动生成 heading + text 子控件', () => {
    const result = expectSuccess(handleAddModule({
      styleId: 'module-card',
      title: '教育背景',
      content: '<p>清华大学</p>',
    }, []));

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('module');
    const children = result[0]!.children || [];
    expect(children.length).toBe(2);
    expect(children[0].type).toBe('heading');
    expect(children[0].content).toContain('教育背景');
    expect(children[1].type).toBe('text');
    expect(children[1].content).toBe('<p>清华大学</p>');
  });
});

// ============================================================
// 内容/样式修改 handler
// ============================================================
describe('handleSetContent', () => {
  it('修改已有模块内容', () => {
    const initial = expectSuccess(handleAddText({ content: '旧内容' }, []));
    const id = initial[0]!.id;

    const result = expectSuccess(handleSetContent({ id, content: '新内容' }, initial));
    expect(result[0]!.content).toBe('新内容');
  });

  it('id 不存在返回错误', () => {
    const err = expectError(handleSetContent({ id: 'nonexistent', content: 'x' }, []));
    expect(err.code).toBe('MODULE_NOT_FOUND');
  });

  it('content 缺失返回结构化错误，不做静默修改', () => {
    const initial = expectSuccess(handleAddText({ content: '旧内容' }, []));
    const id = initial[0]!.id;

    const err = expectError(handleSetContent({ id, content: undefined! }, initial));
    expect(err.code).toBe('MISSING_CONTENT');
  });

  it('content 为空字符串是合法的清空操作', () => {
    const initial = expectSuccess(handleAddText({ content: '旧内容' }, []));
    const id = initial[0]!.id;

    const result = expectSuccess(handleSetContent({ id, content: '' }, initial));
    expect(result[0]!.content).toBe('');
  });
});

describe('handleSetStyle', () => {
  it('修改多个样式属性', () => {
    const initial = expectSuccess(handleAddText({ content: 'x' }, []));
    const id = initial[0]!.id;

    const result = expectSuccess(handleSetStyle({
      id,
      style: { fontSize: '24px', color: '#ff0000' },
    }, initial));

    expect(result[0]!.style!.fontSize).toBe('24px');
    expect(result[0]!.style!.color).toBe('#ff0000');
  });

  it('style 为空对象返回结构化错误，避免静默空操作', () => {
    const initial = expectSuccess(handleAddText({ content: 'x' }, []));
    const id = initial[0]!.id;

    const err = expectError(handleSetStyle({ id, style: {} }, initial));
    expect(err.code).toBe('EMPTY_STYLE');
  });

  it('style 缺失返回结构化错误', () => {
    const initial = expectSuccess(handleAddText({ content: 'x' }, []));
    const id = initial[0]!.id;

    const err = expectError(handleSetStyle({ id, style: undefined! }, initial));
    expect(err.code).toBe('EMPTY_STYLE');
  });
});

describe('handleSetProperty', () => {
  it('修改单个 CSS 属性', () => {
    const initial = expectSuccess(handleAddText({ content: 'x' }, []));
    const id = initial[0]!.id;

    const result = expectSuccess(handleSetProperty({
      id,
      property: 'fontSize',
      value: '30px',
    }, initial));

    expect(result[0]!.style!.fontSize).toBe('30px');
  });
});

// ============================================================
// 模块操作 handler
// ============================================================
describe('handleRemoveModule', () => {
  it('删除指定模块', () => {
    const initial = expectSuccess(handleAddText({ content: '删除我' }, []));
    const id = initial[0]!.id;

    const result = expectSuccess(handleRemoveModule({ id }, initial));
    expect(result).toHaveLength(0);
  });
});

describe('handleMoveModule', () => {
  it('移动模块到顶层指定索引', () => {
    // 创建两个模块
    const withA = expectSuccess(handleAddText({ content: 'A' }, []));
    const withBoth = expectSuccess(handleAddText({ content: 'B' }, withA));
    // 现在顺序是 [A, B]
    expect(withBoth[0]!.content).toBe('A');
    expect(withBoth[1]!.content).toBe('B');

    // 把 B 移到 index 0
    const result = expectSuccess(handleMoveModule({
      id: withBoth[1]!.id,
      index: 0,
    }, withBoth));

    expect(result[0]!.content).toBe('B');
    expect(result[1]!.content).toBe('A');
  });
});

describe('handleDuplicateModule', () => {
  it('复制模块并生成新 id', () => {
    const initial = expectSuccess(handleAddText({
      content: '<p>原文</p>',
      style: { color: '#333' },
    }, []));
    const id = initial[0]!.id;

    const result = expectSuccess(handleDuplicateModule({ id }, initial));
    // 应有两个模块
    expect(result).toHaveLength(2);
    // 第二个是副本
    expect(result[1]!.content).toBe('<p>原文</p>');
    expect(result[1]!.style!.color).toBe('#333');
    expect(result[1]!.id).not.toBe(id);
  });

  it('复制不存在的模块返回错误', () => {
    const err = expectError(handleDuplicateModule({ id: 'nonexistent' }, []));
    expect(err.code).toBe('MODULE_NOT_FOUND');
  });
});

// ============================================================
// 模板 handler
// ============================================================
describe('handleApplyTemplate', () => {
  it('应用 simple 模板清空画布并生成结构', () => {
    // 先加一个模块，确认会被清空
    const initial = expectSuccess(handleAddText({ content: '旧数据' }, []));

    const result = expectSuccess(handleApplyTemplate({ name: 'simple' }, initial));
    expect(result.length).toBeGreaterThanOrEqual(2);
    // 应有 header 和至少一个 module
    expect(result.some(m => m.type === 'header')).toBe(true);
    expect(result.some(m => m.type === 'module')).toBe(true);
    // 旧数据不应存在
    expect(result.some(m => m.content === '旧数据')).toBe(false);
  });

  it('不存在的模板返回 TEMPLATE_NOT_FOUND', () => {
    const err = expectError(handleApplyTemplate({ name: 'nonexistent' }, []));
    expect(err.code).toBe('TEMPLATE_NOT_FOUND');
  });
});


// ============================================================
// set_style_by_type 批量样式
// ============================================================
describe('handleSetStyleByType', () => {
  it('按类型匹配批量修改样式', () => {
    // 创建 3 个 text + 1 个 heading
    const withAll = expectSuccess(handleAddText({ content: 'text1' }, []));
    const withMore = expectSuccess(handleAddText({ content: 'text2' }, withAll));
    const withEvenMore = expectSuccess(handleAddText({ content: 'text3' }, withMore));
    const withHeading = expectSuccess(handleAddHeading({ content: '标题' }, withEvenMore));

    const result = expectSuccess(handleSetStyleByType({
      type: ['text'],
      style: { color: '#ff0000' },
    }, withHeading));

    // heading 不受影响
    const heading = result.find(m => m.type === 'heading');
    expect(heading).toBeDefined();
    // heading 的 style 可能为 undefined（默认值在 styleRegistry 中）
    expect(heading!.style!.color).toBe('#0f172a');

    // text 全部变成红色
    const texts = result.filter(m => m.type === 'text');
    expect(texts).toHaveLength(3);
    for (const t of texts) {
      expect(t.style!.color).toBe('#ff0000');
    }
  });

  it('except 排除指定类型', () => {
    const withAll = expectSuccess(handleAddText({ content: 't' }, []));
    const withHeading = expectSuccess(handleAddHeading({ content: 'h' }, withAll));

    const result = expectSuccess(handleSetStyleByType({
      except: ['heading'],
      style: { backgroundColor: '#ffffff' },
    }, withHeading));

    // heading 不应被改
    const heading = result.find(m => m.type === 'heading');
    expect(heading!.style?.backgroundColor).toBeUndefined();

    // text 被改了
    const text = result.find(m => m.type === 'text');
    expect(text!.style!.backgroundColor).toBe('#ffffff');
  });

  it('无匹配模块返回 NO_MATCH', () => {
    const withHeading = expectSuccess(handleAddHeading({ content: 'h' }, []));

    const result = handleSetStyleByType({
      type: ['text'],
      style: { color: '#ff0' },
    }, withHeading);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NO_MATCH');
    }
  });
});



// ============================================================
// set_field 模块元数据
// ============================================================
describe('handleSetField', () => {
  it('设置 name 字段', () => {
    const withText = expectSuccess(handleAddText({ content: '姓名' }, []));
    const id = withText[0]!.id;

    const result = expectSuccess(handleSetField({
      id,
      field: 'name',
      value: '张三',
    }, withText));

    expect(result[0]!.name).toBe('张三');
  });

  it('设置 jobTitle 字段', () => {
    const withText = expectSuccess(handleAddText({ content: '求职意向' }, []));
    const id = withText[0]!.id;

    const result = expectSuccess(handleSetField({
      id,
      field: 'jobTitle',
      value: '前端工程师',
    }, withText));

    expect(result[0]!.jobTitle).toBe('前端工程师');
  });

  it('无效字段返回错误', () => {
    const withText = expectSuccess(handleAddText({ content: 'x' }, []));
    const id = withText[0]!.id;

    const result = handleSetField({
      id,
      field: 'invalidField',
      value: 'x',
    }, withText);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_FIELD');
    }
  });

  it('不存在的模块返回错误', () => {
    const result = handleSetField({
      id: 'nonexistent',
      field: 'name',
      value: 'x',
    }, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('MODULE_NOT_FOUND');
    }
  });
});

// ============================================================
// delete_modules 批量删除
// ============================================================
describe('handleDeleteModules', () => {
  it('批量删除多个模块', () => {
    const withA = expectSuccess(handleAddText({ content: 'A' }, []));
    const withB = expectSuccess(handleAddText({ content: 'B' }, withA));
    const withC = expectSuccess(handleAddText({ content: 'C' }, withB));

    const result = expectSuccess(handleDeleteModules({
      ids: [withC[0].id, withC[2].id],
    }, withC));

    // 删除 A 和 C，只剩 B
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe('B');
  });

  it('ids 为空返回错误', () => {
    const withA = expectSuccess(handleAddText({ content: 'A' }, []));
    const result = handleDeleteModules({ ids: [] }, withA);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('MISSING_IDS');
    }
  });

  it('id 不存在返回错误', () => {
    const withA = expectSuccess(handleAddText({ content: 'A' }, []));
    const result = handleDeleteModules({ ids: ['nonexistent'] }, withA);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('MODULE_NOT_FOUND');
    }
  });
});

// ============================================================
// clear_canvas 清空画布
// ============================================================
describe('handleClearCanvas', () => {
  it('清空所有模块', () => {
    const withA = expectSuccess(handleAddText({ content: 'A' }, []));
    const withB = expectSuccess(handleAddText({ content: 'B' }, withA));

    const result = expectSuccess(handleClearCanvas({}, withB));
    expect(result).toHaveLength(0);
  });

  it('空画布不报错', () => {
    const result = expectSuccess(handleClearCanvas({}, []));
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// 路由表
// ============================================================
describe('toolHandlerMap', () => {
  const allTools = [
    'add_text', 'add_heading', 'add_list', 'add_image',
    'add_flex', 'add_grid', 'add_flex_inline', 'add_grid_inline',
    'add_header', 'add_module',
    'set_content', 'set_style', 'set_property',
    'remove_module', 'move_module', 'duplicate_module',
    'apply_template', 'export_pdf', 'set_style_by_type', 'delete_modules', 'clear_canvas',
  ];

  for (const toolName of allTools) {
    it(`${toolName} 在路由表中存在且是函数`, () => {
      expect(toolHandlerMap[toolName]).toBeDefined();
      expect(typeof toolHandlerMap[toolName]).toBe('function');
    });
  }

  it('执行不存在的 tool 返回 undefined', () => {
    expect(toolHandlerMap['nonexistent_tool']).toBeUndefined();
  });
});

// ============================================================
// handleCopyStyle / handleCopyTextStyle — 格式刷
// ============================================================

import {
  handleCopyStyle,
  handleCopyTextStyle,
} from './toolHandlers';

describe('handleCopyStyle', () => {
  const makeModule = (overrides: Partial<ResumeModule> = {}): ResumeModule => ({
    id: 'mod-1',
    type: 'text',
    styleId: 'text-default',
    style: {},
    children: [],
    ...overrides,
  });

  it('copies all style properties when types match', () => {
    const source = makeModule({ id: 'src', type: 'text', style: { fontSize: '16px', color: '#333' } });
    const target = makeModule({ id: 'tgt', type: 'text', style: { fontSize: '12px' } });
    const mods = [source, target];

    const result = handleCopyStyle({ source_id: 'src', target_id: 'tgt' }, mods);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unexpected error');

    const updatedTarget = result.newModules.find(m => m.id === 'tgt')!;
    expect(updatedTarget.style).toEqual({ fontSize: '16px', color: '#333' });
  });

  it('copies between same control types (text → heading)', () => {
    const source = makeModule({ id: 'src', type: 'text', style: { fontSize: '14px', color: '#111' }, name: 'TestName' });
    const target = makeModule({ id: 'tgt', type: 'heading', style: {} });
    const mods = [source, target];

    const result = handleCopyStyle({ source_id: 'src', target_id: 'tgt' }, mods);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unexpected error');

    const updatedTarget = result.newModules.find(m => m.id === 'tgt')!;
    expect(updatedTarget.style).toEqual({ fontSize: '14px', color: '#111' });
    expect(updatedTarget.name).toBe('TestName');
  });

  it('copies only layout properties for cross-type (text → flex)', () => {
    const source = makeModule({
      id: 'src', type: 'text',
      style: { fontSize: '14px', color: '#111', padding: '10px', borderRadius: '5px' },
    });
    const target = makeModule({ id: 'tgt', type: 'flex', style: { display: 'flex' } });
    const mods = [source, target];

    const result = handleCopyStyle({ source_id: 'src', target_id: 'tgt' }, mods);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unexpected error');

    const updatedTarget = result.newModules.find(m => m.id === 'tgt')!;
    // Should have layout props but NOT text-specific props
    expect(updatedTarget.style?.padding).toBe('10px');
    expect(updatedTarget.style?.borderRadius).toBe('5px');
    expect(updatedTarget.style?.fontSize).toBeUndefined();
    expect(updatedTarget.style?.color).toBeUndefined();
    // Should preserve existing flex-specific properties
    expect(updatedTarget.style?.display).toBe('flex');
  });

  it('errors when source module not found', () => {
    const target = makeModule({ id: 'tgt' });
    const result = handleCopyStyle({ source_id: 'nonexistent', target_id: 'tgt' }, [target]);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected error');
    expect(result.code).toBe('MODULE_NOT_FOUND');
  });

  it('errors when target module not found', () => {
    const source = makeModule({ id: 'src' });
    const result = handleCopyStyle({ source_id: 'src', target_id: 'nonexistent' }, [source]);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected error');
    expect(result.code).toBe('MODULE_NOT_FOUND');
  });

  it('errors when source and target are the same', () => {
    const mod = makeModule({ id: 'same' });
    const result = handleCopyStyle({ source_id: 'same', target_id: 'same' }, [mod]);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected error');
    expect(result.code).toBe('SAME_MODULE');
  });

  it('copies metadata fields for same-type modules', () => {
    const source = makeModule({
      id: 'src', type: 'text',
      name: '张三', jobTitle: '工程师', phone: '13800000000', email: 'test@test.com',
    });
    const target = makeModule({ id: 'tgt', type: 'text' });
    const mods = [source, target];

    const result = handleCopyStyle({ source_id: 'src', target_id: 'tgt' }, mods);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unexpected error');

    const updatedTarget = result.newModules.find(m => m.id === 'tgt')!;
    expect(updatedTarget.name).toBe('张三');
    expect(updatedTarget.jobTitle).toBe('工程师');
    expect(updatedTarget.phone).toBe('13800000000');
    expect(updatedTarget.email).toBe('test@test.com');
  });
});

describe('handleCopyTextStyle', () => {
  const makeModule = (overrides: Partial<ResumeModule> = {}): ResumeModule => ({
    id: 'mod-1',
    type: 'text',
    styleId: 'text-default',
    style: {},
    children: [],
    ...overrides,
  });

  it('copies text CSS properties from module.style', () => {
    const source = makeModule({
      id: 'src',
      style: { fontSize: '18px', fontWeight: '700', color: '#0f172a', padding: '10px' },
    });
    const target = makeModule({ id: 'tgt', style: { fontSize: '12px' } });
    const mods = [source, target];

    const result = handleCopyTextStyle({ source_id: 'src', target_id: 'tgt' }, mods);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unexpected error');

    const updatedTarget = result.newModules.find(m => m.id === 'tgt')!;
    // Text properties should be copied
    expect(updatedTarget.style?.fontSize).toBe('18px');
    expect(updatedTarget.style?.fontWeight).toBe('700');
    expect(updatedTarget.style?.color).toBe('#0f172a');
    // Layout property should NOT be copied
    expect(updatedTarget.style?.padding).toBeUndefined();
  });

  it('extracts and copies text CSS from HTML inline styles', () => {
    const source = makeModule({
      id: 'src',
      style: {},
      content: '<p style="font-size:16px;color:#333;margin:5px">text</p>',
    });
    const target = makeModule({ id: 'tgt', style: {} });
    const mods = [source, target];

    const result = handleCopyTextStyle({ source_id: 'src', target_id: 'tgt' }, mods);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unexpected error');

    const updatedTarget = result.newModules.find(m => m.id === 'tgt')!;
    // Should extract text properties from HTML
    expect(updatedTarget.style?.fontSize).toBe('16px');
    expect(updatedTarget.style?.color).toBe('#333');
    // margin is NOT a text style key
    expect(updatedTarget.style?.margin).toBeUndefined();
  });

  it('strips conflicting inline styles from target HTML', () => {
    const source = makeModule({
      id: 'src',
      content: '<p style="font-size:16px">text</p>',
    });
    const target = makeModule({
      id: 'tgt',
      content: '<p style="font-size:12px;padding:5px">old text</p>',
    });
    const mods = [source, target];

    const result = handleCopyTextStyle({ source_id: 'src', target_id: 'tgt' }, mods);
    expect(result.success).toBe(true);

    const updatedTarget = result.success
      ? result.newModules.find(m => m.id === 'tgt')!
      : null;
    expect(updatedTarget).toBeDefined();
    // font-size should be removed from HTML (moved to module.style)
    expect(updatedTarget!.content).not.toContain('font-size');
    // padding is not a text style, should remain
    expect(updatedTarget!.content).toContain('padding:5px');
  });

  it('errors when no text style to copy', () => {
    const source = makeModule({ id: 'src', style: { padding: '10px' } });
    const target = makeModule({ id: 'tgt' });
    const mods = [source, target];

    const result = handleCopyTextStyle({ source_id: 'src', target_id: 'tgt' }, mods);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected error');
    expect(result.code).toBe('NO_STYLE');
  });

  it('errors when source and target are the same', () => {
    const mod = makeModule({ id: 'same', style: { fontSize: '14px' } });
    const result = handleCopyTextStyle({ source_id: 'same', target_id: 'same' }, [mod]);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected error');
    expect(result.code).toBe('SAME_MODULE');
  });

  it('module.style takes priority over HTML inline styles', () => {
    const source = makeModule({
      id: 'src',
      style: { fontSize: '20px' },
      content: '<p style="font-size:14px;color:#999">text</p>',
    });
    const target = makeModule({ id: 'tgt', style: {} });
    const mods = [source, target];

    const result = handleCopyTextStyle({ source_id: 'src', target_id: 'tgt' }, mods);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unexpected error');

    const updatedTarget = result.newModules.find(m => m.id === 'tgt')!;
    // Module style font-size (20px) takes priority over HTML (14px)
    expect(updatedTarget.style?.fontSize).toBe('20px');
    // HTML color should still be extracted since not in module.style
    expect(updatedTarget.style?.color).toBe('#999');
  });
});
