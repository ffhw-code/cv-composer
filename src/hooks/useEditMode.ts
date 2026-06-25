import { createContext, useContext } from 'react';

const EditModeContext = createContext<boolean>(true);

export const useEditMode = () => useContext(EditModeContext);

export const EditModeProvider = EditModeContext.Provider;
