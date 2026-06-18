import { useEffect} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { getHeadingExtensions } from '../../tiptap/editorExtensions';
import { useResumeStore } from '../../store/useResumeStore';
import { useOverflowGuard } from '../../hooks/useOverflowGuard';
import { useActiveEditor } from '../../hooks/useActiveEditor';
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

function HeadingControl({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const { setActiveEditor } = useActiveEditor();

  const editor = useEditor({
    extensions: getHeadingExtensions(),
    content: module.content || '<h2>标题</h2>',
    editorProps: {
      attributes: {
        class: 'outline-none focus:ring-1 focus:ring-blue-200 rounded p-1 text-xl font-bold',
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
      editor.commands.setContent(module.content || '<h2>标题</h2>');
    }
  }, [module.content, editor]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const style = module.style || {};
    /* eslint-disable react-hooks/immutability */
    dom.style.fontFamily = style.fontFamily || '';
    dom.style.fontSize = style.fontSize || '';
    dom.style.color = style.color || '';
    dom.style.textAlign = style.textAlign || '';
    dom.style.fontWeight = style.fontWeight || '';
    dom.style.lineHeight = style.lineHeight || '';
    dom.style.letterSpacing = style.letterSpacing || '';
    /* eslint-enable react-hooks/immutability */
  }, [editor, module.style]);

  const { ref, heightStyle, isOverflowing } = useOverflowGuard(module.style?.height);
  const containerStyle: React.CSSProperties = {
    width: module.style?.width || 'auto',
    ...heightStyle,
    margin: module.style?.margin || '0',
    padding: module.style?.padding || '0',
    backgroundColor: module.style?.backgroundColor || 'transparent',
  };

  return (
    <div ref={ref} style={containerStyle} className={isOverflowing ? 'ring-2 ring-red-300 rounded' : ''}>
      <EditorContent editor={editor} />
    </div>
  );
}

export default HeadingControl;
