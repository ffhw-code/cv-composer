// src/store/styleRegistry.ts
import type { FC } from 'react';
import type { ResumeModule } from './useResumeStore';

// 样式组件的通用 Props
export type StyleComponentProps = { module: ResumeModule };

// 一个样式的完整定义
export interface StyleConfig {
  type: 'header' | 'module';
  style: string;          // 唯一标识，如 'header-style-1'
  label: string;          // 面板中显示的名称
  thumb: string;          // 缩略图路径
  component: FC<StyleComponentProps>;
  // 默认内容：当用这个样式创建模块时，初始化什么文字
  defaultContent?: Partial<ResumeModule>;
}

// 由于组件需要动态导入，我们先创建一个空的注册表，
// 在各自组件文件创建后再填充，或者使用懒加载。
// 这里提供一个存储容器和一个查找工具函数。

const styleRegistry: StyleConfig[] = [];

// 注册一个样式
export function registerStyle(config: StyleConfig) {
  // 去重
  const exists = styleRegistry.find(
    (item) => item.type === config.type && item.style === config.style
  );
  if (!exists) {
    styleRegistry.push(config);
  }
}

// 根据 type 获取所有样式
export function getStylesByType(type: 'header' | 'module'): StyleConfig[] {
  return styleRegistry.filter((item) => item.type === type);
}

// 根据 type 和 style 获取单个配置
export function getStyleConfig(
  type: 'header' | 'module',
  style?: string
): StyleConfig | undefined {
  return styleRegistry.find(
    (item) => item.type === type && item.style === (style || 'header-style-1')
  );
}