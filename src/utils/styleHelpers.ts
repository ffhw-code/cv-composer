/** 从 module.style 中构建容器的完整内联样式 */
export function buildContainerStyle(
  style: Record<string, string> | undefined
): React.CSSProperties {
  if (!style) return {};

  const css: Record<string, string> = {};

  // 复制非特殊属性
  const specialKeys = new Set([
    'borderScope', 'borderStyle', 'borderColor', 'borderWidth',
    'gradientDirection', 'gradientFrom', 'gradientTo',
    'boxShadow', 'opacity',
  ]);

  for (const [key, val] of Object.entries(style)) {
    if (!specialKeys.has(key)) {
      css[key] = val;
    }
  }

  // ---- 边框 ----
  const scope = style.borderScope || '全部';
  const bs = style.borderStyle;
  const bc = style.borderColor;
  const bw = style.borderWidth;

  if (bs && bs !== 'none') {
    const sideMap: Record<string, string> = {
      '全部': '',
      '上': 'Top',
      '下': 'Bottom',
      '左': 'Left',
      '右': 'Right',
    };
    const suffix = sideMap[scope] || '';

    css[`border${suffix}Style`] = bs;
    if (bc) css[`border${suffix}Color`] = bc;
    if (bw) css[`border${suffix}Width`] = bw;
    // 默认值
    if (!bw && scope === '全部') css['borderWidth'] = '1px';
    if (!bw && scope !== '全部') css[`border${suffix}Width`] = '1px';
  } else if (bs === 'none') {
    if (scope === '全部') {
      css['border'] = 'none';
    } else {
      const sideMap: Record<string, string> = { '上': 'Top', '下': 'Bottom', '左': 'Left', '右': 'Right' };
      const suffix = sideMap[scope] || '';
      css[`border${suffix}Style`] = 'none';
    }
  }

  // ---- 渐变背景 ----
  const gd = style.gradientDirection;
  if (gd && gd !== 'none') {
    const from = style.gradientFrom || '#ffffff';
    const to = style.gradientTo || '#e2e8f0';
    css['background'] = `linear-gradient(${gd}, ${from}, ${to})`;
  }

  // ---- 阴影 ----
  const shadow = style.boxShadow;
  if (shadow && shadow !== 'none') {
    css['boxShadow'] = shadow;
  }

  // ---- 透明度 ----
  const opacity = style.opacity;
  if (opacity !== undefined && opacity !== '') {
    css['opacity'] = opacity;
  }

  return css as React.CSSProperties;
}

/** 判断是否需要覆盖 Tailwind 默认虚线边框 */
export function hasCustomBorder(style: Record<string, string> | undefined): boolean {
  if (!style) return false;
  return style.borderStyle !== undefined
    || style.borderColor !== undefined
    || style.borderWidth !== undefined;
}
