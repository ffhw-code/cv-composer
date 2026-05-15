// src/store/styleRegistry.ts
import type { FC } from 'react';
import type { ResumeModule } from './useResumeStore';

export type StyleComponentProps = { module: ResumeModule };
export type ModuleType = ResumeModule['type'];

export interface ChildTemplate {
  type: ModuleType;
  styleId?: string;
  defaultProps?: Partial<ResumeModule>;
  defaultStyle?: Record<string, string>;
  children?: ChildTemplate[];
}

// 分解器：接收父模块 ID，返回子模块数组
export type Decomposer = (parentId: string) => ResumeModule[];

export interface StyleConfig {
  type: ModuleType;
  style: string;
  label: string;
  thumb: string;
  component?: FC<StyleComponentProps>;
  defaultContent?: Partial<ResumeModule>;
  defaultStyle?: Record<string, string>;
  defaultChildren?: ChildTemplate[];          // 保留向后兼容，但新样式将使用 decomposer
  decomposer?: Decomposer;                   // 新增：精确分解器
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