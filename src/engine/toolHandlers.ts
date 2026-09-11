import { generateId } from "../utils/idUtils";
// src/engine/toolHandlers.ts
// 每个 tool 对应一个纯函数，接收参数 + 当前 modules，返回操作结果。
import { findModuleById } from '../utils/moduleUtils';
// 内部通过构造 Command 调用 commandExecutor，不向 LLM 暴露 Command 结构。

import { executeCommands, type Command } from './commandExecutor';
import type { ResumeModule } from '../types/resume';
import { loadTemplate } from './templates';
import { useResumeStore } from '../store/useResumeStore';
import { executeSkill, type SkillContext } from './skillExecutor';
import { exportPDF } from '../utils/export';
import type {
  AddTextParams,
  AddHeadingParams,
  AddListParams,
  AddImageParams,
  AddFlexParams,
  AddGridParams,
  AddFlexInlineParams,
  AddGridInlineParams,
  InlineChildDef,
  AddHeaderParams,
  AddModuleParams,
  SetContentParams,
  SetStyleParams,
  SetPropertyParams,
  SetFieldParams,
  SetStyleByTypeParams,
  RemoveModuleParams,
  CopyStyleParams,
  CopyTextStyleParams,
  DeleteModulesParams,
  ClearCanvasParams,
  MoveModuleParams,
  DuplicateModuleParams,
  ApplyTemplateParams,
  ExecuteSkillParams,
} from './aiPrompt';

// ==================== 返回类型 ====================

export interface ToolSuccess {
  success: true;
  newModules: ResumeModule[];
  /** 给 LLM 的结果摘要，包含创建的模块 id 等内容 */
  summary: string;
}

export interface ToolError {
  success: false;
  /** 错误码，用于 LLM 自纠正 */
  code: string;
  /** 人类可读的描述 */
  message: string;
  /** 给 LLM 的修正建议 */
  fix: string;
  /** 原始模块（未修改），ChatPanel 可据此决定是否回退 */
  originalModules: ResumeModule[];
}

export type ToolResult = ToolSuccess | ToolError;

// ==================== 辅助函数 ====================


function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function styleToRecord(style?: Record<string, string>): Record<string, string> {
  return style || {};
}

/** 将 executeCommands 的返回值转换为 ToolResult */
function toToolResult(
  result: { newModules: ResumeModule[]; errors: import('./commandExecutor').CommandError[] },
  originalModules: ResumeModule[],
  summary?: string,
): ToolResult {
  if (result.errors.length === 0) {
    return { success: true, newModules: result.newModules, summary: summary || '操作已成功执行。' };
  }
  const firstError = result.errors[0];
  return {
    success: false,
    code: firstError.code,
    message: firstError.message,
    fix: firstError.fix,
    originalModules,
  };
}

/** 将内联子控件转换为 Command 数组 */
function inlineChildrenToCommands(children: InlineChildDef[], parentTempId: string): Command[] {
  return children.map((child, i) => {
    const style: Record<string, string> = { ...child.style };
    // 默认样式
    if (child.type === 'heading') {
      style.fontSize = style.fontSize || '20px';
      style.fontWeight = style.fontWeight || '700';
    }
    if (!style.fontSize) style.fontSize = '15px';
    if (!style.color) style.color = '#334155';

    return {
      action: 'addModule' as const,
      tempId: `${parentTempId}-c${i}`,
      params: {
        type: child.type,
        styleId: `${child.type}-default`,
        style,
        content: child.content || '',
      },
    };
  });
}

// ==================== Tool Handler 函数 ====================

export function handleAddText(params: AddTextParams, modules: ResumeModule[]): ToolResult {
  const cmd: Command = {
    action: 'addModule',
    params: {
      type: 'text',
      styleId: 'text-default',
      style: styleToRecord(params.style),
      content: params.content,
    },
  };
  const result = executeCommands(modules, [cmd]);
  const newId = result.newModules.length > 0 ? result.newModules[result.newModules.length - 1]?.id : '';
  return toToolResult(result, modules, JSON.stringify({ id: newId, type: 'text', content: params.content?.slice(0, 60) }));
}

export function handleAddHeading(params: AddHeadingParams, modules: ResumeModule[]): ToolResult {
  const cmd: Command = {
    action: 'addModule',
    params: {
      type: 'heading',
      styleId: 'heading-default',
      style: {
        fontSize: '20px',
        fontWeight: '700',
        color: '#0f172a',
        ...styleToRecord(params.style),
      },
      content: params.content,
    },
  };
  const result = executeCommands(modules, [cmd]);
  const newId = result.newModules.length > 0 ? result.newModules[result.newModules.length - 1]?.id : '';
  return toToolResult(result, modules, JSON.stringify({ id: newId, type: 'heading', content: params.content?.slice(0, 60) }));
}

