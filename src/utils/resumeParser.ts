// src/utils/resumeParser.ts
import { getApiConfig } from './aiConfig';

// ==================== 类型定义 ====================

/** 布局树节点：描述控件嵌套结构 */
export interface LayoutTreeNode {
  type: 'flex' | 'grid' | 'text' | 'heading' | 'list' | 'image';
  /** 引用 data 中的字段名 */
  ref?: string;
  direction?: 'row' | 'column';
  columns?: number;
  gap?: string;
  padding?: string;
  lineHeight?: string;
  style?: Record<string, string>;
  children?: LayoutTreeNode[];
}

/** 整个简历的布局树 */
export interface LayoutTree {
  header: LayoutTreeNode;
  modules: LayoutTreeNode[];
}

/** 模块内单条记录（多条目结构） */
export interface ParsedModuleEntry {
  [key: string]: string;
}

/** 模块数据 */
export interface ParsedModuleData {
  title: string;
  content?: string;
  /** 多条目结构：每个条目是一组独立字段（date、company、role、description 等） */
  entries?: ParsedModuleEntry[];
}

/** 简历数据 */
export interface ResumeData {
  name?: string;
  jobTitle?: string;
  birth?: string;
  phone?: string;
  email?: string;
  photo?: string;
  modules?: ParsedModuleData[];
  /** 其他自定义字段 */
  [key: string]: unknown;
}

/** AI 解析输出：布局 + 数据一体 */
export interface ParsedResume {
  layoutTree?: LayoutTree;
  data?: ResumeData;
}

// ==================== Prompt ====================

