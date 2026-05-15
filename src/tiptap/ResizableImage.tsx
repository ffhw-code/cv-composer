import Image from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useRef, useCallback } from 'react';

function ResizableImageView(props: any) {
  const { node, updateAttributes } = props;
  const imgRef = useRef<HTMLImageElement>(null);
  const startPos = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const width = node.attrs.width || 'auto';
  const height = node.attrs.height || 'auto';

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      w: img.clientWidth,
      h: img.clientHeight,
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!startPos.current) return;
    const deltaX = e.clientX - startPos.current.x;
    const deltaY = e.clientY - startPos.current.y;
    const newWidth = Math.max(20, startPos.current.w + deltaX);
    const newHeight = Math.max(20, startPos.current.h + deltaY);
    updateAttributes({
      width: `${newWidth}px`,
      height: `${newHeight}px`,
    });
  }, [updateAttributes]);

  const onMouseUp = useCallback(() => {
    startPos.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <NodeViewWrapper className="relative inline-block group">
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        title={node.attrs.title || ''}
        style={{
          width,
          height,
          maxWidth: '100%',
          display: 'block',
        }}
        className="rounded"
      />
      {/* 拖拽手柄 */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 bg-blue-400 rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={onMouseDown}
        title="拖拽调整尺寸"
      />
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  name: 'resizableImage',

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('width') || el.style.width || null,
        renderHTML: (attrs: Record<string, any>) => {
          if (!attrs.width) return {};
          return { width: attrs.width };
        },
      },
      height: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('height') || el.style.height || null,
        renderHTML: (attrs: Record<string, any>) => {
          if (!attrs.height) return {};
          return { height: attrs.height };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});