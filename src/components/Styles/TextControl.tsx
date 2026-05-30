import { useEffect} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { getTextExtensions } from '../../tiptap/editorExtensions';
import { useResumeStore } from '../../store/useResumeStore';
import { useActiveEditor } from '../../hooks/useActiveEditor';
import type { ResumeModule } from '../../store/useResumeStore';

function TextControl({ module }: { module: ResumeModule }) {
  const updateModule = useResumeStore((s) => s.updateModule);
  const { setActiveEditor } = useActiveEditor();

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

  // 动态应用模块样式到编辑器根元素
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const style = module.style || {};
    dom.style.fontFamily = style.fontFamily || '';
    dom.style.fontSize = style.fontSize || '';
    dom.style.color = style.color || '';
    dom.style.textAlign = style.textAlign || '';
    dom.style.backgroundColor = style.backgroundColor || '';
    dom.style.fontWeight = style.fontWeight || '';
    dom.style.lineHeight = style.lineHeight || '';
    dom.style.letterSpacing = style.letterSpacing || '';
    // 注意：编辑器内部可能有背景，我们也可以直接在外层 div 设置背景
  }, [editor, module.style]);

  // 布局属性放到外层容器
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

export default TextControl;