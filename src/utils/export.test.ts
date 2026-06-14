/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// 基线测试：export.ts
// 目标：验证 PDF 导出的 DOM 操作正确性
// ============================================================

// Mock window.alert for missing-container test
const alertMock = vi.fn();

// Suppress print (jsdom iframe.contentWindow.print doesn't hit main window mock)
const printSpy = vi.fn();

function createContainer(id: string, innerHTML?: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  if (innerHTML) el.innerHTML = innerHTML;
  document.body.appendChild(el);
  return el;
}

function cleanup() {
  document.body.innerHTML = '';
  document.querySelectorAll('iframe').forEach(f => f.remove());
  alertMock.mockClear();
  printSpy.mockClear();
}

beforeEach(() => {
  cleanup();
  window.alert = alertMock;
  // Spy on window.print to verify it's NOT called for missing-container case
  vi.spyOn(window, 'print').mockImplementation(printSpy);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Dynamically import after mocks are set up
const { exportPDF, exportResume } = await import('./export');

describe('exportPDF', () => {
  it('容器不存在时 alert 并返回，不创建 iframe', () => {
    exportPDF();
    expect(alertMock).toHaveBeenCalledWith('未找到简历内容，请先添加模块');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('容器存在时创建 A4 尺寸 iframe', () => {
    createContainer('resume-preview', '<p>简历内容</p>');
    exportPDF();

    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.style.position).toBe('fixed');
    expect(iframe!.style.width).toBe('794px');
    expect(iframe!.style.height).toBe('1123px');
  });

  it('iframe onload 后内容包含原始简历 HTML', () => {
    createContainer('resume-preview', '<p class="my-resume">张三的简历</p>');
    exportPDF();

    const iframe = document.querySelector('iframe')!;
    // 手动触发 onload（模拟 jsdom 中 src='about:blank' 的行为）
    iframe.dispatchEvent(new Event('load'));

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    expect(doc).toBeDefined();
    if (doc) {
      expect(doc.body.innerHTML).toContain('my-resume');
      expect(doc.body.innerHTML).toContain('张三的简历');
    }
  });

  it('优先使用 #resume-pages 而非 #resume-preview', () => {
    createContainer('resume-pages', '<p>多页</p>');
    createContainer('resume-preview', '<p>单页</p>');
    exportPDF();

    const iframe = document.querySelector('iframe')!;
    iframe.dispatchEvent(new Event('load'));
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      expect(doc.body.innerHTML).toContain('多页');
      expect(doc.body.innerHTML).not.toContain('单页');
    }
  });

  it('收集页面 style 标签并注入 iframe', () => {
    const style = document.createElement('style');
    style.textContent = '.resume-title { font-size: 24px; }';
    document.head.appendChild(style);

    createContainer('resume-preview', '<p>内容</p>');
    exportPDF();

    const iframe = document.querySelector('iframe')!;
    iframe.dispatchEvent(new Event('load'));
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      // style 内容应出现在 iframe head 的 style 标签中
      const headHTML = doc.head.innerHTML;
      expect(headHTML).toContain('.resume-title');
      expect(headHTML).toContain('font-size: 24px');
    }
  });

  it('iframe 包含 @page A4 打印样式', () => {
    createContainer('resume-preview', '<p>内容</p>');
    exportPDF();

    const iframe = document.querySelector('iframe')!;
    iframe.dispatchEvent(new Event('load'));
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      const headHTML = doc.head.innerHTML;
      expect(headHTML).toContain('@page');
      expect(headHTML).toContain('size: A4');
      expect(headHTML).toContain('-webkit-print-color-adjust: exact');
    }
  });

  it('afterprint 事件后 iframe 从 body 移除', () => {
    createContainer('resume-preview', '<p>内容</p>');
    exportPDF();

    const iframe = document.querySelector('iframe')!;
    iframe.dispatchEvent(new Event('load'));

    // 模拟打印完成 — listener 在 iframe.contentWindow 上
    iframe.contentWindow?.dispatchEvent(new Event('afterprint'));

    expect(document.body.contains(iframe)).toBe(false);
  });

  it('超时 3 秒后 iframe 也被强制移除（fallback）', () => {
    vi.useFakeTimers();
    createContainer('resume-preview', '<p>内容</p>');
    exportPDF();

    const iframe = document.querySelector('iframe')!;
    // 先触发 onload，这样 setTimeout 才会被注册
    iframe.dispatchEvent(new Event('load'));
    expect(document.body.contains(iframe)).toBe(true);

    // 不触发 afterprint，仅靠超时清理
    vi.advanceTimersByTime(3000);

    expect(document.body.contains(iframe)).toBe(false);
    vi.useRealTimers();
  });
});

describe('exportResume', () => {
  it('委托到 exportPDF，创建 iframe 并包含内容', () => {
    createContainer('resume-preview', '<p>测试简历</p>');
    exportResume();

    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    iframe!.dispatchEvent(new Event('load'));
    const doc = iframe!.contentDocument || iframe!.contentWindow?.document;
    if (doc) {
      expect(doc.body.innerHTML).toContain('测试简历');
    }
  });
});