function buildPrompt(): string {
  return `你是一个专业的简历解析助手。请仔细分析简历图片，同时提取内容信息和排版布局结构，输出一个 JSON 对象。

## 输出格式

{
  "layoutTree": { ... },
  "data": { ... }
}

### layoutTree — 描述排版结构

包含 header 和 modules 两部分。header 描述简历头区域，modules 是内容模块数组。

**节点类型**:
- "flex": 弹性容器，用 direction("row"|"column") 控制排列方向
- "grid": 网格容器，用 columns(数字) 控制列数
- "text": 文本节点
- "heading": 标题节点
- "list": 列表节点
- "image": 图片节点

**节点公共属性**: type(必填), ref, gap, padding, lineHeight, style(可选 CSS 对象)
**容器独有属性**: children(子节点数组), direction(flex), columns(grid)

**CSS 属性词汇表（仅使用以下属性）**:
fontSize(如 "16px"), fontWeight(如 "bold" 或 "700"), color(如 "#333333"), backgroundColor, padding, margin, borderRadius, border, boxShadow, display, flexDirection, alignItems, justifyContent, gap, gridTemplateColumns, width, height, lineHeight, textAlign, objectFit

**对齐与间距**: 用 justifyContent("space-between"|"space-around"|"flex-start"|"center") 表达元素排列方式，用 gap(如 "0px"|"8px"|"12px") 控制子元素间距，用 padding 控制容器内边距，用固定 height 控制行高。

### data — 存放文本数据

通过 ref 关联到 layoutTree 中的节点。顶层字段(name, jobTitle, birth, phone, email, photo)和 modules 数组。

modules 中每项包含 title，其内容二选一：
- **单条目**（内容不可再拆分时）：用 content 字段，值用 HTML 标签表达(<p><br/><strong><ul><li>)
- **多条目**（有多个工作/教育经历时）：用 entries 数组，每项是一组命名字段（字段名根据原图内容命名，如 date、company、role、description），字段值为纯文本

## 示例一：带多条目结构的模块（工作经历/教育经历有多条记录时使用）

{
  "layoutTree": {
    "header": {
      "type": "flex", "direction": "row", "gap": "20px", "padding": "24px",
      "style": {"backgroundColor": "#f8fafc", "borderRadius": "12px"},
      "children": [
        {"type": "image", "ref": "photo", "style": {"width": "100px", "height": "130px", "borderRadius": "8px", "objectFit": "cover"}},
        {"type": "flex", "direction": "column", "gap": "12px", "children": [
          {"type": "text", "ref": "name", "style": {"fontSize": "24px", "fontWeight": "700", "color": "#1a202c"}},
          {"type": "grid", "columns": 2, "gap": "8px", "children": [
            {"type": "text", "ref": "jobTitle", "style": {"fontSize": "15px", "color": "#475569"}},
            {"type": "text", "ref": "email", "style": {"fontSize": "15px", "color": "#475569"}},
            {"type": "text", "ref": "phone", "style": {"fontSize": "15px", "color": "#475569"}},
            {"type": "text", "ref": "birth", "style": {"fontSize": "15px", "color": "#475569"}}
          ]}
        ]}
      ]
    },
    "modules": [
      {
        "type": "flex", "direction": "column", "gap": "8px", "padding": "16px",
        "children": [
          {"type": "heading", "ref": "modules.0.title", "style": {"fontSize": "20px", "fontWeight": "700", "color": "#0f172a"}},
          {"type": "text", "ref": "modules.0.content", "style": {"fontSize": "15px", "color": "#334155", "lineHeight": "1.6"}}
        ]
      },
      {
        "type": "flex", "direction": "column", "gap": "0px", "padding": "16px",
        "children": [
          {"type": "heading", "ref": "modules.1.title", "style": {"fontSize": "20px", "fontWeight": "700", "color": "#0f172a"}},
          {"type": "flex", "direction": "row", "justifyContent": "space-between", "gap": "0px", "style": {"padding": "0px"},
           "children": [
             {"type": "flex", "direction": "row", "gap": "12px", "children": [
               {"type": "text", "ref": "modules.1.entries.0.date", "style": {"fontSize": "15px", "color": "#334155"}},
               {"type": "text", "ref": "modules.1.entries.0.company", "style": {"fontSize": "15px", "color": "#334155"}}
             ]},
             {"type": "text", "ref": "modules.1.entries.0.role", "style": {"fontSize": "15px", "color": "#475569"}}
           ]
          },
          {"type": "text", "ref": "modules.1.entries.0.description", "style": {"fontSize": "15px", "color": "#334155", "lineHeight": "1.6"}},
          {"type": "flex", "direction": "row", "justifyContent": "space-between", "gap": "0px", "style": {"padding": "0px"},
           "children": [
             {"type": "flex", "direction": "row", "gap": "12px", "children": [
               {"type": "text", "ref": "modules.1.entries.1.date", "style": {"fontSize": "15px", "color": "#334155"}},
               {"type": "text", "ref": "modules.1.entries.1.company", "style": {"fontSize": "15px", "color": "#334155"}}
             ]},
             {"type": "text", "ref": "modules.1.entries.1.role", "style": {"fontSize": "15px", "color": "#475569"}}
           ]
          },
          {"type": "text", "ref": "modules.1.entries.1.description", "style": {"fontSize": "15px", "color": "#334155", "lineHeight": "1.6"}}
        ]
      }
    ]
  },
  "data": {
    "name": "张三",
    "jobTitle": "产品经理",
    "email": "zhang@example.com",
    "phone": "13800000000",
    "birth": "1995-06",
    "photo": "",
    "modules": [
      {"title": "教育背景", "content": "<p>清华大学 · 计算机科学与技术 · 2017-2021</p>"},
      {"title": "工作经历", "entries": [
        {"date": "2023.10 - 2025.1", "company": "某科技有限公司", "role": "产品经理", "description": "1.参与新产品的市场调研，协助制定产品方案。2.分析用户需求，协助产品功能设计与优化。"},
        {"date": "2022.7 - 2023.9", "company": "某广告公司", "role": "产品运营", "description": "1.负责产品上线后的数据分析与用户反馈收集。"}
      ]}
    ]
  }
}

## 示例二：简单模块（单条目，无重复记录）

{
  "layoutTree": {
    "header": {
      "type": "flex", "direction": "row", "gap": "16px", "padding": "20px",
      "children": [
        {"type": "text", "ref": "name", "style": {"fontSize": "24px", "fontWeight": "700"}},
        {"type": "text", "ref": "jobTitle", "style": {"fontSize": "16px", "color": "#475569"}}
      ]
    },
    "modules": [{
      "type": "flex", "direction": "column", "gap": "8px",
      "children": [
        {"type": "heading", "ref": "modules.0.title", "style": {"fontSize": "18px", "fontWeight": "700"}},
        {"type": "text", "ref": "modules.0.content", "style": {"fontSize": "15px"}}
      ]
    }]
  },
  "data": {
    "name": "王五",
    "jobTitle": "设计师",
    "modules": [{"title": "个人简介", "content": "<p>10年UI设计经验，精通Figma和Sketch。</p>"}]
  }
}

## 规则
1. photo 永远返回 ""
2. 不存在的字段填空字符串 ""，禁止填占位文字
3. 原图的排版结构必须在 LayoutTree 中忠实体现：有几栏就设 columns，有左右分布就用 justifyContent: "space-between" 或 "space-around"，有固定列宽就用 width。禁止统一用 gap 简化间距、禁止套用示例的左右布局
4. 模块若包含多条记录（多个工作经历、多个教育经历、多个项目经历），必须使用 entries 结构逐条拆分。每条包含独立的 date、company、role、description 等字段（字段名根据原图实际内容命名）
5. 每条记录的排版细节（日期+公司同行、角色在右、描述在下方等）必须逐层在 LayoutTree 中表达，禁止把所有文本合并到单个 content 字符串
6. 容器节点(flex/grid)的 children 必须是非空数组
7. 只返回 JSON，不要任何额外文字`;
}

