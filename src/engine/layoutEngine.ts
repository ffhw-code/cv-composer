// 排版引擎纯函数，不依赖任何 React，只处理数据

export interface ModuleGeometry {
  id: string;
  height: number; // 模块的实际 DOM 高度（像素）
}

interface LayoutResult {
  pages: string[][]; // 每页包含的模块 id 数组
  needsMorePages: boolean; // 是否需要比当前更多的页
}

/**
 * 根据模块高度和页面容量，计算分页
 * @param modules - 所有模块的几何信息（按画布顺序）
 * @param pageCapacity - 一个 A4 页能容纳的模块高度（像素）
 * @param gap - 模块之间的间距（像素）
 * @returns 分页结果
 */
export function computeLayout(
  modules: ModuleGeometry[],
  pageCapacity: number,
  gap: number
): LayoutResult {
  const pages: string[][] = [];
  let currentPage: string[] = [];
  let currentHeight = 0;

  for (const mod of modules) {
    const h = mod.height;
    // 如果当前页不为空，加上 gap
    const consume = currentHeight > 0 ? h + gap : h;

    if (currentHeight + consume > pageCapacity) {
      // 新页
      pages.push(currentPage);
      currentPage = [mod.id];
      currentHeight = h;
    } else {
      currentPage.push(mod.id);
      currentHeight += consume;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return {
    pages: pages.length === 0 ? [[]] : pages,
    needsMorePages: pages.length > 1,
  };
}