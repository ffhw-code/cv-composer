import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResumeModule } from '../store/useResumeStore';
import {
  RESUME_AUTOSAVE_DEBOUNCE_MS,
  RESUME_AUTOSAVE_KEY,
  loadSavedResume,
  saveResumeSnapshot,
  subscribeResumeAutosave,
  type AutosaveState,
} from './resumePersistence';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

interface FakeResumeState extends AutosaveState {
  selectedId: string | null;
}

function createFakeStore() {
  let state: FakeResumeState = {
    modules: [],
    selectedId: null,
    pagePadding: '40px',
    pageGap: '16px',
    pagePaddingTop: '40px',
  };
  const listeners = new Set<(state: AutosaveState, prev: AutosaveState) => void>();
  return {
    getState: () => state,
    emit: (patch: Partial<FakeResumeState>) => {
      const prev = state;
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener(state, prev));
    },
    subscribe: (listener: (state: AutosaveState, prev: AutosaveState) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function sampleModules(): ResumeModule[] {
  return [{ id: 'm1', type: 'header', name: '张三', children: [] }];
}

function savedPayload(storage: Storage) {
  const raw = storage.getItem(RESUME_AUTOSAVE_KEY);
  return raw ? JSON.parse(raw) : null;
}

let memory: MemoryStorage;

beforeEach(() => {
  memory = new MemoryStorage();
  vi.stubGlobal('localStorage', memory);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('saveResumeSnapshot / loadSavedResume', () => {
  it('快照包含 version、savedAt 与文档字段，并能完整恢复', () => {
    const modules = sampleModules();
    const saved = saveResumeSnapshot({
      modules,
      pagePadding: '24px',
      pageGap: '8px',
      pagePaddingTop: '30px',
    });

    expect(saved).toBe(true);
    const payload = savedPayload(memory);
    expect(payload.version).toBe(1);
    expect(typeof payload.savedAt).toBe('number');
    expect(payload.modules).toEqual(modules);

    const restored = loadSavedResume();
    expect(restored).toEqual({
      modules,
      pagePadding: '24px',
      pageGap: '8px',
      pagePaddingTop: '30px',
    });
  });

  it('无存储或未保存过时返回 null，且不抛异常', () => {
    expect(loadSavedResume()).toBeNull();

    vi.stubGlobal('localStorage', undefined);
    expect(loadSavedResume()).toBeNull();
    expect(
      saveResumeSnapshot({
        modules: sampleModules(),
        pagePadding: '40px',
        pageGap: '16px',
        pagePaddingTop: '40px',
      })
    ).toBe(false);
  });

  it('非法 JSON、版本不符或结构错误时返回 null', () => {
    memory.setItem(RESUME_AUTOSAVE_KEY, 'not json');
    expect(loadSavedResume()).toBeNull();

    memory.setItem(RESUME_AUTOSAVE_KEY, JSON.stringify({ version: 999, modules: [] }));
    expect(loadSavedResume()).toBeNull();

    memory.setItem(RESUME_AUTOSAVE_KEY, JSON.stringify({ version: 1, modules: 'oops' }));
    expect(loadSavedResume()).toBeNull();
  });

  it('字段缺失时恢复可省略页面设置，由调用方回退默认值', () => {
    memory.setItem(RESUME_AUTOSAVE_KEY, JSON.stringify({ version: 1, modules: sampleModules() }));
    expect(loadSavedResume()).toEqual({ modules: sampleModules() });
  });

  it('localStorage 抛异常时读写都静默降级', () => {
    vi.stubGlobal(
      'localStorage',
      {
        getItem() {
          throw new Error('SecurityError');
        },
        setItem() {
          throw new Error('QuotaExceededError');
        },
      } as unknown as Storage
    );

    expect(loadSavedResume()).toBeNull();
    expect(
      saveResumeSnapshot({
        modules: sampleModules(),
        pagePadding: '40px',
        pageGap: '16px',
        pagePaddingTop: '40px',
      })
    ).toBe(false);
  });
});

describe('subscribeResumeAutosave', () => {
  it('选中态等会话字段变化不触发保存', () => {
    const store = createFakeStore();
    const stop = subscribeResumeAutosave(store);

    store.emit({ selectedId: 'm1' });
    vi.advanceTimersByTime(RESUME_AUTOSAVE_DEBOUNCE_MS + 100);

    expect(memory.getItem(RESUME_AUTOSAVE_KEY)).toBeNull();
    stop();
  });

  it('内容变化后防抖写入一次完整快照', () => {
    const store = createFakeStore();
    const stop = subscribeResumeAutosave(store);
    const modules = sampleModules();

    store.emit({ modules, pagePadding: '24px' });
    vi.advanceTimersByTime(RESUME_AUTOSAVE_DEBOUNCE_MS - 1);
    expect(memory.getItem(RESUME_AUTOSAVE_KEY)).toBeNull();

    vi.advanceTimersByTime(1);
    const payload = savedPayload(memory);
    expect(payload.modules).toEqual(modules);
    expect(payload.pagePadding).toBe('24px');
    stop();
  });

  it('防抖窗口内的连续修改只落盘一次', () => {
    const store = createFakeStore();
    const stop = subscribeResumeAutosave(store);
    const setItemSpy = vi.spyOn(memory, 'setItem');

    store.emit({ modules: sampleModules() });
    store.emit({ modules: [{ id: 'm2', type: 'text', content: '你好', children: [] }] });
    vi.advanceTimersByTime(RESUME_AUTOSAVE_DEBOUNCE_MS + 1);

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const payload = savedPayload(memory);
    expect(payload.modules[0].id).toBe('m2');
    stop();
  });

  it('取消订阅时立即落盘，防抖窗口内不丢最后一次编辑', () => {
    const store = createFakeStore();
    const stop = subscribeResumeAutosave(store);
    const modules = sampleModules();

    store.emit({ modules });
    stop();

    const payload = savedPayload(memory);
    expect(payload.modules).toEqual(modules);
  });

  it('解除订阅后内容变化不再写入', () => {
    const store = createFakeStore();
    const stop = subscribeResumeAutosave(store);
    stop();

    store.emit({ modules: sampleModules() });
    vi.advanceTimersByTime(RESUME_AUTOSAVE_DEBOUNCE_MS + 100);
    expect(memory.getItem(RESUME_AUTOSAVE_KEY)).toBeNull();
  });
});
