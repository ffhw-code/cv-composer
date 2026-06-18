/* eslint-disable @typescript-eslint/no-explicit-any */
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


// 扩展：自动清理尾部空白块（Button/Delete/Backspace 无法删除的空 <p></p>/<li><p></p></li>）
const CleanEmptyBlocks = Extension.create({
  name: 'cleanEmptyBlocks',
  addKeyboardShortcuts() {
    return {
      // 在空段落或空列表项中按 Backspace 时，如果前面有兄弟节点则删除当前块
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty) return false;
        const node = $from.parent;
        const isEmptyBlock = node.type.name === 'paragraph' && node.content.size === 0;
        const isEmptyListItem = node.type.name === 'listItem' && node.content.size === 2; // listItem 只含一个空 paragraph
        if (!isEmptyBlock && !isEmptyListItem) return false;
        // 如果是文档中唯一的块，不处理
        const docSize = this.editor.state.doc.content.content.length;
        if (docSize <= 1 && !isEmptyListItem) return false;
        return this.editor.commands.deleteNode(node.type);
      },
    };
  },
});

export function getTextExtensions() {
  return [
    CleanEmptyBlocks,
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
    CleanEmptyBlocks,
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
    CleanEmptyBlocks,
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
    CleanEmptyBlocks,
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
