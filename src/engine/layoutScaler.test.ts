import { describe, it, expect } from 'vitest';
import { scaleLayoutToFit, trimBlankGaps } from './layoutScaler';
import type { ResumeModule } from '../store/useResumeStore';

function makeModule(overrides: Partial<ResumeModule> = {}): ResumeModule {
  return {
    id: 'test-1',
    type: 'text',
    style: {},
    children: [],
    ...overrides,
  } as ResumeModule;
}

describe('scaleLayoutToFit', () => {
  it('不缩放未超出 A4 宽度的模块', () => {
    const mods = [makeModule({ style: { width: '400px', fontSize: '16px' } })];
    scaleLayoutToFit(mods);
    expect(mods[0]!.style!.width).toBe('400px');
    expect(mods[0]!.style!.fontSize).toBe('16px');
  });

  it('缩放到 A4 宽度内', () => {
    const mods = [makeModule({ style: { width: '1000px', fontSize: '20px', padding: '10px' } })];
    scaleLayoutToFit(mods);
    // scale = 794 / 1000 = 0.794
    expect(mods[0]!.style!.width).toBe('794px');
    expect(mods[0]!.style!.fontSize).toBe('16px'); // 20 * 0.794 = 15.88 → 16
    expect(mods[0]!.style!.padding).toBe('8px');   // 10 * 0.794 = 7.94 → 8
  });

  it('borderWidth 仅在原始值 > 0 时缩放', () => {
    const mods = [makeModule({ style: { width: '1200px', borderWidth: '0px', borderTopWidth: '3px' } })];
    scaleLayoutToFit(mods);
    expect(mods[0]!.style!.borderWidth).toBe('0px');  // 0 → keep 0
    expect(mods[0]!.style!.borderTopWidth).toBe('2px'); // 3 * 0.662 = 1.98 → 2
  });

  it('lineHeight 无单位值不缩放', () => {
    const mods = [makeModule({ style: { width: '1000px', lineHeight: '1.5' } })];
    scaleLayoutToFit(mods);
    expect(mods[0]!.style!.lineHeight).toBe('1.5');
  });

  it('lineHeight px 值缩放', () => {
    const mods = [makeModule({ style: { width: '1000px', lineHeight: '24px' } })];
    scaleLayoutToFit(mods);
    expect(mods[0]!.style!.lineHeight).toBe('19px'); // 24 * 0.794 = 19.056 → 19
  });

  it('非 px 值不缩放', () => {
    const mods = [makeModule({ style: { width: '1000px', height: 'auto', color: '#333' } })];
    scaleLayoutToFit(mods);
    expect(mods[0]!.style!.height).toBe('auto');
    expect(mods[0]!.style!.color).toBe('#333');
  });

  it('缩放后 < 1px 的值强制为 1px', () => {
    const mods = [makeModule({ style: { width: '5000px', fontSize: '2px', letterSpacing: '1px' } })];
    scaleLayoutToFit(mods);
    // scale = 794/5000 = 0.1588, 2*0.1588=0.317→0→1, 1*0.1588=0.159→0→1
    expect(mods[0]!.style!.fontSize).toBe('1px');
    expect(mods[0]!.style!.letterSpacing).toBe('1px');
  });

  it('递归缩放子模块', () => {
    const mods = [makeModule({
      style: { width: '1200px' },
      children: [makeModule({ id: 'child', type: 'text', style: { width: '800px', fontSize: '24px' } })],
    })];
    scaleLayoutToFit(mods);
    expect(mods[0]!.style!.width).toBe('794px');
    expect(mods[0]!.children![0]!.style!.width).toBe('529px'); // 800 * 0.662 = 529.6 → 530
    expect(mods[0]!.children![0]!.style!.fontSize).toBe('16px'); // 24 * 0.662 = 15.88 → 16
  });

  it('取整棵树最大宽度计算缩放比', () => {
    const mods = [
      makeModule({ id: 'a', style: { width: '400px' } }),
      makeModule({ id: 'b', style: { width: '900px', marginLeft: '50px', marginRight: '50px' } }),
    ];
    scaleLayoutToFit(mods);
    // maxW = 900 + 50 + 50 = 1000, scale = 0.794
    expect(mods[1]!.style!.width).toBe('715px'); // 900*0.794=714.6→715
  });
});

