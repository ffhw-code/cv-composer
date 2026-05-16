// src/engine/commandExecutor.ts
import type { ResumeModule } from '../store/useResumeStore';
import { getStylesByType } from '../store/styleRegistry';

// ==================== 指令定义 ====================
export type CommandAction =
  | 'addModule'
  | 'updateModule'
  | 'removeModule'
  | 'moveModule'
  | 'setStyle'
  | 'setContent'
  | 'setProperty'
  | 'addCustomModule'
  | 'selectModule'
  | 'applyTemplate';

export interface Command {
  action: CommandAction;
  tempId?: string;
  params: any;
}

export interface AddModuleParams {
  parentId?: string | null;
  type: string;
  styleId?: string;
  style?: Record<string, string>;
  content?: string;
  name?: string;
  jobTitle?: string;
  birth?: string;
  phone?: string;
  email?: string;
  title?: string;
  children?: Command[];
}

export interface UpdateModuleParams {
  id: string;
  data: Partial<ResumeModule>;
}

export interface RemoveModuleParams {
  id: string;
}

export interface MoveModuleParams {
  id: string;
  newParentId: string | null;
  index: number;
}

export interface SetStyleParams {
  id: string;
  style: Record<string, string>;
}

export interface SetContentParams {
  id: string;
  content: string;
}

export interface SetPropertyParams {
  id: string;
  property: string;
  value: string;
}

export interface SelectModuleParams {
  id: string;
}

export interface ApplyTemplateParams {
  id: string;
  styleId: string;
}

// ==================== 引擎内部工具 ====================
type IdMap = Map<string, string>;

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function resolveId(id: string, idMap: IdMap): string {
  return idMap.get(id) || id;
}

function deepCloneModules(modules: ResumeModule[]): ResumeModule[] {
  return structuredClone(modules);
}

function updateModuleInTree(
  nodes: ResumeModule[],
  targetId: string,
  updater: (mod: ResumeModule) => ResumeModule
): ResumeModule[] {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return updater(node);
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: updateModuleInTree(node.children, targetId, updater) };
    }
    return node;
  });
}

/** 合法的模块类型列表 */
const VALID_TYPES = ['header', 'module', 'text', 'heading', 'list', 'image', 'flex', 'grid'];

/** 类型映射（用于容错，但仅在 addModule 中尝试纠正明显的拼写错误） */
function correctType(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  if (VALID_TYPES.includes(lower)) return lower;
  // 常见别名映射
  const alias: Record<string, string> = {
    'paragraph': 'text',
    'photo': 'image',
    '简历头': 'header',
    '模块': 'module',
    '文本框': 'text',
    '标题': 'heading',
    '列表': 'list',
    '图片': 'image',
    '弹性容器': 'flex',
    '网格容器': 'grid',
  };
  if (alias[lower]) return alias[lower];
  // 模糊匹配：如果以某个有效类型开头或包含
  for (const vt of VALID_TYPES) {
    if (lower.startsWith(vt) || vt.startsWith(lower)) return vt;
  }
  return null; // 无法修正
}

/**
 * 模糊匹配样式 ID
 * 返回匹配到的样式 ID，或 null（未找到）
 */
function matchStyleId(type: string, requested: string): string | null {
  const styles = getStylesByType(type as any);
  if (!styles.length) return null;
  const exact = styles.find(s => s.style === requested);
  if (exact) return exact.style;
  // 忽略大小写
  const lowerRequested = requested.toLowerCase();
  const caseInsensitive = styles.find(s => s.style.toLowerCase() === lowerRequested);
  if (caseInsensitive) return caseInsensitive.style;
  // 忽略连字符和大小写
  const normalizedRequested = lowerRequested.replace(/-/g, '');
  const normalizedMatch = styles.find(s => s.style.toLowerCase().replace(/-/g, '') === normalizedRequested);
  if (normalizedMatch) return normalizedMatch.style;
  // 部分匹配：请求的 ID 包含在某个样式中，或样式包含在请求中
  const partial = styles.find(
    s => s.style.toLowerCase().includes(lowerRequested) || lowerRequested.includes(s.style.toLowerCase())
  );
  if (partial) return partial.style;
  return null;
}

/** 递归构建子模块（用于 addModule） */
function buildChildren(childrenCmds: Command[], parentId: string, idMap: IdMap): ResumeModule[] {
  const children: ResumeModule[] = [];
  for (const childCmd of childrenCmds) {
    if (childCmd.action === 'addModule') {
      const childParams = childCmd.params as AddModuleParams;
      const childId = generateId();
      if (childCmd.tempId) idMap.set(childCmd.tempId, childId);
      // 类型修正
      const resolvedType = correctType(childParams.type);
      if (!resolvedType) {
        // 无法修正的类型，跳过（会在调用方记录错误）
        continue;
      }
      // 样式 ID 模糊匹配，不提供默认值
      const resolvedStyleId = childParams.styleId ? matchStyleId(resolvedType, childParams.styleId) : null;
      const childMod: ResumeModule = {
        id: childId,
        type: resolvedType as any,
        styleId: resolvedStyleId || childParams.styleId, // 保留原始 ID（即使可能无效）
        style: childParams.style || {},
        content: childParams.content || '',
        name: childParams.name,
        jobTitle: childParams.jobTitle,
        birth: childParams.birth,
        phone: childParams.phone,
        email: childParams.email,
        title: childParams.title,
        children: childParams.children ? buildChildren(childParams.children, childId, idMap) : [],
        parentId,
      } as ResumeModule;
      children.push(childMod);
    }
  }
  return children;
}

