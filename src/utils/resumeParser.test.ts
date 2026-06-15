/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseResumeFile } from './resumeParser';
import { isVisionModel } from './aiConfig';
import { saveApiConfig } from './aiConfig';

// ============================================================
// 基线测试：resumeParser.ts
// 验证新 prompt 输出的解析路径 + JSON 修正重试
// ============================================================

const MOCK_API_KEY = 'sk-test';

// 模拟成功的 AI 响应
function mockFetchResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

function buildMockResumeResponse(layoutTree: unknown, data: unknown) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({ layoutTree, data }),
      },
    }],
  };
}

const validLayoutTree = {
  header: {
    type: 'flex',
    direction: 'row',
    gap: '20px',
    style: { backgroundColor: '#f8fafc' },
    children: [
      { type: 'image', ref: 'photo', style: { width: '100px' } },
      {
        type: 'flex',
        direction: 'column',
        children: [
          { type: 'text', ref: 'name', style: { fontSize: '24px' } },
          { type: 'grid', columns: 2, children: [
            { type: 'text', ref: 'jobTitle' },
            { type: 'text', ref: 'email' },
          ]},
        ],
      },
    ],
  },
  modules: [
    {
      type: 'flex',
      direction: 'column',
      children: [
        { type: 'heading', ref: 'modules.0.title', style: { fontSize: '20px' } },
        { type: 'text', ref: 'modules.0.content', style: { fontSize: '15px' } },
      ],
    },
  ],
};

const validData = {
  name: '张三',
  jobTitle: '工程师',
  email: 'z@e.com',
  photo: '',
  modules: [
    { title: '教育背景', content: '<p>清华大学</p>' },
  ],
};

// Mock sessionStorage (not available in node test env)
const sessionStore = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => sessionStore.get(key) ?? null,
  setItem: (key: string, value: string) => { sessionStore.set(key, value); },
  removeItem: (key: string) => { sessionStore.delete(key); },
});

beforeEach(() => {
  sessionStore.clear();
  saveApiConfig({
    provider: 'aliyun',
    apiKey: MOCK_API_KEY,
    model: 'qwen-max',
    baseUrl: 'https://test.api/v1',
    visionModel: 'qwen-vl-max',
  });
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseResumeFile', () => {
  it('解析图片返回 ParsedResume（含 layoutTree 和 data）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse(buildMockResumeResponse(validLayoutTree, validData)),
    );

    // 创建模拟图片文件
    const blob = new Blob(['fake-image-data'], { type: 'image/png' });
    const file = new File([blob], 'resume.png', { type: 'image/png' });

    const result = await parseResumeFile(file);

    expect(result.layoutTree).toBeDefined();
    expect(result.layoutTree!.header).toBeDefined();
    expect(result.layoutTree!.header.type).toBe('flex');
    expect(result.layoutTree!.modules).toHaveLength(1);

    expect(result.data).toBeDefined();
    expect(result.data!.name).toBe('张三');
    expect(result.data!.modules).toHaveLength(1);
    expect(result.data!.modules![0].title).toBe('教育背景');
  });

  it('AI 输出被 markdown code fence 包裹时仍能正确提取', async () => {
    const wrappedResponse = {
      choices: [{
        message: {
          content: '```json\n' + JSON.stringify({ layoutTree: validLayoutTree, data: validData }) + '\n```',
        },
      }],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse(wrappedResponse),
    );

    const blob = new Blob(['fake'], { type: 'image/png' });
    const file = new File([blob], 'r.png', { type: 'image/png' });

    const result = await parseResumeFile(file);
    expect(result.data!.name).toBe('张三');
  });

  it('JSON 解析失败时发起一次修正重试并成功', async () => {
    const badJson = '{ "layoutTree": { "header": { "type": "flex", } } }'; // 尾部逗号 — 部分可修复
    const fixedJson = JSON.stringify({ layoutTree: validLayoutTree, data: validData });

    vi.spyOn(globalThis, 'fetch')
      // 第一次调用：返回损坏的 JSON（完全无法解析的）
      .mockResolvedValueOnce(mockFetchResponse({
        choices: [{ message: { content: '{ broken json ///' } }],
      }))
      // 第二次调用（修正重试）：返回正确 JSON
      .mockResolvedValueOnce(mockFetchResponse({
        choices: [{ message: { content: fixedJson } }],
      }));

    const blob = new Blob(['fake'], { type: 'image/png' });
    const file = new File([blob], 'r.png', { type: 'image/png' });

    const result = await parseResumeFile(file);
    expect(result.data!.name).toBe('张三');
  });

  it('JSON 解析失败且修正重试也失败时抛出异常', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse({
        choices: [{ message: { content: '{ totally broken' } }],
      }))
      .mockResolvedValueOnce(mockFetchResponse({
        choices: [{ message: { content: 'still broken ///' } }],
      }));

    const blob = new Blob(['fake'], { type: 'image/png' });
    const file = new File([blob], 'r.png', { type: 'image/png' });

    await expect(parseResumeFile(file)).rejects.toThrow('JSON 解析失败');
  });

  it('API 返回非 200 时抛出异常', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ error: 'unauthorized' }, 401),
    );

    const blob = new Blob(['fake'], { type: 'image/png' });
    const file = new File([blob], 'r.png', { type: 'image/png' });

    await expect(parseResumeFile(file)).rejects.toThrow('API 请求失败');
  });

  it('视觉模型不支持图片解析时抛出提示', async () => {
    saveApiConfig({
      provider: 'aliyun',
      apiKey: MOCK_API_KEY,
      model: 'qwen-max',
      baseUrl: 'https://test.api/v1',
      visionModel: 'qwen-plus', // 非视觉模型作为 visionModel
    });

    const blob = new Blob(['fake'], { type: 'image/png' });
    const file = new File([blob], 'r.png', { type: 'image/png' });

    await expect(parseResumeFile(file)).rejects.toThrow('不支持图片解析');
  });

  it('PDF 文件抛出明确错误', async () => {
    const blob = new Blob(['fake'], { type: 'application/pdf' });
    const file = new File([blob], 'r.pdf', { type: 'application/pdf' });

    await expect(parseResumeFile(file)).rejects.toThrow('PDF/Word 文件暂不支持');
  });
});

describe('isVisionModel', () => {
  it('qwen-vl-max 是视觉模型', () => {
    expect(isVisionModel('qwen-vl-max')).toBe(true);
  });

  it('gpt-4o 是视觉模型', () => {
    expect(isVisionModel('gpt-4o')).toBe(true); // matches 'vision' in the regex? No. Let me check.
  });

  it('qwen-plus 不是视觉模型', () => {
    expect(isVisionModel('qwen-plus')).toBe(false);
  });
});
