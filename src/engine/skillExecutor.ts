// src/engine/skillExecutor.ts
import JSON5 from 'json5';
import { loadTemplate, type TemplateModule } from './templates';
import { executeCommands, type Command } from './commandExecutor';
import type { ResumeModule } from '../store/useResumeStore';
import { findModuleById } from '../utils/moduleUtils';
import type { ParsedResume, LayoutTree, LayoutTreeNode } from '../utils/resumeParser';
import { getUploadedFile } from '../utils/aiConfig';
import { normalizeLayoutTree } from './layoutTreeNormalizer';

export interface SkillContext {
  modules: ResumeModule[];
  importModules: (modules: ResumeModule[]) => void;
  getCanvasState: () => unknown;
  callAiForPolish: (text: string) => Promise<string>;
  callAiForEvaluate: (prompt: string, state: unknown) => Promise<string>;
  callAiForSmartFill: (sysPrompt: string, userPrompt: string) => Promise<string>;
}

type SkillHandler = (params: Record<string, unknown>, ctx: SkillContext) => Promise<string>;

const skillRegistry = new Map<string, SkillHandler>();

export function registerSkill(name: string, handler: SkillHandler) {
  skillRegistry.set(name, handler);
}


/** base64 字符串 → Blob */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteArrays: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers) as Uint8Array<ArrayBuffer>);
  }
  return new Blob(byteArrays, { type: mimeType });
}

