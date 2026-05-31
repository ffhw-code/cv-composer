// src/utils/resumeParser.ts
import { getApiConfig } from './aiConfig';


export interface ParsedResume {
  name?: string;
  jobTitle?: string;
  birth?: string;
  phone?: string;
  email?: string;
  photo?: string;
  modules?: {
    title: string;
    content: string;
  }[];
}

interface ChatMessage {
  role: string;
  content: string | ChatMessageContent[];
}

interface ChatMessageContent {
  type: string;
  text?: string;
  image_url?: { url: string };
}

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

function buildPrompt(): string {
  return `你是一个专业的简历解析助手。请仔细阅读以下简历文件内容，提取所有关键信息，并按指定的 JSON 格式返回。

请返回一个 JSON 对象，格式如下：
{
  "name": "姓名",
  "jobTitle": "求职意向或职位",
  "birth": "出生年月或籍贯",
  "phone": "电话号码",
  "email": "电子邮箱",
  "photo": "",
  "modules": [
    {
      "title": "模块标题（如教育背景、工作经历、技能等）",
      "content": "模块详细内容（HTML 格式，可使用 <ul><li> 等标签）"
    }
  ]
}

注意：
1. photo 字段永远返回空字符串 ""，不要返回任何 base64 编码。
2. 如果某项信息不存在，请用空字符串 "" 表示。
3. 模块内容请尽量保留原文结构，使用 HTML 标签格式化。
4. 只返回 JSON 对象，不要包含任何其他文字或解释。`;
}

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

async function callApi(baseUrl: string, apiKey: string, model: string, messages: ChatMessage[]): Promise<ParsedResume> {
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

  const tryParse = (str: string): ParsedResume => {
    try {
      return JSON.parse(str);
    } catch (e) {
      // 尝试修复 photo 字段可能带来的 base64 超长问题
      const cleaned = str.replace(/"photo"\s*:\s*"[^"]*"/, '"photo": ""');
      if (cleaned !== str) {
        return JSON.parse(cleaned);
      }
      throw e;
    }
  };

  try {
    return tryParse(jsonStr);
  } catch (parseError: unknown) {
    const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
    console.error('JSON 解析失败，原始内容:', content);
    console.error('清理后的 JSON 字符串:', jsonStr);
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`JSON 解析失败: ${errMsg}`, { cause: parseError instanceof Error ? parseError : undefined });
  }
}

// 判断是否为多模态视觉模型
export function isVisionModel(model: string): boolean {
  return /(vl|vision|claude-3|gemini-pro-vision|ocr)/i.test(model);
}

export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const config = getApiConfig();
  if (!config || !config.apiKey) {
    throw new Error('请先配置 AI 服务 (API Key)');
  }

  const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  let model = config.model;
  const isImage = file.type.startsWith('image/');

  // ★ 核心修复：如果是图片，但配置的模型不是视觉模型，自动切换为 qwen-vl-max
  if (isImage && (!model || !isVisionModel(model))) {
    throw new Error('当前配置的模型不支持图片解析，请在 AI 设置中更换为视觉模型（如 qwen-vl-max、gpt-4o）。');
  }
  if (!model) {
    model = 'qwen-plus';
  }

  const visionModel = isVisionModel(model);
  let messages: ChatMessage[];
  const fileType = file.type;

  if (fileType === 'application/pdf' ||
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    throw new Error('PDF/Word 文件暂不支持，请先将简历转为 PNG 或 JPG 图片后上传');
  } else if (isImage) {
    const base64 = await readFileAsBase64(file);
    // ★ 核心修复：补全 data URI 前缀，确保视觉模型能识别
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
