import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontSize from '../../tiptap/fontSize'; // 导入自定义扩展
import { useActiveEditor } from '../../hooks/useActiveEditor';

interface InlineEditorProps {
  content: string;
  onUpdate: (html: string) => void;
  className?: string;
}

export default function InlineEditor({ content, onUpdate, className = '' }: InlineEditorProps) {
  const { setActiveEditor } = useActiveEditor();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['paragraph'] }),
      FontFamily,
      TextStyle,
      Color,
      FontSize,
    ],
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