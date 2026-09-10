// src/engine/layoutMeasurer.ts
// ⚠️ browser-only：本模块通过把模块树渲染进真实 DOM（document.createElement /
// scrollWidth / document.fonts）来测量 A4 宽度下的溢出，依赖浏览器排版引擎，
// 无法在 Node/SSR 中运行。因此在无 DOM 环境下显式降级为不测量（返回 TARGET_WIDTH），
// 调用方不应把「返回 TARGET_WIDTH」当作真实测量结果。

import type { ResumeModule } from '../types/resume';
import { TARGET_WIDTH } from './layoutScaler';

/** 支持的 CSS 属性集合 — 仅把影响宽度的属性透传到测量 DOM */
const STYLE_PASSTHROUGH = new Set([
  'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignContent',
  'gap', 'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateRows',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'border', 'borderWidth', 'borderTopWidth', 'borderRightWidth',
  'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'borderColor',
  'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
  'letterSpacing', 'wordSpacing', 'textTransform',
  'width', 'maxWidth', 'minWidth',
  'borderRadius', 'boxSizing',
]);

/** 提取纯文本（去除 HTML 标签） */
function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

/** 将模块样式透传到 DOM 元素 */
function applyStyles(el: HTMLElement, style: Record<string, string>): void {
  for (const key of Object.keys(style)) {
    if (!STYLE_PASSTHROUGH.has(key)) continue;
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    el.style.setProperty(cssKey, style[key]);
  }
  el.style.setProperty('box-sizing', 'border-box');
}

/** 递归将模块树渲染为 DOM 元素 */
function renderModuleToDOM(mod: ResumeModule): HTMLElement {
  const el = document.createElement('div');
  const s = mod.style || {};

  applyStyles(el, s);

  const isLeaf = mod.type === 'text' || mod.type === 'heading' || mod.type === 'list';
  const isImage = mod.type === 'image';
  const hasChildren = mod.children && mod.children.length > 0;

  if (isLeaf) {
    const text = stripHtml(mod.content || '');
    el.style.setProperty('white-space', 'pre-wrap');
    el.style.setProperty('word-break', 'break-word');
    el.textContent = text || '\u00A0';
  } else if (isImage) {
    el.style.setProperty('display', 'inline-block');
    if (!s.width) el.style.setProperty('width', '100px');
    if (!s.height) el.style.setProperty('height', '130px');
    el.textContent = '';
  } else if (hasChildren) {
    if (!s.display) {
      el.style.setProperty('display', 'flex');
      el.style.setProperty('flex-direction', 'column');
    }
    for (const child of mod.children!) {
      el.appendChild(renderModuleToDOM(child));
    }
  } else {
    el.style.setProperty('min-height', '1px');
    el.textContent = '\u00A0';
  }

  return el;
}

/**
 * 测量模块树在 A4 宽度下的实际溢出宽度。
 *
 * 将模块渲染到固定宽度 794px 的隐藏容器中，让文本自然换行、flex 正常折行，
 * 然后通过 scrollWidth 检测是否有元素溢出容器边界。
 *
 * - 如果 scrollWidth ≤ TARGET_WIDTH：内容刚好容纳，返回 TARGET_WIDTH（无需缩放）
 * - 如果 scrollWidth > TARGET_WIDTH：有元素溢出，返回 scrollWidth 供计算缩放比
 */
export async function measureActualWidth(modules: ResumeModule[]): Promise<number> {
  if (typeof document === 'undefined') return TARGET_WIDTH;

  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* 忽略 */ }
  }

  const container = document.createElement('div');
  container.setAttribute('data-editing', 'false');
  container.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;' +
    `width:${TARGET_WIDTH}px;top:-9999px;left:0;z-index:-1;` +
    'overflow:visible;';
  document.body.appendChild(container);

  for (const mod of modules) {
    container.appendChild(renderModuleToDOM(mod));
  }

  // 等待两帧确保浏览器完成布局
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const scrollW = container.scrollWidth;
  container.remove();

  // 加 1px 容差，避免浮点取整误触发缩放
  return scrollW > TARGET_WIDTH + 1 ? Math.ceil(scrollW) : TARGET_WIDTH;
}

/**
 * 同步测量（无字体等待，适合快速预览场景）
 */
export function measureActualWidthSync(modules: ResumeModule[]): number {
  if (typeof document === 'undefined') return TARGET_WIDTH;

  const container = document.createElement('div');
  container.setAttribute('data-editing', 'false');
  container.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;' +
    `width:${TARGET_WIDTH}px;top:-9999px;left:0;z-index:-1;` +
    'overflow:visible;';
  document.body.appendChild(container);

  for (const mod of modules) {
    container.appendChild(renderModuleToDOM(mod));
  }

  const scrollW = container.scrollWidth;
  container.remove();
  return scrollW > TARGET_WIDTH + 1 ? Math.ceil(scrollW) : TARGET_WIDTH;
}
