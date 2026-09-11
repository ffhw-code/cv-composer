// 直接 AI API 调用（非 tool-calling 路径），供 skill 和 file import 使用
import { getApiConfig, resolveBaseUrl } from '../../utils/aiConfig';

export function translateApiError(status: number, body: string, model: string): string {
  let detail = '';
  try {
    const parsed = JSON.parse(body);
    detail = parsed.error?.message || parsed.error?.code || parsed.message || '';
  } catch { /* ignore parse errors */ }

  const lowerDetail = detail.toLowerCase();

  switch (status) {
    case 400:
      if (lowerDetail.includes('model') || lowerDetail.includes('not found') || lowerDetail.includes('does not exist')) {
        return `模型 "${model}" 不存在或不可用，请检查 API 设置中的模型名称是否正确。`;
      }
      if (lowerDetail.includes('invalid')) {
        return `请求参数有误：${detail || '请检查 API 设置'}。`;
      }
      return `请求格式错误${detail ? '：' + detail : '，请检查 API 设置中的模型名称和 Base URL。'}`;
    case 401:
      return 'API Key 无效，请在 API 设置中重新填写。';
    case 403:
      return 'API Key 没有访问权限，请检查该 Key 是否已开通所需模型的调用权限。';
    case 404:
      return '接口地址不存在（404），模型名或 Base URL 可能填错了，请检查 API 设置。';
    case 429:
      return '请求过于频繁，请稍后重试。';
    case 500:
    case 502:
    case 503:
      return 'AI 服务暂时不可用，请稍后重试。';
    default:
      return `AI 服务返回错误 (${status})${detail ? '：' + detail : '，请稍后重试。'}`;
  }
}

export async function callSmartFill(sysPrompt: string, userPrompt: string): Promise<string> {
  const config = getApiConfig();
  if (!config || !config.apiKey) throw new Error('API 未配置');
  const baseUrl = resolveBaseUrl(config.baseUrl);
  const model = config.model || 'qwen-plus';
  const messages = [
    {
      role: 'user' as const,
      content: `${sysPrompt}\n\n${userPrompt}`,
    },
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.1 }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`smart-fill API 请求失败: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('smart-fill 未返回有效内容');
  return content;
}

export async function callAiForEvaluate(prompt: string): Promise<string> {
  const config = getApiConfig();
  if (!config?.apiKey) throw new Error('API 未配置');
  const baseUrl = resolveBaseUrl(config.baseUrl);
  const model = config.model || 'qwen-plus';
  const messages = [{ role: 'user' as const, content: prompt }];
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.1 }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`评估 API 请求失败: ${response.status} ${errText}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('评估未返回有效内容');
  return content;
}

export async function callAiForPolish(text: string): Promise<string> {
  const polishMsgs = [
    { role: 'system', content: '请优化以下文本，保持原意但使表达更专业、简洁。直接返回优化后文本，不要解释。' },
    { role: 'user', content: text },
  ];
  const config = getApiConfig();
  if (!config?.apiKey) throw new Error('API 未配置');
  const baseUrl = resolveBaseUrl(config.baseUrl);
  const model = config.model || 'qwen-plus';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model, messages: polishMsgs, temperature: 0.1 }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`润色 API 请求失败: ${response.status} ${errText}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('润色未返回有效内容');
  return content;
}
