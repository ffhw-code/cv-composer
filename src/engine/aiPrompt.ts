// src/engine/aiPrompt.ts
import { getStylesByType } from '../styles/styleRegistry';
import { type ToolResult, handleAddText, handleAddHeading, handleAddList, handleAddImage, handleAddFlex, handleAddGrid, handleAddFlexInline, handleAddGridInline, handleAddHeader, handleAddModule, handleSetContent, handleSetStyle, handleSetStyleByType, handleSetProperty, handleSetField, handleRemoveModule, handleDeleteModules, handleClearCanvas, handleMoveModule, handleDuplicateModule, handleCopyStyle, handleCopyTextStyle, handleApplyTemplate, handleExportPdf } from './toolHandlers';
import type { ResumeModule } from '../types/resume';


// ==================== Tool 参数类型 ====================

export interface AddTextParams {
  content: string;
  style?: Record<string, string>;
}

export interface AddHeadingParams {
  content: string;
  style?: Record<string, string>;
}

export interface AddListParams {
  content: string;
  style?: Record<string, string>;
}

export interface AddImageParams {
  content?: string;
  style?: Record<string, string>;
}

export interface AddFlexParams {
  /** 已有模块的 id 列表 */
  children: string[];
  direction?: 'row' | 'column';
  gap?: string;
  style?: Record<string, string>;
}

export interface AddGridParams {
  /** 已有模块的 id 列表 */
  children: string[];
  columns?: number;
  gap?: string;
  style?: Record<string, string>;
}

/** 内联子控件定义，用于 add_flex_inline / add_grid_inline */
export interface InlineChildDef {
  type: 'text' | 'heading' | 'list' | 'image';
  content?: string;
  ref?: string;
  style?: Record<string, string>;
}

export interface AddFlexInlineParams {
  children: InlineChildDef[];
  direction?: 'row' | 'column';
  gap?: string;
  style?: Record<string, string>;
}

export interface AddGridInlineParams {
  children: InlineChildDef[];
  columns?: number;
  gap?: string;
  style?: Record<string, string>;
}

export interface AddHeaderParams {
  styleId: string;
}

export interface AddModuleParams {
  styleId: string;
  title: string;
  content: string;
}

export interface SetContentParams {
  id: string;
  content: string;
}

export interface SetStyleParams {
  id: string;
  style: Record<string, string>;
}

export interface SetPropertyParams {
  id: string;
  property: string;
  value: string;
}

export interface SetStyleByTypeParams {
  /** 限定模块类型，不传则匹配所有类型 */
  type?: string[];
  /** 排除的模块类型，如 ["heading"] 表示跳过所有标题 */
  except?: string[];
  /** 要应用的 CSS 样式 */
  style: Record<string, string>;
}

export interface SetFieldParams {
  id: string;
  field: string;
  value: string;
}

export interface RemoveModuleParams {
  id: string;
}

export interface CopyStyleParams {
  source_id: string;
  target_id: string;
}

export interface CopyTextStyleParams {
  source_id: string;
  target_id: string;
}

export interface DeleteModulesParams {
  /** 要删除的模块 ID 列表 */
  ids: string[];
}

export type ClearCanvasParams = Record<string, never>;

export interface MoveModuleParams {
  id: string;
  parent_id?: string;
  index: number;
}

export interface DuplicateModuleParams {
  id: string;
}

