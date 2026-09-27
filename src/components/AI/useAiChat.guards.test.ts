// @vitest-environment jsdom
// P0.2 第 1~3 项的**集成**验证：守卫/计数/假成功防护是不是真的接进了 fetch 链路。
// 纯逻辑的单测在 `src/utils/aiGuards.test.ts`；这里只跑「模型回复 → 循环 → 请求体 / 埋点 / 画布」的端到端。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAiChat } from './useAiChat';
import { clearAiMetrics, getAiMetrics, type AiTurnEvent } from '../../utils/aiMetrics';
import { PROVIDER_PRESETS, saveApiConfig, type ApiConfig } from '../../utils/aiConfig';
import { useResumeStore } from '../../store/useResumeStore';
import { FAKE_SUCCESS_NOTICE } from '../../utils/aiGuards';

const ADD = { styleId: 'module-card', title: '专业技能', content: '<p>Java、Python</p>' };

function config(): ApiConfig {
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
  messages: { role: string; text: string }[];
}

function toolCall(id: string, name: string, args: unknown) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function replyToolCalls(calls: unknown[]) {
  return { choices: [{ message: { tool_calls: calls } }] };
}

function replyText(content: string) {
  return { choices: [{ message: { content } }] };
}

/** 按顺序消费一串预设响应；用光后再调用会抛错（防止用例悄悄多打一轮请求） */
function stubFetchQueue(responses: unknown[]) {
  const queue = [...responses];
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
    const body = queue.shift();
    if (!body) throw new Error('fetch 调用次数超出预设队列');
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type FetchMock = ReturnType<typeof stubFetchQueue>;

function sentBody(fetchMock: FetchMock, index: number): { messages: Record<string, unknown>[] } {
  const init = fetchMock.mock.calls[index][1];
  return JSON.parse(init?.body as string) as { messages: Record<string, unknown>[] };
}

function lastTurnEvent(): AiTurnEvent {
  const turns = getAiMetrics().filter((e): e is AiTurnEvent => e.kind === 'turn');
  expect(turns.length).toBeGreaterThan(0);
  return turns[turns.length - 1];
}

function lastAiText(): string {
  const aiMessages = hook.messages.filter(m => m.role === 'ai');
  return aiMessages[aiMessages.length - 1]?.text ?? '';
}

let hook: HookApi;
let root: Root | null = null;
let container: HTMLDivElement;

describe('useAiChat 链路守卫（集成）', () => {
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
    saveApiConfig(config());
    useResumeStore.getState().importModules([]);
    clearAiMetrics();
  });

  afterEach(() => {
    act(() => { root?.unmount(); });
    root = null;
    container.remove();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('同轮第二次同参数调用被拦下：handler 不执行、回传 priorResult、redundantCalls 计数', async () => {
    const fetchMock = stubFetchQueue([
      replyToolCalls([toolCall('call_1', 'add_module', ADD)]),
      replyToolCalls([toolCall('call_2', 'add_module', ADD)]),
      replyText('好的，已处理。'),
    ]);

    await act(async () => { await hook.handleSend('添加专业技能模块'); });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 第三次请求里带着两轮的工具结果：第 2 条必须是被守卫打回的 REDUNDANT_CALL（含上一次结果摘要）
    const toolMessages = sentBody(fetchMock, 2).messages.filter(m => m.role === 'tool');
    expect(toolMessages).toHaveLength(2);
    const rejected = JSON.parse(String(toolMessages[1].content)) as { error?: string; priorResult?: string };
    expect(rejected.error).toBe('REDUNDANT_CALL');
    expect(rejected.priorResult).toContain('"type":"module"');

    // handler 只真正执行过一次：画布上只多出一个模块（标题落在它的 heading 子控件上）
    const modules = useResumeStore.getState().modules;
    expect(modules).toHaveLength(1);
    expect(JSON.stringify(modules)).toContain('专业技能');

    const turn = lastTurnEvent();
    expect(turn.redundantCalls).toBe(1);
    expect(turn.toolErrors).toBe(1);
    expect(turn.outcome).toBe('partial');
  });

  it('打满 MAX_TOOL_ROUNDS 时 outcome 记 partial（改前会静默记 success）', async () => {
    const responses = Array.from({ length: 8 }, (_v, i) => replyToolCalls([
      toolCall(`call_${i}`, 'add_module', { styleId: 'module-card', title: `模块${i}`, content: '<p>x</p>' }),
    ]));
    const fetchMock = stubFetchQueue(responses);

    await act(async () => { await hook.handleSend('依次添加多个模块'); });

    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(lastAiText()).toContain('工具调用次数已达上限');
    const turn = lastTurnEvent();
    expect(turn.rounds).toBe(8);
    expect(turn.outcome).toBe('partial');
  });

  it('零工具调用却称「已完成」：先纠正一次，仍不改口则显式告知用户', async () => {
    const fetchMock = stubFetchQueue([
      replyText('已完成修改，字号已改成 15px。'),
      replyText('已完成修改。'),
    ]);

    await act(async () => { await hook.handleSend('把字号改成 15px'); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastAiText()).toContain(FAKE_SUCCESS_NOTICE);
    expect(lastTurnEvent().outcome).toBe('partial');
  });

  it('纠正之后模型真的调了工具：不追加「假成功」提示', async () => {
    const fetchMock = stubFetchQueue([
      replyText('已完成修改。'),
      replyToolCalls([toolCall('call_1', 'add_module', ADD)]),
      replyText('已按你的要求完成。'),
    ]);

    await act(async () => { await hook.handleSend('添加专业技能模块'); });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lastAiText()).not.toContain(FAKE_SUCCESS_NOTICE);
    const modules = useResumeStore.getState().modules;
    expect(modules).toHaveLength(1);
    expect(JSON.stringify(modules)).toContain('专业技能');
    expect(lastTurnEvent().outcome).toBe('partial'); // 出现过假成功信号：这一轮不算干净
  });

  it('</think> 泄漏被清洗且不浪费一次重试', async () => {
    const fetchMock = stubFetchQueue([replyText('让我先想想…</think>你的简历整体不错，可以再精简项目描述。')]);

    await act(async () => { await hook.handleSend('帮我看看简历'); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastAiText()).toBe('你的简历整体不错，可以再精简项目描述。');
    expect(lastTurnEvent().outcome).toBe('partial');
  });

  it('工具调用被写成 JSON 文本（首轮）：仍按「不支持 Function Calling」报错', async () => {
    stubFetchQueue([replyText('{"name": "add_module", "arguments": {"title":"x"}}')]);

    await act(async () => { await hook.handleSend('添加模块'); });

    expect(lastAiText()).toContain('不支持 Function Calling');
    expect(lastTurnEvent().outcome).toBe('failed');
  });

  it('正常一轮：text 回复无信号 → outcome 仍是 success', async () => {
    const fetchMock = stubFetchQueue([replyText('你的简历整体不错。')]);

    await act(async () => { await hook.handleSend('帮我看看简历'); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const turn = lastTurnEvent();
    expect(turn.outcome).toBe('success');
    expect(turn.redundantCalls).toBe(0);
  });
});
