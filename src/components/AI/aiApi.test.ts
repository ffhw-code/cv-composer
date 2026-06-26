import { describe, it, expect } from 'vitest';
import { translateApiError } from './aiApi';

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