// ==================== JSON 提取与解析 ====================

function extractJson(content: string): string {
  let clean = content.replace(/```json\s*|\s*```/g, '').trim();
  const startIdx = clean.indexOf('{');
  const endIdx = clean.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    clean = clean.substring(startIdx, endIdx + 1);
  }
  // 移除控制字符
  // eslint-disable-next-line no-control-regex
  clean = clean.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return clean;
}

function tryParseJson(str: string): ParsedResume {
  try {
    return JSON.parse(str);
  } catch {
    // 尝试修复常见 JSON 错误：尾部逗号
    const fixed = str.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(fixed);
  }
}

// ==================== API 调用 ====================

interface ChatMessage {
  role: string;
  content: string | ChatMessageContent[];
}

interface ChatMessageContent {
  type: string;
  text?: string;
  image_url?: { url: string };
}

async function callApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<ParsedResume> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('API 未返回有效内容');
  }

  const jsonStr = extractJson(content);

  try {
    return tryParseJson(jsonStr);
  } catch (parseError: unknown) {
    const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
    console.error('JSON 解析失败，尝试单次修正重试…');
    console.error('原始内容:', content.slice(0, 500));

    // 单次修正重试：将原始输出和错误信息发给模型修正
    const fixMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'assistant',
        content: content,
      },
      {
        role: 'user',
        content: `你的上一条回复 JSON 格式不合法：${errMsg}。请修正 JSON 格式后重新输出，只返回合法的 JSON 对象。`,
      },
    ];

    const fixResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: fixMessages,
        temperature: 0.1,
      }),
    });

    if (!fixResponse.ok) {
      throw new Error(`JSON 修正请求失败: ${fixResponse.status}`);
    }

    const fixData = await fixResponse.json();
    const fixContent = fixData.choices?.[0]?.message?.content;
    if (!fixContent) {
      throw new Error(`JSON 解析失败（修正后无输出）。原始错误: ${errMsg}`);
    }

    const fixJsonStr = extractJson(fixContent);
    try {
      return tryParseJson(fixJsonStr);
    } catch (retryError: unknown) {
      const retryErrMsg = retryError instanceof Error ? retryError.message : String(retryError);
      throw new Error(`JSON 解析失败（修正后仍不合法）: ${retryErrMsg}。原始 AI 输出: ${content.slice(0, 300)}`);
    }
  }
}

// ==================== 文件读取 ====================

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ==================== 视觉模型检测 ====================

export function isVisionModel(model: string): boolean {
  return /(vl|vision|claude-3|gemini-pro-vision|ocr|gpt-4o)/i.test(model);
}

// ==================== 主解析入口 ====================

export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const config = getApiConfig();
  if (!config || !config.apiKey) {
    throw new Error('请先配置 AI 服务 (API Key)');
  }

  const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  // 图片解析优先使用视觉模型，回退到通用模型
  let model = config.visionModel || config.model;
  const isImage = file.type.startsWith('image/');

  if (isImage && (!model || !isVisionModel(model))) {
    throw new Error(`当前视觉模型「${model || '未设置'}」不支持图片解析。请在 API 设置中配置视觉模型（如 qwen-vl-max），与 FC 模型（如 qwen-max）分开设置。`);
  }
  if (!model) {
    model = 'qwen-vl-max';
  }

  const visionModel = isVisionModel(model);
  const fileType = file.type;

  let messages: ChatMessage[];

  if (fileType === 'application/pdf' ||
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    throw new Error('PDF/Word 文件暂不支持，请先将简历转为 PNG 或 JPG 图片后上传');
  } else if (isImage) {
    const base64 = await readFileAsBase64(file);
    messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${buildPrompt()}\n\n请严格返回 JSON。` },
          {
            type: 'image_url',
            image_url: { url: `data:${fileType};base64,${base64}` },
          },
        ],
      },
    ];
  } else if (fileType === 'text/plain') {
    const fileContent = await readFileAsText(file);
    const fullText = `${buildPrompt()}\n\n简历文件内容：\n${fileContent}`;
    messages = [
      {
        role: 'user',
        content: visionModel ? [{ type: 'text', text: fullText }] : fullText,
      },
    ];
  } else {
    throw new Error('不支持的文件格式，请上传 PNG/JPG 图片或 TXT 文本文件');
  }

  return callApi(baseUrl, config.apiKey, model, messages);
}
