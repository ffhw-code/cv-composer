import { useEffect} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { getListExtensions } from '../../tiptap/editorExtensions';
import { useResumeStore } from '../../store/useResumeStore';
import { useActiveEditor } from '../../hooks/useActiveEditor';
import type { ResumeModule } from '../../store/useResumeStore';

function ListControl({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const { setActiveEditor } = useActiveEditor();

  const editor = useEditor({
    extensions: getListExtensions(),
    content: module.content || '<ul><li>列表项</li></ul>',
    editorProps: {
      attributes: {
        class: 'outline-none focus:ring-1 focus:ring-blue-200 rounded p-2 list-disc pl-5',
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
      editor.commands.setContent(module.content || '<ul><li>列表项</li></ul>');
    }
  }, [module.content, editor]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const style = module.style || {};
    // eslint-disable-next-line react-hooks/immutability
    dom.style.fontFamily = style.fontFamily || '';
    dom.style.fontSize = style.fontSize || '';
    dom.style.color = style.color || '';
    dom.style.textAlign = style.textAlign || '';
    dom.style.fontWeight = style.fontWeight || '';
    dom.style.lineHeight = style.lineHeight || '';
    dom.style.letterSpacing = style.letterSpacing || '';
  }, [editor, module.style]);

  const containerStyle: React.CSSProperties = {
    width: module.style?.width || 'auto',
    height: module.style?.height || 'auto',
    margin: module.style?.margin || '0',
    padding: module.style?.padding || '0',
    backgroundColor: module.style?.backgroundColor || 'transparent',
  };

  return (
    <div style={containerStyle}>
      <EditorContent editor={editor} />
    </div>
  );
}

export default ListControl;