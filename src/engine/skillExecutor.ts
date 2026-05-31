// src/engine/skillExecutor.ts
import JSON5 from 'json5';
import { loadTemplate, type TemplateModule } from './templates';
import { executeCommands, type Command } from './commandExecutor';
import type { ResumeModule } from '../store/useResumeStore';
import { findModuleById } from '../utils/moduleUtils';
import type { ParsedResume } from '../utils/resumeParser';
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
    return `生成简历时发生错误：${result.errors.join('; ')}`;
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
  if (result.errors.length > 0) return `应用主题出错: ${result.errors.join('; ')}`;
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
  if (result.errors.length > 0) return `填充失败：${result.errors.join('; ')}`;
  ctx.importModules(result.newModules);
  return `智能填充完成，已更新 ${commands.length} 个模块。`;
});

// 从 ParsedResume 动态生成指令数组（不依赖模板，有几个字段创建几个控件）
function buildResumeCommands(parsed: ParsedResume): Command[] {
  function esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const commands: Command[] = [];

  // --- 收集 header 信息字段（仅包含有数据的） ---
  const infoFields: { label: string; value: string }[] = [];
  if (parsed.jobTitle) infoFields.push({ label: '求职意向', value: parsed.jobTitle });
  if (parsed.birth) infoFields.push({ label: '出生年月', value: parsed.birth });
  if (parsed.phone) infoFields.push({ label: '电话', value: parsed.phone });
  if (parsed.email) infoFields.push({ label: '邮箱', value: parsed.email });

  // --- 构建 header 的 info grid（仅当有字段时） ---
  const gridChildren: Command[] = infoFields.map((f, i) => ({
    action: 'addModule' as const,
    tempId: `h-field-${i}`,
    params: {
      type: 'text',
      styleId: 'text-default',
      style: { fontSize: '15px', color: '#4a5568' },
      content: `<p>${esc(f.label)}：${esc(f.value)}</p>`,
    },
  }));

  // --- 构建 header 信息容器子控件 ---
  const infoFlexChildren: Command[] = [];

  if (parsed.name) {
    infoFlexChildren.push({
      action: 'addModule' as const,
      tempId: 'h-name',
      params: {
        type: 'text',
        styleId: 'text-default',
        style: { fontSize: '24px', fontWeight: '700', color: '#1a202c' },
        content: `<p>${esc(parsed.name)}</p>`,
        name: parsed.name,
      },
    });
  }

  if (gridChildren.length > 0) {
    const cols = gridChildren.length === 1 ? '1fr' : '1fr 1fr';
    infoFlexChildren.push({
      action: 'addModule' as const,
      tempId: 'h-grid',
      params: {
        type: 'grid',
        styleId: 'grid-default',
        style: { gridTemplateColumns: cols, gap: '12px' },
        children: gridChildren,
      },
    });
  }

  // --- header 容器 ---
  const headerChildren: Command[] = [
    {
      action: 'addModule' as const,
      tempId: 'h-img',
      params: {
        type: 'image',
        styleId: 'image-default',
        style: { width: '100px', height: '130px', borderRadius: '8px', objectFit: 'cover' },
        content: '',
      },
    },
  ];

  if (infoFlexChildren.length > 0) {
    headerChildren.push({
      action: 'addModule' as const,
      tempId: 'h-info',
      params: {
        type: 'flex',
        styleId: 'flex-default',
        style: { flexDirection: 'column', gap: '12px', flex: '1' },
        children: infoFlexChildren,
      },
    });
  }

  commands.push({
    action: 'addModule',
    tempId: 'header',
    params: {
      type: 'header',
      styleId: 'header-classic',
      style: {
        display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '20px',
        padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px',
        border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      },
      children: headerChildren,
    },
  });

  // --- 模块容器（每个 parsed.modules 条目一个） ---
  const moduleStyles = [
    { id: 'module-card', style: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' } as Record<string, string> },
    { id: 'module-timeline', style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0 16px 24px', borderLeft: '4px solid #3b82f6' } as Record<string, string> },
  ];

  const modules = parsed.modules || [];
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const sty = moduleStyles[i % moduleStyles.length];
    const raw = (mod.content || '').trim();
    const isList = raw.startsWith('<ul') || raw.startsWith('<ol') || raw.startsWith('- ') || raw.startsWith('• ');

    const modChildren: Command[] = [
      {
        action: 'addModule',
        tempId: `mod-${i}-h`,
        params: {
          type: 'heading',
          styleId: 'heading-default',
          style: { fontSize: '20px', fontWeight: '700', color: '#0f172a', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9' },
          content: `<p>${esc(mod.title)}</p>`,
        },
      },
      {
        action: 'addModule',
        tempId: `mod-${i}-t`,
        params: {
          type: isList ? 'list' : 'text',
          styleId: isList ? 'list-default' : 'text-default',
          style: { fontSize: '15px', color: '#334155', lineHeight: '1.6' },
          content: mod.content || '<p></p>',
        },
      },
    ];

    commands.push({
      action: 'addModule',
      tempId: `mod-${i}`,
      params: {
        type: 'module',
        styleId: sty.id,
        style: sty.style,
        children: modChildren,
      },
    });
  }

  return commands;
}

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
  // 从解析数据动态生成指令（不依赖模板，有几个字段创建几个控件）
  const commands = buildResumeCommands(parsed);
  console.log('[import-resume] 动态生成指令数:', commands.length);

  const result = executeCommands(ctx.modules, commands);
  console.log('[import-resume] 生成的模块数:', result.newModules.length);
  if (result.errors.length > 0) {
    return `构建简历时出错：${result.errors.join('; ')}`;
  }

  ctx.importModules(result.newModules);
  return `简历导入完成，已导入 ${result.newModules.length} 个模块。`;

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