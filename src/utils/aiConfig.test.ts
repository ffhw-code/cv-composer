import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_REQUEST_TIMEOUT_KEY,
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
  getAiRequestTimeoutMs,
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
