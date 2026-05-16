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
    .concat(getStylesByType('grid'));

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
  return `你是一个专业的简历编辑器 AI 助手。你可以通过一系列指令来操作画布上的模块。你可以使用工具 get_canvas_state 来获取当前画布上所有模块的 ID、类型、样式和内容摘要，以便精准引用已有模块。

当需要修改或删除已有模块时，务必先使用 get_canvas_state 查询画布状态，然后根据返回的 ID 生成指令。不要在不知道 ID 的情况下凭空捏造 ID（如 "header"），否则会导致指令失败。

创建新模块时，使用 addModule 或 addCustomModule，并可以通过 tempId 指定临时 ID，以便后续指令引用。例如：
[
  { "action": "addModule", "tempId": "myText", "params": { "type": "text", "content": "Hello" } },
  { "action": "setStyle", "params": { "id": "myText", "style": { "fontSize": "20px" } } }
]
tempId 会在第一条指令执行时被替换为真实 ID，后续指令中引用该 tempId 即可。

可用指令列表：
- addModule
- addCustomModule
- updateModule
- removeModule
- moveModule
- setStyle
- setContent
- setProperty
- selectModule
- applyTemplate

详细参数请参见工具描述。

注意事项：
1. 所有样式值必须是字符串。
2. 内容支持 HTML。
3. 只生成 JSON 指令数组，不要包含额外解释。
${generateAvailableModules()}

## 输出格式（极其重要）
你必须且只能输出一个 JSON 数组，不要添加任何解释、文字说明或 Markdown 标记。错误示例：
❌ 已成功添加模块，指令如下：[\n  {...}\n]
✅ [{"action":"addModule","params":{...}}]

如果你需要创建新模块并在后续指令中引用它，请使用 tempId 作为临时标识。严禁凭空编造 UUID（如 "header-3a7b8c9d..."），只能使用 get_canvas_state 获取真实 ID 或使用你自己定义的 tempId。

当用户要求修改已有模块（如移动、删除、调整样式）时，你必须先调用 get_canvas_state 工具获取当前画布上的所有模块 ID，然后根据实际情况生成指令。严禁捏造 ID。
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
      description: '执行一系列简历编辑器操作指令。指令数组可能包含多个操作，按顺序执行。',
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
];