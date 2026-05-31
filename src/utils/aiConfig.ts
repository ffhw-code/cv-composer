export interface ApiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  visionModel: string;
}

const STORAGE_KEY = 'resume_ai_config';

const DEFAULTS: Record<string, Partial<ApiConfig>> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', visionModel: 'gpt-4o' },
  aliyun: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', visionModel: 'qwen-vl-max' },
};

export function getApiConfig(): ApiConfig | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ApiConfig;
  } catch {
    return null;
  }
}

export function saveApiConfig(config: ApiConfig): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getDefaultConfig(provider: string): Partial<ApiConfig> {
  return DEFAULTS[provider] || {};
}

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_BASE64_SIZE = 6.8 * 1024 * 1024; // ~6.8M base64


// ---- 上传文件缓存（替换 window globals） ----

interface UploadedFileData {
  base64: string;
  fileName: string;
  fileType: string;
}

let _uploadedFile: UploadedFileData | null = null;

export function setUploadedFile(data: UploadedFileData | null): void {
  _uploadedFile = data;
}

export function getUploadedFile(): UploadedFileData | null {
  return _uploadedFile;
}