export function handleAddList(params: AddListParams, modules: ResumeModule[]): ToolResult {
  const cmd: Command = {
    action: 'addModule',
    params: {
      type: 'list',
      styleId: 'list-default',
      style: styleToRecord(params.style),
      content: params.content,
    },
  };
  const result = executeCommands(modules, [cmd]);
  const newId = result.newModules.length > 0 ? result.newModules[result.newModules.length - 1]?.id : '';
  return toToolResult(result, modules, JSON.stringify({ id: newId, type: 'list', content: params.content?.slice(0, 60) }));
}

export function handleAddImage(params: AddImageParams, modules: ResumeModule[]): ToolResult {
  const cmd: Command = {
    action: 'addModule',
    params: {
      type: 'image',
      styleId: 'image-default',
      style: {
        width: '100px',
        height: '130px',
        borderRadius: '8px',
        objectFit: 'cover',
        ...styleToRecord(params.style),
      },
      content: params.content || '',
    },
  };
  const result = executeCommands(modules, [cmd]);
  const newId = result.newModules.length > 0 ? result.newModules[result.newModules.length - 1]?.id : '';
  return toToolResult(result, modules, JSON.stringify({ id: newId, type: 'image' }));
}

export function handleAddFlex(params: AddFlexParams, modules: ResumeModule[]): ToolResult {
  if (!params.children || params.children.length === 0) {
    return {
      success: false,
      code: 'MISSING_CHILDREN',
      message: 'add_flex 需要至少一个 children 元素。如需创建新子模块，请使用 add_flex_inline。',
      fix: '请使用 add_flex_inline 工具，它允许内联定义子控件：add_flex_inline(children: [{type:"text", content:"..."}], direction:"column")',
      originalModules: modules,
    };
  }

  // 查找并收集所有需要包装的模块
  const childModules: ResumeModule[] = [];
  for (const childId of params.children) {
    const mod = findModuleById(modules, childId);
    if (!mod) {
      return {
        success: false,
        code: 'MODULE_NOT_FOUND',
        message: `add_flex 的子模块 "${childId}" 在当前画布中不存在。`,
        fix: `请检查 children 中的 id。如需创建新子模块，请使用 add_flex_inline。`,
        originalModules: modules,
      };
    }
    childModules.push(mod);
  }

  // 将已有模块转为嵌套 Command（深拷贝内容，保留样式）
  const flexTempId = 'flex-' + generateId();
  const childrenCmds: Command[] = childModules.map((mod, i) => ({
    action: 'addModule' as const,
    tempId: `${flexTempId}-c${i}`,
    params: {
      type: mod.type,
      styleId: mod.styleId,
      style: { ...mod.style },
      content: mod.content,
      name: mod.name,
      jobTitle: mod.jobTitle,
      birth: mod.birth,
      phone: mod.phone,
      email: mod.email,
      title: mod.title,
    },
  }));

  // 创建 flex 并删除原模块（一次 executeCommands 调用中完成）
  const commands: Command[] = [
    {
      action: 'addModule',
      tempId: flexTempId,
      params: {
        type: 'flex',
        styleId: 'flex-default',
        style: {
          display: 'flex',
          flexDirection: params.direction || 'column',
          gap: params.gap || '12px',
          ...styleToRecord(params.style),
        },
        children: childrenCmds,
      },
    },
    ...params.children.map(childId => ({
      action: 'removeModule' as const,
      params: { id: childId },
    })),
  ];

  return toToolResult(executeCommands(modules, commands), modules);
}

