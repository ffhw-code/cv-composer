// src/engine/layoutScaler.ts
// 导入简历后自动缩放模块树以适应 A4 画布宽度（794px）

import type { ResumeModule } from '../types/resume';

export const TARGET_WIDTH = 794; // A4 px width

// 数值型 CSS 属性白名单（仅缩放带 px 单位的值）
const SCALE_KEYS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'fontSize', 'letterSpacing', 'wordSpacing',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'gap', 'rowGap', 'columnGap',
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius',
  'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'lineHeight', 'top', 'right', 'bottom', 'left', 'textIndent',
]);

/**
 * scaleLayoutToFit — 按测量宽度缩放模块树
 *
 * @param modules      模块树（原地修改）
 * @param actualMaxWidth  实际测量宽度。若不传则回退到 computeMaxWidth（基于 style.width 估算，不推荐）
 * @returns 缩放比（1 表示无需缩放），以及影响的属性总数
 */
export function scaleLayoutToFit(
  modules: ResumeModule[],
  actualMaxWidth?: number,
): { scale: number; scaledCount: number } {
  const maxW = actualMaxWidth ?? computeMaxWidth(modules);
  if (maxW <= TARGET_WIDTH) return { scale: 1, scaledCount: 0 };

  const scale = TARGET_WIDTH / maxW;
  const count = walkAndScale(modules, scale);
  return { scale, scaledCount: count };
}

/** 基于模块显式 width 估算最大宽度（回退） */
function computeMaxWidth(modules: ResumeModule[]): number {
  let maxW = 0;
  function walk(m: ResumeModule) {
    const s = m.style || {};
    const w = parsePx(s.width);
    const ml = parsePx(s.marginLeft) || parsePx(s.margin) || 0;
    const mr = parsePx(s.marginRight) || parsePx(s.margin) || 0;
    maxW = Math.max(maxW, w + ml + mr);
    (m.children || []).forEach(walk);
  }
  modules.forEach(walk);
  return maxW;
}

function parsePx(val: string | undefined): number {
  if (!val) return 0;
  const m = val.match(/^(\d+(?:\.\d+)?)px$/);
  return m ? parseFloat(m[1]) : 0;
}

/** 递归缩放，返回变化的属性总数 */
function walkAndScale(modules: ResumeModule[], scale: number): number {
  let count = 0;
  for (const m of modules) {
    if (m.style) {
      const scaled: Record<string, string> = {};
      for (const key of Object.keys(m.style)) {
        const val = m.style[key];
        if (!SCALE_KEYS.has(key)) {
          scaled[key] = val;
          continue;
        }
        // borderWidth: only scale if original > 0
        if (key.includes('border') && key.includes('Width')) {
          const n = parsePx(val);
          if (n > 0) {
            const r = Math.round(n * scale);
            scaled[key] = r < 1 && n > 0 ? '1px' : `${r}px`;
            count++;
          } else {
            scaled[key] = val;
          }
          continue;
        }
        // lineHeight: only scale if has px unit
        if (key === 'lineHeight') {
          const pxMatch = val.match(/^(\d+(?:\.\d+)?)px$/);
          if (pxMatch) {
            const r = Math.round(parseFloat(pxMatch[1]) * scale);
            scaled[key] = r < 1 ? '1px' : `${r}px`;
            count++;
          } else {
            scaled[key] = val;
          }
          continue;
        }
        // Generic numeric px scaling
        const pxMatch = val.match(/^(\d+(?:\.\d+)?)px$/);
        if (pxMatch) {
          const n = parseFloat(pxMatch[1]);
          const r = Math.round(n * scale);
          scaled[key] = r < 1 && n > 0 ? '1px' : `${r}px`;
          count++;
        } else {
          scaled[key] = val;
        }
      }
      m.style = scaled;
    }
    if (m.children && m.children.length > 0) {
      count += walkAndScale(m.children, scale);
    }
  }
  return count;
}

/**
 * trimBlankGaps — 缩放后裁剪冗余空白
 * 规则 1: 容器仅有一个子模块 → gap 强制 0
 * 规则 2: 仅当 wasScaled=true 时：四方向 padding ≤ 2px → 归零
 */
export function trimBlankGaps(modules: ResumeModule[], wasScaled: boolean): void {
  function walk(m: ResumeModule) {
    if (!m.style) { m.style = {}; }
    const s = m.style!;

    // 规则 1
    if (m.children && m.children.length === 1) {
      s.gap = '0';
    }

    // 规则 2: only when scaling was applied
    if (wasScaled) {
      const pt = parsePx(s.paddingTop) || parsePx(s.padding) || 0;
      const pr = parsePx(s.paddingRight) || parsePx(s.padding) || 0;
      const pb = parsePx(s.paddingBottom) || parsePx(s.padding) || 0;
      const pl = parsePx(s.paddingLeft) || parsePx(s.padding) || 0;
      if (pt <= 2 && pr <= 2 && pb <= 2 && pl <= 2 && (pt + pr + pb + pl) > 0) {
        s.padding = '0';
        delete s.paddingTop;
        delete s.paddingRight;
        delete s.paddingBottom;
        delete s.paddingLeft;
      }
    }

    (m.children || []).forEach(walk);
  }
  modules.forEach(walk);
}
