// @vitest-environment jsdom
// 只验证一件事：请求体里「发不发 tool_choice / thinking」。
// 分两层 —— 纯函数用例锁住形状（含与改前逐字节一致的回归），集成用例锁住 useAiChat 真的把该函数
// 接进了 fetch（防止「函数写对了但请求没接上」这种静默失效）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { buildChatRequestBody, isUploadTurn, useAiChat, type ChatRequestBodyOptions } from './useAiChat';
import { PROVIDER_PRESETS, getProviderQuirks, saveApiConfig, type ApiConfig } from '../../utils/aiConfig';
import { buildSystemPrompt } from '../../engine/aiPrompt';

const MESSAGES = [{ role: 'system', content: 'sys' }, { role: 'user', content: '帮我删除工作经历模块' }];
const TOOLS = [{ type: 'function', function: { name: 'add_text' } }];

/** 改造前 useAiChat 里写死的请求体，用作「阿里云 / OpenAI 逐字节不变」的对照 */
function legacyRequestBody(model: string, isUpload: boolean): Record<string, unknown> {
  return { model, messages: MESSAGES, tools: TOOLS, tool_choice: isUpload ? 'required' : 'auto', temperature: 0.1 };
}

function build(provider: string, isUpload: boolean, model = 'm'): Record<string, unknown> {
  const options: ChatRequestBodyOptions = {
    model,
    messages: MESSAGES,
    tools: TOOLS,
    isUpload,
    quirks: getProviderQuirks(provider),
  };
  return buildChatRequestBody(options);
}

describe('buildChatRequestBody：形状', () => {
  it('阿里云百炼：非上传发 auto、上传发 required，且整串与改前逐字节一致', () => {
    expect(JSON.stringify(build('aliyun', false))).toBe(JSON.stringify(legacyRequestBody('m', false)));
    expect(JSON.stringify(build('aliyun', true))).toBe(JSON.stringify(legacyRequestBody('m', true)));
  });

  it('OpenAI：与改前逐字节一致', () => {
    expect(JSON.stringify(build('openai', false))).toBe(JSON.stringify(legacyRequestBody('m', false)));
    expect(JSON.stringify(build('openai', true))).toBe(JSON.stringify(legacyRequestBody('m', true)));
  });

  it('自定义 / 未知服务商：与改前逐字节一致', () => {
    expect(JSON.stringify(build('custom', false))).toBe(JSON.stringify(legacyRequestBody('m', false)));
    expect(JSON.stringify(build('unknown-provider', true))).toBe(JSON.stringify(legacyRequestBody('m', true)));
  });

  it('DeepSeek：非上传轮次整个 tool_choice 字段不发，也不发 thinking', () => {
    const body = build('deepseek', false);
    expect('tool_choice' in body).toBe(false);
    expect('thinking' in body).toBe(false);
    expect(body).toEqual({ model: 'm', messages: MESSAGES, tools: TOOLS, temperature: 0.1 });
  });

  it('DeepSeek：上传轮次发 required，并同时显式关闭思考', () => {
    const body = build('deepseek', true);
    expect(body.tool_choice).toBe('required');
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('字段顺序保序：DeepSeek 非上传少了 tool_choice，其余顺序不变', () => {
    expect(Object.keys(build('aliyun', false))).toEqual(['model', 'messages', 'tools', 'tool_choice', 'temperature']);
    expect(Object.keys(build('deepseek', false))).toEqual(['model', 'messages', 'tools', 'temperature']);
    expect(Object.keys(build('deepseek', true))).toEqual(['model', 'messages', 'tools', 'tool_choice', 'thinking', 'temperature']);
  });
});

// ==================== 上传轮次判定（isUpload 恒真的修正） ====================

describe('isUploadTurn：判定只认用户消息', () => {
  it('system 消息含 "[上传文件]" 字面量时，普通用户指令仍判为非上传', () => {
    // 改前判定是 `msgs.some(m => m.content?.includes('[上传文件]'))`（不区分角色），
    // 而 system prompt 正文自带该字面量 ⇒ isUpload 恒为真。本用例在改前失败、改后通过。
    const systemMsg = { role: 'system', content: buildSystemPrompt() };
    const userMsg = { role: 'user', content: '帮我删除工作经历模块' };

    expect(systemMsg.content).toContain('[上传文件]'); // 前提：字面量确实在 system 正文里
    expect(isUploadTurn([systemMsg, userMsg])).toBe(false);
  });

  it('用户消息带 [上传文件] 标记时判为上传轮次', () => {
    const systemMsg = { role: 'system', content: buildSystemPrompt() };
    const uploadMsg = { role: 'user', content: '[上传文件] 文件名: a.txt, 类型: text/plain, 请导入此简历' };

    expect(isUploadTurn([systemMsg, uploadMsg])).toBe(true);
  });

  it('内容为数组（图片消息）或缺失内容的用户消息不会误判，也不会抛错', () => {
    expect(isUploadTurn([{ role: 'user', content: [{ type: 'text', text: '[上传文件]' }] }])).toBe(false);
    expect(isUploadTurn([{ role: 'user' }])).toBe(false);
    expect(isUploadTurn([])).toBe(false);
  });
});

// ==================== 集成：请求体真的接进了 fetch ====================
function deepseekConfig(): ApiConfig {
  const preset = PROVIDER_PRESETS.deepseek;
  return {
    provider: 'deepseek',
    apiKey: 'test-key',
    baseUrl: preset.baseUrl,
    model: preset.model,
    visionModel: preset.visionModel,
  };
}

interface HookApi {
  handleSend: (overrideMessage?: string) => Promise<void>;
}

let hook: HookApi;
let root: Root | null = null;
let container: HTMLDivElement;

function stubFetchOk() {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  fetchMock.mockImplementation(() => Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '好的' } }] }),
  } as unknown as Response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type FetchMock = ReturnType<typeof stubFetchOk>;

