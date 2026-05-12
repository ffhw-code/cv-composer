export function exportPDF() {
  // 优先使用多页容器，否则降级到旧版单页
  const container = document.getElementById('resume-pages') || document.getElementById('resume-preview');

  if (!container) {
    alert('未找到简历内容，请先添加模块');
    return;
  }

  const clone = container.cloneNode(true) as HTMLElement;

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
        ${clone.outerHTML}
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

export async function exportResume(_format: 'pdf') {
  exportPDF();
}