export interface ApplyTemplateParams {
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExportPdfParams {}

export interface ExecuteSkillParams {
  name: string;
  params?: Record<string, unknown>;
}

export type RegisteredToolRunner = (
  params: Record<string, unknown>,
  modules: ResumeModule[],
) => ToolResult | Promise<ToolResult>;

export interface ChatToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 单个工具的注册条目：OpenAI function schema（发给 LLM）+ run（本地执行），参数类型经 defineTool 收敛 */
export interface ChatToolEntry {
  type: 'function';
  function: ChatToolFunction;
  run?: RegisteredToolRunner;
}

/**
 * 将「带类型参数的纯函数」适配为 RegisteredToolRunner。
 * LLM 返回的 args 本质是 JSON 反序列化的 unknown，唯一一次参数断言收敛在这里。
 */
function defineTool<P extends object>(
  run: (params: P, modules: ResumeModule[]) => ToolResult | Promise<ToolResult>,
): RegisteredToolRunner {
  return (params, modules) => run(params as unknown as P, modules);
}

// ==================== OpenAI Function Calling Tool 定义 ====================

export const aiTools: ChatToolEntry[] = [
  {
    type: 'function' as const,
    function: {
      name: 'add_text',
      description: '添加一个文本框到画布。用于添加段落、说明文字等。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '文本内容，支持 HTML 标签（<p>、<strong>、<br/> 等）' },
          style: { type: 'object', description: '可选的 CSS 样式对象，如 {"fontSize":"15px","color":"#334155"}' },
        },
        required: ['content'],
      },
    },
    run: defineTool<AddTextParams>((p, m) => handleAddText(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_heading',
      description: '添加一个标题到画布。用于模块标题、姓名等。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '标题文字，支持 HTML 标签' },
          style: { type: 'object', description: '可选的 CSS 样式对象' },
        },
        required: ['content'],
      },
    },
    run: defineTool<AddHeadingParams>((p, m) => handleAddHeading(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_list',
      description: '添加一个列表到画布。用于技能列表、项目要点等。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '列表内容，用 <ul><li>...</li></ul> 或 <ol><li>...</li></ol> 格式' },
          style: { type: 'object', description: '可选的 CSS 样式对象' },
        },
        required: ['content'],
      },
    },
    run: defineTool<AddListParams>((p, m) => handleAddList(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_image',
      description: '添加一个图片到画布。用于照片、图标等。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '图片的 base64 数据或 URL' },
          style: { type: 'object', description: '可选的 CSS 样式对象，建议设置 width、height、borderRadius 等' },
        },
        required: [],
      },
    },
    run: defineTool<AddImageParams>((p, m) => handleAddImage(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_flex',
      description: '创建一个弹性容器，将已有模块包装为水平或垂直排列。children 必须是当前画布中已存在的模块 id。如需创建新子模块并同时包装，请使用 add_flex_inline。',
      parameters: {
        type: 'object',
        properties: {
          children: { type: 'array', items: { type: 'string' }, description: '已有模块的 id 列表' },
          direction: { type: 'string', enum: ['row', 'column'], description: '排列方向，默认 column' },
          gap: { type: 'string', description: '子元素间距，如 "12px"' },
          style: { type: 'object', description: '可选的 CSS 样式对象' },
        },
        required: ['children'],
      },
    },
    run: defineTool<AddFlexParams>((p, m) => handleAddFlex(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_grid',
      description: '创建一个网格容器，将已有模块按列排列。children 必须是当前画布中已存在的模块 id。如需创建新子模块并同时包装，请使用 add_grid_inline。',
      parameters: {
        type: 'object',
        properties: {
          children: { type: 'array', items: { type: 'string' }, description: '已有模块的 id 列表' },
          columns: { type: 'number', description: '列数，默认 2' },
          gap: { type: 'string', description: '子元素间距，如 "12px"' },
          style: { type: 'object', description: '可选的 CSS 样式对象' },
        },
        required: ['children'],
      },
    },
    run: defineTool<AddGridParams>((p, m) => handleAddGrid(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_flex_inline',
      description: '创建弹性容器并内联定义子控件。一次调用同时创建容器和所有子控件，无需提前创建子模块。',
      parameters: {
        type: 'object',
        properties: {
          children: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['text', 'heading', 'list', 'image'], description: '子控件类型' },
                content: { type: 'string', description: '子控件内容' },
                ref: { type: 'string', description: '引用 data 中的字段名（简历导入场景使用）' },
                style: { type: 'object', description: '子控件的 CSS 样式' },
              },
              required: ['type'],
            },
            description: '内联子控件定义列表',
          },
          direction: { type: 'string', enum: ['row', 'column'], description: '排列方向，默认 column' },
          gap: { type: 'string', description: '子元素间距' },
          style: { type: 'object', description: '容器的 CSS 样式' },
        },
        required: ['children'],
      },
    },
    run: defineTool<AddFlexInlineParams>((p, m) => handleAddFlexInline(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_grid_inline',
      description: '创建网格容器并内联定义子控件。一次调用同时创建容器和所有子控件。',
      parameters: {
        type: 'object',
        properties: {
          children: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['text', 'heading', 'list', 'image'] },
                content: { type: 'string' },
                ref: { type: 'string' },
                style: { type: 'object' },
              },
              required: ['type'],
            },
            description: '内联子控件定义列表',
          },
          columns: { type: 'number', description: '列数，默认 2' },
          gap: { type: 'string', description: '子元素间距' },
          style: { type: 'object', description: '容器的 CSS 样式' },
        },
        required: ['children'],
      },
    },
    run: defineTool<AddGridInlineParams>((p, m) => handleAddGridInline(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_header',
      description: '添加一个简历头。只需指定样式 ID，照片和姓名等信息子控件由前端自动生成。使用前请查看可用模块类型了解支持的 header 样式。',
      parameters: {
        type: 'object',
        properties: {
          styleId: { type: 'string', description: '简历头样式 ID，如 header-classic、header-gradient、header-business' },
        },
        required: ['styleId'],
      },
    },
    run: defineTool<AddHeaderParams>((p, m) => handleAddHeader(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_module',
      description: '添加一个内容模块（如教育背景、工作经历）。标题和内容子控件由前端自动生成，无需手动创建 heading 和 text。',
      parameters: {
        type: 'object',
        properties: {
          styleId: { type: 'string', description: '模块样式 ID，如 module-card、module-timeline、module-list、module-plain' },
          title: { type: 'string', description: '模块标题，如 "教育背景"' },
          content: { type: 'string', description: '模块内容，支持 HTML 标签' },
        },
        required: ['styleId', 'title', 'content'],
      },
    },
    run: defineTool<AddModuleParams>((p, m) => handleAddModule(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_content',
      description: '修改已有模块的文本内容。id 必须来自当前画布中的模块。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '目标模块 id' },
          content: { type: 'string', description: '新的文本内容，支持 HTML' },
        },
        required: ['id', 'content'],
      },
    },
    run: defineTool<SetContentParams>((p, m) => handleSetContent(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_style',
      description: '修改已有模块的多个 CSS 样式属性。id 必须来自当前画布。支持的属性见上方「样式属性键名及可选值」完整列表。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '目标模块 id' },
          style: { type: 'object', description: 'CSS 样式键值对，如 {"fontSize":"18px","color":"#1a202c"}' },
        },
        required: ['id', 'style'],
      },
    },
    run: defineTool<SetStyleParams>((p, m) => handleSetStyle(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_property',
      description: '修改已有模块的单个 CSS 属性。适合微调。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '目标模块 id' },
          property: { type: 'string', description: 'CSS 属性名，如 fontSize、color、padding' },
          value: { type: 'string', description: 'CSS 属性值，如 "16px"、"#333"' },
        },
        required: ['id', 'property', 'value'],
      },
    },
    run: defineTool<SetPropertyParams>((p, m) => handleSetProperty(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_style_by_type',
      description: '按模块类型批量修改样式。适合“所有文本改成蓝色”“除标题外统一白色背景”等批量操作。比逐个调用 set_style 效率高得多。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'array', items: { type: 'string' }, description: '限定修改的模块类型，如 ["text","list","flex"]。不传则匹配所有类型。' },
          except: { type: 'array', items: { type: 'string' }, description: '排除的模块类型，如 ["heading","image"]。配合 type 或单独使用。' },
          style: { type: 'object', description: 'CSS 样式键值对，如 {"backgroundColor":"#ffffff","fontSize":"16px"}', required: ['style'] },
        },
        required: ['style'],
      },
    },
    run: defineTool<SetStyleByTypeParams>((p, m) => handleSetStyleByType(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_field',
      description: '修改模块的非样式元数据字段。可设置的字段：name（姓名）、jobTitle（求职意向）、birth（出生年月）、phone（电话）、email（邮箱）、title（模块标题）。注意：这不同于 set_content（改 HTML 正文）和 set_style（改 CSS 样式）。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '目标模块 id' },
          field: { type: 'string', description: '字段名：name、jobTitle、birth、phone、email、title' },
          value: { type: 'string', description: '字段值，纯文本' },
        },
        required: ['id', 'field', 'value'],
      },
    },
    run: defineTool<SetFieldParams>((p, m) => handleSetField(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_module',
      description: '删除指定模块及其所有子模块。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '要删除的模块 id' },
        },
        required: ['id'],
      },
    },
    run: defineTool<RemoveModuleParams>((p, m) => handleRemoveModule(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'move_module',
      description: '移动模块到新的父容器或调整在同级中的位置。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '要移动的模块 id' },
          parent_id: { type: 'string', description: '目标父容器 id，省略则移到画布顶层' },
          index: { type: 'number', description: '在父容器中的位置索引（从 0 开始）' },
        },
        required: ['id', 'index'],
      },
    },
    run: defineTool<MoveModuleParams>((p, m) => handleMoveModule(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'duplicate_module',
      description: '复制指定模块，生成一个包含相同内容和样式的副本。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '要复制的模块 id' },
        },
        required: ['id'],
      },
    },
    run: defineTool<DuplicateModuleParams>((p, m) => handleDuplicateModule(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'copy_style',
      description: '模块格式刷：复制源模块的样式到目标模块。规则：同类型模块或两个都是控件(text/heading/list之间)→复制全部属性及元数据；其余跨类型→仅复制共有布局属性(padding/margin/背景/圆角/阴影/宽高等)和基本字段(name/title)。',
      parameters: {
        type: 'object',
        properties: {
          source_id: { type: 'string', description: '源模块 id（复制谁的样式）' },
          target_id: { type: 'string', description: '目标模块 id（把样式应用到谁）' },
        },
        required: ['source_id', 'target_id'],
      },
    },
    run: defineTool<CopyStyleParams>((p, m) => handleCopyStyle(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'copy_text_style',
      description: '文字样式复制：将源模块的文字排版属性复制到目标模块。自动从 module.style 和 HTML 内联样式(&lt;span style="..."&gt;) 中提取字体/字号/颜色等，写入目标 module.style 并清除目标 HTML 中冲突的內联样式，使 module.style 生效。适合"让这些字和那些字长得一样"的需求。',
      parameters: {
        type: 'object',
        properties: {
          source_id: { type: 'string', description: '源模块 id（复制谁的文字样式）' },
          target_id: { type: 'string', description: '目标模块 id（把文字样式应用到谁）' },
        },
        required: ['source_id', 'target_id'],
      },
    },
    run: defineTool<CopyTextStyleParams>((p, m) => handleCopyTextStyle(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'apply_template',
      description: '应用预设简历模板，清空画布并生成模板结构。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '模板名称：simple（简约）或 classic（经典）' },
        },
        required: ['name'],
      },
    },
    run: defineTool<ApplyTemplateParams>((p, m) => handleApplyTemplate(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_modules',
      description: '批量删除多个模块。ids 必须来自当前画布上的模块 ID。比逐个调用 remove_module 效率高得多。',
      parameters: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: '要删除的模块 ID 数组' },
        },
        required: ['ids'],
      },
    },
    run: defineTool<DeleteModulesParams>((p, m) => handleDeleteModules(p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'clear_canvas',
      description: '清空画布，删除所有模块。慎用——不可撤销。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    run: defineTool<ClearCanvasParams>((_p, m) => handleClearCanvas(_p, m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'export_pdf',
      description: '导出当前简历为 PDF 并触发浏览器打印。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    run: defineTool<ExportPdfParams>((_p, m) => handleExportPdf(m)),
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_uploaded_file',
      description: '获取用户上传的简历文件信息（base64 编码）。上传文件后必须先调用此工具获取文件数据，再调用 execute_skill 技能 import-resume 进行解析。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'execute_skill',
      description: '执行高级技能。可用技能：generate-resume（生成简历，参数 {"template":"simple"|"classic"}）、polish-text（润色文本，参数 {"moduleId":"模块ID"}）、evaluate-resume（评估简历）、smart-fill（智能填充，参数 {"info":"用户背景"}）、import-resume（导入上传的简历文件，无参数）。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '技能名称' },
          params: { type: 'object', description: '技能参数' },
        },
        required: ['name'],
      },
    },
  },
];