function sentRequestBody(fetchMock: FetchMock): Record<string, unknown> {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0][1];
  expect(init?.body).toBeTruthy();
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

function sentUrl(fetchMock: FetchMock): string {
  return fetchMock.mock.calls[0][0];
}

describe('useAiChat 请求体（集成）', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    function Probe() {
      hook = useAiChat() as unknown as HookApi;
      return null;
    }
    act(() => { root?.render(createElement(Probe)); });
  });

  afterEach(() => {
    act(() => { root?.unmount(); });
    root = null;
    container.remove();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('DeepSeek 非上传轮次（老板报错的那条指令）：请求体不含 tool_choice，URL 不带 /v1', async () => {
    saveApiConfig(deepseekConfig());
    const fetchMock = stubFetchOk();

    await act(async () => { await hook.handleSend('帮我删除工作经历模块'); });

    const body = sentRequestBody(fetchMock);
    expect('tool_choice' in body).toBe(false);
    expect('thinking' in body).toBe(false);
    expect(body).toMatchObject({ model: 'deepseek-flash', temperature: 0.1 });
    expect(sentUrl(fetchMock)).toBe('https://api.deepseek.com/chat/completions');
  });

  it('DeepSeek 上传轮次：请求体含 required 与 thinking:{type:"disabled"}', async () => {
    saveApiConfig(deepseekConfig());
    const fetchMock = stubFetchOk();

    await act(async () => { await hook.handleSend('[上传文件] 文件名: a.txt, 类型: text/plain, 请导入此简历'); });

    const body = sentRequestBody(fetchMock);
    expect(body.tool_choice).toBe('required');
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('阿里云非上传轮次：由恒真的 required 回到 auto，且未新增 thinking 字段', async () => {
    const preset = PROVIDER_PRESETS.aliyun;
    saveApiConfig({
      provider: 'aliyun',
      apiKey: 'test-key',
      baseUrl: preset.baseUrl,
      model: preset.model,
      visionModel: preset.visionModel,
    });
    const fetchMock = stubFetchOk();

    await act(async () => { await hook.handleSend('帮我删除工作经历模块'); });

    const body = sentRequestBody(fetchMock);
    expect(body.tool_choice).toBe('auto');
    expect('thinking' in body).toBe(false);
    expect(JSON.stringify(body)).toBe(JSON.stringify({
      model: 'qwen-max',
      messages: (body as { messages: unknown }).messages,
      tools: (body as { tools: unknown }).tools,
      tool_choice: 'auto',
      temperature: 0.1,
    }));
  });

  it('阿里云上传轮次：仍发 required（未受 isUpload 修正影响）', async () => {
    const preset = PROVIDER_PRESETS.aliyun;
    saveApiConfig({
      provider: 'aliyun',
      apiKey: 'test-key',
      baseUrl: preset.baseUrl,
      model: preset.model,
      visionModel: preset.visionModel,
    });
    const fetchMock = stubFetchOk();

    await act(async () => { await hook.handleSend('[上传文件] 文件名: a.txt, 类型: text/plain, 请导入此简历'); });

    const body = sentRequestBody(fetchMock);
    expect(body.tool_choice).toBe('required');
    expect('thinking' in body).toBe(false);
  });
});