// ==================== 主执行器（事务性、可回滚） ====================
export function executeCommands(
  modules: ResumeModule[],
  commands: Command[]
): { newModules: ResumeModule[]; errors: string[]; rolledBack: boolean } {
  const idMap: IdMap = new Map();
  // 保存原始树，用于回滚
  const originalModules = deepCloneModules(modules);
  let currentModules = deepCloneModules(modules);
  const errors: string[] = [];
  let criticalError = false; // 关键错误标志

  function processCommand(cmd: Command) {
    try {
      switch (cmd.action) {
        case 'addModule': {
          const params = cmd.params as AddModuleParams;
          const realId = generateId();
          if (cmd.tempId) idMap.set(cmd.tempId, realId);

          // 类型检查与修正
          const resolvedType = correctType(params.type);
          if (!resolvedType) {
            errors.push(`无效的模块类型: "${params.type}"`);
            criticalError = true;
            return;
          }

          // 样式 ID 处理：模糊匹配，不自动降级
          let resolvedStyleId: string | undefined = undefined;
          if (params.styleId) {
            const matched = matchStyleId(resolvedType, params.styleId);
            if (!matched) {
              // 无法匹配到已注册样式，但允许创建，保留原 styleId
              resolvedStyleId = params.styleId;
            } else {
              resolvedStyleId = matched;
            }
          } // 未提供 styleId 时，resolvedStyleId 为 undefined，EditableModule 会使用无样式组件（MinimalContainer 等）

          const children = params.children ? buildChildren(params.children, realId, idMap) : [];

          const newMod: ResumeModule = {
            id: realId,
            type: resolvedType as any,
            styleId: resolvedStyleId,
            style: params.style || {},
            content: params.content || '',
            name: params.name,
            jobTitle: params.jobTitle,
            birth: params.birth,
            phone: params.phone,
            email: params.email,
            title: params.title,
            children,
            parentId: params.parentId ? resolveId(params.parentId, idMap) : undefined,
          } as ResumeModule;

          const parentId = params.parentId ? resolveId(params.parentId, idMap) : null;
          if (parentId === null) {
            currentModules.push(newMod);
          } else {
            currentModules = updateModuleInTree(currentModules, parentId, (mod) => ({
              ...mod,
              children: [...(mod.children || []), newMod],
            }));
          }
          break;
        }

        case 'addCustomModule': {
          const params = cmd.params as AddModuleParams & { style?: Record<string, string> };
          const realId = generateId();
          if (cmd.tempId) idMap.set(cmd.tempId, realId);

          // addCustomModule 允许任意类型，不做类型检查
          const type = params.type || 'text';
          // 如果有 styleId，尝试模糊匹配，但不强制
          const resolvedStyleId = params.styleId ? matchStyleId(type, params.styleId) || params.styleId : undefined;

          const newMod: ResumeModule = {
            id: realId,
            type: type as any,
            styleId: resolvedStyleId,
            style: params.style || {},
            content: params.content || '',
            name: params.name,
            jobTitle: params.jobTitle,
            birth: params.birth,
            phone: params.phone,
            email: params.email,
            title: params.title,
            children: [],
            parentId: params.parentId ? resolveId(params.parentId, idMap) : undefined,
          } as ResumeModule;

          const parentId = params.parentId ? resolveId(params.parentId, idMap) : null;
          if (parentId === null) {
            currentModules.push(newMod);
          } else {
            currentModules = updateModuleInTree(currentModules, parentId, (mod) => ({
              ...mod,
              children: [...(mod.children || []), newMod],
            }));
          }
          break;
        }

        case 'updateModule': {
          const params = cmd.params as UpdateModuleParams;
          const realId = resolveId(params.id, idMap);
          // 检查模块是否存在
          let found = false;
          const checkExist = (nodes: ResumeModule[]) => {
            for (const n of nodes) {
              if (n.id === realId) { found = true; return; }
              if (n.children) checkExist(n.children);
            }
          };
          checkExist(currentModules);
          if (!found) {
            errors.push(`updateModule: 模块 ${params.id} 不存在`);
            criticalError = true;
            return;
          }
          currentModules = updateModuleInTree(currentModules, realId, (mod) => ({
            ...mod,
            ...params.data,
          }));
          break;
        }

        case 'removeModule': {
          const params = cmd.params as RemoveModuleParams;
          const realId = resolveId(params.id, idMap);
          let found = false;
          function removeFrom(nodes: ResumeModule[]): ResumeModule[] {
            return nodes.filter(n => {
              if (n.id === realId) { found = true; return false; }
              return true;
            }).map(n => ({ ...n, children: n.children ? removeFrom(n.children) : [] }));
          }
          currentModules = removeFrom(currentModules);
          if (!found) {
            errors.push(`removeModule: 模块 ${params.id} 不存在`);
            criticalError = true;
          }
          break;
        }

        case 'moveModule': {
          const params = cmd.params as MoveModuleParams;
          const realId = resolveId(params.id, idMap);
          const newParentId = params.newParentId ? resolveId(params.newParentId, idMap) : null;

          let targetMod: ResumeModule | null = null;
          function removeMod(nodes: ResumeModule[]): ResumeModule[] {
            return nodes.filter(n => {
              if (n.id === realId) { targetMod = n; return false; }
              return true;
            }).map(n => ({ ...n, children: n.children ? removeMod(n.children) : [] }));
          }
          currentModules = removeMod(currentModules);
          if (!targetMod) {
            errors.push(`moveModule: 模块 ${params.id} 不存在`);
            criticalError = true;
            break;
          }
          if (newParentId === null) {
            const idx = Math.min(params.index, currentModules.length);
            currentModules = [...currentModules.slice(0, idx), targetMod, ...currentModules.slice(idx)];
          } else {
            currentModules = updateModuleInTree(currentModules, newParentId, (mod) => {
              const children = [...(mod.children || [])];
              const idx = Math.min(params.index, children.length);
              children.splice(idx, 0, targetMod!);
              return { ...mod, children };
            });
          }
          break;
        }

        case 'setStyle': {
          const params = cmd.params as SetStyleParams;
          const realId = resolveId(params.id, idMap);
          let found = false;
          const checkExist = (nodes: ResumeModule[]) => {
            for (const n of nodes) {
              if (n.id === realId) { found = true; return; }
              if (n.children) checkExist(n.children);
            }
          };
          checkExist(currentModules);
          if (!found) {
            errors.push(`setStyle: 模块 ${params.id} 不存在`);
            criticalError = true;
            return;
          }
          currentModules = updateModuleInTree(currentModules, realId, (mod) => ({
            ...mod,
            style: { ...mod.style, ...params.style },
          }));
          break;
        }

        case 'setContent': {
          const params = cmd.params as SetContentParams;
          const realId = resolveId(params.id, idMap);
          let found = false;
          const checkExist = (nodes: ResumeModule[]) => {
            for (const n of nodes) {
              if (n.id === realId) { found = true; return; }
              if (n.children) checkExist(n.children);
            }
          };
          checkExist(currentModules);
          if (!found) {
            errors.push(`setContent: 模块 ${params.id} 不存在`);
            criticalError = true;
            return;
          }
          currentModules = updateModuleInTree(currentModules, realId, (mod) => ({
            ...mod,
            content: params.content,
          }));
          break;
        }

        case 'setProperty': {
          const params = cmd.params as SetPropertyParams;
          const realId = resolveId(params.id, idMap);
          let found = false;
          const checkExist = (nodes: ResumeModule[]) => {
            for (const n of nodes) {
              if (n.id === realId) { found = true; return; }
              if (n.children) checkExist(n.children);
            }
          };
          checkExist(currentModules);
          if (!found) {
            errors.push(`setProperty: 模块 ${params.id} 不存在`);
            criticalError = true;
            return;
          }
          currentModules = updateModuleInTree(currentModules, realId, (mod) => ({
            ...mod,
            style: { ...mod.style, [params.property]: params.value },
          }));
          break;
        }

        case 'selectModule': {
          // 不修改树
          break;
        }

        case 'applyTemplate': {
          const params = cmd.params as ApplyTemplateParams;
          const realId = resolveId(params.id, idMap);
          let targetType: string = 'module';
          // 查找模块以获取类型
          const search = (nodes: ResumeModule[]): ResumeModule | null => {
            for (const n of nodes) {
              if (n.id === realId) return n;
              if (n.children) {
                const found = search(n.children);
                if (found) return found;
              }
            }
            return null;
          };
          const mod = search(currentModules);
          if (!mod) {
            errors.push(`applyTemplate: 模块 ${params.id} 不存在`);
            criticalError = true;
            return;
          }
          targetType = mod.type;
          const matchedStyle = matchStyleId(targetType, params.styleId);
          if (!matchedStyle) {
            errors.push(`applyTemplate: 样式 ${params.styleId} 不存在于类型 ${targetType} 中`);
            criticalError = true;
            return;
          }
          currentModules = updateModuleInTree(currentModules, realId, (m) => ({
            ...m,
            styleId: matchedStyle,
          }));
          break;
        }
      }
    } catch (err: any) {
      errors.push(`执行指令 ${cmd.action} 时发生异常: ${err.message}`);
      criticalError = true;
    }
  }

  // 按顺序执行所有指令
  for (const cmd of commands) {
    processCommand(cmd);
    // 一旦出现关键错误，停止执行并准备回滚
    if (criticalError) break;
  }

  // 事务性回滚：如果有任何错误，返回原始模块树
  if (errors.length > 0) {
    return { newModules: originalModules, errors, rolledBack: true };
  }

  return { newModules: currentModules, errors, rolledBack: false };
}