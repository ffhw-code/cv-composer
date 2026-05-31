/* eslint-disable react-refresh/only-export-components */
// src/hooks/useActiveEditor.ts
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';

interface ActiveEditorContextValue {
  activeEditor: Editor | null;
  setActiveEditor: (editor: Editor | null) => void;
}

const ActiveEditorContext = createContext<ActiveEditorContextValue>({
  activeEditor: null,
  setActiveEditor: () => {},
});

export const useActiveEditor = () => useContext(ActiveEditorContext);

export function ActiveEditorProvider({ children }: { children: ReactNode }) {
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  return (
    <ActiveEditorContext.Provider value={{ activeEditor, setActiveEditor }}>
      {children}
    </ActiveEditorContext.Provider>
  );
}