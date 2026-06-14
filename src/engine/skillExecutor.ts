// src/engine/skillExecutor.ts
import JSON5 from 'json5';
import { loadTemplate, type TemplateModule } from './templates';
import { executeCommands, type Command } from './commandExecutor';
import type { ResumeModule } from '../store/useResumeStore';
import { useResumeStore } from '../store/useResumeStore';
import { findModuleById } from '../utils/moduleUtils';
import type { ParsedResume, LayoutTree, LayoutTreeNode } from '../utils/resumeParser';
import { getUploadedFile } from '../utils/aiConfig';

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

    // 填充内容
    if (node.ref) {
      const val = resolveRef(node.ref);
      const isPlainTextField = ['name', 'jobTitle', 'birth', 'phone', 'email'].includes(node.ref);

      if (node.type === 'text' || node.type === 'heading') {
        // 个人信息是纯文本需转义；模块内容是 HTML 直接使用
        (cmd.params as Record<string, unknown>).content = isPlainTextField
          ? '<p>' + esc(val) + '</p>'
          : (val || '<p></p>');
      } else if (node.type === 'list') {
        (cmd.params as Record<string, unknown>).content = val || '<ul><li></li></ul>';
      } else if (node.type === 'image') {
        (cmd.params as Record<string, unknown>).content = val;
      }

      // 个人信息字段同步到模块属性
      if (isPlainTextField) {
        (cmd.params as Record<string, unknown>)[node.ref] = val;
      }
    }

    // 容器属性
    if (node.type === 'flex') {
      baseStyle.display = 'flex';
      baseStyle.flexDirection = node.direction || 'column';
    }
    if (node.type === 'grid') {
      baseStyle.display = 'grid';
      baseStyle.gridTemplateColumns = 'repeat(' + (node.columns || 1) + ', 1fr)';
    }
    if (node.gap) baseStyle.gap = node.gap;
    if (node.padding) baseStyle.padding = node.padding;
    if (node.lineHeight) baseStyle.lineHeight = node.lineHeight;

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

// ===== Overflow detection & compression =====

const A4_HEIGHT_PX = 794;