export function handleAddGrid(params: AddGridParams, modules: ResumeModule[]): ToolResult {
  if (!params.children || params.children.length === 0) {
    return {
      success: false,
      code: 'MISSING_CHILDREN',
      message: 'add_grid 需要至少一个 children 元素。如需创建新子模块，请使用 add_grid_inline。',
      fix: '请使用 add_grid_inline 工具，它允许内联定义子控件：add_grid_inline(children: [{type:"text", content:"..."}], columns: 2)',
      originalModules: modules,
    };
  }

  const childModules: ResumeModule[] = [];
  for (const childId of params.children) {
    const mod = findModuleById(modules, childId);
    if (!mod) {
      return {
        success: false,
        code: 'MODULE_NOT_FOUND',
        message: `add_grid 的子模块 "${childId}" 在当前画布中不存在。`,
        fix: `请检查 children 中的 id。如需创建新子模块，请使用 add_grid_inline。`,
        originalModules: modules,
      };
    }
    childModules.push(mod);
  }

  const gridTempId = 'grid-' + generateId();
  const columns = params.columns || 2;
  const childrenCmds: Command[] = childModules.map((mod, i) => ({
    action: 'addModule' as const,
    tempId: `${gridTempId}-c${i}`,
    params: {
      type: mod.type,
      styleId: mod.styleId,
      style: { ...mod.style },
      content: mod.content,
      name: mod.name,
      jobTitle: mod.jobTitle,
      birth: mod.birth,
      phone: mod.phone,
      email: mod.email,
      title: mod.title,
    },
  }));

  const commands: Command[] = [
    {
      action: 'addModule',
      tempId: gridTempId,
      params: {
        type: 'grid',
        styleId: 'grid-default',
        style: {
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: params.gap || '12px',
          ...styleToRecord(params.style),
        },
        children: childrenCmds,
      },
    },
    ...params.children.map(childId => ({
      action: 'removeModule' as const,
      params: { id: childId },
    })),
  ];

  return toToolResult(executeCommands(modules, commands), modules);
}

export function handleAddFlexInline(params: AddFlexInlineParams, modules: ResumeModule[]): ToolResult {
  const tempId = 'flex-inline-' + generateId();
  const childrenCmds = inlineChildrenToCommands(params.children, tempId);

  const cmd: Command = {
    action: 'addModule',
    tempId,
    params: {
      type: 'flex',
      styleId: 'flex-default',
      style: {
        display: 'flex',
        flexDirection: params.direction || 'column',
        gap: params.gap || '12px',
        ...styleToRecord(params.style),
      },
      children: childrenCmds,
    },
  };

  return toToolResult(executeCommands(modules, [cmd]), modules);
}

export function handleAddGridInline(params: AddGridInlineParams, modules: ResumeModule[]): ToolResult {
  const tempId = 'grid-inline-' + generateId();
  const childrenCmds = inlineChildrenToCommands(params.children, tempId);
  const columns = params.columns || 2;

  const cmd: Command = {
    action: 'addModule',
    tempId,
    params: {
      type: 'grid',
      styleId: 'grid-default',
      style: {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: params.gap || '12px',
        ...styleToRecord(params.style),
      },
      children: childrenCmds,
    },
  };

  return toToolResult(executeCommands(modules, [cmd]), modules);
}

