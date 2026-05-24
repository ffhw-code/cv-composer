// src/engine/skillExecutor.ts
import JSON5 from 'json5';
import { loadTemplate, type TemplateModule } from './templates';
import { executeCommands, type Command } from './commandExecutor';
import type { ResumeModule } from '../store/useResumeStore';

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
  const findModule = (nodes: ResumeModule[], id: string): ResumeModule | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) {
        const found = findModule(n.children, id);
        if (found) return found;
      }
    }
    return null;
  };
  const target = findModule(ctx.modules, moduleId);
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
    const extract = (nodes: any[], parentNode?: any) => {
      for (const n of nodes) {
        const name = n.name || '';
        const title = n.title || '';
        const content = n.content || '';
        const jobTitle = n.jobTitle || '';
        let label = '';
        if (name && name !== '未命名' && name !== '姓名') label = name;
        else if (title) label = title;
        else if (jobTitle && jobTitle !== '求职意向') label = jobTitle;
        else if (parentNode?.title && (n.type === 'heading' || n.type === 'text'))
          label = n.type === 'heading' ? `${parentNode.title} 标题` : `${parentNode.title} 内容`;
        else if (content.trim().length > 0) label = content.trim().substring(0, 20);
        else label = n.type;
        label = generateUniqueLabel(label);
        items.push({ label, id: n.id, type: n.type, currentContent: content || name || '' });
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
  let cleaned = aiReply.replace(/```json\s*|\s*```/g, '').trim();
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
      } catch (e: any) {
        return `智能填充解析失败：${e.message}`;
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

// 8. 导入简历文件（AI 动态生成完整简历结构，强化内容填充）
registerSkill('import-resume', async (_params, ctx) => {
  const uploaded = (window as any).__uploadedFile as {
    base64: string;
    fileName: string;
    fileType: string;
  } | undefined;

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

  if (fileType === 'application/pdf') {
    return '暂不支持直接导入 PDF，请将 PDF 转为图片（PNG/JPG）后上传。';
  }

  let parseResumeFile: (file: File) => Promise<any>;
  try {
    const module = await import('../utils/resumeParser');
    parseResumeFile = module.parseResumeFile;
  } catch {
    return '简历解析模块加载失败，请检查项目结构。';
  }

  const blob = base64ToBlob(fileBase64, fileType);
  const file = new File([blob], fileName, { type: fileType });

  let parsed: any;
  try {
    parsed = await parseResumeFile(file);
  } catch (e: any) {
    return `文件解析失败：${e.message}`;
  }

  if (!parsed) return '解析结果为空。';

  // 获取可用样式
  const { getStylesByType } = await import('../store/styleRegistry');
  const availableTypes = ['header', 'module', 'text', 'heading', 'list', 'image', 'flex', 'grid'];
  const availableStyles: Record<string, string[]> = {};
  for (const t of availableTypes) {
    availableStyles[t] = getStylesByType(t as any).map(s => s.style);
  }

  const systemPrompt = `你是简历生成专家。从文件中提取了以下信息：
${JSON.stringify(parsed, null, 2)}

你可以使用以下模块类型和样式构建简历：
${JSON.stringify(availableStyles, null, 2)}

请生成完整的指令数组来构建这份简历。

**严格规则（必须完全遵守）：**
1. 所有文本/标题的 content 必须使用提取信息中的具体文字，禁止使用任何占位符（如“列表项”、“点击此处编辑...”）。
2. 如果提取信息中包含 modules 数组，每个 module 必须对应一个 module 容器，其 children 包含 heading（模块标题）和 text 或 list（模块内容）。
3. 如果 module 内容是列表（如技能、荣誉），使用 list 类型，content 用 HTML 列表格式（<ul><li>...</li></ul>）。
4. header 必须包含 image（照片，可为空）和 flex 容器，flex 内放置 name、jobTitle、birth、phone、email 等字段，每个字段一个 text。
5. 只输出 JSON 数组，不要任何解释文字。

**示例（请严格按照此结构生成）：**
[
  {
    "action": "addModule",
    "params": {
      "type": "header",
      "styleId": "header-classic",
      "style": {
        "display": "flex",
        "flexDirection": "row",
        "alignItems": "flex-start",
        "gap": "20px",
        "padding": "24px",
        "backgroundColor": "#ffffff",
        "borderRadius": "12px",
        "border": "1px solid #e8ecf1",
        "boxShadow": "0 1px 3px rgba(0,0,0,0.04)"
      },
      "children": [
        {
          "action": "addModule",
          "params": { "type": "image", "styleId": "image-default", "style": { "width": "100px", "height": "130px", "borderRadius": "8px", "objectFit": "cover" }, "content": "" }
        },
        {
          "action": "addModule",
          "params": {
            "type": "flex",
            "styleId": "flex-default",
            "style": { "flexDirection": "column", "gap": "12px", "flex": "1" },
            "children": [
              { "action": "addModule", "params": { "type": "text", "styleId": "text-default", "style": { "fontSize": "24px", "fontWeight": "700", "color": "#1a202c" }, "content": "<p>张三</p>", "name": "张三" } },
              { "action": "addModule", "params": { "type": "text", "styleId": "text-default", "style": { "fontSize": "15px", "color": "#4a5568" }, "content": "<p>求职意向：前端工程师</p>", "jobTitle": "前端工程师" } },
              { "action": "addModule", "params": { "type": "text", "styleId": "text-default", "style": { "fontSize": "15px", "color": "#4a5568" }, "content": "<p>📞 138-0000-0000</p>", "phone": "138-0000-0000" } },
              { "action": "addModule", "params": { "type": "text", "styleId": "text-default", "style": { "fontSize": "15px", "color": "#4a5568" }, "content": "<p>📧 zhang@example.com</p>", "email": "zhang@example.com" } }
            ]
          }
        }
      ]
    }
  },
  {
    "action": "addModule",
    "params": {
      "type": "module",
      "styleId": "module-card",
      "style": { "display": "flex", "flexDirection": "column", "gap": "12px", "padding": "20px", "backgroundColor": "#ffffff", "borderRadius": "12px", "border": "1px solid #e2e8f0", "boxShadow": "0 2px 8px rgba(0,0,0,0.04)" },
      "children": [
        { "action": "addModule", "params": { "type": "heading", "styleId": "heading-default", "style": { "fontSize": "20px", "fontWeight": "700", "color": "#0f172a", "paddingBottom": "8px", "borderBottom": "2px solid #f1f5f9" }, "content": "<p>教育背景</p>" } },
        { "action": "addModule", "params": { "type": "text", "styleId": "text-default", "style": { "fontSize": "15px", "color": "#334155", "lineHeight": "1.6" }, "content": "<p>清华大学 计算机科学与技术 本科 2020-2024</p>" } }
      ]
    }
  }
]`;

  const aiReply = await ctx.callAiForSmartFill(systemPrompt, '请生成完整的简历构建指令数组');

  let commands: Command[] | null = null;
  let cleaned = aiReply.replace(/```json\s*|\s*```/g, '').trim();
  try {
    commands = JSON5.parse(cleaned);
  } catch {
    try {
      commands = JSON.parse(cleaned);
    } catch {
      const fixed = cleaned.replace(/,\s*([}\]])/g, '$1');
      try {
        commands = JSON5.parse(fixed);
      } catch (e: any) {
        return `生成指令解析失败：${e.message}`;
      }
    }
  }

  if (!Array.isArray(commands)) return 'AI 返回格式错误，请重试。';

  const result = executeCommands(ctx.modules, commands);
  if (result.errors.length > 0) {
    return `构建简历时出错：${result.errors.join('; ')}`;
  }

  ctx.importModules(result.newModules);
  return '简历导入完成，已根据文件内容动态构建。';
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