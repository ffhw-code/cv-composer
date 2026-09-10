import type { ResumeModule } from '../types/resume';

// ========== 简历文档自动保存（localStorage） ==========
//
// 只持久化「文档内容」：模块树 + 页面设置；选中态、undo/redo 历史等
// 会话性字段不保存，避免恢复出旧光标位置等无意义状态。
//
// 读写都做了降级兜底：localStorage 不可用（Node/隐私模式/配额满）时
// 静默返回，不影响手动保存/导入 JSON 的主流程。

export const RESUME_AUTOSAVE_KEY = 'cv-composer:resume:autosave:v1';
export const RESUME_AUTOSAVE_DEBOUNCE_MS = 500;

const AUTOSAVE_VERSION = 1;

/** store 中参与自动保存的状态（与 ResumeStore 结构化兼容） */
export interface AutosaveState {
  modules: ResumeModule[];
  pagePadding: string;
  pageGap: string;
  pagePaddingTop: string;
}

/** 写入 localStorage 的完整快照 */
export interface ResumeAutosaveSnapshot extends AutosaveState {
  version: number;
  savedAt: number;
}

/** 恢复结果；可选字段缺失时由 store 回退到默认值 */
export interface RestoredResumeState {
  modules: ResumeModule[];
  pagePadding?: string;
  pageGap?: string;
  pagePaddingTop?: string;
}

function getStorage(): Storage | null {
  try {
    // Node 测试环境下没有 localStorage；浏览器隐私模式访问可能抛异常
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSavedResume(): RestoredResumeState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(RESUME_AUTOSAVE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const snapshot = data as Partial<ResumeAutosaveSnapshot>;
    if (snapshot.version !== AUTOSAVE_VERSION || !Array.isArray(snapshot.modules)) return null;
    return {
      modules: snapshot.modules,
      ...(typeof snapshot.pagePadding === 'string' ? { pagePadding: snapshot.pagePadding } : {}),
      ...(typeof snapshot.pageGap === 'string' ? { pageGap: snapshot.pageGap } : {}),
      ...(typeof snapshot.pagePaddingTop === 'string'
        ? { pagePaddingTop: snapshot.pagePaddingTop }
        : {}),
    };
  } catch {
    return null;
  }
}

export function saveResumeSnapshot(state: AutosaveState): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const snapshot: ResumeAutosaveSnapshot = {
      version: AUTOSAVE_VERSION,
      savedAt: Date.now(),
      modules: state.modules,
      pagePadding: state.pagePadding,
      pageGap: state.pageGap,
      pagePaddingTop: state.pagePaddingTop,
    };
    storage.setItem(RESUME_AUTOSAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

/** subscribeResumeAutosave 所需的 store 形状（与 zustand store 结构化兼容） */
export interface AutosaveStore {
  getState(): AutosaveState;
  subscribe(listener: (state: AutosaveState, prev: AutosaveState) => void): () => void;
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function persistLatest(store: AutosaveStore): void {
  const state = store.getState();
  saveResumeSnapshot({
    modules: state.modules,
    pagePadding: state.pagePadding,
    pageGap: state.pageGap,
    pagePaddingTop: state.pagePaddingTop,
  });
}

/**
 * 订阅文档内容变化，防抖写盘；卸载/页面隐藏时立即落盘一次，
 * 避免防抖窗口内关闭页面丢掉最后一次编辑。
 */
export function subscribeResumeAutosave(store: AutosaveStore): () => void {
  const schedule = () => {
    if (pendingTimer !== null) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      persistLatest(store);
    }, RESUME_AUTOSAVE_DEBOUNCE_MS);
  };

  const flush = () => {
    if (pendingTimer === null) return;
    clearTimeout(pendingTimer);
    pendingTimer = null;
    persistLatest(store);
  };

  const onChange = (state: AutosaveState, prev: AutosaveState) => {
    const docChanged =
      state.modules !== prev.modules ||
      state.pagePadding !== prev.pagePadding ||
      state.pageGap !== prev.pageGap ||
      state.pagePaddingTop !== prev.pagePaddingTop;
    if (docChanged) schedule();
  };

  const unsubscribe = store.subscribe(onChange);
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
  }
  return () => {
    unsubscribe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', flush);
    }
    flush();
  };
}
