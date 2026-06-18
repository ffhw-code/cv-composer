import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { getInlineExtensions } from '../../tiptap/editorExtensions';
import { useActiveEditor } from '../../hooks/useActiveEditor';

/** 清理 HTML 中所有尾部空块 */
const cleanTrailing = (html: string): string => {
  let result = html;
  const trailingRe = /(?:<p><\/p>|<li><p><\/p><\/li>|<br\s*\/?>)\s*$/g;
  while (trailingRe.test(result)) {
    result = result.replace(trailingRe, '');
  }
  return result;
};

interface InlineEditorProps {
  content: string;
  onUpdate: (html: string) => void;
  className?: string;
}

export default function InlineEditor({ content, onUpdate, className = '' }: InlineEditorProps) {
  const { setActiveEditor } = useActiveEditor();

  const editor = useEditor({
    extensions: getInlineExtensions(),
    content: content || '',
    editorProps: {
      attributes: {
        class: `outline-none min-w-[40px] ${className}`,
      },
    },
    onUpdate: ({ editor }) => {
      onUpdate(cleanTrailing(editor.getHTML()));
    },
    onFocus: ({ editor }) => {
      setActiveEditor(editor);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const editorHtml = cleanTrailing(editor.getHTML());
    const storedHtml = cleanTrailing(content || '');
    if (storedHtml !== editorHtml) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  return <EditorContent editor={editor} />;
}
