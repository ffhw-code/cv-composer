import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import FontSize from './fontSize';
import { ResizableImage } from './ResizableImage';

const linkExtension = Link.configure({
  openOnClick: false,
  autolink: true,
  HTMLAttributes: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
});

export function getTextExtensions() {
  return [
    StarterKit.configure({ heading: false, link: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['paragraph'] }),
    FontFamily,
    TextStyle,
    Color,
    linkExtension,
    ResizableImage,
    FontSize,
  ];
}

export function getHeadingExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2] }, link: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    FontFamily,
    TextStyle,
    Color,
    linkExtension,
    ResizableImage,
    FontSize,
  ];
}

export function getListExtensions() {
  return [
    StarterKit.configure({ heading: false, link: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['paragraph', 'listItem'] }),
    FontFamily,
    TextStyle,
    Color,
    linkExtension,
    ResizableImage,
    FontSize,
  ];
}

export function getInlineExtensions() {
  return [
    StarterKit.configure({ heading: false, link: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['paragraph'] }),
    FontFamily,
    TextStyle,
    Color,
    linkExtension,
    FontSize,
  ];
}

/** 仅允许 http(s) / mailto 链接，拒绝 javascript: 等危险协议 */
export function sanitizeLinkUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, window.location.href);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}
