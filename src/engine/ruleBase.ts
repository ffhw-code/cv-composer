// src/engine/ruleBase.ts

export interface Rule {
  keywords: string[];         // 中文关键词
  content: string;            // 注入给 AI 的规则说明
  example?: string;           // 可选的指令 JSON 示例
}

const RULE_BASE: Rule[] = [
  // ========== 基础控件 ==========
  {
    keywords: ['文本框', '文本', '文字框', '输入文字', '段落'],
    content: '当用户要求添加“文本框”时，使用 type: "text", styleId: "text-default"。',
    example: '[{"action":"addModule","params":{"type":"text","styleId":"text-default","content":"文本内容"}}]',
  },
  {
    keywords: ['标题', 'heading', '大标题'],
    content: '当用户要求添加“标题”时，使用 type: "heading", styleId: "heading-default"。',
    example: '[{"action":"addModule","params":{"type":"heading","styleId":"heading-default","content":"标题文字"}}]',
  },
  {
    keywords: ['列表', '清单', '项目符号'],
    content: '当用户要求添加“列表”时，使用 type: "list", styleId: "list-default"。',
    example: '[{"action":"addModule","params":{"type":"list","styleId":"list-default","content":"<ul><li>项目一</li></ul>"}}]',
  },
  {
    keywords: ['图片', '照片', '头像', 'image'],
    content: '当用户要求添加“图片”时，使用 type: "image", styleId: "image-default"。',
    example: '[{"action":"addModule","params":{"type":"image","styleId":"image-default"}}]',
  },
  {
    keywords: ['弹性容器', 'flex', '水平排列', '垂直排列'],
    content: '当用户要求添加“弹性容器”时，使用 type: "flex", styleId: "flex-default"。',
    example: '[{"action":"addModule","params":{"type":"flex","styleId":"flex-default"}}]',
  },
  {
    keywords: ['网格容器', 'grid', '两列', '三列', '表格布局'],
    content: '当用户要求添加“网格容器”时，使用 type: "grid", styleId: "grid-default"。',
    example: '[{"action":"addModule","params":{"type":"grid","styleId":"grid-default"}}]',
  },

  // ========== 简历头样式 ==========
  {
    keywords: ['经典分栏', '经典简历头', '经典样式', 'header-classic'],
    content: '经典分栏简历头：type: "header", styleId: "header-classic"。包含左侧照片和右侧两列信息。',
    example: '[{"action":"addModule","params":{"type":"header","styleId":"header-classic"}}]',
  },
  {
    keywords: ['蓝色渐变', '渐变背景', 'header-gradient'],
    content: '蓝色渐变简历头：type: "header", styleId: "header-gradient"。左侧信息，右侧圆形照片。',
    example: '[{"action":"addModule","params":{"type":"header","styleId":"header-gradient"}}]',
  },
  {
    keywords: ['名片风格', '名片式', 'header-business'],
    content: '名片风格简历头：type: "header", styleId: "header-business"。左侧信息，右侧小照片。',
    example: '[{"action":"addModule","params":{"type":"header","styleId":"header-business"}}]',
  },

  // ========== 模块样式 ==========
  {
    keywords: ['卡片样式', '模块-卡片', 'module-card'],
    content: '卡片样式模块：type: "module", styleId: "module-card"。带圆角背景的卡片。',
    example: '[{"action":"addModule","params":{"type":"module","styleId":"module-card","title":"模块标题"}}]',
  },
  {
    keywords: ['时间线样式', '时间线模块', 'module-timeline'],
    content: '时间线样式模块：type: "module", styleId: "module-timeline"。左侧蓝色竖线。',
    example: '[{"action":"addModule","params":{"type":"module","styleId":"module-timeline"}}]',
  },
  {
    keywords: ['简洁列表', '列表模块', 'module-list'],
    content: '简洁列表模块：type: "module", styleId: "module-list"。标题+项目符号列表。',
    example: '[{"action":"addModule","params":{"type":"module","styleId":"module-list"}}]',
  },
  {
    keywords: ['简约无边框', '无边框模块', 'module-plain'],
    content: '简约无边框模块：type: "module", styleId: "module-plain"。无边框的极简风格。',
    example: '[{"action":"addModule","params":{"type":"module","styleId":"module-plain"}}]',
  },

  // ========== 常用操作 ==========
  {
    keywords: ['修改颜色', '设置颜色', '字体颜色', '背景颜色'],
    content: '修改颜色使用 setProperty 或 setStyle。例：{"action":"setProperty","params":{"id":"模块ID","property":"color","value":"#333"}}',
  },
  {
    keywords: ['调整大小', '宽度', '高度', '尺寸'],
    content: '修改尺寸使用 setProperty 或 setStyle。例：{"action":"setProperty","params":{"id":"模块ID","property":"width","value":"200px"}}',
  },
  {
    keywords: ['移动', '换位置', '调整顺序', '移到'],
    content: '移动模块使用 moveModule，需要先通过 get_canvas_state 获取模块 ID。',
  },
  {
    keywords: ['删除', '移除', '去掉'],
    content: '删除模块使用 removeModule，需要先通过 get_canvas_state 获取模块 ID。',
  },
  {
    keywords: ['修改内容', '更改文字', '输入内容', '填写'],
    content: '修改模块内容使用 setContent。例：{"action":"setContent","params":{"id":"模块ID","content":"新内容"}}',
  },

  // ========== 核心约束（始终注入） ==========
  {
    keywords: [], // 始终注入
    content: `重要规则：
1. 所有基础控件（文本、标题、列表、图片、弹性容器、网格容器）的 styleId 默认为 type-default 格式（如 text-default, heading-default）。
2. 修改已有模块前，必须先调用 get_canvas_state 获取真实模块 ID。
3. 创建新模块时使用 tempId，后续指令通过 tempId 引用。
4. 指令数组只包含 JSON，不要添加解释文本。`,
  },

  // ========== 组合需求（完整模板） ==========
  {
    keywords: ['生成简历头', '创建简历头', '添加一个简历头', '帮我生成一个简历头'],
    content: `当用户要求生成简历头时，请创建一个完整的带子控件的简历头，而不是空容器。
示例（经典分栏简历头）：
[{"action":"addModule","tempId":"header","params":{"type":"header","styleId":"header-classic","style":{"display":"flex","flexDirection":"row","alignItems":"flex-start","gap":"20px","padding":"24px","backgroundColor":"#ffffff","borderRadius":"12px","border":"1px solid #e8ecf1","boxShadow":"0 1px 3px rgba(0,0,0,0.04)"},"children":[{"action":"addModule","tempId":"photo","params":{"type":"image","styleId":"image-default","style":{"width":"100px","height":"130px","borderRadius":"8px","objectFit":"cover"}}},{"action":"addModule","tempId":"infoContainer","params":{"type":"flex","styleId":"flex-default","style":{"flexDirection":"column","gap":"12px","flex":"1"},"children":[{"action":"addModule","params":{"type":"text","styleId":"text-default","style":{"fontSize":"24px","fontWeight":"700","color":"#1a202c"},"content":"姓名"}},{"action":"addModule","params":{"type":"grid","styleId":"grid-default","style":{"gridTemplateColumns":"1fr 1fr","gap":"12px"},"children":[{"action":"addModule","params":{"type":"text","styleId":"text-default","style":{"fontSize":"15px","color":"#4a5568"},"content":"求职意向"}},{"action":"addModule","params":{"type":"text","styleId":"text-default","style":{"fontSize":"15px","color":"#4a5568"},"content":"出生年月"}},{"action":"addModule","params":{"type":"text","styleId":"text-default","style":{"fontSize":"15px","color":"#4a5568"},"content":"电话"}},{"action":"addModule","params":{"type":"text","styleId":"text-default","style":{"fontSize":"15px","color":"#4a5568"},"content":"邮箱"}}]}]}}]}}]`,
  },
  {
    keywords: ['生成简约简历', '创建一个简约的简历', '生成一个简历', '简单简历'],
    content: `当用户要求生成简约简历时，请创建包含简历头（经典分栏）和至少两个模块（卡片样式）的完整结构。确保每个模块都有默认内容。
示例指令集（先创建 header，再创建两个 module）：
[
  {"action":"addModule","tempId":"header","params":{"type":"header","styleId":"header-classic","style":{...},"children":[...]}},
  {"action":"addModule","params":{"type":"module","styleId":"module-card","style":{},"title":"教育背景","content":"点击此处编辑..."}},
  {"action":"addModule","params":{"type":"module","styleId":"module-card","style":{},"title":"工作经历","content":"点击此处编辑..."}}
]
具体子控件结构请参考“生成简历头”的示例。`,
  },
  {
    keywords: ['添加一个卡片模块', '添加模块', '教育背景', '工作经历', '技能'],
    content: `创建卡片样式模块的完整指令示例：
{"action":"addModule","tempId":"mod1","params":{"type":"module","styleId":"module-card","style":{"display":"flex","flexDirection":"column","gap":"12px","padding":"20px","backgroundColor":"#ffffff","borderRadius":"12px","border":"1px solid #e2e8f0","boxShadow":"0 2px 8px rgba(0,0,0,0.04)"},"children":[{"action":"addModule","params":{"type":"heading","styleId":"heading-default","style":{"fontSize":"20px","fontWeight":"700","color":"#0f172a","paddingBottom":"8px","borderBottom":"2px solid #f1f5f9"},"content":"模块标题"}},{"action":"addModule","params":{"type":"text","styleId":"text-default","style":{"fontSize":"15px","color":"#334155","lineHeight":"1.6"},"content":"点击此处编辑详细内容..."}}]}}`,
  },

  {
  keywords: ['极简简历', '最简简历', '只有姓名和电话'],
  content: `当用户要求极简简历时，直接生成原子指令，不要调用模板。示例：
[{ "action": "addModule", "params": { "type": "text", "styleId": "text-default", "style": { "fontSize": "24px" }, "content": "姓名" } },
 { "action": "addModule", "params": { "type": "text", "styleId": "text-default", "content": "电话：138-0000-0000" } }]`,
},

{
  keywords: ['复杂指令', '生成模块', '构建简历', '丰富简历', '添加模块'],
  content: `指令生成自查清单（每次生成指令后必须逐条核对）：
1. 所有 action: "addModule" 且 type 为 "module"、"header"、"flex"、"grid" 的指令，必须包含 children 数组。
2. children 不能为空数组 []，至少包含一个子 addModule 指令。
3. 示例：创建卡片模块的正确指令格式：
{ "action": "addModule", "params": { "type": "module", "styleId": "module-card", "children": [
  { "action": "addModule", "params": { "type": "heading", "styleId": "heading-default", "content": "标题" } },
  { "action": "addModule", "params": { "type": "text", "styleId": "text-default", "content": "内容" } }
] } }
4. 如果遗漏 children，引擎将拒绝执行并返回错误。`,
},

];

export function retrieveRules(userInput: string): string[] {
  const matched: string[] = [];
  for (const rule of RULE_BASE) {
    if (rule.keywords.length === 0 || rule.keywords.some(kw => userInput.includes(kw))) {
      matched.push(rule.content);
      if (rule.example) matched.push(`指令示例：${rule.example}`);
    }
  }
  // 去重，限制最多 8 条
  return [...new Set(matched)].slice(0, 8);
}