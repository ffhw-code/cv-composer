export function exportPDF() {
  // 1. 选择导出容器：优先使用纸张页容器，否则向后兼容
  const pageEl =
    document.getElementById('resume-page') ||
    document.getElementById('resume-preview');

  if (!pageEl) {
    alert('未找到简历内容，请先添加模块');
    return;
  }

  // 2. 深克隆（保留所有内联样式、事件以外的结构）
  const clone = pageEl.cloneNode(true) as HTMLElement;

  // 3. 动态获取原容器的宽高（px），用于后续纸张匹配
  const computed = window.getComputedStyle(pageEl);
  const widthStr = computed.width;   // e.g. "794px"
  const heightStr = computed.height; // e.g. "1123px"
  const widthPx = parseFloat(widthStr);
  const heightPx = parseFloat(heightStr);

  // 转换为毫米（96dpi 基准），适配 @page 尺寸
  const pxToMm = (px: number) => ((px * 25.4) / 96).toFixed(2);
  const widthMM = pxToMm(widthPx);
  const heightMM = pxToMm(heightPx);

  // 4. 收集所有内联样式（<style> 标签）
  const inlineStyles = Array.from(document.querySelectorAll('style'))
    .map(s => s.textContent || '')
    .filter(css => css.trim().length > 0)
    .join('\n');

  // 5. 收集外部样式表（<link rel="stylesheet">），转为绝对路径确保可加载
  const linkTags = Array.from(
    document.querySelectorAll('link[rel="stylesheet"]')
  )
    .map(link => {
      const cloneLink = link.cloneNode() as HTMLLinkElement;
      cloneLink.href = (link as HTMLLinkElement).href; // 转为绝对路径
      return cloneLink.outerHTML;
    })
    .join('\n');

  // 6. 创建隐藏 iframe，尺寸与容器匹配
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = widthStr;
  iframe.style.height = heightStr;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      alert('无法创建打印文档');
      document.body.removeChild(iframe);
      return;
    }

    // 7. 构建独立文档，注入完整样式和克隆内容
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>简历</title>
        <!-- 外部样式表（绝对路径） -->
        ${linkTags}
        <style>
          /* 最小化重置，不破坏模板自身边距 */
          html, body {
            margin: 0;
            padding: 0;
            background: white;
            display: flex;
            justify-content: center;
          }

          /* 让克隆的页面容器保持原尺寸，overflow 防止溢出第二页 */
          #${pageEl.id} {
            width: ${widthStr};
            height: ${heightStr};
            overflow: hidden;
            box-sizing: border-box;
            /* 模板自身的 padding 就是打印出来的页边距 */
          }

          /* 注入原页搜集的内联样式（包含 Tailwind 等） */
          ${inlineStyles}

          /* 打印设置：无边距，纸张尺寸动态匹配容器 */
          @media print {
            body { margin: 0; }
            @page {
              size: ${widthMM}mm ${heightMM}mm;
              margin: 0;
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

    // 8. 触发打印
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    // 9. 打印对话框关闭后清理 iframe（使用 afterprint 兼容更佳）
    const handleAfterPrint = () => {
      document.body.removeChild(iframe);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
    iframe.contentWindow?.addEventListener('afterprint', handleAfterPrint);
    // 兜底：若 afterprint 不支持，延迟移除
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