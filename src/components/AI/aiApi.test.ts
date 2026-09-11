import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callSmartFill, describeFetchError, describeHttpError, translateApiError } from './aiApi';
import { clearAiMetrics, getAiMetrics, type AiRoundEvent } from '../../utils/aiMetrics';
import { DEFAULT_AI_REQUEST_TIMEOUT_MS } from '../../utils/aiConfig';

describe('translateApiError', () => {
  const model = 'qwen-max';

  it('returns model-not-found message for 400 with model error', () => {
    const body = JSON.stringify({ error: { message: 'model not found', code: 'invalid_model' } });
    const result = translateApiError(400, body, model);
    expect(result).toContain('不存在或不可用');
    expect(result).toContain('qwen-max');
  });

  it('returns model-not-found message for 400 with "does not exist"', () => {
    const body = JSON.stringify({ error: { message: 'Model does not exist' } });
    const result = translateApiError(400, body, model);
    expect(result).toContain('不存在或不可用');
  });

  it('returns invalid params message for 400 with "invalid"', () => {
    const body = JSON.stringify({ error: { message: 'invalid request parameter' } });
    const result = translateApiError(400, body, 'some-model');
    expect(result).toContain('请求参数有误');
  });

  it('returns generic 400 message without detail', () => {
    const result = translateApiError(400, '{}', model);
    expect(result).toContain('请求格式错误');
  });

  it('returns auth error for 401', () => {
    const result = translateApiError(401, '{}', model);
    expect(result).toContain('API Key 无效');
  });

  it('returns permission error for 403', () => {
    const result = translateApiError(403, '{}', model);
    expect(result).toContain('没有访问权限');
  });

  it('returns not-found error for 404', () => {
    const result = translateApiError(404, '{}', model);
    expect(result).toContain('接口地址不存在');
  });

  it('returns rate-limit error for 429', () => {
    const result = translateApiError(429, '{}', model);
    expect(result).toContain('过于频繁');
  });

  it('returns service unavailable for 500', () => {
    const result = translateApiError(500, '{}', model);
    expect(result).toContain('暂时不可用');
  });

  it('returns service unavailable for 502', () => {
    const result = translateApiError(502, '{}', model);
    expect(result).toContain('暂时不可用');
  });

  it('returns service unavailable for 503', () => {
    const result = translateApiError(503, '{}', model);
    expect(result).toContain('暂时不可用');
  });

  it('returns generic error for unknown status', () => {
    const result = translateApiError(418, '{}', model);
    expect(result).toContain('返回错误 (418)');
  });

  it('includes error detail from response body', () => {
    const body = JSON.stringify({ error: { message: 'Rate limit exceeded: 100 RPM' } });
    const result = translateApiError(429, body, model);
    expect(result).toContain("过于频繁");
  });

  it('handles non-JSON response body gracefully', () => {
    const result = translateApiError(500, 'Internal Server Error', model);
    expect(result).toContain('暂时不可用');
  });
});

