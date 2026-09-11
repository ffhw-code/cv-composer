export interface ApiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  visionModel: string;
}

/** Provider 特有行为差异 */
export interface ProviderQuirks {
  /** tool_calls 消息中 content 必须设为 null（阿里百炼） */
  nullContentOnToolCalls: boolean;
  /** 视觉模型不支持独立的 vision model，直接复用 FC 模型（gpt-4o 等） */
  visionReusesFcModel: boolean;
  /** 错误响应中 message 字段路径 */
  errorMessagePath: string;
}

const STORAGE_KEY = 'resume_ai_config';

interface ProviderPreset {
  label: string;
  baseUrl: string;
  model: string;
  visionModel: string;
  quirks: ProviderQuirks;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  aliyun: {
    label: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    visionModel: 'qwen-vl-max',
    quirks: {
      nullContentOnToolCalls: true,
      visionReusesFcModel: false,
      errorMessagePath: 'error.message',
    },
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    visionModel: 'gpt-4o',
    quirks: {
      nullContentOnToolCalls: false,
      visionReusesFcModel: true,
      errorMessagePath: 'error.message',
    },
  },
  custom: {
    label: '自定义接口',
    baseUrl: '',
    model: '',
    visionModel: '',
    quirks: {
      nullContentOnToolCalls: false,
      visionReusesFcModel: false,
      errorMessagePath: 'error.message',
    },
  },
};

/** 未显式配置 baseUrl 时默认走阿里云百炼兼容接口 */
export const DEFAULT_BASE_URL = PROVIDER_PRESETS.aliyun.baseUrl;

/** 解析实际请求地址：空字符串视为未配置，回退到默认服务商 */
export function resolveBaseUrl(baseUrl?: string): string {
  return baseUrl && baseUrl.trim() ? baseUrl : DEFAULT_BASE_URL;
}

export function getProviderQuirks(provider: string): ProviderQuirks {
  return PROVIDER_PRESETS[provider]?.quirks || PROVIDER_PRESETS.custom.quirks;
}

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

// ---- 请求超时 ----

/**
 * 单次 AI 请求的默认超时（毫秒）。
 * 改前基线里成功请求的 P95 只有 14.3 s，120 s 只会把「网络挂死」拖成两分钟等待，
 * 因此默认调到 45 s；需要更宽松时用 localStorage 覆盖（见 getAiRequestTimeoutMs）。
 */
export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 45_000;

/** localStorage 覆盖键：便于临时调整或测试，无需改代码 */
export const AI_REQUEST_TIMEOUT_KEY = 'resume_ai_request_timeout_ms';

const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 600_000;

/** 读取单次请求超时：localStorage 覆盖（5s~600s 内视为有效）> 默认 45s */
export function getAiRequestTimeoutMs(): number {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(AI_REQUEST_TIMEOUT_KEY);
    const value = raw ? Number(raw) : NaN;
    if (Number.isFinite(value) && value >= MIN_TIMEOUT_MS && value <= MAX_TIMEOUT_MS) return value;
  } catch { /* 存储不可用时退回默认值 */ }
  return DEFAULT_AI_REQUEST_TIMEOUT_MS;
}

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_BASE64_SIZE = 6.8 * 1024 * 1024;

// ---- 上传文件缓存 ----

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

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  { model: 'qwen-max', provider: '阿里云百炼', note: '综合能力最强，function calling 稳定，首选推荐' },
  { model: 'qwen-plus', provider: '阿里云百炼', note: '性价比高，function calling 可靠，日常使用推荐' },
  { model: 'gpt-4o', provider: 'OpenAI', note: 'function calling 最成熟，指令遵循极好' },
  { model: 'gpt-4o-mini', provider: 'OpenAI', note: '轻量高效，function calling 稳定，成本低' },
  { model: 'deepseek-chat', provider: 'DeepSeek', note: 'OpenAI 兼容接口，function calling 表现好' },
];

export function isRecommendedModel(model: string): boolean {
  return RECOMMENDED_MODELS.some(m => m.model === model.trim());
}

/** 检查模型是否支持视觉（通过模型名推断） */
export function isVisionModel(model: string): boolean {
  return /(vl|vision|claude-3|gemini-pro-vision|ocr|gpt-4o)/i.test(model);
}
