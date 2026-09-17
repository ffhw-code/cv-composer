import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_REQUEST_TIMEOUT_KEY,
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
  getProviderQuirks,
  getAiRequestTimeoutMs,
  isVisionCapableModel,
  isVisionModel,
  PROVIDER_PRESETS,
} from './aiConfig';

/** 最小可用的 localStorage 替身 */
function createFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => { map.clear(); },
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

describe('getAiRequestTimeoutMs', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: createFakeStorage(), configurable: true, writable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('默认 45s（改前基线成功请求 P95 只有 14.3s，120s 只会拖长等待）', () => {
    expect(DEFAULT_AI_REQUEST_TIMEOUT_MS).toBe(45_000);
    expect(getAiRequestTimeoutMs()).toBe(45_000);
  });

  it('localStorage 可覆盖', () => {
    localStorage.setItem(AI_REQUEST_TIMEOUT_KEY, '9000');
    expect(getAiRequestTimeoutMs()).toBe(9000);
  });

  it('越界或非数字的覆盖值被忽略', () => {
    localStorage.setItem(AI_REQUEST_TIMEOUT_KEY, '100');
    expect(getAiRequestTimeoutMs()).toBe(45_000);
    localStorage.setItem(AI_REQUEST_TIMEOUT_KEY, '99999999');
    expect(getAiRequestTimeoutMs()).toBe(45_000);
    localStorage.setItem(AI_REQUEST_TIMEOUT_KEY, 'abc');
    expect(getAiRequestTimeoutMs()).toBe(45_000);
  });
});

describe('DeepSeek 预设与 ProviderQuirks 开关', () => {
  it('DeepSeek 预设：官方端点不加 /v1，档位 deepseek-flash（探针实测可用且支持图片输入）', () => {
    expect(PROVIDER_PRESETS.deepseek.baseUrl).toBe('https://api.deepseek.com');
    expect(PROVIDER_PRESETS.deepseek.model).toBe('deepseek-flash');
    expect(PROVIDER_PRESETS.deepseek.visionModel).toBe('deepseek-flash');
  });

  it('DeepSeek 开关打开：非上传不发 tool_choice、required 时关闭思考', () => {
    const quirks = getProviderQuirks('deepseek');
    expect(quirks.omitAutoToolChoice).toBe(true);
    expect(quirks.disableThinkingWithRequiredToolChoice).toBe(true);
  });

  it('阿里云 / OpenAI / 自定义 / 未知服务商：两个开关均为关，行为保持改前', () => {
    for (const provider of ['aliyun', 'openai', 'custom', 'unknown-provider']) {
      const quirks = getProviderQuirks(provider);
      expect(quirks.omitAutoToolChoice).toBe(false);
      expect(quirks.disableThinkingWithRequiredToolChoice).toBe(false);
    }
  });
});

describe('isVisionCapableModel：显式配置优先，名称正则只作兜底', () => {
  it('DeepSeek 预设的视觉档位可通过图片上传的前置校验（单靠正则认不出 deepseek-flash）', () => {
    const { visionModel } = PROVIDER_PRESETS.deepseek;
    expect(isVisionModel(visionModel)).toBe(false); // 改前：正则判定为「不支持图片」
    expect(isVisionCapableModel('deepseek', visionModel)).toBe(true);
  });

  it('预设档位在「回退到 FC 模型」的路径上同样被采信', () => {
    expect(isVisionCapableModel('aliyun', 'qwen-vl-max')).toBe(true);
    expect(isVisionCapableModel('openai', 'gpt-4o')).toBe(true);
  });

  it('用户自填的非视觉档位仍被拒绝（既有语义不变）', () => {
    expect(isVisionCapableModel('aliyun', 'qwen-plus')).toBe(false);
  });

  it('档位为空时返回 false', () => {
    expect(isVisionCapableModel('custom', '')).toBe(false);
  });
});
