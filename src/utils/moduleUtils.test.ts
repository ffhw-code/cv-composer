import { describe, it, expect } from 'vitest';
import { findModuleById, findParentById, getAllModuleIds } from './moduleUtils';
import type { ResumeModule } from '../store/useResumeStore';

const sampleTree: ResumeModule[] = [
  {
    id: 'root-1',
    type: 'header',
    styleId: 'header-classic',
    children: [
      { id: 'child-1', type: 'image', styleId: 'image-default', children: [] },
      {
        id: 'child-2',
        type: 'flex',
        styleId: 'flex-default',
        children: [
          { id: 'grandchild-1', type: 'text', styleId: 'text-default', children: [] },
        ],
      },
    ],
  },
  { id: 'root-2', type: 'module', styleId: 'module-classic', children: [] },
];

describe('findModuleById', () => {
  it('找到顶层模块', () => {
    expect(findModuleById(sampleTree, 'root-2')?.id).toBe('root-2');
  });

  it('找到嵌套模块', () => {
    expect(findModuleById(sampleTree, 'grandchild-1')?.id).toBe('grandchild-1');
  });

  it('找不到返回 null', () => {
    expect(findModuleById(sampleTree, 'nonexistent')).toBeNull();
  });
});

describe('findParentById', () => {
  it('找到直接父模块', () => {
    const parent = findParentById(sampleTree, 'child-1');
    expect(parent?.id).toBe('root-1');
  });

  it('找到跨层级父模块', () => {
    const parent = findParentById(sampleTree, 'grandchild-1');
    expect(parent?.id).toBe('child-2');
  });

  it('顶层模块无父', () => {
    expect(findParentById(sampleTree, 'root-1')).toBeNull();
  });
});

describe('getAllModuleIds', () => {
  it('收集所有模块 id', () => {
    const ids = getAllModuleIds(sampleTree);
    expect(ids).toEqual(['root-1', 'child-1', 'child-2', 'grandchild-1', 'root-2']);
  });
});
