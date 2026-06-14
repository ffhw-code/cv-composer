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

// ---- 推荐模型列表 ----

export interface RecommendedModel {
  model: string;
  provider: string;
  note: string;
}

/** 经测试确认 function calling 可靠、指令遵循良好的模型 */
export const RECOMMENDED_MODELS: RecommendedModel[] = [
  { model: 'qwen-max', provider: '阿里云百炼', note: '综合能力最强，function calling 稳定，首选推荐' },
  { model: 'qwen-plus', provider: '阿里云百炼', note: '性价比高，function calling 可靠，日常使用推荐' },
  { model: 'gpt-4o', provider: 'OpenAI', note: 'function calling 最成熟，指令遵循极好' },
  { model: 'gpt-4o-mini', provider: 'OpenAI', note: '轻量高效，function calling 稳定，成本低' },
  { model: 'deepseek-chat', provider: 'DeepSeek', note: 'OpenAI 兼容接口，function calling 表现好' },
];

/** 检查模型是否在推荐列表中 */
export function isRecommendedModel(model: string): boolean {
  return RECOMMENDED_MODELS.some(m => m.model === model.trim());
}