export function handleAddHeader(params: AddHeaderParams, modules: ResumeModule[]): ToolResult {
  const headerTempId = 'header-' + generateId();

  // 从模板中查找对应 header 样式，获取默认结构
  // 如果找不到，构建通用结构：photo + info flex
  const cmd: Command = {
    action: 'addModule',
    tempId: headerTempId,
    params: {
      type: 'header',
      styleId: params.styleId,
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: '20px',
        padding: '24px',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e8ecf1',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      },
      children: [
        {
          action: 'addModule' as const,
          tempId: `${headerTempId}-photo`,
          params: {
            type: 'image',
            styleId: 'image-default',
            style: { width: '100px', height: '130px', borderRadius: '8px', objectFit: 'cover' },
            content: '',
          },
        },
        {
          action: 'addModule' as const,
          tempId: `${headerTempId}-info`,
          params: {
            type: 'flex',
            styleId: 'flex-default',
            style: { flexDirection: 'column', gap: '12px', flex: '1' },
            children: [
              {
                action: 'addModule' as const,
                tempId: `${headerTempId}-name`,
                params: {
                  type: 'text',
                  styleId: 'text-default',
                  style: { fontSize: '24px', fontWeight: '700', color: '#1a202c' },
                  content: '姓名',
                  name: '姓名',
                },
              },
              {
                action: 'addModule' as const,
                tempId: `${headerTempId}-grid`,
                params: {
                  type: 'grid',
                  styleId: 'grid-default',
                  style: { gridTemplateColumns: '1fr 1fr', gap: '12px' },
                  children: [
                    {
                      action: 'addModule' as const,
                      params: { type: 'text', styleId: 'text-default', content: '求职意向', jobTitle: '求职意向' },
                    },
                    {
                      action: 'addModule' as const,
                      params: { type: 'text', styleId: 'text-default', content: '出生年月', birth: '出生年月' },
                    },
                    {
                      action: 'addModule' as const,
                      params: { type: 'text', styleId: 'text-default', content: '📞 电话', phone: '电话' },
                    },
                    {
                      action: 'addModule' as const,
                      params: { type: 'text', styleId: 'text-default', content: '📧 邮箱', email: '邮箱' },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };

  const result = executeCommands(modules, [cmd]);
  const newId = result.newModules.length > 0 ? result.newModules[result.newModules.length - 1]?.id : '';
  return toToolResult(result, modules, JSON.stringify({ id: newId, type: 'header', styleId: params.styleId }));
}

export function handleAddModule(params: AddModuleParams, modules: ResumeModule[]): ToolResult {
  const modTempId = 'mod-' + generateId();

  const cmd: Command = {
    action: 'addModule',
    tempId: modTempId,
    params: {
      type: 'module',
      styleId: params.styleId,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '20px',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      },
      children: [
        {
          action: 'addModule' as const,
          tempId: `${modTempId}-heading`,
          params: {
            type: 'heading',
            styleId: 'heading-default',
            style: { fontSize: '20px', fontWeight: '700', color: '#0f172a', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9' },
            content: `<p>${esc(params.title)}</p>`,
            title: params.title,
          },
        },
        {
          action: 'addModule' as const,
          tempId: `${modTempId}-text`,
          params: {
            type: 'text',
            styleId: 'text-default',
            style: { fontSize: '15px', color: '#334155', lineHeight: '1.6' },
            content: params.content || '<p></p>',
          },
        },
      ],
    },
  };

  const result = executeCommands(modules, [cmd]);
  const newId = result.newModules.length > 0 ? result.newModules[result.newModules.length - 1]?.id : '';
  return toToolResult(result, modules, JSON.stringify({ id: newId, type: 'module', title: params.title }));
}

export function handleSetContent(params: SetContentParams, modules: ResumeModule[]): ToolResult {
  if (typeof params?.content !== 'string') {
    return {
      success: false,
      code: 'MISSING_CONTENT',
      message: 'set_content 缺少 content 参数，未做任何修改。',
      fix: '请提供 content 字符串（想清空内容就显式传空字符串 ""），例如 {"id":"模块id","content":"<p>新内容</p>"}。',
      originalModules: modules,
    };
  }
  const cmd: Command = {
    action: 'setContent',
    params: { id: params.id, content: params.content },
  };
  return toToolResult(executeCommands(modules, [cmd]), modules);
}

export function handleSetStyle(params: SetStyleParams, modules: ResumeModule[]): ToolResult {
  const style = params?.style as Record<string, string> | null | undefined;
  if (!style || typeof style !== 'object' || Array.isArray(style) || Object.keys(style).length === 0) {
    return {
      success: false,
      code: 'EMPTY_STYLE',
      message: 'set_style 的 style 参数为空，没有可应用的样式，未做任何修改。',
      fix: 'style 必须是「属性名 → 值」的合法 JSON 对象，至少包含一个属性，例如 {"fontSize":"15px","color":"#334155"}。只改单个属性请用 set_property。',
      originalModules: modules,
    };
  }
  const cmd: Command = {
    action: 'setStyle',
    params: { id: params.id, style: params.style },
  };
  return toToolResult(executeCommands(modules, [cmd]), modules);
}

export function handleSetProperty(params: SetPropertyParams, modules: ResumeModule[]): ToolResult {
  const cmd: Command = {
    action: 'setProperty',
    params: { id: params.id, property: params.property, value: params.value },
  };
  return toToolResult(executeCommands(modules, [cmd]), modules);
}


export function handleSetStyleByType(params: SetStyleByTypeParams, modules: ResumeModule[]): ToolResult {
  const includeTypes = params.type ? new Set(params.type) : null;
  const excludeTypes = params.except ? new Set(params.except) : null;

  const matchedIds: string[] = [];

  const walk = (nodes: ResumeModule[]) => {
    for (const node of nodes) {
      // Skip excluded types
      if (excludeTypes?.has(node.type)) {
        if (node.children) walk(node.children);
        continue;
      }
      // Match by type filter
      if (!includeTypes || includeTypes.has(node.type)) {
        matchedIds.push(node.id);
      }
      if (node.children) walk(node.children);
    }
  };

  walk(modules);

  if (matchedIds.length === 0) {
    const filterDesc = params.type ? `类型 ${params.type.join(', ')}` : '所有类型';
    const exceptDesc = params.except ? `（排除 ${params.except.join(', ')}）` : '';
    return {
      success: false,
      code: 'NO_MATCH',
      message: `没有找到匹配的模块：${filterDesc}${exceptDesc}`,
      fix: '请检查 type/except 参数是否正确，或先确认画布上有相应类型的模块。',
      originalModules: modules,
    };
  }

  const commands: Command[] = matchedIds.map(id => ({
    action: 'setStyle',
    params: { id, style: params.style },
  }));

  const result = executeCommands(modules, commands);

  return toToolResult(
    result,
    modules,
    `已将 ${matchedIds.length} 个模块的样式更新为 ${JSON.stringify(params.style)}`,
  );
}


export function handleSetField(params: SetFieldParams, modules: ResumeModule[]): ToolResult {
  const validFields = ['name', 'jobTitle', 'birth', 'phone', 'email', 'title'];
  if (!validFields.includes(params.field)) {
    return {
      success: false,
      code: 'INVALID_FIELD',
      message: `set_field: 不支持的字段 "${params.field}"。可用字段: ${validFields.join(', ')}`,
      fix: `请使用以下字段之一: ${validFields.join(', ')}。`,
      originalModules: modules,
    };
  }

  const cmd: Command = {
    action: 'setField',
    params: { id: params.id, field: params.field, value: params.value },
  };
  return toToolResult(executeCommands(modules, [cmd]), modules);
}

export function handleRemoveModule(params: RemoveModuleParams, modules: ResumeModule[]): ToolResult {
  const cmd: Command = {
    action: 'removeModule',
    params: { id: params.id },
  };
  return toToolResult(executeCommands(modules, [cmd]), modules);
}


export function handleDeleteModules(params: DeleteModulesParams, modules: ResumeModule[]): ToolResult {
  if (!params.ids || params.ids.length === 0) {
    return {
      success: false,
      code: 'MISSING_IDS',
      message: 'delete_modules: ids 参数为空或缺失',
      fix: '请提供至少一个模块 ID',
      originalModules: modules,
    };
  }

  const existingIds = new Set<string>();
  const collectIds = (nodes: ResumeModule[]) => {
    for (const n of nodes) {
      existingIds.add(n.id);
      if (n.children) collectIds(n.children);
    }
  };
  collectIds(modules);

  const missing = params.ids.filter((id) => !existingIds.has(id));
  if (missing.length > 0) {
    return {
      success: false,
      code: 'MODULE_NOT_FOUND',
      message: `delete_modules: 以下模块不存在: ${missing.join(', ')}`,
      fix: '请检查模块 ID，确保它们来自当前画布。',
      originalModules: modules,
    };
  }

  const commands: Command[] = params.ids.map((id) => ({
    action: 'removeModule',
    params: { id },
  }));

  const result = executeCommands(modules, commands);
  return toToolResult(result, modules, `已删除 ${params.ids.length} 个模块`);
}


export function handleCopyStyle(params: CopyStyleParams, modules: ResumeModule[]): ToolResult {
  // 查找源模块
  const source = findModuleById(modules, params.source_id);
  if (!source) {
    return {
      success: false,
      code: 'MODULE_NOT_FOUND',
      message: `copy_style: 源模块 ${params.source_id} 不存在`,
      fix: '请检查源模块 id 是否正确。',
      originalModules: modules,
    };
  }

  const target = findModuleById(modules, params.target_id);
  if (!target) {
    return {
      success: false,
      code: 'MODULE_NOT_FOUND',
      message: `copy_style: 目标模块 ${params.target_id} 不存在`,
      fix: '请检查目标模块 id 是否正确。',
      originalModules: modules,
    };
  }

  if (params.source_id === params.target_id) {
    return {
      success: false,
      code: 'SAME_MODULE',
      message: 'copy_style: 源模块和目标模块相同，无需复制',
      fix: '请选择不同的模块。',
      originalModules: modules,
    };
  }

  // 类型感知：同类型或同是控件 → 全复制；跨类型 → 仅共有布局属性
  const CONTROLS = new Set(['text', 'heading', 'list']);
  const isSameType = source.type === target.type;
  const bothControls = CONTROLS.has(source.type) && CONTROLS.has(target.type);

  const commands: Command[] = [];

  if (isSameType || bothControls) {
    // 全量复制样式
    commands.push({
      action: 'setStyle',
      params: { id: params.target_id, style: source.style || {} },
    });
    // 复制全部元数据
    const metaFields = ['name', 'jobTitle', 'birth', 'phone', 'email', 'title'] as const;
    for (const field of metaFields) {
      if (source[field]) {
        commands.push({
          action: 'setField',
          params: { id: params.target_id, field, value: source[field] as string },
        });
      }
    }
  } else {
    // 跨类型：仅复制共有布局属性
    const LAYOUT_KEYS = new Set([
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'backgroundColor', 'borderRadius', 'boxShadow', 'opacity',
      'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
      'overflow', 'border', 'borderWidth', 'borderStyle', 'borderColor',
    ]);
    const commonStyle: Record<string, string> = {};
    if (source.style) {
      for (const key of Object.keys(source.style)) {
        if (LAYOUT_KEYS.has(key)) commonStyle[key] = source.style[key];
      }
    }
    if (Object.keys(commonStyle).length > 0) {
      commands.push({
        action: 'setStyle',
        params: { id: params.target_id, style: commonStyle },
      });
    }
    // 仅复制基本标识字段
    const basicFields = ['name', 'title'] as const;
    for (const field of basicFields) {
      if (source[field]) {
        commands.push({
          action: 'setField',
          params: { id: params.target_id, field, value: source[field] as string },
        });
      }
    }
  }

  const result = executeCommands(modules, commands);
  return toToolResult(result, modules, `已将模块 ${params.source_id} 的样式复制到 ${params.target_id}`);
}

// 文字排版相关 CSS 属性（仅影响文字外观，不影响容器）
const TEXT_STYLE_KEYS = new Set([
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
  'color',
  'textAlign', 'textDecoration', 'textTransform', 'textIndent',
  'lineHeight', 'letterSpacing', 'wordSpacing',
  'whiteSpace', 'wordBreak', 'overflowWrap', 'direction',
]);

// CSS 属性名 kebab-case → camelCase 映射（用于解析 HTML 内联样式）
const CSS_TO_CAMEL: Record<string, string> = {
  'font-family': 'fontFamily', 'font-size': 'fontSize', 'font-weight': 'fontWeight',
  'font-style': 'fontStyle', 'font-variant': 'fontVariant', 'color': 'color',
  'text-align': 'textAlign', 'text-decoration': 'textDecoration',
  'text-transform': 'textTransform', 'text-indent': 'textIndent',
  'line-height': 'lineHeight', 'letter-spacing': 'letterSpacing',
  'word-spacing': 'wordSpacing', 'white-space': 'whiteSpace',
  'word-break': 'wordBreak', 'overflow-wrap': 'overflowWrap', 'direction': 'direction',
};

/** 从 HTML 内容的 style 属性中提取文字排版 CSS 属性，转为 camelCase */
function extractTextCSSFromHTML(html: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!html) return result;
  const styleRegex = /style="([^"]*)"/gi;
  let match;
  while ((match = styleRegex.exec(html)) !== null) {
    for (const decl of match[1].split(';')) {
      const colonIdx = decl.indexOf(':');
      if (colonIdx === -1) continue;
      const prop = decl.substring(0, colonIdx).trim().toLowerCase();
      const val = decl.substring(colonIdx + 1).trim();
      const camel = CSS_TO_CAMEL[prop];
      if (camel && val && TEXT_STYLE_KEYS.has(camel) && !result[camel]) {
        result[camel] = val;
      }
    }
  }
  return result;
}

/** 从 HTML 内容中移除所有文字排版相关的内联 CSS 声明 */
function stripTextCSSFromHTML(html: string | undefined): string {
  if (!html) return '';
  // 匹配 style="..." 属性，移除其中匹配的文字排版声明
  return html.replace(/style="([^"]*)"/gi, (_full: string, declarations: string) => {
    const parts = declarations.split(';').filter((d) => {
      const colonIdx = d.indexOf(':');
      if (colonIdx === -1) return true; // malformed, keep
      const prop = d.substring(0, colonIdx).trim().toLowerCase();
      const camel = CSS_TO_CAMEL[prop];
      return !camel || !TEXT_STYLE_KEYS.has(camel);
    });
    const remaining = parts.join(';').trim();
    return remaining ? `style="${remaining}"` : '';
  });
}

export function handleCopyTextStyle(params: CopyTextStyleParams, modules: ResumeModule[]): ToolResult {
  const source = findModuleById(modules, params.source_id);
  if (!source) {
    return {
      success: false,
      code: 'MODULE_NOT_FOUND',
      message: `copy_text_style: 源模块 ${params.source_id} 不存在`,
      fix: '请检查源模块 id 是否正确。',
      originalModules: modules,
    };
  }

  const target = findModuleById(modules, params.target_id);
  if (!target) {
    return {
      success: false,
      code: 'MODULE_NOT_FOUND',
      message: `copy_text_style: 目标模块 ${params.target_id} 不存在`,
      fix: '请检查目标模块 id 是否正确。',
      originalModules: modules,
    };
  }

  if (params.source_id === params.target_id) {
    return {
      success: false,
      code: 'SAME_MODULE',
      message: 'copy_text_style: 源模块和目标模块相同，无需复制',
      fix: '请选择不同的模块。',
      originalModules: modules,
    };
  }

  // 1) 从 module.style 提取文字排版属性
  const textStyle: Record<string, string> = {};
  if (source.style) {
    for (const key of Object.keys(source.style)) {
      if (TEXT_STYLE_KEYS.has(key)) {
        textStyle[key] = source.style[key];
      }
    }
  }

  // 2) 从 HTML 内联样式中补充未在 module.style 中出现的文字属性
  const htmlTextStyle = extractTextCSSFromHTML(source.content as string | undefined);
  for (const [key, val] of Object.entries(htmlTextStyle)) {
    if (!textStyle[key]) {
      textStyle[key] = val;
    }
  }

  const commands: Command[] = [];

  // 3) 将合并后的文字样式写入目标 module.style
  if (Object.keys(textStyle).length > 0) {
    commands.push({
      action: 'setStyle',
      params: { id: params.target_id, style: textStyle },
    });
  }

  // 4) 清除目标 HTML 中的内联文字样式，使 module.style 生效
  if (target.content) {
    const stripped = stripTextCSSFromHTML(target.content as string);
    if (stripped !== target.content) {
      commands.push({
        action: 'setContent',
        params: { id: params.target_id, content: stripped },
      });
    }
  }

  if (commands.length === 0) {
    return {
      success: false,
      code: 'NO_STYLE',
      message: `copy_text_style: 源模块 ${params.source_id} 没有可复制的文字样式（module.style 和 HTML 内联样式中均未找到）`,
      fix: '源模块可能没有设置任何文字样式属性。',
      originalModules: modules,
    };
  }

  const result = executeCommands(modules, commands);
  const copied = Object.keys(textStyle).join(', ');
  return toToolResult(result, modules, `已将模块 ${params.source_id} 的文字样式（${copied || '无'}）复制到 ${params.target_id}`);
}


export function handleClearCanvas(_params: ClearCanvasParams, modules: ResumeModule[]): ToolResult {
  if (modules.length === 0) {
    return toToolResult(
      { newModules: [], errors: [] },
      modules,
      '画布已经为空，无需清空。',
    );
  }

  const commands: Command[] = modules.map((m) => ({
    action: 'removeModule',
    params: { id: m.id },
  }));

  const result = executeCommands(modules, commands);
  return toToolResult(result, modules, '画布已清空');
}

export function handleMoveModule(params: MoveModuleParams, modules: ResumeModule[]): ToolResult {
  const cmd: Command = {
    action: 'moveModule',
    params: { id: params.id, newParentId: params.parent_id || null, index: params.index },
  };
  return toToolResult(executeCommands(modules, [cmd]), modules);
}

export function handleDuplicateModule(params: DuplicateModuleParams, modules: ResumeModule[]): ToolResult {
  // 查找目标模块
  const target = findModuleById(modules, params.id);
  if (!target) {
    return {
      success: false,
      code: 'MODULE_NOT_FOUND',
      message: `复制失败：模块 "${params.id}" 不存在。`,
      fix: `请检查 id 是否正确。当前画布中可用的模块 id 需来自「当前画布」列表。`,
      originalModules: modules,
    };
  }

  // 深拷贝并生成新 id
  const newId = generateId();
  const deepClone = (node: ResumeModule, parentId?: string): ResumeModule => ({
    ...node,
    id: node.id === target.id ? newId : generateId(),
    parentId: parentId || node.parentId,
    children: (node.children || []).map(c => deepClone(c, node.id === target.id ? newId : c.parentId)),
  });

  const clone = deepClone(target, target.parentId);
  const result = executeCommands(modules, [{
    action: 'addModule',
    params: {
      type: clone.type,
      styleId: clone.styleId,
      style: clone.style,
      content: clone.content,
      name: clone.name,
      jobTitle: clone.jobTitle,
      birth: clone.birth,
      phone: clone.phone,
      email: clone.email,
      title: clone.title,
      parentId: clone.parentId,
      children: clone.children?.map(c => ({
        action: 'addModule' as const,
        params: {
          type: c.type,
          styleId: c.styleId,
          style: c.style,
          content: c.content,
          name: c.name,
          jobTitle: c.jobTitle,
          birth: c.birth,
          phone: c.phone,
          email: c.email,
          title: c.title,
          children: c.children?.map(gc => ({
            action: 'addModule' as const,
            params: {
              type: gc.type,
              styleId: gc.styleId,
              style: gc.style,
              content: gc.content,
            },
          })),
        },
      })),
    },
  }]);

  return toToolResult(result, modules);
}

export function handleApplyTemplate(params: ApplyTemplateParams, modules: ResumeModule[]): ToolResult {
  const template = loadTemplate(params.name);
  if (!template) {
    return {
      success: false,
      code: 'TEMPLATE_NOT_FOUND',
      message: `模板 "${params.name}" 不存在。`,
      fix: '可用的模板有: simple（简约）、classic（经典）。请使用 apply_template(name: "simple") 或 apply_template(name: "classic")。',
      originalModules: modules,
    };
  }

  // 清空画布并导入模板模块
  const store = useResumeStore.getState();
  store.importModules([]);

  const commands: Command[] = template.modules.map(mod => ({
    action: 'addModule' as const,
    tempId: mod.tempId,
    params: {
      type: mod.type,
      styleId: mod.styleId,
      style: mod.style,
      content: mod.content,
      name: mod.name,
      jobTitle: mod.jobTitle,
      birth: mod.birth,
      phone: mod.phone,
      email: mod.email,
      title: mod.title,
      children: mod.children?.map(c => ({
        action: 'addModule' as const,
        tempId: c.tempId,
        params: {
          type: c.type,
          styleId: c.styleId,
          style: c.style,
          content: c.content,
          name: c.name,
          jobTitle: c.jobTitle,
          birth: c.birth,
          phone: c.phone,
          email: c.email,
          title: c.title,
          children: c.children?.map(gc => ({
            action: 'addModule' as const,
            tempId: gc.tempId,
            params: {
              type: gc.type,
              styleId: gc.styleId,
              style: gc.style,
              content: gc.content,
              name: gc.name,
              jobTitle: gc.jobTitle,
              birth: gc.birth,
              phone: gc.phone,
              email: gc.email,
              title: gc.title,
              children: gc.children?.map(ggc => ({
                action: 'addModule' as const,
                tempId: ggc.tempId,
                params: {
                  type: ggc.type,
                  styleId: ggc.styleId,
                  style: ggc.style,
                  content: ggc.content,
                  name: ggc.name,
                  jobTitle: ggc.jobTitle,
                  birth: ggc.birth,
                  phone: ggc.phone,
                  email: ggc.email,
                  title: ggc.title,
                },
              })),
            },
          })),
        },
      })),
    },
  }));

  const result = executeCommands([], commands);
  store.importModules(result.newModules);
  return { success: true, newModules: result.newModules, summary: `已应用「${params.name}」模板，共 ${result.newModules.length} 个模块。` };
}

export function handleExportPdf(_modules: ResumeModule[]): ToolResult {
  try {
    exportPDF();
    return { success: true, newModules: _modules, summary: 'PDF 打印已触发。' };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      code: 'EXPORT_ERROR',
      message: `导出 PDF 失败：${errMsg}`,
      fix: '请确认画布中有内容，然后重试。如果问题持续，请刷新页面。',
      originalModules: _modules,
    };
  }
}

export async function handleExecuteSkill(
  params: ExecuteSkillParams,
  modules: ResumeModule[],
  skillCtx: SkillContext,
): Promise<ToolResult> {
  try {
    await executeSkill(params.name, params.params || {}, skillCtx);
    // 技能执行后模块可能已通过 ctx.importModules 更新
    const store = useResumeStore.getState();
    return { success: true, newModules: store.modules, summary: `技能「${params.name}」执行完成。` };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      code: 'SKILL_ERROR',
      message: `技能 "${params.name}" 执行失败：${errMsg}`,
      fix: '请检查技能名称和参数是否正确，可用的技能有: generate-resume, polish-text, evaluate-resume, apply-theme, smart-fill, import-resume。',
      originalModules: modules,
    };
  }
}
