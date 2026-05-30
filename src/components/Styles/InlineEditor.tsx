import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { getInlineExtensions } from '../../tiptap/editorExtensions';
import { useActiveEditor } from '../../hooks/useActiveEditor';

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
      onUpdate(editor.getHTML());
    },
    onFocus: ({ editor }) => {
      setActiveEditor(editor);
    },
  });

  // 外部内容变化时同步（例如撤销/重做）
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  return <EditorContent editor={editor} />;
}