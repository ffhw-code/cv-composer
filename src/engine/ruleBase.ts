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