import { createContext } from 'react';
import type { ResumeModule } from '../../store/useResumeStore';

export const ModuleRenderContext = createContext<(mod: ResumeModule) => React.ReactNode>(() => null);