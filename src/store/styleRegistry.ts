// src/store/styleRegistry.ts
import type { FC } from 'react';
import type { ResumeModule } from '../types/resume';

export type StyleComponentProps = { module: ResumeModule; children?: React.ReactNode };
export type ModuleType = ResumeModule['type'];

export interface ChildTemplate {
  type: ModuleType;
  styleId?: string;
  defaultProps?: Partial<ResumeModule>;
  defaultStyle?: Record<string, string>;
  children?: ChildTemplate[];
}

export interface StyleConfig {
  type: ModuleType;
  style: string;
  label: string;
  thumb: string;
  component?: FC<StyleComponentProps>;
  defaultContent?: Partial<ResumeModule>;
  defaultStyle?: Record<string, string>;
  defaultChildren?: ChildTemplate[];
}

const styleRegistry: StyleConfig[] = [];

export function registerStyle(config: StyleConfig) {
  const exists = styleRegistry.find(
    (item) => item.type === config.type && item.style === config.style
  );
  if (!exists) {
    styleRegistry.push(config);
  }
}

export function getStylesByType(type: ModuleType): StyleConfig[] {
  return styleRegistry.filter((item) => item.type === type);
}

export function getStyleConfig(
  type: ModuleType,
  styleId?: string
): StyleConfig | undefined {
  return styleRegistry.find(
    (item) => item.type === type && item.style === (styleId || '')
  );
}