describe('AI 请求埋点', () => {
  function createStorage(): Storage {
    const store = new Map<string, string>();
    return {
      get length() { return store.size; },
      clear: () => { store.clear(); },
      getItem: (k: string) => store.get(k) ?? null,
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      removeItem: (k: string) => { store.delete(k); },
      setItem: (k: string, v: string) => { store.set(k, v); },
    } as Storage;
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function roundEvents(): AiRoundEvent[] {
    return getAiMetrics().filter((e): e is AiRoundEvent => e.kind === 'round');
  }

  beforeEach(() => {
    const storage = createStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true, writable: true });
    sessionStorage.setItem('resume_ai_config', JSON.stringify({
      provider: 'dashscope',
      apiKey: 'sk-test',
      baseUrl: '',
      model: 'qwen-plus',
      visionModel: 'qwen-vl-max',
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearAiMetrics();
    Reflect.deleteProperty(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  it('成功请求记录渠道、模型、注入体积与 token 用量', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      choices: [{ message: { content: '优化后的文本' } }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    })));

    await expect(callSmartFill('系统提示', '用户输入')).resolves.toBe('优化后的文本');

    const rounds = roundEvents();
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({
      channel: 'smart-fill',
      ok: true,
      model: 'qwen-plus',
      provider: 'dashscope',
      retryIndex: 0,
    });
    expect(rounds[0].promptChars).toBeGreaterThan(0);
    expect(rounds[0].promptTokensEst).toBeGreaterThan(0);
    expect(rounds[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(rounds[0].usage).toEqual({ promptTokens: 120, completionTokens: 30, totalTokens: 150 });
  });

  it('HTTP 错误记录状态码，并保留调用方原有的错误文案', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"boom"}}', { status: 403 })));

    await expect(callSmartFill('系统提示', '用户输入')).rejects.toThrow('smart-fill API 请求失败: 403');

    expect(roundEvents()[0]).toMatchObject({ ok: false, httpStatus: 403, errorKind: 'http', channel: 'smart-fill' });
  });

  it('网络异常记录 network，并给出可读提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    await expect(callSmartFill('系统提示', '用户输入')).rejects.toThrow('无法连接到 AI 服务');

    expect(roundEvents()[0]).toMatchObject({ ok: false, errorKind: 'network' });
  });

  it('网络异常记录 cause 里的错误码，便于判断是限流还是本机网络', async () => {
    const cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const err = Object.assign(new TypeError('fetch failed'), { cause });
    vi.stubGlobal('fetch', vi.fn(async () => { throw err; }));

    await expect(callSmartFill('系统提示', '用户输入')).rejects.toThrow('无法连接到 AI 服务');

    expect(roundEvents()[0]).toMatchObject({
      ok: false,
      errorKind: 'network',
      errorCode: 'ECONNRESET',
      errorDetail: 'socket hang up',
    });
  });

  it('HTTP 错误记录服务商错误码与说明（如额度用尽）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'Free quota exhausted', code: 'AllocationQuota.FreeTierOnly' } }),
      { status: 403 },
    )));

    await expect(callSmartFill('系统提示', '用户输入')).rejects.toThrow();

    expect(roundEvents()[0]).toMatchObject({
      ok: false,
      httpStatus: 403,
      errorKind: 'http',
      errorCode: 'AllocationQuota.FreeTierOnly',
    });
    expect(roundEvents()[0].errorDetail).toContain('Free quota exhausted');
  });

  it('未显式传超时时按默认值中止请求，并记录 TIMEOUT', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    })));

    const promise = callSmartFill('系统提示', '用户输入');
    const assertion = expect(promise).rejects.toThrow('请求超时');
    await vi.advanceTimersByTimeAsync(DEFAULT_AI_REQUEST_TIMEOUT_MS);
    await assertion;

    expect(roundEvents()[0]).toMatchObject({ ok: false, errorKind: 'timeout', errorCode: 'TIMEOUT' });
  });

  it('localStorage 覆盖超时后按覆盖值中止', async () => {
    localStorage.setItem('resume_ai_request_timeout_ms', '9000');
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    })));

    const promise = callSmartFill('系统提示', '用户输入');
    const assertion = expect(promise).rejects.toThrow('请求超时');
    await vi.advanceTimersByTimeAsync(9000);
    await assertion;

    expect(roundEvents()[0]).toMatchObject({ errorKind: 'timeout' });
  });

  it('响应体不是 JSON 时记录失败', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 200 })));

    await expect(callSmartFill('系统提示', '用户输入')).rejects.toThrow();

    expect(roundEvents()[0]).toMatchObject({ ok: false, errorKind: 'http', channel: 'smart-fill' });
  });

  it('没有 usage 字段时不写入 token 数据', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      choices: [{ message: { content: 'hi' } }],
    })));

    await callSmartFill('系统提示', '用户输入');

    expect(roundEvents()[0].usage).toBeUndefined();
  });
});

describe('失败原因归纳', () => {
  it('describeFetchError 沿 cause 链取错误码', () => {
    const cause = Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' });
    const err = Object.assign(new TypeError('fetch failed'), { cause });
    expect(describeFetchError(err)).toEqual({
      errorCode: 'EAI_AGAIN',
      errorDetail: 'getaddrinfo EAI_AGAIN',
    });
  });

  it('describeFetchError 对没有 cause 的普通错误只给 message', () => {
    expect(describeFetchError(new Error('boom'))).toEqual({ errorDetail: 'boom' });
  });

  it('describeHttpError 优先取 error.code，没有 code 时退回 error.type 或状态码', () => {
    expect(describeHttpError(400, JSON.stringify({ error: { code: 'invalid_parameter', message: 'bad' } }))).toMatchObject({
      errorCode: 'invalid_parameter',
      errorDetail: 'bad',
    });
    expect(describeHttpError(400, JSON.stringify({ error: { type: 'ModelNotFound', message: 'no such model' } }))).toMatchObject({
      errorCode: 'ModelNotFound',
    });
    expect(describeHttpError(502, '<html>bad gateway</html>')).toMatchObject({
      errorCode: 'HTTP_502',
      errorDetail: '<html>bad gateway</html>',
    });
  });

  it('describeHttpError 截断超长说明', () => {
    const info = describeHttpError(500, JSON.stringify({ error: { message: 'x'.repeat(500) } }));
    expect(info.errorDetail!.length).toBeLessThanOrEqual(201);
  });
});
