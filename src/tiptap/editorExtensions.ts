import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import { Extension } from '@tiptap/core';
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

// 字重扩展（仿 FontFamily 模式，作用于 textStyle mark）
const FontWeight = Extension.create({
  name: 'fontWeight',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontWeight: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontWeight || null,
          renderHTML: (attrs: Record<string, any>) => {
            if (!attrs.fontWeight) return {};
            return { style: `font-weight: ${attrs.fontWeight}` };
          },
        },
      },
    }];
  },
  addCommands(): any {
    return {
      setFontWeight: (val: string) => ({ chain }: any) =>
        chain().setMark('textStyle', { fontWeight: val }).run(),
      unsetFontWeight: () => ({ chain }: any) =>
        chain().setMark('textStyle', { fontWeight: null }).removeEmptyTextStyle().run(),
    };
  },
});

// 字间距扩展
const LetterSpacing = Extension.create({
  name: 'letterSpacing',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        letterSpacing: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.letterSpacing || null,
          renderHTML: (attrs: Record<string, any>) => {
            if (!attrs.letterSpacing) return {};
            return { style: `letter-spacing: ${attrs.letterSpacing}` };
          },
        },
      },
    }];
  },
  addCommands(): any {
    return {
      setLetterSpacing: (val: string) => ({ chain }: any) =>
        chain().setMark('textStyle', { letterSpacing: val }).run(),
      unsetLetterSpacing: () => ({ chain }: any) =>
        chain().setMark('textStyle', { letterSpacing: null }).removeEmptyTextStyle().run(),
    };
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
    FontWeight,
    LetterSpacing,
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
    FontWeight,
    LetterSpacing,
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
    FontWeight,
    LetterSpacing,
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
    FontWeight,
    LetterSpacing,
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
