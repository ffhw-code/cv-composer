import { describe, it, expect } from 'vitest';
import { getFixedConstraints, getConstraintList } from './ruleBase';

describe('getConstraintList', () => {
  it('返回非空约束数组', () => {
    const list = getConstraintList();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(5);
  });

  it('每条约束非空字符串', () => {
    for (const rule of getConstraintList()) {
      expect(typeof rule).toBe('string');
      expect(rule.trim().length).toBeGreaterThan(0);
    }
  });

  it('包含关键约束：禁止编造 id', () => {
    const text = getFixedConstraints();
    expect(text).toContain('禁止编造');
  });

  it('包含关键约束：add_header / add_module 自动生成 children', () => {
    const text = getFixedConstraints();
    expect(text).toContain('add_header');
    expect(text).toContain('add_module');
    expect(text).toContain('禁止手动构造它们的 children');
  });

  it('包含关键约束：CSS 属性白名单', () => {
    const text = getFixedConstraints();
    expect(text).toContain('fontSize');
    expect(text).toContain('backgroundColor');
    expect(text).toContain('gridTemplateColumns');
  });

  it('包含关键约束：颜色和尺寸格式', () => {
    const text = getFixedConstraints();
    expect(text).toContain('#rrggbb');
    expect(text).toContain('px 单位');
  });

  it('包含 rule 6：flex/grid inline 优先', () => {
    const text = getFixedConstraints();
    expect(text).toContain('add_flex_inline');
    expect(text).toContain('add_grid_inline');
  });

  it('包含 rule 7：重试上限', () => {
    const text = getFixedConstraints();
    expect(text).toContain('最多重试 3 次');
    expect(text).toContain('连续同一 tool 失败 2 次');
  });
});

describe('getFixedConstraints', () => {
  it('返回以换行符分隔的字符串', () => {
    const text = getFixedConstraints();
    const lines = text.split('\n');
    expect(lines.length).toBe(getConstraintList().length);
  });

  it('与 getConstraintList 内容一致', () => {
    const text = getFixedConstraints();
    const list = getConstraintList();
    expect(text).toBe(list.join('\n'));
  });
});
