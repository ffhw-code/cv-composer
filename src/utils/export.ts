export function exportPDF() {
  // 优先使用多页容器，否则降级到旧版单页
  const container = document.getElementById('resume-pages') || document.getElementById('resume-preview');

  if (!container) {
    alert('未找到简历内容，请先添加模块');
    return;
  }

  const clone = container.cloneNode(true) as HTMLElement;

  // —— 清理编辑器专用 UI 元素和样式 ——
  // 1) 移除整个编辑器专用元素
  clone.querySelectorAll([
    '.resize-handles',                   // 缩放把手
    '.absolute.top-0\\.5.left-0\\.5',   // InlineToolbar 容器
    '.absolute.-bottom-8',               // 快捷键提示条
    '.animate-pulse',                    // 拖入指示线
  ].join(', ')).forEach(el => el.remove());

  // 删除模式勾选框：外层 .absolute.-left-8 容器
  clone.querySelectorAll('.absolute.-left-8').forEach(el => el.remove());

  // 2) 清理 inline style 中的编辑器专用属性
  clone.querySelectorAll('[style]').forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    // 选中蓝色边框 → 透明
    if (el.style.border === '2px solid rgb(59, 130, 246)') {
      el.style.border = '2px solid transparent';
    }
    if (el.style.border.includes('solid rgb(59, 130, 246)')) {
      el.style.border = el.style.border.replace(/solid rgb\(59,\s*130,\s*246\)/g, 'solid transparent');
    }
    // 移除拖拽透明度
    if (el.style.opacity === '0.4') el.style.opacity = '1';
    // 移除 InlineToolbar 占位 padding
    if (el.style.paddingTop === '20px') el.style.paddingTop = '0';
    // 重置拖拽光标
    if (el.style.cursor === 'grabbing') el.style.cursor = 'default';
  });

  // 3) 移除编辑器专用 CSS class
  clone.querySelectorAll('*').forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    let cls = el.className;
    if (!cls || typeof cls !== 'string') return;

    // 选中高亮 / 拖放目标高亮 / 溢出标记
    cls = cls.replace(/\bring-2\s+ring-blue-400\s+ring-offset-1\b/g, '');
    cls = cls.replace(/\bring-2\s+ring-red-300\b/g, '');
    cls = cls.replace(/shadow-\[0_0_12px_rgba\(59,130,246,0\.3\)\]/g, '');
    cls = cls.replace(/shadow-\[inset_0_1px_3px_rgba\(0,0,0,0\.2\)\]/g, '');
    cls = cls.replace(/\btranslate-y-\[1px\]\b/g, '');

    // 空容器虚线边框和灰色背景
    cls = cls.replace(/\bborder-dashed\b/g, '');
    cls = cls.replace(/\bborder-gray-300\b/g, '');
    cls = cls.replace(/\bbg-gray-50\/40\b/g, '');
    cls = cls.replace(/\bbg-gray-50\/60\b/g, '');

    // 拖拽激活态
    cls = cls.replace(/\bopacity-40\b/g, '');
    cls = cls.replace(/\bgrabbing\b/g, '');

    // 删除模式勾选框的蓝色选中态
    cls = cls.replace(/\bbg-blue-500\b/g, '');
    cls = cls.replace(/\bborder-blue-600\b/g, '');
    cls = cls.replace(/\bhover:border-blue-400\b/g, '');
    cls = cls.replace(/\bactive:scale-95\b/g, '');

    // 清理多余空格
    el.className = cls.replace(/\s+/g, ' ').trim();
  });

  // 4) 任何残留的 border-dashed 容器 → 透明边框
  clone.querySelectorAll('[class*="border"]').forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    const cls = el.className;
    if (cls.includes('border-dashed') || (cls.includes('border') && !cls.match(/border-\[/))) {
      el.style.border = '1px solid transparent';
    }
  });

  // 为每个页面卡片添加分页符（如果还没有）
  const pages = clone.querySelectorAll('[style*="page-break-after"]');
  pages.forEach((page, index) => {
    if (index < pages.length - 1) {
      (page as HTMLElement).style.pageBreakAfter = 'always';
    } else {
      (page as HTMLElement).style.pageBreakAfter = 'auto';
    }
  });

  // 收集样式表
  const inlineStyles = Array.from(document.querySelectorAll('style'))
    .map(s => s.textContent || '')
    .filter(css => css.trim().length > 0)
    .join('\n');

  const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(link => {
      const cloneLink = link.cloneNode() as HTMLLinkElement;
      cloneLink.href = (link as HTMLLinkElement).href;
      return cloneLink.outerHTML;
    })
    .join('\n');

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  document.body.appendChild(iframe);

  iframe.onload = () => {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      alert('无法创建打印文档');
      document.body.removeChild(iframe);
      return;
    }

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>简历</title>
        ${linkTags}
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background: white;
          }
          #${container.id} {
            /* 保持原始缩放等效果（如果有） */
          }
          ${inlineStyles}
          @media print {
            body { margin: 0; }
            @page {
              size: A4;
              margin: 0;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        </style>
      </head>
      <body>
        <div data-editing="false">${clone.outerHTML}</div>
      </body>
      </html>
    `);
    iframeDoc.close();

    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    const handleAfterPrint = () => {
      document.body.removeChild(iframe);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
    iframe.contentWindow?.addEventListener('afterprint', handleAfterPrint);
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
        window.removeEventListener('afterprint', handleAfterPrint);
      }
    }, 3000);
  };

  iframe.src = 'about:blank';
}

export async function exportResume() {
  exportPDF();
}