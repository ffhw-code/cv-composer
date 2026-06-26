import { useEffect} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { getTextExtensions } from '../../tiptap/editorExtensions';
import { useResumeStore } from '../../store/useResumeStore';
import { useActiveEditor } from '../../hooks/useActiveEditor';
import { useOverflowGuard } from '../../hooks/useOverflowGuard';
import { useEditMode } from '../../hooks/useEditMode';
import { buildContainerStyle, hasCustomBorder } from '../../utils/styleHelpers';
import type { ResumeModule } from '../../store/useResumeStore';

/** 清理 HTML 中所有尾部空块 */
const cleanTrailing = (html: string): string => {
  let result = html;
  const trailingRe = /(?:<p><\/p>|<li><p><\/p><\/li>|<br\s*\/?>)\s*$/g;
  while (trailingRe.test(result)) {
    result = result.replace(trailingRe, '');
  }
  return result;
};

function TextControl({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const { setActiveEditor } = useActiveEditor();
  const isEditing = useEditMode();

  const editor = useEditor({
    extensions: getTextExtensions(),
    content: module.content || '<p>请在此输入文本...</p>',
    editorProps: {
      attributes: {
        style: 'min-height: 40px;',
        class: 'outline-none focus:ring-1 focus:ring-blue-200 rounded p-2',
      },
    },
    onUpdate: ({ editor }) => {
      const html = cleanTrailing(editor.getHTML());
      updateModule(module.id, { content: html });
    },
    onFocus: ({ editor }) => {
      setActiveEditor(editor);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const editorHtml = cleanTrailing(editor.getHTML());
    const storedHtml = cleanTrailing(module.content || '');
    if (storedHtml !== editorHtml) {
      editor.commands.setContent(module.content || '<p>请在此输入文本...</p>');
    }
  }, [module.content, editor]);

  // 动态应用模块样式到编辑器根元素（文字排版属性）
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const style = module.style || {};
    // eslint-disable-next-line react-hooks/immutability
    dom.style.minHeight = isEditing ? '40px' : '0';
    dom.style.padding = isEditing ? '' : '0';
    dom.style.fontFamily = style.fontFamily || '';
    dom.style.fontSize = style.fontSize || '';
    dom.style.color = style.color || '';
    dom.style.textAlign = style.textAlign || '';
    dom.style.backgroundColor = style.backgroundColor || '';
    dom.style.fontWeight = style.fontWeight || '';
    dom.style.fontStyle = style.fontStyle || '';
    dom.style.fontVariant = style.fontVariant || '';
    dom.style.lineHeight = style.lineHeight || '';
    dom.style.letterSpacing = style.letterSpacing || '';
    dom.style.textDecoration = style.textDecoration || '';
    dom.style.textTransform = style.textTransform || '';
    dom.style.textIndent = style.textIndent || '';
    dom.style.wordSpacing = style.wordSpacing || '';
    dom.style.whiteSpace = style.whiteSpace || '';
    dom.style.wordBreak = style.wordBreak || '';
    dom.style.overflowWrap = style.overflowWrap || '';
    dom.style.direction = style.direction || '';
  }, [editor, module.style, isEditing]);

  const styleForBuild = module.style ? { ...module.style } : undefined;
  const userHeight = styleForBuild?.height;
  if (styleForBuild) delete styleForBuild.height;

  const custom = hasCustomBorder(styleForBuild);
  const inline = buildContainerStyle(styleForBuild);
  const { ref, heightStyle, isOverflowing } = useOverflowGuard(userHeight);

  const containerStyle: React.CSSProperties = {
    ...inline,
    width: module.style?.width || 'auto',
    ...heightStyle,
  };

  return (
    <div ref={ref} style={containerStyle} className={`${isEditing && custom ? 'min-h-[20px]' : ''} ${isOverflowing ? 'ring-2 ring-red-300 rounded' : ''}`}>
      <EditorContent editor={editor} />
    </div>
  );
}

export default TextControl;
