import type { FC } from 'react';
import type { ResumeModule } from './useResumeStore';

export type StyleComponentProps = { module: ResumeModule };
export type ModuleType = ResumeModule['type'];

export interface StyleConfig {
  type: ModuleType;
  style: string;          // 样式标识，如 'header-style-1'
  label: string;
  thumb: string;
  component: FC<StyleComponentProps>;
  defaultContent?: Partial<ResumeModule>;
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