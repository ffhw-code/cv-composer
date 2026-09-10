// 基准测试：排版引擎的分页计算（纯函数，无 DOM 依赖）
// 运行方式：npx vitest bench
import { bench, describe } from 'vitest';
import { computeLayout, type ModuleGeometry } from './layoutEngine';

const A4_CAPACITY = 1123;
const PAGE_GAP = 16;

/** 典型简历：12 个模块，高度 80~420px */
const typicalResume: ModuleGeometry[] = Array.from({ length: 12 }, (_, i) => ({
  id: `mod-${i}`,
  height: 80 + ((i * 137) % 340),
}));

/** 长文档：60 个模块，用于观察分页循环随规模的增长 */
const longResume: ModuleGeometry[] = Array.from({ length: 60 }, (_, i) => ({
  id: `mod-${i}`,
  height: 60 + ((i * 97) % 260),
}));

describe('computeLayout 分页计算', () => {
  bench('12 模块 / A4 容量', () => {
    computeLayout(typicalResume, A4_CAPACITY, PAGE_GAP);
  });

  bench('60 模块 / A4 容量', () => {
    computeLayout(longResume, A4_CAPACITY, PAGE_GAP);
  });
});
