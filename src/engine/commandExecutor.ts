import { generateId } from "../utils/idUtils";
// src/engine/commandExecutor.ts
import type { ResumeModule } from '../types/resume';
import { findModuleById } from '../utils/moduleUtils';
import { useResumeStore } from '../store/useResumeStore';
import { getStylesByType } from '../styles/styleRegistry';

// ==================== 指令定义 ====================
export type CommandAction =
  | 'addModule'
  | 'updateModule'
  | 'removeModule'
  | 'moveModule'
  | 'setStyle'
  | 'setContent'
  | 'setProperty'
  | 'setField'
  | 'addCustomModule'
  | 'selectModule'
  | 'applyTemplate';

export interface Command {
  action: CommandAction;
  tempId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export interface UpdateModuleParams { id: string; data: Partial<ResumeModule> }
export interface RemoveModuleParams { id: string }
export interface MoveModuleParams { id: string; newParentId: string | null; index: number }
export interface SetStyleParams { id: string; style: Record<string, string> }
export interface SetContentParams { id: string; content: string }
export interface SetPropertyParams { id: string; property: string; value: string }
export interface SelectModuleParams { id: string }
export interface ApplyTemplateParams { id: string; styleId: string }
// ==================== 结构化错误类型 ====================

export interface CommandError {
  /** 错误码，用于 LLM 自纠正 */
  code: string;
  /** 人类可读的描述 */
  message: string;
  /** 给 LLM 的修正建议 */
  fix: string;
}

function makeError(code: string, message: string, fix: string): CommandError {
  return { code, message, fix };
}

// ==================== 校验函数 ====================

// 结构完整性校验：容器型模块必须包含 children
function validateCommands(commands: Command[]): string | null {
  function check(cmdList: Command[], path: string): string | null {
    for (const cmd of cmdList) {
      if (cmd.action === 'addModule') {
        const params = cmd.params as AddModuleParams;
        const type = params.type;
        const containerTypes = ['header', 'module', 'flex', 'grid'];
        if (containerTypes.includes(type)) {
          const children = params.children;
          if (!children || !Array.isArray(children) || children.length === 0) {
            const id = cmd.tempId || '未命名';
            return `容器模块 "${id}" (type: ${type}) 缺少 children 定义。请添加至少一个子 addModule 指令。`;
          }
          // 递归检查子指令
          const err = check(children, `${path}/${type}`);
          if (err) return err;
        }
      }
    }
    return null;
  }
  return check(commands, 'root');
}

// JSON 格式校验：确保整个指令数组能通过 JSON 序列化/反序列化
function validateJsonFormat(commands: Command[]): string | null {
  try {
    const json = JSON.stringify(commands);
    JSON.parse(json);
    return null;
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const pos = errMsg.match(/position (\d+)/)?.[1] || '未知';
    return `指令 JSON 格式错误（第 ${pos} 个字符处）：${errMsg}`;
  }
}

// ==================== 引擎内部工具 ====================
type IdMap = Map<string, string>;


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
    if (node.id === targetId) return updater(node);
    if (node.children && node.children.length > 0)
      return { ...node, children: updateModuleInTree(node.children, targetId, updater) };
    return node;
  });
}

const VALID_TYPES: ResumeModule['type'][] = ['header', 'module', 'text', 'heading', 'list', 'image', 'flex', 'grid'];

function correctType(raw: string): ResumeModule['type'] | null {
  const lower = raw.toLowerCase().trim();
  if ((VALID_TYPES as readonly string[]).includes(lower)) return lower as ResumeModule['type'];
  const alias: Record<string, string> = {
    'paragraph': 'text', 'photo': 'image', '简历头': 'header', '模块': 'module',
    '文本框': 'text', '标题': 'heading', '列表': 'list', '图片': 'image',
    '弹性容器': 'flex', '网格容器': 'grid',
  };
  if (alias[lower]) return alias[lower] as ResumeModule['type'];
  for (const vt of VALID_TYPES) {
    if (lower.startsWith(vt) || vt.startsWith(lower)) return vt as ResumeModule['type'];
  }
  return null;
}

function matchStyleId(type: string, requested: string): string | null {
  const styles = getStylesByType(type as ResumeModule['type']);
  if (!styles.length) return null;
  const exact = styles.find(s => s.style === requested);
  if (exact) return exact.style;
  const lowerRequested = requested.toLowerCase();
  const caseInsensitive = styles.find(s => s.style.toLowerCase() === lowerRequested);
  if (caseInsensitive) return caseInsensitive.style;
  const normalizedRequested = lowerRequested.replace(/-/g, '');
  const normalizedMatch = styles.find(s => s.style.toLowerCase().replace(/-/g, '') === normalizedRequested);
  if (normalizedMatch) return normalizedMatch.style;
  const partial = styles.find(
    s => s.style.toLowerCase().includes(lowerRequested) || lowerRequested.includes(s.style.toLowerCase())
  );
  if (partial) return partial.style;
  return null;
}

