import { useEffect } from 'react';
import { useResumeStore } from '../store/useResumeStore';
import { subscribeResumeAutosave } from '../utils/resumePersistence';

/**
 * 简历文档自动保存：订阅 store 的内容变化，防抖写入 localStorage，
 * 页面隐藏/组件卸载前强制落盘。在浏览器环境挂载一次即可。
 */
export function useResumeAutosave(): void {
  useEffect(() => subscribeResumeAutosave(useResumeStore), []);
}
