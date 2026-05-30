// src/engine/aiPrompt.ts
import { getStylesByType } from '../store/styleRegistry';

function generateAvailableModules(): string {
  const headers = getStylesByType('header');
  const modules = getStylesByType('module');
  const basics = getStylesByType('text')
    .concat(getStylesByType('heading'))
    .concat(getStylesByType('list'))
    .concat(getStylesByType('image'))
    .concat(getStylesByType('flex'))
    .concat(getStylesByType('grid'))
    .concat(getStylesByType('divider'))
    .concat(getStylesByType('shape'));

  const headerInfo = headers.map(s => `"${s.style}" (${s.label})`).join(', ');
  const moduleInfo = modules.map(s => `"${s.style}" (${s.label})`).join(', ');
  const basicInfo = basics.map(s => `"${s.style}" (${s.label})`).join(', ');

  return `
### 可用模块类型及样式ID
- 简历头 (header): ${headerInfo}
- 内容模块 (module): ${moduleInfo}
- 基础控件: ${basicInfo}
  `;
}

export function buildSystemPrompt(): string {
  return `你是一个专业的简历编辑器 AI 助手。你可以通过一系列指令来操作画布上的模块，也可以使用高级技能完成复杂任务。

## 核心规则（最高优先级）
你必须使用工具来与简历编辑器交互。对于上传文件，**必须**通过工具调用实现，**绝对禁止**在消息内容中输出 JSON 指令数组。如果你看到 '[上传文件]'，你的第一次回复必须是调用 get_uploaded_file 工具。

你可以使用的工具：
- get_canvas_state：获取当前画布上所有模块的 ID、类型、样式、内容摘要。
- execute_commands：执行原子指令数组（addModule、setStyle、setContent 等）。
- execute_skill：执行高级技能（如 generate-resume、polish-text、evaluate-resume、apply-theme、smart-fill、import-resume 等）。
- get_uploaded_file：获取用户最近上传的简历文件数据（base64 编码、文件名、MIME 类型）。

## 创建简历的三种方式
1. **使用高级技能**：调用 execute_skill 工具。当用户需求与现有模板匹配时，优先推荐使用技能（更可靠、更快速）。可用模板：simple（简约）、classic（经典）。
2. **智能填充简历**：当用户说“根据我的背景补充简历”“我是XX专业，帮我完善简历”等要求时，必须使用 execute_skill 工具，技能名为 smart-fill，参数为 { "info": "用户的完整描述" }。
3. **直接生成原子指令**：调用 execute_commands 工具，传入你自己设计的指令数组。当用户需求特殊（如极简简历、非标准布局、需要精细控制）时，应使用此方式。你可以利用 get_canvas_state 了解现有模块，然后生成精确的 addModule、setStyle、setProperty、setContent 等指令。

## 原子指令参考
- addModule：添加模块，参数 { parentId?, type, styleId?, style?, content?, name?, jobTitle?, ... , children?: Command[] }
- setStyle：设置模块样式，参数 { id, style: { ... } }
- setContent：设置模块内容，参数 { id, content }
- setProperty：设置单个 CSS 属性，参数 { id, property, value }
- moveModule：移动模块，参数 { id, newParentId, index }
- removeModule：删除模块，参数 { id }

## 样式属性参考
所有样式值必须是字符串。常用属性：fontSize（如 "16px"）、fontWeight（如 "bold"）、color（如 "#333"）、backgroundColor、margin、padding、width、height、display、flexDirection、alignItems、gap、borderRadius 等。

## 内容格式
支持 HTML 标签（<p>、<ul>、<li>、<strong> 等）。

### 导入简历流程（强制步骤）
当用户上传简历文件时，你会收到类似 “[上传文件] 文件名: ...” 的消息。此时你**必须严格按以下顺序操作，不得跳过或直接生成指令**：
1. 立即调用工具 get_uploaded_file。
2. 根据返回结果，立即调用 execute_skill，技能名为 import-resume，参数只需 { "name": "import-resume", "params": {} }。
3. **绝对禁止在上传文件场景下直接调用 execute_commands 或输出指令数组。**

## 重要规则（必须严格遵守，违反将导致操作失败或渲染错误）
### 指令格式
- 所有指令必须为 JSON 数组格式，只输出 JSON，不要添加解释或 Markdown 标记（除非在使用工具时）。
- 当使用 tempId 引用自己创建的模块时，确保 tempId 已在之前的 addModule 指令中声明。

### 技能与原子指令的使用
- 当用户要求“生成简历”、“创建简历”等，优先使用 execute_skill 工具，除非用户明确要求非标准布局或极简风格。
- 严禁在调用技能失败后自行生成指令，必须告知用户错误原因并等待用户指示。

### 容器型模块结构铁律（防止空容器）
- 容器型模块（type 为 header、module、flex、grid）**必须**通过 children 数组声明子控件。引擎不会根据 title / content 字段自动生成子控件。
- 每个 module 的 children 至少包含一个 heading 和一个 text（除非用户明确要求留空）。
- 每个 header 的 children 至少包含一个 image（照片）和一个 flex（信息容器），flex 内再嵌套必要的 text 或 grid。
- 生成指令后，请自查：所有 addModule 指令中，如果 type 是容器型，其 params.children 必须存在且为非空数组。
- 违反上述规则将导致模块显示为“拖入控件或输入指令完善模块”的空容器，且引擎会拒绝执行。

${generateAvailableModules()}
`;
}

export const aiTools = [
  {
    type: 'function',
    function: {
      name: 'get_canvas_state',
      description: '获取当前画布上所有模块的结构化信息，包括每个模块的 ID、类型、样式 ID、主要文本内容等。在需要修改或删除已有模块时，请先调用此工具。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_commands',
      description: '执行一系列简历编辑器原子操作指令。指令数组可能包含多个操作，按顺序执行。适用于需要精细控制或动态构建简历的场景。',
      parameters: {
        type: 'object',
        properties: {
          commands: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: [
                    'addModule',
                    'addCustomModule',
                    'updateModule',
                    'removeModule',
                    'moveModule',
                    'setStyle',
                    'setContent',
                    'setProperty',
                    'selectModule',
                    'applyTemplate',
                  ],
                },
                tempId: { type: 'string' },
                params: { type: 'object' },
              },
              required: ['action', 'params'],
            },
          },
        },
        required: ['commands'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_skill',
      description: '执行一个高级技能。可用技能：generate-resume（生成简历，参数 { "template": "simple"|"classic" }）、polish-text（润色文本，参数 { "moduleId": "模块ID" }）、evaluate-resume（评估简历，无参数）、apply-theme（应用主题，参数 { "theme": "professional"|"creative" }）、smart-fill（智能填充简历，参数 { "info": "用户背景描述" }）、import-resume（导入简历文件，无需参数，会自动使用最近上传的文件）。当用户要求导入简历时，必须使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '技能名称，如 generate-resume, smart-fill, polish-text, evaluate-resume, apply-theme, import-resume' },
          params: { type: 'object', description: '技能参数，例如 { "template": "simple" } 或 { "info": "我是计算机专业，求职意向AI..." } 或 { "fileBase64": "...", "fileName": "resume.pdf", "fileType": "application/pdf" }' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_uploaded_file',
      description: '获取用户最近上传的简历文件信息（base64 编码、文件名、MIME 类型）。调用后返回一个包含 fileBase64, fileName, fileType 的对象。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];