/** 兼容层：按工具名查找可执行 runner（execute_skill / get_uploaded_file 由 ChatPanel 按技能上下文单独处理） */
export const toolHandlerMap: Record<string, RegisteredToolRunner> = Object.fromEntries(
  aiTools.flatMap((tool) => (tool.run ? [[tool.function.name, tool.run]] : [])),
) as Record<string, RegisteredToolRunner>;

// ==================== System Prompt ====================

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
- 基础控件: ${basicInfo}`;
}

export function buildSystemPrompt(): string {
  return `你是一个专业的简历编辑器 AI 助手。你可以通过 function calling 调用工具来操作画布上的模块。

## 创建简历的方式
1. **使用模板**：调用 apply_template 工具，参数 name 为 simple 或 classic。
2. **逐模块构建**：使用 add_header、add_module、add_text 等工具自由组合。一般三步骤：
   - 用 add_header 创建简历头
   - 用 add_module 逐个创建内容模块（教育背景、工作经历等）
   - 用 set_content / set_style / set_property 精细调整
3. **智能填充**：当用户提供自身背景并要求填充简历时，使用 execute_skill 工具，技能名 smart-fill。
4. **导入简历**：当用户上传了简历文件（[上传文件] 提示），按顺序：(1) 调用 get_uploaded_file，(2) 调用 execute_skill 技能名 import-resume。

