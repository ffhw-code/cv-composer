import { useState, useRef } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import { executeSkill } from '../../engine/skillExecutor';
import { setUploadedFile } from '../../utils/aiConfig';
import { callSmartFill, callAiForEvaluate, callAiForPolish } from './aiApi';

export const UNSUPPORTED_FILE_MSG = 'PDF/Word 文件暂不支持，请先将简历转为 PNG 或 JPG 图片后上传。';

export function isSupportedUploadFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  if (file.type === 'text/plain') return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'txt' || ['png', 'jpg', 'jpeg'].includes(ext ?? '');
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxWidth = 1600;
      const maxHeight = 1600;
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片加载失败'));
    };
    img.src = objectUrl;
  });
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export function useFileImport(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) {
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildSkillContext = () => ({
    get modules() { return useResumeStore.getState().modules; },
    importModules: (mods: import('../../store/useResumeStore').ResumeModule[]) =>
      useResumeStore.getState().importModules(mods),
    getCanvasState: () => {
      const modules = useResumeStore.getState().modules;
      return JSON.stringify(modules.map(m => ({
        id: m.id, type: m.type, styleId: m.styleId,
        name: m.name || m.title || '',
        content: m.content?.substring(0, 100) || '',
        children: m.children?.map(c => ({ id: c.id, type: c.type, styleId: c.styleId })) || [],
      })), null, 2);
    },
    callAiForPolish,
    callAiForEvaluate: async (prompt: string) => callAiForEvaluate(prompt),
    callAiForSmartFill: callSmartFill,
  });

  const replaceImportStatusMessage = (text: string) => {
    setMessages(prev => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'ai' && next[i].text === '正在解析简历…') {
          next[i] = { role: 'ai', text };
          return next;
        }
      }
      return [...prev, { role: 'ai', text }];
    });
  };

  const runAutoImport = async (fileName: string, fileType: string) => {
    setMessages(prev => [
      ...prev,
      { role: 'user', text: `[上传文件] 文件名: ${fileName}, 类型: ${fileType}, 请导入此简历` },
      { role: 'ai', text: '正在解析简历…' },
    ]);

    try {
      const result = await executeSkill('import-resume', {}, buildSkillContext());
      replaceImportStatusMessage(result);
    } catch (err: unknown) {
      const importErrMsg = err instanceof Error ? err.message : String(err);
      replaceImportStatusMessage(`导入失败：${importErrMsg}\n\n<details><summary>诊断信息</summary>请检查：1. 视觉模型是否支持图片解析 2. API 是否有限流 3. 图片是否清晰可读</details>`);
    }
  };

  const MAX_SIZE = 5 * 1024 * 1024;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSupportedUploadFile(file)) {
      setMessages(prev => [...prev, { role: 'ai', text: UNSUPPORTED_FILE_MSG }]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_SIZE) {
      setMessages(prev => [...prev, { role: 'ai', text: '文件过大，请压缩到 5MB 以内或转为图片后上传。' }]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setParsing(true);
    try {
      let base64: string;
      if (file.type.startsWith('image/')) {
        base64 = await compressImage(file);
      } else {
        const reader = new FileReader();
        base64 = await new Promise((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      base64 = base64.replace(/\s/g, '');
      while (base64.length % 4 !== 0) {
        base64 += '=';
      }

      setUploadedFile({ base64, fileName: file.name, fileType: file.type });
      await runAutoImport(file.name, file.type);
    } catch (err: unknown) {
      const fileErrMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { role: 'ai', text: `文件读取失败: ${fileErrMsg}` }]);
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  return { parsing, fileInputRef, handleImportClick, handleFileChange };
}