function buildChildren(childrenCmds: Command[], parentId: string, idMap: IdMap): ResumeModule[] {
  const children: ResumeModule[] = [];
  for (const childCmd of childrenCmds) {
    if (childCmd.action === 'addModule') {
      const childParams = childCmd.params as AddModuleParams;
      const childId = generateId();
      if (childCmd.tempId) idMap.set(childCmd.tempId, childId);
      const resolvedType = correctType(childParams.type);
      if (!resolvedType) throw new Error(`无效的子模块类型: "${childParams.type}"，无法构建模块树`);
      const resolvedStyleId = childParams.styleId ? matchStyleId(resolvedType, childParams.styleId) : null;
      const childMod: ResumeModule = {
        id: childId,
        type: resolvedType,
        styleId: resolvedStyleId || childParams.styleId,
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

// ==================== 主执行器 ====================
export function executeCommands(
  modules: ResumeModule[],
  commands: Command[]
): { newModules: ResumeModule[]; errors: CommandError[]; rolledBack: boolean } {
  // 1. 结构完整性校验
  const structureError = validateCommands(commands);
  if (structureError) {
    console.error('[SkillSystem] 指令结构校验失败:', structureError);
    return { newModules: modules, errors: [makeError('MISSING_CHILDREN', structureError, '容器模块必须包含 children 数组。请为容器添加至少一个子 addModule 指令。')], rolledBack: false };
  }

  // 2. JSON 格式校验
  const jsonError = validateJsonFormat(commands);
  if (jsonError) {
    console.error('[SkillSystem] JSON 格式校验失败:', jsonError);
    return { newModules: modules, errors: [makeError('INVALID_FORMAT', jsonError, '指令 JSON 格式不合法，请检查括号配对、引号转义和逗号分隔。')], rolledBack: false };
  }

  console.group(`[SkillSystem] 执行指令序列，共 ${commands.length} 条`);
  const idMap: IdMap = new Map();
  const originalModules = deepCloneModules(modules);
  let currentModules = deepCloneModules(modules);
  const errors: CommandError[] = [];
  let criticalError = false;

  function processCommand(cmd: Command) {
    try {
      switch (cmd.action) {
        case 'addModule': {
          const params = cmd.params as AddModuleParams;
          const realId = generateId();
          if (cmd.tempId) idMap.set(cmd.tempId, realId);

          const resolvedType = correctType(params.type);
          if (!resolvedType) {
            errors.push(makeError("INVALID_TYPE", `无效的模块类型: "${params.type}"`, `可用的模块类型有: text, heading, list, image, flex, grid, header, module。请使用其中一种。`));
            criticalError = true;
            return;
          }

          let resolvedStyleId: string | undefined = undefined;
          if (params.styleId) {
            const matched = matchStyleId(resolvedType, params.styleId);
            resolvedStyleId = matched || params.styleId;
          }

          // 基础类型默认样式补全
          if (!resolvedStyleId) {
            const defaultStyleMap: Record<string, string> = {
              text: 'text-default',
              heading: 'heading-default',
              list: 'list-default',
              image: 'image-default',
              flex: 'flex-default',
              grid: 'grid-default',
            };
            if (defaultStyleMap[resolvedType]) resolvedStyleId = defaultStyleMap[resolvedType];
          }

          const children = params.children ? buildChildren(params.children, realId, idMap) : [];

          const newMod: ResumeModule = {
            id: realId,
        type: resolvedType,
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
          const type = params.type || 'text';
          let resolvedStyleId: string | undefined = params.styleId ? matchStyleId(type, params.styleId) || params.styleId : undefined;

          if (!resolvedStyleId) {
            const defaultStyleMap: Record<string, string> = {
              text: 'text-default', heading: 'heading-default', list: 'list-default',
              image: 'image-default', flex: 'flex-default', grid: 'grid-default',
            };
            if (defaultStyleMap[type]) resolvedStyleId = defaultStyleMap[type];
          }

          const newMod: ResumeModule = {
            id: realId,
            type: type,
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
          if (!findModuleById(currentModules, realId)) { errors.push(makeError("MODULE_NOT_FOUND", `updateModule: 模块 ${params.id} 不存在`, `请检查模块 id 是否正确，确保它来自「当前画布」列表中的已有模块。`)); criticalError = true; return; }
          currentModules = updateModuleInTree(currentModules, realId, (mod) => ({ ...mod, ...params.data }));
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
          if (!found) { errors.push(makeError("MODULE_NOT_FOUND", `removeModule: 模块 ${params.id} 不存在`, `请检查要删除的模块 id，确保它来自「当前画布」列表。`)); criticalError = true; }
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
          if (!targetMod) { errors.push(makeError("MODULE_NOT_FOUND", `moveModule: 模块 ${params.id} 不存在`, `请检查要移动的模块 id，确保它来自「当前画布」列表。`)); criticalError = true; break; }
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
          if (!findModuleById(currentModules, realId)) { errors.push(makeError("MODULE_NOT_FOUND", `setStyle: 模块 ${params.id} 不存在`, `请检查模块 id，确保它来自「当前画布」列表。`)); criticalError = true; return; }
          currentModules = updateModuleInTree(currentModules, realId, (mod) => ({
            ...mod,
            style: { ...mod.style, ...params.style },
          }));
          break;
        }

        case 'setField': {
          const params = cmd.params as { id: string; field: string; value: string };
          const realId = resolveId(params.id, idMap);
          if (!findModuleById(currentModules, realId)) { errors.push(makeError("MODULE_NOT_FOUND", `setField: 模块 ${params.id} 不存在`, `请检查模块 id，确保它来自「当前画布」列表。`)); criticalError = true; return; }
          currentModules = updateModuleInTree(currentModules, realId, (mod) => ({
            ...mod,
            [params.field]: params.value,
          }));
          break;
        }

        case 'setContent': {
          const params = cmd.params as SetContentParams;
          const realId = resolveId(params.id, idMap);
          if (!findModuleById(currentModules, realId)) { errors.push(makeError("MODULE_NOT_FOUND", `setContent: 模块 ${params.id} 不存在`, `请检查模块 id，确保它来自「当前画布」列表。`)); criticalError = true; return; }
          currentModules = updateModuleInTree(currentModules, realId, (mod) => ({
            ...mod,
            content: params.content,
          }));
          break;
        }

        case 'setProperty': {
          const params = cmd.params as SetPropertyParams;
          const realId = resolveId(params.id, idMap);
          if (!findModuleById(currentModules, realId)) { errors.push(makeError("MODULE_NOT_FOUND", `setProperty: 模块 ${params.id} 不存在`, `请检查模块 id，确保它来自「当前画布」列表。`)); criticalError = true; return; }
          currentModules = updateModuleInTree(currentModules, realId, (mod) => ({
            ...mod,
            style: { ...mod.style, [params.property]: params.value },
          }));
          break;
        }

        case 'selectModule': {
          const realId = resolveId(cmd.params.id || cmd.params.moduleId, idMap);
          if (realId) useResumeStore.getState().select(realId);
          break;
        }

        case 'applyTemplate': {
          const params = cmd.params as ApplyTemplateParams;
          const realId = resolveId(params.id, idMap);
          let targetType: string = 'module';
          const mod = findModuleById(currentModules, realId);
          if (!mod) { errors.push(makeError("MODULE_NOT_FOUND", `applyTemplate: 模块 ${params.id} 不存在`, `请检查模块 id，确保它来自「当前画布」列表。`)); criticalError = true; return; }
          targetType = mod.type;
          const matchedStyle = matchStyleId(targetType, params.styleId);
          if (!matchedStyle) { errors.push(makeError("TEMPLATE_NOT_FOUND", `applyTemplate: 样式 ${params.styleId} 不存在`, `可用样式请查看「可用模块类型及样式ID」列表。`)); criticalError = true; return; }
          currentModules = updateModuleInTree(currentModules, realId, (m) => ({ ...m, styleId: matchedStyle }));
          break;
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(makeError("EXECUTION_ERROR", `执行指令 ${cmd.action} 时异常: ${errMsg}`, "请检查参数格式后重试。如果问题持续，请尝试用不同的方式描述需求。"));
      criticalError = true;
    }
  }

  for (const cmd of commands) {
    processCommand(cmd);
    if (criticalError) break;
  }

  console.log(`[SkillSystem] 执行完成，错误数: ${errors.length}`);
  if (errors.length > 0) console.error('[SkillSystem] 错误详情:', errors.map(e => e.message));
  console.groupEnd();

  return { newModules: errors.length > 0 ? originalModules : currentModules, errors, rolledBack: errors.length > 0 };
}
