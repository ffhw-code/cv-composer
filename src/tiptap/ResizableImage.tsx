/* eslint-disable react-refresh/only-export-components */
import Image from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useRef } from 'react';

function ResizableImageView(props: { node: { attrs: Record<string, string | null> }; updateAttributes: (attrs: Record<string, string>) => void }) {
  const { node, updateAttributes } = props;
  const imgRef = useRef<HTMLImageElement>(null);
  const startPos = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const width = node.attrs.width || 'auto';
  const height = node.attrs.height || 'auto';

  const onMouseDown = (e: React.MouseEvent) => {
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

    const handleMove = (moveEvent: MouseEvent) => {
      if (!startPos.current) return;
      const deltaX = moveEvent.clientX - startPos.current.x;
      const deltaY = moveEvent.clientY - startPos.current.y;
      const newWidth = Math.max(20, startPos.current.w + deltaX);
      const newHeight = Math.max(20, startPos.current.h + deltaY);
      updateAttributes({
        width: `${newWidth}px`,
        height: `${newHeight}px`,
      });
    };

    const handleUp = () => {
      startPos.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <NodeViewWrapper className="relative inline-block group">
      <img
        ref={imgRef}
        src={node.attrs.src ?? undefined}
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
        renderHTML: (attrs: Record<string, string | null>) => {
          if (!attrs.width) return {};
          return { width: attrs.width };
        },
      },
      height: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('height') || el.style.height || null,
        renderHTML: (attrs: Record<string, string | null>) => {
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
