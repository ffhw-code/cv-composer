# cv-composer — AI 智能简历编辑器

AI 驱动的简历编辑器，融合自动浮动排版引擎与自然语言交互。支持手动拖拽编辑和 AI Function Calling 全量操作——输入内容，自动生成专业排版。

## 功能特性

- **可视化编辑**：拖拽控件到画布，点击模块即可调整样式、布局、内容
- **AI 对话**：自然语言指令驱动模块创建、内容填充、排版调整、模板应用
- **简历复现**：上传简历图片，AI 提取内容与排版信息，忠实重建为可编辑格式
- **Function Calling**：25+ 工具覆盖全部编辑器操作（创建、修改、删除、移动、复制、导出等）
- **格式刷**：支持跨模块复制样式和文字排版属性
- **撤销/重做**：30 步历史记录
- **多模板**：经典分栏、蓝色渐变、名片风格、卡片/时间线/列表/简约模块样式
- **JSON 导入导出**：保存为 JSON 文件，随时加载继续编辑
- **PDF 导出**：清除编辑器标记后直接打印为 PDF

## 快速开始

```bash
npm install
npm run dev        # 启动开发服务器 (默认 http://localhost:5173)
npm run build      # 生产构建
npm run preview    # 预览生产构建
npm test           # 运行单元测试 (230 tests)
npm run lint       # 代码规范检查
npx tsc --noEmit   # 类型检查
```

### 生产部署

```bash
npm run build
# dist/ 目录可直接部署到任意静态文件服务器
```

## AI 配置

点击右上角设置按钮，配置 AI 解析服务：

| 提供商 | 对话模型 | 视觉模型 | Base URL |
|---|---|---|---|
| 阿里云百炼（推荐） | `qwen-max` / `qwen-plus` | `qwen-vl-max` | 自动填写 |
| OpenAI | `gpt-4o` / `gpt-4o-mini` | `gpt-4o` | 自动填写 |
| 自定义接口 | 自行输入 | 自行输入 | 需手动输入 |

- **API Key**：在对应平台获取，仅保存在浏览器当前会话中（关闭标签页即清除）
- **视觉模型**：上传简历图片解析需要视觉模型。如果配置了非视觉模型，解析时会收到明确提示

## 使用方式

### 手动编辑

左侧面板拖拽控件到画布，点击模块后可在顶部工具栏分组编辑属性（基本 / 背景 / 边框 / 效果 / 布局）。点击文字模块进入编辑模式可调整字体、字号、字重、对齐等。

支持深色主题、边框设置（四边独立）、渐变背景、阴影效果等丰富样式。

### AI 对话

聊天面板中输入自然语言指令，AI 通过 Function Calling 直接操作画布：

```
生成一个简历模板
根据我的专业背景补充内容
把教育经历改为两栏布局
将标题字号统一为 20px
评估当前简历质量
上传简历图片 → 自动解析并重建
```

### 导出

- 工具栏「保存」导出为 JSON（可后续加载继续编辑）
- 工具栏「PDF」直接导出为 PDF

### 快捷键

| 快捷键 | 功能 |
|---|---|
| `Esc` | 退出编辑模式 |
| `Ctrl+Z` / `Cmd+Z` | 撤销 |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | 重做 |
| `Delete` / `Backspace` | 删除选中模块 |

## 项目结构

```
src/
├── main.tsx                    # 入口
├── App.tsx                     # 根组件，编排布局
├── index.css                   # 全局样式
├── styleInit.ts                # 风格注册表初始化
├── assets/images/              # 模板缩略图
├── components/
│   ├── AI/                     # AI 对话面板、API 调用、文件导入
│   ├── Canvas/                 # 画布区域、模块拖拽、右键菜单、工具栏
│   ├── Module/                 # 模块面板、简历头、可编辑模块
│   ├── Settings/               # API Key 配置弹窗
│   ├── Styles/                 # 控件渲染组件 (Text/Heading/List/Image/Flex/Grid)
│   └── Toolbar/                # 顶部工具栏、样式属性面板
├── engine/                     # 核心引擎 (不依赖 React)
│   ├── aiPrompt.ts             # System prompt + OpenAI tool 定义
│   ├── commandExecutor.ts      # 指令执行器 (Command → Module tree)
│   ├── layoutEngine.ts         # A4 分页算法
│   ├── layoutScaler.ts         # 溢出缩放
│   ├── layoutMeasurer.ts       # DOM 高度测量
│   ├── layoutTreeNormalizer.ts # 布局树规范化
│   ├── ruleBase.ts             # 固定约束规则
│   ├── skillExecutor.ts        # 技能系统 (生成/导入/润色/评估/填充)
│   ├── templates.ts            # 预设模板
│   └── toolHandlers.ts         # Tool → 纯函数映射 (25+ tools)
├── hooks/                      # 自定义 Hooks
├── store/
│   ├── useResumeStore.ts       # Zustand 状态管理
│   └── styleRegistry.ts        # 风格注册表
├── tiptap/                     # TipTap 编辑器扩展
└── utils/                      # 工具函数 (导出/解析/JSON 修复/ID 生成)
```

## 架构设计

编辑器采用 **工具驱动架构**（Tool-driven Architecture），AI 通过 OpenAI Function Calling 协议调用标准化工具接口，工具处理函数内部通过 `commandExecutor` 构造指令并操作模块树：

```
用户输入 → ChatPanel → LLM API (Function Calling)
                         ↓
              toolHandlers (纯函数映射)
                         ↓
            commandExecutor (Command[] → Module tree)
                         ↓
            useResumeStore (Zustand, 带 undo/redo)
                         ↓
            React 组件渲染 (A4 画布)
```

**简历复现管线**（上传图片 → 可编辑简历）：

```
图片上传 → 视觉模型解析 → ParsedResume (LayoutTree + Data)
        → normalizeLayoutTree (规范化/去冗余)
        → translateLayoutTree (LayoutTree → Command[])
        → commandExecutor → 画布渲染
```

## 技术栈

React 19 · TypeScript 6 · Vite 8 · Tailwind CSS 4 · TipTap 3 · Zustand 5 · dnd-kit 6 · Vitest 4

## 测试

```bash
npm test                # 运行全部测试
npm run test:watch      # watch 模式
```

| 模块 | 测试覆盖 |
|---|---|
| `engine/` | commandExecutor, layoutEngine, layoutScaler, layoutTreeNormalizer, ruleBase, templates, toolHandlers |
| `utils/` | export, jsonRepair, moduleUtils, resumeParser |
| `components/` | aiApi, useFileImport |

## License

MIT
