import { describe, it, expect } from 'vitest';
import { findModuleById, findParentById, getAllModuleIds, getCanvasStateSummary, exportLayoutTree } from './moduleUtils';
import type { ResumeModule } from '../store/useResumeStore';

const makeMod = (overrides: Partial<ResumeModule> = {}): ResumeModule => ({
  id: 'mod-1',
  type: 'text',
  styleId: 'text-default',
  style: {},
  children: [],
  ...overrides,
});

describe('findModuleById', () => {
  it('finds top-level module', () => {
    const m = makeMod({ id: 'a' });
    expect(findModuleById([m], 'a')).toBe(m);
  });

  it('finds nested module', () => {
    const child = makeMod({ id: 'child' });
    const parent = makeMod({ id: 'parent', type: 'flex', children: [child] });
    expect(findModuleById([parent], 'child')).toBe(child);
  });

  it('returns null when not found', () => {
    expect(findModuleById([makeMod({ id: 'a' })], 'nonexistent')).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(findModuleById([], 'any')).toBeNull();
  });
});

describe('findParentById', () => {
  it('returns parent of nested module', () => {
    const child = makeMod({ id: 'child' });
    const parent = makeMod({ id: 'parent', children: [child] });
    const result = findParentById([parent], 'child');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('parent');
  });

  it('returns null for top-level module', () => {
    const m = makeMod({ id: 'top' });
    expect(findParentById([m], 'top')).toBeNull();
  });

  it('returns null when not found', () => {
    expect(findParentById([makeMod({ id: 'a' })], 'nonexistent')).toBeNull();
  });
});

describe('getAllModuleIds', () => {
  it('collects all ids recursively', () => {
    const leaf1 = makeMod({ id: 'leaf1' });
    const leaf2 = makeMod({ id: 'leaf2' });
    const container = makeMod({ id: 'container', type: 'flex', children: [leaf1, leaf2] });
    const mods = [container];
    const ids = getAllModuleIds(mods);
    expect(ids).toHaveLength(3);
    expect(ids).toContain('container');
    expect(ids).toContain('leaf1');
    expect(ids).toContain('leaf2');
  });

  it('returns empty array for empty modules', () => {
    expect(getAllModuleIds([])).toEqual([]);
  });
});

describe('getCanvasStateSummary', () => {
  it('returns empty message when no modules', () => {
    expect(getCanvasStateSummary([])).toBe('（画布为空）');
  });

  it('includes module id and type', () => {
    const mod = makeMod({ id: 'test-id', type: 'heading', styleId: 'heading-default' });
    const summary = getCanvasStateSummary([mod]);
    expect(summary).toContain('test-id');
    expect(summary).toContain('heading');
  });

  it('includes content snippet', () => {
    const mod = makeMod({ id: 'a', content: '<p>Hello World</p>' });
    const summary = getCanvasStateSummary([mod]);
    expect(summary).toContain('Hello World');
  });

  it('strips HTML tags from content snippet', () => {
    const mod = makeMod({ id: 'a', content: '<p><strong>Bold</strong> text</p>' });
    const summary = getCanvasStateSummary([mod]);
    expect(summary).toContain('Bold text');
    expect(summary).not.toContain('<strong>');
  });

  it('renders tree structure', () => {
    const child = makeMod({ id: 'child', type: 'text' });
    const parent = makeMod({ id: 'parent', type: 'flex', children: [child] });
    const summary = getCanvasStateSummary([parent]);
    expect(summary).toContain("└─");
    expect(summary).toContain('parent');
    expect(summary).toContain('child');
  });
});

describe('exportLayoutTree', () => {
  it('returns empty array for empty modules', () => {
    expect(exportLayoutTree([])).toEqual([]);
  });

  it('exports type and styleId', () => {
    const mod = makeMod({ id: 'a', type: 'heading', styleId: 'heading-default' });
    const tree = exportLayoutTree([mod]);
    expect(tree[0].type).toBe('heading');
    expect(tree[0].styleId).toBe('heading-default');
  });

  it('strips HTML from content', () => {
    const mod = makeMod({ id: 'a', content: '<p>Hello</p>' });
    const tree = exportLayoutTree([mod]);
    expect(tree[0].content).toBe('Hello');
  });

  it('exports nested children', () => {
    const child = makeMod({ id: 'child' });
    const parent = makeMod({ id: 'parent', type: 'flex', children: [child] });
    const tree = exportLayoutTree([parent]);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].type).toBe('text');
  });

  it('omits empty style objects', () => {
    const mod = makeMod({ id: 'a', style: {} });
    const tree = exportLayoutTree([mod]);
    expect(tree[0].style).toBeUndefined();
  });

  it('includes non-empty style objects', () => {
    const mod = makeMod({ id: 'a', style: { fontSize: '16px' } });
    const tree = exportLayoutTree([mod]);
    expect(tree[0].style).toEqual({ fontSize: '16px' });
  });
});
