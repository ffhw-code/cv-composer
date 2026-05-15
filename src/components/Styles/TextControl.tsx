import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontSize from '../../tiptap/fontSize';
import { ResizableImage } from '../../tiptap/ResizableImage';
import { useResumeStore } from '../../store/useResumeStore';
import { useActiveEditor } from '../../hooks/useActiveEditor';
import type { ResumeModule } from '../../store/useResumeStore';

function TextControl({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const { setActiveEditor } = useActiveEditor();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['paragraph'] }),
      FontFamily,
      TextStyle,
      Color,
      ResizableImage,
      FontSize,
    ],
    content: module.content || '<p>请在此输入文本...</p>',
    editorProps: {
      attributes: {
        style: 'min-height: 40px;',
        class: 'outline-none focus:ring-1 focus:ring-blue-200 rounded p-2',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      updateModule(module.id, { content: html });
    },
    onFocus: ({ editor }) => {
      setActiveEditor(editor);
    },
  });

  useEffect(() => {
    if (editor && module.content !== editor.getHTML()) {
      editor.commands.setContent(module.content || '<p>请在此输入文本...</p>');
    }
  }, [module.content, editor]);

  return <EditorContent editor={editor} />;
}

export default TextControl;