describe('trimBlankGaps', () => {
  it('规则1: 容器仅有一个子模块 → gap 强制 0', () => {
    const mods = [makeModule({
      type: 'flex',
      style: { gap: '16px' },
      children: [makeModule({ id: 'child', type: 'text' })],
    })];
    trimBlankGaps(mods, false);
    expect(mods[0]!.style!.gap).toBe('0');
  });

  it('规则1: 容器多个子模块 → gap 保留', () => {
    const mods = [makeModule({
      type: 'flex',
      style: { gap: '16px' },
      children: [
        makeModule({ id: 'c1', type: 'text' }),
        makeModule({ id: 'c2', type: 'text' }),
      ],
    })];
    trimBlankGaps(mods, false);
    expect(mods[0]!.style!.gap).toBe('16px');
  });

  it('规则2: 仅在 wasScaled=true 时执行', () => {
    const mods = [makeModule({ style: { padding: '2px' } })];
    trimBlankGaps(mods, false);
    expect(mods[0]!.style!.padding).toBe('2px'); // not scaled, keep
  });

  it('规则2: wasScaled=true 且 ≤ 2px → 归零', () => {
    const mods = [makeModule({ style: { padding: '2px' } })];
    trimBlankGaps(mods, true);
    expect(mods[0]!.style!.padding).toBe('0');
  });

  it('规则2: wasScaled=true 但 > 2px → 保留', () => {
    const mods = [makeModule({ style: { padding: '8px' } })];
    trimBlankGaps(mods, true);
    expect(mods[0]!.style!.padding).toBe('8px');
  });

  it('规则2: 多方向混合，总值 > 0 才归零', () => {
    const mods = [makeModule({ style: { paddingTop: '1px', paddingBottom: '1px' } })];
    trimBlankGaps(mods, true);
    expect(mods[0]!.style!.padding).toBe('0');
  });

  it('组合: 规则1 + 规则2 均生效', () => {
    const mods = [makeModule({
      type: 'flex',
      style: { gap: '8px', padding: '2px' },
      children: [makeModule({ id: 'child', type: 'text' })],
    })];
    trimBlankGaps(mods, true);
    expect(mods[0]!.style!.gap).toBe('0');
    expect(mods[0]!.style!.padding).toBe('0');
  });
});

  it('返回正确的 scale 和 scaledCount', () => {
    const mods = [makeModule({ style: { width: '1000px', fontSize: '20px', padding: '10px' } })];
    const { scale, scaledCount } = scaleLayoutToFit(mods);
    expect(scale).toBeCloseTo(0.794, 2);
    expect(scaledCount).toBeGreaterThanOrEqual(3); // width, fontSize, padding
  });

  it('未缩放时返回 scale=1, scaledCount=0', () => {
    const mods = [makeModule({ style: { width: '400px', fontSize: '16px' } })];
    const { scale, scaledCount } = scaleLayoutToFit(mods);
    expect(scale).toBe(1);
    expect(scaledCount).toBe(0);
  });

  it('支持外部传入 actualMaxWidth 替代 computeMaxWidth', () => {
    // 模块无显式 width，但传入 externalMaxWidth=1200
    const mods = [makeModule({ style: { fontSize: '20px', padding: '10px' } })];
    const { scale, scaledCount } = scaleLayoutToFit(mods, 1200);
    // scale = 794/1200 ≈ 0.662
    expect(scale).toBeCloseTo(0.662, 2);
    expect(mods[0]!.style!.fontSize).toBe('13px'); // 20*0.662=13.24→13
    expect(mods[0]!.style!.padding).toBe('7px');   // 10*0.662=6.62→7
    expect(scaledCount).toBeGreaterThanOrEqual(2);
  });

  it('传入 externalMaxWidth ≤ 794 时不缩放', () => {
    const mods = [makeModule({ style: { fontSize: '14px', padding: '8px' } })];
    const { scale, scaledCount } = scaleLayoutToFit(mods, 600);
    expect(scale).toBe(1);
    expect(scaledCount).toBe(0);
    expect(mods[0]!.style!.fontSize).toBe('14px');
    expect(mods[0]!.style!.padding).toBe('8px');
  });