function estimateCommandHeight(cmd: Command): number {
  const s = (cmd.params as Record<string, unknown>).style as Record<string, string> | undefined;
  const type = (cmd.params as Record<string, unknown>).type as string;
  const content = (cmd.params as Record<string, unknown>).content as string | undefined;
  const children = (cmd.params as Record<string, unknown>).children as Command[] | undefined;
  let h = 0;

  const px = (key: string) => {
    const v = s?.[key];
    if (!v) return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const paddingV = px('paddingTop') || px('padding') || 0;
  const gap = px('gap') || 0;

  switch (type) {
    case 'text':
    case 'heading':
    case 'list': {
      const fontSize = px('fontSize') || 15;
      const lineHeight = parseFloat(s?.lineHeight || '1.5');
      const text = content?.replace(/<[^>]+>/g, '') || '';
      const lines = Math.max(1, Math.ceil(text.length / 30));
      h = fontSize * lineHeight * lines + paddingV * 2;
      break;
    }
    case 'image': {
      h = px('height') || 100;
      break;
    }
    case 'flex':
    case 'grid':
    case 'module':
    case 'header': {
      let childrenH = 0;
      if (children) {
        for (const c of children) childrenH += estimateCommandHeight(c);
      }
      const childCount = children?.length || 1;
      h = childrenH + gap * (childCount - 1) + paddingV * 2;
      break;
    }
  }
  return h;
}

function estimateTotalHeight(commands: Command[], pagePaddingTop: number, pagePaddingBottom: number): number {
  let total = pagePaddingTop + pagePaddingBottom;
  for (const cmd of commands) total += estimateCommandHeight(cmd);
  return total;
}

function compressCommandTree(cmd: Command, ratio: number): void {
  const s = (cmd.params as Record<string, unknown>).style as Record<string, string> | undefined;
  if (!s) return;

  const keys = ['padding', 'paddingTop', 'paddingBottom', 'gap', 'margin', 'marginTop', 'marginBottom'];

  for (const k of keys) {
    const v = s[k];
    if (!v) continue;
    const num = parseFloat(v);
    if (isNaN(num)) continue;

    const min = 0;
    const compressed = Math.max(min, Math.round(num * ratio));
    s[k] = compressed + 'px';
  }

  const cmdChildren = (cmd.params as Record<string, unknown>).children as Command[] | undefined;
  if (cmdChildren) {
    for (const c of cmdChildren) compressCommandTree(c, ratio);
  }
}

/** 检查命令树是否还有压缩空间 */
function canCompressMore(cmd: Command): boolean {
  const s = (cmd.params as Record<string, unknown>).style as Record<string, string> | undefined;
  if (!s) {
    const children = (cmd.params as Record<string, unknown>).children as Command[] | undefined;
    if (children) return children.some(canCompressMore);
    return false;
  }

  const keys = ['padding', 'paddingTop', 'paddingBottom', 'gap', 'margin', 'marginTop', 'marginBottom'];
  for (const k of keys) {
    const v = s[k];
    if (!v) continue;
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return true;
  }

  const cmdChildren = (cmd.params as Record<string, unknown>).children as Command[] | undefined;
  if (cmdChildren) return cmdChildren.some(canCompressMore);
  return false;
}

function applyOverflowCompression(
  commands: Command[],
  pagePaddingTop: number,
  pagePaddingBottom: number,
): { compressed: boolean; ratio: number; newPaddingTop: number; newPaddingBottom: number; gaveUp: boolean } {
  const MAX_ITERATIONS = 5;
  let padTop = pagePaddingTop;
  let padBottom = pagePaddingBottom;
  let anyCompressed = false;
  let finalRatio = 1;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const estimated = estimateTotalHeight(commands, padTop, padBottom);
    console.log('[import-resume] Iteration ' + (iter + 1) + ': estimated ' + estimated.toFixed(0) + 'px / A4=' + A4_HEIGHT_PX + 'px');

    if (estimated <= A4_HEIGHT_PX) break;

    if (!commands.some(canCompressMore) && padTop === 0 && padBottom === 0) {
      console.log('[import-resume] No more compression possible');
      break;
    }

    const ratio = A4_HEIGHT_PX / estimated * 0.95;  // 留 5% 余量避免反复
    finalRatio = ratio;
    console.log('[import-resume] Overflow, compressing with ratio: ' + ratio.toFixed(3));

    for (const cmd of commands) compressCommandTree(cmd, ratio);
    padTop = Math.max(0, Math.round(padTop * ratio));
    padBottom = Math.max(0, Math.round(padBottom * ratio));
    anyCompressed = true;
  }

  // 最后一轮检查是否仍溢出
  const finalEstimate = estimateTotalHeight(commands, padTop, padBottom);
  const gaveUp = finalEstimate > A4_HEIGHT_PX && anyCompressed;

  if (gaveUp) {
    console.warn('[import-resume] Unable to fit content within A4 after compression. Final: ' + finalEstimate.toFixed(0) + 'px');
  }

  return { compressed: anyCompressed, ratio: finalRatio, newPaddingTop: padTop, newPaddingBottom: padBottom, gaveUp };
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

  // 优先使用 AI 输出的布局树，回退到固定模板生成
  let commands: Command[];
  if (parsed.layoutTree) {
    console.log('[import-resume] AI 布局树:', JSON.stringify(parsed.layoutTree, null, 2));
    console.log('[import-resume] 使用 AI 布局树生成指令');
    commands = translateLayoutTree(parsed.layoutTree, parsed);
  } else {
    console.error('[import-resume] AI 未输出 LayoutTree，无法重建布局');
    return `简历解析失败：AI 未输出布局结构信息（LayoutTree），无法忠实复现原版排版。请重试或更换视觉模型。原始 AI 输出：${JSON.stringify(parsed).slice(0, 500)}`;
  }
  console.log('[import-resume] 生成指令数:', commands.length);

  // 溢出检测（含页边距）
  const store = useResumeStore.getState();
  const padTop = parseInt(store.pagePaddingTop || store.pagePadding) || 40;
  const padBottom = parseInt(store.pagePadding) || 40;
  const overflow = applyOverflowCompression(commands, padTop, padBottom);

  // 应用压缩后的页边距
  if (overflow.compressed) {
    useResumeStore.getState().setPagePaddingTop(String(overflow.newPaddingTop) + 'px');
    useResumeStore.getState().setPagePadding(String(overflow.newPaddingBottom) + 'px');
  }

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