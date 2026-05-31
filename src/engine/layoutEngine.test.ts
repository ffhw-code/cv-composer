import { describe, it, expect } from 'vitest';
import { computeLayout } from './layoutEngine';

describe('computeLayout', () => {
  it('单页：所有模块在一页内', () => {
    const modules = [
      { id: 'a', height: 200 },
      { id: 'b', height: 300 },
      { id: 'c', height: 200 },
    ];
    const result = computeLayout(modules, 1000, 16);
    expect(result.pages).toEqual([['a', 'b', 'c']]);
    expect(result.needsMorePages).toBe(false);
  });

  it('分页：模块超出一页容量', () => {
    const modules = [
      { id: 'a', height: 600 },
      { id: 'b', height: 600 },
      { id: 'c', height: 200 },
    ];
    const result = computeLayout(modules, 1000, 16);
    expect(result.pages.length).toBe(2);
    expect(result.pages[0]).toEqual(['a']);
    expect(result.pages[1]).toEqual(['b', 'c']);
    expect(result.needsMorePages).toBe(true);
  });

  it('空模块列表返回一页空数组', () => {
    const result = computeLayout([], 1000, 16);
    expect(result.pages).toEqual([[]]);
    expect(result.needsMorePages).toBe(false);
  });

  it('gap 计入分页计算', () => {
    const modules = [
      { id: 'a', height: 500 },
      { id: 'b', height: 500 },
    ];
    // 500 + 16(gap) + 500 = 1016 > 1000, 应该分两页
    const result = computeLayout(modules, 1000, 16);
    expect(result.pages.length).toBe(2);
  });
});
