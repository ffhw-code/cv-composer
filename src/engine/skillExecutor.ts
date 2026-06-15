// src/engine/skillExecutor.ts
import JSON5 from 'json5';
import { loadTemplate, type TemplateModule } from './templates';
import { executeCommands, type Command } from './commandExecutor';
import type { ResumeModule } from '../store/useResumeStore';
import { useResumeStore } from '../store/useResumeStore';
import { findModuleById } from '../utils/moduleUtils';
import type { ParsedResume, LayoutTree, LayoutTreeNode } from '../utils/resumeParser';
import { getUploadedFile } from '../utils/aiConfig';
import { normalizeLayoutTree } from './layoutTreeNormalizer';
import { applyOverflowCompression } from './layoutTreeNormalizer';

export interface SkillContext {
  modules: ResumeModule[];
  importModules: (modules: ResumeModule[]) => void;
  getCanvasState: () => unknown;
  callAiForPolish: (text: string) => Promise<string>;
  callAiForEvaluate: (state: unknown) => Promise<string>;
  callAiForSmartFill: (sysPrompt: string, userPrompt: string) => Promise<string>;
}

type SkillHandler = (params: Record<string, unknown>, ctx: SkillContext) => Promise<string>;

const skillRegistry = new Map<string, SkillHandler>();

export function registerSkill(name: string, handler: SkillHandler) {
  skillRegistry.set(name, handler);
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
  return await ctx.callAiForEvaluate(state);
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

  const getModuleLabelMap = (): { label: string; id: string; type: string; currentContent: string }[] => {
    const items: { label: string; id: string; type: string; currentContent: string }[] = [];
    const usedLabels = new Set<string>();
    const generateUniqueLabel = (desired: string): string => {
      let label = desired;
      let counter = 1;
      while (usedLabels.has(label)) {
        label = `${desired} (${counter++})`;
      }
      usedLabels.add(label);
      return label;
    };
    interface ParsedNode { id?: string; name?: string; title?: string; content?: string; jobTitle?: string; type?: string; children?: ParsedNode[] }
    const extract = (nodes: ParsedNode[], parentNode?: ParsedNode) => {
      for (const n of nodes) {
        const name = n.name || '';
        const title = n.title || '';
        const content = n.content || '';
        const jobTitle = n.jobTitle || '';
        // eslint-disable-next-line no-useless-assignment
        let label = '';
        if (name && name !== '未命名' && name !== '姓名') label = name;
        else if (title) label = title;
        else if (jobTitle && jobTitle !== '求职意向') label = jobTitle;
        else if (parentNode?.title && (n.type === 'heading' || n.type === 'text'))
          label = n.type === 'heading' ? `${parentNode.title} 标题` : `${parentNode.title} 内容`;
        else if (content.trim().length > 0) label = content.trim().substring(0, 20);
        else label = n.type || '';
        label = generateUniqueLabel(label);
        items.push({ label, id: n.id || '', type: n.type || 'text', currentContent: content || name || '' });
        if (n.children?.length) extract(n.children, n);
      }
    };
    extract(ctx.modules);
    return items;
  };

  const labelMap = getModuleLabelMap();
  const labelList = labelMap.map(m =>
    `- [标签] ${m.label}\n  当前内容: ${m.currentContent || '(空)'}\n  类型: ${m.type}`
  ).join('\n');

  const systemPrompt = `你是简历填充专家。当前画布模块如下：
${labelList}

用户信息：${userInfo}

请生成 JSON 数组：
[
  { "label": "模块标签", "content": "新内容" },
  ...
]
只使用上面标签，只输出 JSON。`;

  const aiReply = await ctx.callAiForSmartFill(systemPrompt, '请生成填充内容');
  const cleaned = aiReply.replace(/```json\s*|\s*```/g, '').trim();
  // eslint-disable-next-line no-useless-assignment
  let fillList: { label: string; content: string }[] | null = null;
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

  const labelToId = new Map<string, string>();
  for (const item of labelMap) labelToId.set(item.label, item.id);

  const commands: Command[] = [];
  for (const fill of fillList) {
    const realId = labelToId.get(fill.label);
    if (!realId) continue;
    commands.push({
      action: 'setContent',
      params: { id: realId, content: fill.content || '' },
    });
  }

  if (commands.length === 0) return '没有有效填充指令，请检查标签匹配。';

  const result = executeCommands(ctx.modules, commands);
  if (result.errors.length > 0) return `填充失败：${result.errors.map((e: {message: string}) => e.message).join('; ')}`;
  ctx.importModules(result.newModules);
  return `智能填充完成，已更新 ${commands.length} 个模块。`;
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

  // 2. LayoutTree 层级溢出压缩
  const store = useResumeStore.getState();
  const padTop = parseInt(store.pagePaddingTop || store.pagePadding) || 40;
  const padBottom = parseInt(store.pagePadding) || 40;
  const overflow = applyOverflowCompression(
    [normalized.header, ...normalized.modules],
    padTop,
    padBottom,
  );

  if (overflow.compressed) {
    useResumeStore.getState().setPagePaddingTop(String(overflow.newPaddingTop) + 'px');
    useResumeStore.getState().setPagePadding(String(overflow.newPaddingBottom) + 'px');
  }

  // 3. 翻译为 Command 数组
  const commands = translateLayoutTree(
    { header: normalized.header, modules: normalized.modules },
    parsed,
  );
  console.log('[import-resume] 生成指令数:', commands.length);

  // 4. 执行
  const result = executeCommands(ctx.modules, commands);
  console.log('[import-resume] 生成的模块数:', result.newModules.length);
  if (result.errors.length > 0) {
    return `构建简历时出错：${result.errors.map((e: {message: string}) => e.message).join('; ')}`;
  }

  ctx.importModules(result.newModules);
  let compressNote = '';
  if (overflow.gaveUp) {
    compressNote = ' (警告：内容过多，压缩后仍超出 A4 页面，请手动调整间距或精简内容)';
  } else if (overflow.compressed) {
    compressNote = ' (内容溢出，已自动压缩间距和页边距)';
  }
  return `简历导入完成，已导入 ${result.newModules.length} 个模块。${compressNote}`;

});

// 辅助：base64 转 Blob（清理后转换）
function base64ToBlob(base64: string, mimeType: string): Blob {
  let clean = base64.replace(/\s/g, '');
  while (clean.length % 4 !== 0) {
    clean += '=';
  }
  const byteCharacters = atob(clean);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}