export async function executeSkill(
  name: string,
  params: Record<string, unknown>,
  ctx: SkillContext
): Promise<string> {
  console.group(`[SkillSystem] 执行技能: ${name}`);
  console.log('[SkillSystem] 参数:', params);

  const handler = skillRegistry.get(name);
  if (!handler) {
    const err = `未知技能: ${name}`;
    console.error(`[SkillSystem] ${err}`);
    console.groupEnd();
    throw new Error(err);
  }

  try {
    const result = await handler(params, ctx);
    console.log('[SkillSystem] 技能执行结果:', result);
    console.groupEnd();
    return result;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[SkillSystem] 技能执行异常:`, message);
    console.groupEnd();
    throw e;
  }
}

// ---------- 辅助函数 ----------

function countCommands(commands: Command[]): number {
  let count = commands.length;
  for (const cmd of commands) {
    if (cmd.action === 'addModule' && cmd.params.children && Array.isArray(cmd.params.children)) {
      count += countCommands(cmd.params.children);
    }
  }
  return count;
}

function summarizeCommands(commands: Command[]): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    if (cmd.action === 'addModule' && (cmd.params.parentId === null || cmd.params.parentId === undefined)) {
      const subTotal = countCommands([cmd]);
      parts.push(`${cmd.tempId ?? '?'} 模块 ${subTotal} 条指令`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : '无顶层模块';
}

function buildCommands(modules: TemplateModule[], parentId: string | null): Command[] {
  const commands: Command[] = [];
  for (const mod of modules) {
    const cmd: Command = {
      action: 'addModule',
      tempId: mod.tempId,
      params: {
        parentId,
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
        children: mod.children ? buildCommands(mod.children, mod.tempId) : undefined,
      },
    };
    commands.push(cmd);
  }
  console.log(`[SkillSystem] 生成指令完成，共 ${commands.length} 条顶层指令，详情: ${summarizeCommands(commands)}`);
  return commands;
}

// ============== 内置元技能注册 ==============

// 1. 生成简历
registerSkill('generate-resume', async (params, ctx) => {
  const templateName = (params.template as string) || 'simple';
  const template = loadTemplate(templateName);
  if (!template) {
    const err = `模板 "${templateName}" 不存在，当前可用模板：simple, classic`;
    console.error(`[SkillSystem] ${err}`);
    return err;
  }

  const commands = buildCommands(template.modules, null);
  console.log('[SkillSystem] 即将执行指令，指令数:', countCommands(commands));

  const result = executeCommands(ctx.modules, commands);
  if (result.errors.length > 0) {
    console.error('[SkillSystem] 指令执行错误:', result.errors);
    return `生成简历时发生错误：${result.errors.map((e: {message: string}) => e.message).join('; ')}`;
  }

  console.log(`[SkillSystem] 成功生成 ${result.newModules.length} 个顶层模块，准备导入`);
  ctx.importModules(result.newModules);
  return `已生成${template.meta.name}风格的简历，包含简历头、教育背景和工作经历模块。`;
});

// 2. 润色文本
registerSkill('polish-text', async (params, ctx) => {
  const moduleId = params.moduleId as string;
  const target = findModuleById(ctx.modules, moduleId);
  if (!target) return `模块 ${moduleId} 未找到`;
  if (!target.content) return '模块无内容可润色';

  const polished = await ctx.callAiForPolish(target.content);
  const updateContent = (nodes: ResumeModule[], id: string, content: string): ResumeModule[] =>
    nodes.map(n => {
      if (n.id === id) return { ...n, content };
      if (n.children) return { ...n, children: updateContent(n.children, id, content) };
      return n;
    });
  ctx.importModules(updateContent(ctx.modules, moduleId, polished));
  return '润色完成。';
});

// 3. 简历评估
registerSkill('evaluate-resume', async (_params, ctx) => {
  const state = ctx.getCanvasState();
  const stateStr = JSON.stringify(state, null, 2);

  const evalPrompt = `你是资深简历顾问。请根据以下简历画布状态评估质量，给出改进建议。每条建议必须附带可执行的操作（tool + params），前端会将其渲染为可点击按钮。

画布状态：
${stateStr}

输出 JSON 对象（不要 markdown 代码块）：
{
  "summary": "整体评估（1-3句话）",
  "suggestions": [
    {
      "title": "建议标题（如：统一标题字号）",
      "description": "建议说明（一句话）",
      "tool": "set_style",
      "params": { "id": "模块id", "style": { "fontSize": "18px" } }
    }
  ]
}

可用工具及参数格式：
- set_style: { id, style: { key: value } }
- set_content: { id, content }
- set_property: { id, property, value }
- add_module: { styleId, title, content }
- add_text: { content, style? }
- add_heading: { content, style? }
- add_flex_inline: { children: [{type,content}], direction?, gap? }
- add_grid_inline: { children: [{type,content}], columns?, gap? }
- remove_module: { id }
- duplicate_module: { id }
- move_module: { id, parent_id?, index }

id 必须使用画布状态中的实际模块 id。`;

  const evalResult = await ctx.callAiForEvaluate(evalPrompt, stateStr);
  return evalResult;
});

// 4. 应用主题
registerSkill('apply-theme', async (params, ctx) => {
  const theme = (params.theme as string) || 'professional';
  const themeStyles: Record<string, Record<string, string>> = {
    professional: { fontFamily: 'Arial', fontSize: '16px', color: '#333' },
    creative: { fontFamily: 'Georgia', fontSize: '18px', color: '#2c3e50' },
  };
  const style = themeStyles[theme] || themeStyles.professional;
  const commands: Command[] = ctx.modules.map(mod => ({
    action: 'setStyle',
    params: { id: mod.id, style },
  }));
  const result = executeCommands(ctx.modules, commands);
  if (result.errors.length > 0) return `应用主题出错: ${result.errors.map((e: {message: string}) => e.message).join('; ')}`;
  ctx.importModules(result.newModules);
  return `已应用 ${theme} 主题。`;
});

// 5. 重排序模块（预留）
registerSkill('reorder-section', async () => '模块重排序功能已预留，请手动拖拽。');

// 6. 排序列表项（预留）
registerSkill('sort-list', async () => '列表排序功能已预留。');

// 7. 智能填充简历内容（标签版）—— 解析增强
registerSkill('smart-fill', async (params, ctx) => {
  const userInfo = params.info as string;
  if (!userInfo) return '缺少用户信息参数 (info)';

  const MODULE_STYLES = [
    { id: 'module-card', label: '卡片样式（通用）' },
    { id: 'module-timeline', label: '时间线样式（适合经历）' },
    { id: 'module-list', label: '简洁列表（适合技能）' },
    { id: 'module-plain', label: '简约无边框（适合简介）' },
  ];

  // 遍历画布树，为每个可填充的叶子节点生成唯一路径
  interface PathEntry { path: string; id: string; type: string; currentContent: string }
  const entries: PathEntry[] = [];

  function walk(nodes: ResumeModule[], ancestors: string[]) {
    for (const node of nodes) {
      let seg: string;
      const rawText = (node.content || '').replace(/<[^>]+>/g, '').trim();
      const contentSnippet = rawText.slice(0, 12) || '';

      if (node.type === 'header') {
        seg = '简历头';
      } else if (node.type === 'module') {
        seg = node.title || contentSnippet || '模块';
        if (!seg || seg === '模块标题') seg = '模块';
      } else if (node.type === 'heading') {
        seg = contentSnippet || '标题';
      } else if (node.type === 'text') {
        if (node.name && node.name !== '姓名' && node.name !== '未命名') seg = node.name;
        else if (node.jobTitle && node.jobTitle !== '求职意向') seg = '求职意向';
        else if (node.phone && node.phone !== '电话') seg = '电话';
        else if (node.email && node.email !== '邮箱') seg = '邮箱';
        else if (node.birth && node.birth !== '出生年月') seg = '出生年月';
        else if (contentSnippet) seg = contentSnippet;
        else seg = '文本';
      } else if (node.type === 'list') {
        seg = contentSnippet || '列表';
      } else if (node.type === 'image') {
        seg = '照片';
      } else {
        seg = node.type;
      }

      const rawPath = [...ancestors, seg].join(' > ');

      const isLeaf = ['text', 'heading', 'list', 'image'].includes(node.type) &&
        (!node.children || node.children.length === 0);
      if (isLeaf) {
        entries.push({
          path: rawPath,
          id: node.id,
          type: node.type,
          currentContent: contentSnippet,
        });
      }

      if (node.children && node.children.length > 0) {
        const nextAncestors = node.type === 'header' || node.type === 'module'
          ? ancestors
          : [...ancestors, seg];
        walk(node.children, nextAncestors);
      }
    }
  }

  walk(ctx.modules, []);

  // 去重
  const pathCounts = new Map<string, number>();
  for (const e of entries) {
    const count = pathCounts.get(e.path) || 0;
    pathCounts.set(e.path, count + 1);
    if (count > 0) {
      e.path = e.path + ' (' + (count + 1) + ')';
    }
  }

  // 列出画布中已有模块标题，供 AI 判断是否需要新建
  const existingTitles: string[] = [];
  function collectTitles(nodes: ResumeModule[]) {
    for (const n of nodes) {
      if (n.type === 'module' && n.title) existingTitles.push(n.title);
      if (n.children) collectTitles(n.children);
    }
  }
  collectTitles(ctx.modules);
  const existingTitleList = existingTitles.length > 0
    ? existingTitles.map(t => `"${t}"`).join(', ')
    : '（无）';

  const pathList = entries.map(e =>
    `- [${e.path}] (${e.type})\n  当前: ${e.currentContent || '(空)'}`
  ).join('\n');

  const systemPrompt = `你是简历填充专家。你需要从用户背景中提取信息，按以下规则操作：

## 画布中已有的可填充位置
${pathList}

已有模块标题: ${existingTitleList}

## 用户背景
${userInfo}

## 输出 JSON 数组，每项二选一：

1. **填充已有位置**: 用 path 匹配上面列表中的位置
   { "path": "简历头 > 张三", "content": "李四" }

2. **创建新模块**: 当用户信息中没有已有模块能匹配时（如用户提到教育背景但画布无此模块）
   { "action": "add_module", "title": "教育背景", "styleId": "module-card", "content": "<p>清华大学 · 计算机科学 · 2020年毕业</p>" }

可用 styleId: ${MODULE_STYLES.map(s => s.id + '(' + s.label + ')').join(', ')}

## 严格规则
- 路径必须完全匹配上面列表中的 path 字符串，不要自己编造
- 已有模块能匹配的信息 → 必须用 path 填充，不要新建重复模块
- 已有模块无法匹配的信息 → 必须用 action: "add_module" 新建
- content 支持 HTML 标签（<p><ul><li><strong>等），多条项目用 <ul><li> 列表
- 每个 add_module 的 content 应包含完整信息（不需要再拆分 title 和 content——title 已在 action 中指定）
- 只输出 JSON 数组，不要额外文字`;

  const aiReply = await ctx.callAiForSmartFill(systemPrompt, '请生成填充内容');
  const cleaned = aiReply.replace(/```json\s*|\s*```/g, '').trim();

  let fillList: ({ path: string; content: string } | { action: string; title: string; styleId: string; content: string })[];
  try {
    fillList = JSON5.parse(cleaned);
  } catch {
    try {
      fillList = JSON.parse(cleaned);
    } catch {
      const fixed = cleaned.replace(/,\s*([}\]])/g, '$1');
      try {
        fillList = JSON5.parse(fixed);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        return `智能填充解析失败：${errMsg}`;
      }
    }
  }

  if (!Array.isArray(fillList)) return 'AI 返回格式不正确，请重试。';

  const pathToId = new Map<string, string>();
  for (const e of entries) pathToId.set(e.path, e.id);

  const fillCommands: Command[] = [];
  const newModuleCommands: Command[] = [];
  const unmatched: string[] = [];

  for (const item of fillList) {
    if ('path' in item) {
      const realId = pathToId.get(item.path);
      if (!realId) {
        unmatched.push(item.path);
        continue;
      }
      fillCommands.push({
        action: 'setContent',
        params: { id: realId, content: item.content || '' },
      });
    } else if ('action' in item && item.action === 'add_module') {
      // 构造 addModule 指令：创建 module 容器，内含 heading + text
      const modTempId = 'sf-mod-' + Math.random().toString(36).slice(2, 8);
      newModuleCommands.push({
        action: 'addModule',
        tempId: modTempId,
        params: {
          type: 'module',
          styleId: item.styleId || 'module-card',
          title: item.title,
          content: item.content || '',
          style: {
            display: 'flex', flexDirection: 'column', gap: '12px',
            padding: '20px', backgroundColor: '#ffffff',
            borderRadius: '12px', border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          },
          children: [
            {
              action: 'addModule' as const,
              tempId: modTempId + '-h',
              params: {
                type: 'heading',
                styleId: 'heading-default',
                style: { fontSize: '20px', fontWeight: '700', color: '#0f172a', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9' },
                content: '<p>' + (item.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>',
                title: item.title,
              },
            },
            {
              action: 'addModule' as const,
              tempId: modTempId + '-t',
              params: {
                type: 'text',
                styleId: 'text-default',
                style: { fontSize: '15px', color: '#334155', lineHeight: '1.6' },
                content: item.content || '',
              },
            },
          ],
        },
      });
    }
  }

  if (unmatched.length > 0) {
    console.warn('[smart-fill] 未匹配的路径:', unmatched);
  }

  const allCommands = [...newModuleCommands, ...fillCommands];
  if (allCommands.length === 0) {
    return `未生成任何有效操作。AI 返回的内容无法匹配画布模块。`;
  }

  const result = executeCommands(ctx.modules, allCommands);
  if (result.errors.length > 0) return `填充失败：${result.errors.map((e: {message: string}) => e.message).join('; ')}`;
  ctx.importModules(result.newModules);

  const newCount = newModuleCommands.length;
  const fillCount = fillCommands.length;
  const parts: string[] = [];
  if (fillCount > 0) parts.push(`填充了 ${fillCount} 个已有模块`);
  if (newCount > 0) parts.push(`新建了 ${newCount} 个模块`);
  return (parts.length > 0 ? parts.join('，') : '未执行任何操作') + '。';
});

// ===== 布局树翻译器 =====

/** 将 AI 输出的布局树翻译为 Command 数组 */
function translateLayoutTree(tree: LayoutTree, parsed: ParsedResume): Command[] {
  const commands: Command[] = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${idCounter++}`;

  /** 从 parsed 中取 ref 指向的值 */
  function resolveRef(ref: string): string {
    // modules.N.entries.M.field
    const entryMatch = ref.match(/^modules\.(\d+)\.entries\.(\d+)\.(.+)$/);
    if (entryMatch) {
      const modIdx = parseInt(entryMatch[1], 10);
      const entryIdx = parseInt(entryMatch[2], 10);
      const field = entryMatch[3];
      const mod = parsed.data?.modules?.[modIdx];
      if (!mod?.entries) return '';
      return mod.entries[entryIdx]?.[field] || '';
    }
    // modules.N.field
    const modMatch = ref.match(/^modules\.(\d+)\.(.+)$/);
    if (modMatch) {
      const idx = parseInt(modMatch[1], 10);
      const field = modMatch[2];
      const mod = parsed.data?.modules?.[idx];
      if (!mod) return '';
      if (field === 'content') return mod.content || '';
      if (field === 'title') return mod.title || '';
      return (mod as unknown as Record<string, string>)[field] || '';
    }
    // top-level field in data
    return (parsed.data as Record<string, unknown>)?.[ref] as string || '';
  }


  function esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function walk(node: LayoutTreeNode, prefix: string): Command {
    const id = nextId(prefix);
    const baseStyle: Record<string, string> = { ...node.style };

    // 公共样式默认值
    if (node.type === 'text' || node.type === 'heading' || node.type === 'list') {
      baseStyle.fontSize = baseStyle.fontSize || '15px';
      baseStyle.color = baseStyle.color || '#334155';
      if (node.type === 'heading') {
        baseStyle.fontWeight = baseStyle.fontWeight || '700';
        baseStyle.fontSize = baseStyle.fontSize || '20px';
      }
    }

    const cmd: Command = {
      action: 'addModule',
      tempId: id,
      params: {
        type: node.type,
        styleId: node.type + '-default',
        style: baseStyle,
      } as Record<string, unknown>,
    };

    // 填充内容：优先使用 normalizeLayoutTree 已解析的 node.content，
    // 仅当 content 为空且有 ref 时才回退到 ref 解析
    if (node.content) {
      // 内容已由 normalizeLayoutTree 解析，直接使用
      if (node.type === 'text' || node.type === 'heading') {
        const isPlainTextField = node.ref && ['name', 'jobTitle', 'birth', 'phone', 'email'].includes(node.ref);
        (cmd.params as Record<string, unknown>).content = isPlainTextField
          ? '<p>' + esc(node.content) + '</p>'
          : node.content;
        if (isPlainTextField && node.ref) {
          (cmd.params as Record<string, unknown>)[node.ref] = node.content;
        }
      } else if (node.type === 'list') {
        (cmd.params as Record<string, unknown>).content = node.content;
      } else if (node.type === 'image') {
        (cmd.params as Record<string, unknown>).content = node.content;
      }
    } else if (node.ref) {
      // 回退：ref 解析（normalizeLayoutTree 未找到对应 data）
      const val = resolveRef(node.ref);
      const isPlainTextField = ['name', 'jobTitle', 'birth', 'phone', 'email'].includes(node.ref);

      if (node.type === 'text' || node.type === 'heading') {
        (cmd.params as Record<string, unknown>).content = isPlainTextField
          ? '<p>' + esc(val) + '</p>'
          : (val || '<p></p>');
      } else if (node.type === 'list') {
        (cmd.params as Record<string, unknown>).content = val || '<ul><li></li></ul>';
      } else if (node.type === 'image') {
        (cmd.params as Record<string, unknown>).content = val;
      }

      if (isPlainTextField) {
        (cmd.params as Record<string, unknown>)[node.ref] = val;
      }
    }

    // 容器属性：显式字段优先，但不覆盖 AI 在 style 中已设置的值
    if (node.type === 'flex') {
      baseStyle.display = baseStyle.display || 'flex';
      baseStyle.flexDirection = node.direction || baseStyle.flexDirection || 'column';
    }
    if (node.type === 'grid') {
      baseStyle.display = baseStyle.display || 'grid';
      const cols = node.columns || 1;
      if (!baseStyle.gridTemplateColumns) {
        baseStyle.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
      }
    }
    // 显式字段不覆盖 style 中已有值（style 由 normalizeLayoutTree 保证完整性）
    const explicitStyle = baseStyle; // already has node.style + defaults merged
    if (node.gap) explicitStyle.gap = node.gap;
    if (node.padding) explicitStyle.padding = node.padding;
    if (node.lineHeight) explicitStyle.lineHeight = node.lineHeight;

    // 递归子节点
    if (node.children && node.children.length > 0) {
      const children = node.children.map((c, i) => walk(c, prefix + '-c' + i));
      (cmd.params as Record<string, unknown>).children = children;
    }

    return cmd;
  }

  // header
  if (tree.header) {
    commands.push(walk(tree.header, 'h'));
  }

  // modules
  if (tree.modules) {
    for (let i = 0; i < tree.modules.length; i++) {
      commands.push(walk(tree.modules[i], 'mod' + i));
    }
  }

  return commands;
}

// ===== Import skill =====

registerSkill('import-resume', async (_params, ctx) => {
  const uploaded = getUploadedFile();

  if (!uploaded || !uploaded.base64) {
    return '没有找到上传的简历文件，请重新上传。';
  }

  const { fileName, fileType } = uploaded;
  let fileBase64 = uploaded.base64.replace(/\s/g, '');
  while (fileBase64.length % 4 !== 0) {
    fileBase64 += '=';
  }

  const MAX_BASE64_LENGTH = 6_800_000;
  if (fileBase64.length > MAX_BASE64_LENGTH) {
    return '文件过大，请压缩到 5MB 以内或转为图片后上传。';
  }

  if (fileType === 'application/pdf' ||
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'PDF/Word 文件暂不支持，请先将简历转为 PNG 或 JPG 图片后上传。';
  }

  let parseResumeFile: (file: File) => Promise<ParsedResume>;
  try {
    const module = await import('../utils/resumeParser');
    parseResumeFile = module.parseResumeFile;
  } catch {
    return '简历解析模块加载失败，请检查项目结构。';
  }

  const blob = base64ToBlob(fileBase64, fileType);
  const file = new File([blob], fileName, { type: fileType });

  let parsed: ParsedResume;
  try {
    parsed = await parseResumeFile(file);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return `文件解析失败：${errMsg}`;
  }

  if (!parsed) return '解析结果为空。';

  // 输出解析摘要，便于诊断
  console.log('[import-resume] 解析结果:', JSON.stringify({
    name: parsed.data?.name,
    jobTitle: parsed.data?.jobTitle,
    phone: parsed.data?.phone,
    email: parsed.data?.email,
    moduleCount: parsed.data?.modules?.length || 0,
    hasLayoutTree: !!parsed.layoutTree,
  }, null, 2));

  // parse → normalize → compress → translate → execute
  if (!parsed.layoutTree) {
    console.error('[import-resume] AI 未输出 LayoutTree，无法重建布局');
    return `简历解析失败：AI 未输出布局结构信息（LayoutTree），无法忠实复现原版排版。请重试或更换视觉模型。原始 AI 输出：${JSON.stringify(parsed).slice(0, 500)}`;
  }

  console.log('[import-resume] AI 布局树:', JSON.stringify(parsed.layoutTree, null, 2));

  // 1. 规范化 LayoutTree
  const normalized = normalizeLayoutTree(parsed.layoutTree, parsed.data);
  console.log('[import-resume] 规范化后模块数:', normalized.modules.length);

  // 2. 翻译为 Command 数组（跳过预处理压缩，宽度缩放后统一处理高度）
  const commands = translateLayoutTree(
    { header: normalized.header, modules: normalized.modules },
    parsed,
  );
  console.log('[import-resume] 生成指令数:', commands.length);

  // 3. 执行
  const result = executeCommands(ctx.modules, commands);
  console.log('[import-resume] 生成的模块数:', result.newModules.length);
  if (result.errors.length > 0) {
    return `构建简历时出错：${result.errors.map((e: {message: string}) => e.message).join('; ')}`;
  }

  // 4. 先导入画布，用真实 React 渲染测量实际尺寸
  ctx.importModules(result.newModules);

  // 等待 React 渲染完成（两帧确保 dnd-kit + TipTap 全部就绪）
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  // 测量 A4 内容区 (#resume-preview) 的实际渲染尺寸
  const pageEl = document.querySelector('#resume-preview') as HTMLElement | null;
  const canvasW = pageEl?.scrollWidth || 794;
  const canvasH = pageEl?.scrollHeight || 1123;
  console.log('[import-resume] 画布实测宽:', canvasW, 'px | 高:', canvasH, 'px (A4: 794×1123)');

  const A4_W = 794, A4_H = 1123;
  const overflowW = canvasW > A4_W + 2;
  const overflowH = canvasH > A4_H + 2;
  console.log('[import-resume] 宽度溢出:', overflowW, '| 高度溢出:', overflowH);

  console.log('[import-resume] （缩放逻辑已暂时关闭，仅测量诊断）');

  return `简历导入完成，已导入 ${result.newModules.length} 个模块。`;

});