## 关键约束
- 修改已有模块时，id 必须来自下方「当前画布」列表，禁止编造 id
- 创建简历头使用 add_header，创建内容模块使用 add_module——这两个工具会自动生成子控件，禁止手动为它们构造 children
- add_flex / add_grid 仅用于包装已存在的子模块；创建新容器+子控件组合时使用 add_flex_inline / add_grid_inline
- 样式属性键名及可选值：
  通用布局: width, height, minWidth, maxWidth, minHeight, maxHeight, padding, margin, backgroundColor, borderRadius, opacity, overflow
  边框（需搭配使用，见下方说明）: borderScope(全部/上/下/左/右), borderStyle(none/solid/dashed/dotted), borderColor, borderWidth
  渐变背景: gradientDirection(none | "to bottom" | "to right" | "to bottom right" | "to bottom left"), gradientFrom, gradientTo
  阴影: boxShadow(none | "0 1px 3px rgba(0,0,0,0.1)" | "0 4px 6px rgba(0,0,0,0.1)" | "0 8px 16px rgba(0,0,0,0.15)")
  文字排版: fontFamily, fontSize, fontWeight, fontStyle, fontVariant, color, textAlign, textDecoration, textTransform, textIndent, lineHeight, letterSpacing, wordSpacing, whiteSpace, wordBreak, overflowWrap, direction
  弹性布局(仅 flex/header/module): display, flexDirection, alignItems, justifyContent, flexWrap, gap
  网格布局(仅 grid): gridTemplateColumns, gridTemplateRows, gap
  图片(仅 image): objectFit
  边框设置说明: 同时设置 borderScope、borderStyle、borderColor、borderWidth 四个键才能生效，如 {"borderScope":"全部","borderStyle":"solid","borderColor":"#333","borderWidth":"2px"}
- 颜色值统一用 #rrggbb，尺寸值统一用 px 单位
  - 单次回复可调用多个 tool，但须等待 tool 结果后再决定下一步。每次请求的工具调用总数不超过 5 个，达到后应直接回复用户
- 连续同一 tool 失败 2 次后不得再试，改为向用户报告具体错误

## 内容格式
支持 HTML 标签（<p>、<ul>、<li>、<strong>、<br/> 等）。

${generateAvailableModules()}`;
}
