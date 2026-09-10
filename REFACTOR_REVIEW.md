# cv-composer 重构 Review 说明

本文档说明 `eb884f9` 之后 7 个提交的改动内容、动机与收益，供 review 使用。

## 背景

本轮把之前"架构修复"的改动拆成 7 个可独立 review、可独立构建的提交，全部为重构性质，不改业务行为（仅新增一处非浏览器降级提示与 CI 门禁）。基线提交为 `eb884f9`（数据持久化 + DEPLOYMENT.md）。

## 验证方式

- 每个提交都用独立临时 `git worktree` 跑过 `tsc -b --force` 与全部 240 个测试，均通过。
- `HEAD` 上 `npm run lint`、`npm run build` 通过，工作区干净。
- 提交顺序按依赖排列（类型层 → 样式迁移 → 工具注册表 → 默认值 → DOM 边界 → 组件抽离 → CI），每一步都能单独构建。

## 提交清单

### 1. `dd5f910` refactor(types): 抽取 ResumeModule 领域类型到 src/types/resume，消除 utils→store 反向依赖

- 改了什么：新增 `src/types/resume.ts`；`ResumeModule` 原先定义在 `store/useResumeStore.ts` 内，现删除定义并改为 `import type`；29 个文件（engine/utils/components/tests）统一从类型层导入。
- 为什么改：领域模型放在状态容器里，导致任何只想用类型的模块都得反向依赖 store。
- 解决了什么：依赖方向变单向——`store`/`utils`/`engine` 只依赖 `types`，`utils→store` 的反向依赖消失，后续也更不容易踩到循环依赖。

### 2. `b183d96` refactor(styles): 将 styleRegistry 移出 store 并与 styleInit 合并到 src/styles

- 改了什么：把 `store/styleRegistry.ts` 和根目录 `styleInit.ts` 迁到 `src/styles/`（注册表 + 注册内容两个文件职责不变），并同步 9 处引用（App、useResumeStore、commandExecutor、aiPrompt、EditableModule、ResumeHeader、StylePanel 以及两个测试）。
- 为什么改：`store/` 里混着"React 组件注册表"，初始化入口又散在根目录，职责不清晰。
- 解决了什么：store 只保留状态；样式系统的注册入口集中在 `src/styles/`，新增或查找样式只需看一个目录。

### 3. `acec957` refactor(ai): 工具链改为单注册表，schema 与 handler 同条目并去掉 as unknown as 路由表

- 改了什么：`aiTools` 每个条目内联 `run` 绑定（`defineTool<XxxParams>`），新增 `ChatToolEntry` / `RegisteredToolRunner` 类型并显式标注；`toolHandlerMap` 改为从注册表派生；删除 `toolHandlers.ts` 底部约 120 行手写路由表与 24 处 `as unknown as`。
- 为什么改：工具 schema（发给 LLM）和实现（本地执行）分处两个文件，靠手写映射加双重类型断言桥接，改一个工具要动多处、类型在边界处失效。
- 解决了什么：单一来源、schema 与 handler 同条目；参数断言收敛到 `defineTool` 这一处信任边界（LLM 返回的 JSON 天然是运行时数据），消除了重复维护和 schema/实现漂移。

### 4. `dcc4f8b` refactor(ai): provider 默认 baseUrl 收敛到 aiConfig 的 resolveBaseUrl

- 改了什么：`aiConfig.ts` 新增 `DEFAULT_BASE_URL` 与 `resolveBaseUrl()`；替换 `aiApi.ts`（4 处）、`ChatPanel`、`resumeParser` 中重复的 dashscope 硬编码。
- 为什么改：同一个默认地址散落 6 处，将来更换默认服务商极易漏改。
- 解决了什么：默认值单点定义，语义用函数表达（空串视为未配置，回退默认）。

### 5. `b0de5fe` refactor(engine): 标注 layoutMeasurer/export 为 browser-only 并补非浏览器守卫

- 改了什么：`layoutMeasurer.ts`、`utils/export.ts` 顶部加 browser-only 说明；`skillExecutor` 的 import-resume 画布测量前增加"非浏览器环境"早退并返回明确文案。
- 为什么改：这些模块依赖真实 DOM（`document`、iframe、rAF），但文件里没有任何说明，在 Node/SSR/单测环境下的行为是隐式的。
- 解决了什么：边界显式化、可读性提升；非浏览器环境退化为明确提示而非意外崩溃，也让"哪些是纯逻辑、可离屏测试"一目了然。

### 6. `6547064` refactor(ai): 抽出 useAiChat，ChatPanel 只保留渲染

- 改了什么：新增 `useAiChat.ts`，承载多轮 function-calling 循环、工具/技能执行、JSON 修复与重试、建议应用、布局树导出、文件导入编排；`ChatPanel.tsx` 从 464 行降到 134 行，仅保留渲染与交互转发。
- 为什么改：一个组件同时承担 AI 编排与 UI，职责过重、难以单独测试与维护。
- 解决了什么：视图与逻辑分离，编排逻辑可独立复用与测试，组件更薄、更易读。

### 7. `5d92310` ci: 部署前增加 lint 与测试门禁，并同步部署文档

- 改了什么：`.github/workflows/deploy.yml` 在 `npm run build` 前插入 `npm run lint` 与 `npm test`；`DEPLOYMENT.md` 同步流程与"任一失败则不发布"的说明。
- 为什么改：此前 CI 只做构建，lint 错误或测试失败的代码也能直接上线。
- 解决了什么：发布前有了 lint/测试门禁，坏改动会被拦在部署之外，文档与实现保持一致。
- 备注：这条不属于 6 条架构重构，是之前遗留的待提交改动，单独成一条提交。

## 改动规模

| 提交 | 主题 | 涉及文件 |
|---|---|---|
| `dd5f910` | 领域类型抽取 | 29 |
| `b183d96` | 样式注册表迁移 | 11 |
| `acec957` | 工具单注册表 | 4 |
| `dcc4f8b` | 默认 baseUrl 收敛 | 4 |
| `b0de5fe` | browser-only 边界 | 3 |
| `6547064` | ChatPanel 抽 hook | 2 |
| `5d92310` | CI 门禁 + 文档 | 2 |

## 风险与回滚

- 风险较低：除第 5 条的降级提示与第 7 条的 CI 门禁外，其余均为等价重构。
- 回滚：可逐个 `git revert`；若尚未 push，也可整体 `git reset --hard eb884f9`（会丢弃这 7 个提交）。

## 附注

拆分过程中重建过一次提交历史：第 1 个提交最初漏了 `src/store/styleRegistry.ts` 的类型导入更新，导致该提交无法通过类型检查，已修正；当前每个提交都能独立构建。
