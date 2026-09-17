# TASK_ENG —— PM 下发给 ENG 的任务卡

唯一写者：PM。ENG 只读本文件，不得修改（包括状态）。
格式约定：相邻任务模块之间用双分割线间隔；新卡追加在文件末尾；分割线之后的「裁决区」只写 `PM："内容"`。
状态取值见 `AGENTS.md` 第 7 节；状态只能由 PM 修改。

创建：2026-09-16（首次启用多会话协作流程）。

---

当前状态：已发布 **3 张卡** —— TASK-001、TASK-002（批次 0），TASK-015（批次 1）。

---

TASK-001 开发：修正 `README.md` 中的过时信息
编号族：TASK-001
状态：已完成（2026-09-16，提交 `ff0826c`，PM 复核通过）
优先级：P2
链式：短链
依赖：无
允许改动文件：`README.md`（**只允许改下面点名的三行**，不得顺手改动其它内容）
描述：
  - 第 95 行：`npm test           # 运行单元测试 (230 tests)` → 用例数改为实测值 **304**；
  - 第 97 行：`npx tsc --noEmit   # 类型检查` → 改为 `npx tsc -b`；
    理由：根 `tsconfig.json` 是 `files: []` + references 的空壳，`npx tsc --noEmit` 对真实类型错误也返回 0（已实测），
    只有 `npx tsc -b` 是有效的类型检查（见 `AGENTS.md` 第 3 节「命令真相表」）。
  - 第 203 行：`npm test           # 运行全部测试 (230 个)` → 同样改为 **304**。
    （PM 复核时发现该行有同一处过时数字，已报老板；若老板另有指示以老板为准。）
  只做数字与命令的替换，**不要**引入「动态生成数字」等额外机制，也不要新增说明段落。
验收标准：
  1. `grep -n "230" README.md` 无输出；
  2. `grep -n "tsc --noEmit" README.md` 无输出，且 `npx tsc -b` 出现在第 97 行位置；
  3. 第 95、203 行的数字与 `npm test` 实测结果一致（当前为 304）；
  4. `git diff --stat` 只显示 `README.md` 一个文件被修改；
  5. 四项全绿（见下）。
改前基线：无（纯文档改动，不声称改变任何指标，故免两级基线）
成本预算：0 tokens
----
PM："**复核结论：通过**（2026-09-16）。
复核方式（全部由 PM 独立复跑/独立执行，不采信汇报文字）：`git show --stat ff0826c` → 只含 `README.md`，3 增 3 删；
`grep -n "230" README.md` 无输出；`grep -n "tsc --noEmit" README.md` 无输出；`sed -n '93,98p;201,205p' README.md`
确认第 95 行 `(304 tests)`、第 97 行 `npx tsc -b`、第 203 行 `(304 个)`；
四项全绿：`npx tsc -b` 退出码 0、`npx eslint . --max-warnings 0` 退出码 0 且 0 告警、
`npm test` 报 `Test Files 17 passed (17)` / `Tests 304 passed (304)`、`npm run build` 成功（入口 849,296 B、分块 11,857 B）。
全部与 ENG 汇报一致，未发现数字不一致项。
残余风险（记录，不返工）：README 的用例数是静态快照，后续用例增加会再次过时；ENG 报告的「测试小节按文件罗列覆盖面」
同属静态描述漂移。两项均按卡不作为，如后续需要，PM 另开卡（属 P2）。
本卡**免 QA 回归**（纯文档，四项全绿已由 PM 复跑覆盖）。"

============================================================

TASK-002 开发：删除两个残留备份文件
编号族：TASK-002
状态：已完成（2026-09-16，PM 复核通过；按卡免 QA 回归）
优先级：P2
链式：全链·不改指标
依赖：无（与 TASK-001 同批交付，全绿只跑一次）
允许改动文件：
  - `src/components/AI/ChatPanel.tsx.orig`（**只允许删除**）
  - `src/engine/skillExecutor.ts.orig`（**只允许删除**）
  除这两个文件外，**不得**改动任何 `.ts` / `.tsx` / 配置文件。
描述：
  两个 `.orig` 文件是重构前留下的备份，已确认：
  - 被 `.gitignore` 的 `*.orig` 规则忽略，**未被版本库跟踪**，仓库内也没有任何引用；
  - `ChatPanel.tsx.orig` 是重构前的单文件版本；`skillExecutor.ts.orig` 缺少现在的浏览器环境判断；
  - 它们不参与类型检查（`.orig` 不是 TypeScript 扩展名）、不参与构建，也不参与测试收集。
  执行：直接删除这两个文件即可。**注意删除不可逆**（不在版本库，删后无法找回）；老板已明确要求删除。
验收标准：
  1. `ls src/components/AI/ChatPanel.tsx.orig src/engine/skillExecutor.ts.orig` 报「不存在」；
  2. `src/components/AI/ChatPanel.tsx` 与 `src/engine/skillExecutor.ts` 内容**未被改动**（`git status` 不出现这两个文件）；
  3. `grep -rn "\.orig" src` 无引用；
  4. 四项全绿（见下）；
  5. 交付时说明：本任务**不产生任何代码提交**（被忽略的文件删除不出现在 `git status` 里），
     故 TASK-001 的提交只包含 `README.md`。
改前基线：无。理由：删除的是未被跟踪、无引用、不参与构建与测试收集的备份文件，不可能改变体积、用例数或耗时。
  故免两级基线（依 `AGENTS.md` 第 4.3 节「不声称改变指标」豁免），但仍按全链跑四项全绿。
成本预算：0 tokens
回归要求：PM 自核（`ls` + 四项全绿输出）后免 QA 回归。
----
PM："**复核结论：通过**（2026-09-16）。
复核方式：`ls src/components/AI/ChatPanel.tsx.orig src/engine/skillExecutor.ts.orig` 均报 not found；
`git status --short` 中不出现 `src/**` 的任何改动（两文件被 `.gitignore` 忽略，删除不产生 diff，符合卡内预期）；
四项全绿同上条。
**按卡免 QA 回归**（不涉及行为改动，且已删除的文件不参与类型检查、构建与测试收集）。
交付说明已确认：本批次唯一提交 `ff0826c` 只含 `README.md`，TASK-002 不产生任何提交。
授权动作：PM 归档提交时只 `git add` 协作文件，不 add 任何代码文件。"

============================================================

TASK-015 开发：`tool_choice` 按服务商可配置（打通 DeepSeek 官方端点）
编号族：TASK-015
执行门控：**已放行 · 第二轮（方案 B）**：PM 已裁决「一并修 `isUpload` 恒真」（2026-09-17），验收标准已按裁决修订。
状态：进行中（2026-09-17 阻塞已由 PM 解除；quirks 层 `d057664` 已在库内，继续第二轮）
优先级：P0
链式：全链·不改指标
依赖：TASK-014-I（探针）
允许改动文件：
  - `src/utils/aiConfig.ts`（新增 DeepSeek 预设；`ProviderQuirks` 增加开关）
  - `src/components/AI/useAiChat.ts`（按开关组装请求体）
  - `src/utils/resumeParser.ts`（**仅限**：若视觉能力判定改为「显式配置优先」后调用处需要按新语义调整；
    无需改动则不要动，并在报告中说明）
  - `src/utils/aiConfig.test.ts`、`src/components/AI/useAiChat.test.ts`（若不存在可新建 `src/components/AI/*.test.ts`）
  - `README.md` 的 AI 配置小节（仅在需要说明新服务商时改，允许不改）
  **不得**改动 `baseline/**`（属 QA，同步工作由 TASK-016-I 承担）。
  **不得**改动 `src/engine/aiPrompt.ts`（措辞不属本卡范围）。
描述：
  现状：`useAiChat.ts:150` 固定发送 `tool_choice: isUpload ? 'required' : 'auto'`。
  DeepSeek 官方端点在思考模式下对显式 `tool_choice` 直接 400，导致整条对话链路不可用。

  探针结论（`TASK-014-I`，实测，2026-09-16）：
  - **可用形状**：不发 `tool_choice` 字段 / `'auto'` / `'required'` + 显式关闭思考（三种均返回 200 与 `tool_calls`）；
  - **唯一不可用**：思考保持开启 + `'required'` → HTTP 400 `invalid_request_error`（即老板遇到的报错，影响**上传分支**）；
  - 官方端点**不需要**加 `/v1`；该档位实测**支持图片输入**；
  - 思考开启时 `usage.completion_tokens_details.reasoning_tokens` **单独计量**，且 `message.reasoning_content` 会返回非空内容。

  **PM 裁决的退化方案（按此实现，不要自行换方案）**：
  - **非上传轮次：整个 `tool_choice` 字段不发**。理由：官方兼容接口里「不发」的语义等价于 `'auto'`，
    但**规避了「显式发送该字段」这一整个分支**（少一个可能被端点拒绝的参数，风险最小，且不改变默认语义）。
    【更正 2026-09-17】下方原「未解释点」中「老板那条指令走的是 `'auto'`」的说法**已证伪**，此处不再作为理由。
  - **上传轮次（需要强制工具调用）：发 `'required'` + 同时发 `thinking: {type: 'disabled'}`**，保留「必须调用工具」的语义
    （探针实测该组合返回 200 与 `tool_calls`）。
  - 两个行为都**必须由服务商 quirks 控制**；阿里云 / OpenAI / 自定义预设的行为**保持现状**（`'auto'` / `'required'` 照发）。
  不采纳「遇到该 400 自动去掉字段重试一次」的兜底方案：它会给一个已知可控的情形引入额外请求轮次与 token 成本，
  而形状本身已经选定即可规避。若后续在别的服务商遇到同类 400，另开卡处理。

  **原「未解释点」已由 ENG 查清并结案（2026-09-17）**：`useAiChat.ts:141` 用
  `msgs.some(m => m.content?.includes('[上传文件]'))` 判定上传轮次，而**第 0 条 system 消息正文自带 `[上传文件]` 字面量**
  （`src/engine/aiPrompt.ts:666`）⇒ **`isUpload` 恒为真** ⇒ 改造前**所有**请求发的都是 `tool_choice:'required'`。
  老板那条指令虽属普通对话，实际也发了 `'required'`，正好命中探针唯一不可用的组合「思考开启 + `'required'`」
  ⇒ **400 成因完全解释；PM 原先「档位名不同」的猜测不成立，已作废。** ENG 已用 mock fetch 把该行为固化为用例，证据充分。

  **PM 裁决（2026-09-17）：方案 B —— 本卡一并修 `isUpload` 恒真。理由三条**：
  1. **不修等于修复不生效**：真实链路根本没有「非上传轮次」这一支，于是 DeepSeek 在应用里**每一轮都会走
     `required` + 关闭思考**，探针验证过的「非上传轮次可保留思考」永远用不上 —— 等于把该档位的思考能力在应用里废掉；
  2. 它正是老板原始报错的根因，留着就是留着一个已知必然 400 的组合；
  3. 修后产品行为回到设计意图（上传轮强制调用工具、普通轮交由模型判断），AI 采集也才代表真实产品行为。
  最小改法（采纳 ENG 的提议）：判定**只匹配 `role === 'user'` 的消息**，不匹配 system 消息。
  **不要把 `[上传文件]` 字面量从 prompt 里删掉** —— 它是给模型看的流程说明，问题在判定逻辑而非措辞；`aiPrompt.ts` 不在白名单。

  **同时纳入本卡（PM 决定，取代另开卡）**：`isVisionModel()` 名称正则不匹配 `deepseek-flash`，
  导致装 DeepSeek 预设后**图片上传会被前置校验直接拦下**（而 `TASK-014-I` 实测该档位支持图片输入）。
  修法要求：**不得只往正则里补名字**（正则猜名字正是本次问题的根因），改为「**显式配置优先**」——
  以用户配置的 `visionModel` / 服务商预设的视觉档位为权威依据，名称正则只作兜底。

  目标：把「发不发 `tool_choice`、是否需要在强制工具调用时关闭思考」变成**按服务商可配置**的能力，而不是写死。
  实现要点（以 TASK-014-I 的探针结论为准，下面的形状在探针出结论前不得定稿）：
  1. `ProviderQuirks` 增加一个语义明确的开关（例如 `omitToolChoice`），并在 `PROVIDER_PRESETS` 增加 DeepSeek 预设
     （baseUrl `https://api.deepseek.com`、模型档位 `deepseek-flash`——老板 2026-09-16 指定；
     若 TASK-014-I 证明该档位名不可用，以探针结论为准并回报 PM）；
  2. 开关打开时：**非上传轮次整个 `tool_choice` 字段不发**；**上传轮次发 `'required'` 并同时发
     `thinking: {type:'disabled'}`**（两者均经探针实测可用，且上传轮次保留「必须调用工具」的语义）。
     **不需要**改提示词措辞 —— `src/engine/aiPrompt.ts` 不在白名单，且问题不在措辞；
  3. 不引入任何新依赖；
  4. 新增单元测试覆盖：开关开 / 关两种情况下，请求体中 `tool_choice` 字段的出现与否，以及上传场景的退化行为
     （测试文件必须是 `src/**/*.test.ts`——`.tsx` 会被 vitest 静默忽略）；
  5. 若探针发现 `'required'` 之外还存在「思考模式必须关闭」的结论，本卡可一并加入「思考开关」，
     但**思考内容的显示层过滤不在本卡范围**（另有任务）。
验收标准：
  1. **请求形状（DeepSeek 预设）**：非上传轮次请求体**不含** `tool_choice`；上传轮次**含**
     `tool_choice:'required'` 与 `thinking:{type:'disabled'}`；均由 quirks 控制；
     **有单元测试断言字段的出现 / 缺席**；
  2. **`isUpload` 判定修正**：判定只认 `role === 'user'` 的消息；新增测试断言
     「system 消息含 `[上传文件]` 字面量时，普通用户指令仍判为非上传」——
     该用例在改前必须失败、改后通过（交付报告要给出这两个状态）；
  3. **阿里云 / OpenAI / 自定义预设**：请求体的**字段与顺序，除本条 `isUpload` 语义修正带来的差异外不变**
     （即：上传轮次仍发 `'required'`；非上传轮次从「因恒真而发的 `'required'`」回到 `'auto'`）。
     交付报告必须**逐字段列出**这两类预设改前 / 改后的请求体差异，并说明差异只来自本条修正；
     【口径说明】原验收标准 2 的「逐字节不变」因方案 B 而不成立，此处即为其修订版；
  4. **视觉能力判定**：改为「显式配置优先」（以配置的 `visionModel` / 预设视觉档位为权威，名称正则只作兜底）；
     新增测试断言「配置了视觉档位的 DeepSeek 预设可通过图片上传的前置校验」。**不得只靠扩充正则**；
  5. 新增测试通过，且**用例总数不低于入库实测值**（`d057664` 已到 18 文件 / **317** 用例，不得低于 317）；
  6. 四项全绿；
  7. 交付报告写明：改前 / 改后请求体差异（只列字段名，不贴 Key）；原 400 的成因**已完全解释**（ENG 已结案）。
     真调模型的复验（非上传轮次真实请求返回 200）由 `TASK-016-I` 冒烟承担，不在本卡。
改前基线：无。理由：本卡是修复型任务（把「不可用」变为「可用」），不声称改变任何工程指标，
  不作为优化结论引用，故免两级基线；采集类数据一律另走 TASK-003-B / TASK-016-I。
成本预算：0 tokens（本卡不真调模型；验证走 TASK-014-I 已采证据或老板手动复验）
----
（PM 裁决区）

============================================================

TASK-003 开发：同轮重复工具调用守卫
执行门控：**未放行，不得动手**。必须等 PM 在 `TASK-003-B` 裁决区写「基线已冻结」。
状态：待开始
优先级：P0
链式：全链·改指标
依赖：`TASK-003-B`（改前基线冻结）
允许改动文件：
  - `src/components/AI/useAiChat.ts`（去重守卫、冗余响应、打满时的 outcome 判定）
  - `src/utils/aiMetrics.ts`（`AiToolEvent.errorKind` 增加 `'redundant_call'`；`turn.redundantCalls`）
  - `src/engine/toolHandlers.ts`（仅为 `add_module` 增加同名模块守卫；改动要最小）
  - 对应的 `src/**/*.test.ts`（可新建；**不得**用 `.tsx`，vitest 会静默忽略）
  **不得**改动 `baseline/**`
描述（依据 `工作交接与后续方案设计.md` 4.1，按下列四层落地）：
  1. **指纹去重**：`fingerprint = toolName + ':' + stableStringify(args)`；`stableStringify` 需按键名排序、
     剔除 `undefined`、**数组保序**（数组顺序有语义）。同一轮内第二次出现同一指纹即判为冗余。
  2. **冗余响应**：不执行 handler，直接回传结构化结果
     `{ ok: false, code: 'REDUNDANT_CALL', message: '该调用在本次对话中已执行过', priorResult: <上一步结果摘要> }`。
     关键点：必须把**上一次的结果摘要**带回给模型，否则模型缺少新信息仍会重试（历史实测重试自愈率为 0）。
  3. **语义守卫（仅 `add_module`）**：当标题与内容都相同的模块已存在时返回 `{ ok: false, code: 'REDUNDANT_MODULE', existingId }`，
     不再新建 / 删除（治理 add→remove 抖动）。
  4. **计数修正**：`AiToolEvent.errorKind` 增加 `'redundant_call'`；新增 `turn.redundantCalls`；
     `MAX_TOOL_ROUNDS` 打满时 `turn.outcome` 判为 `partial`（**不再记为 `success`**）。
  接口纪律：**不改 `argsStatus` 语义**（它只描述参数解析结果）；冗余一律走 `errorKind`。
  边界：合法的「先 remove 再 add」指纹不同，不得误拦；模型自造随机 id 时指纹不同、拦不住（依赖第 3 层）；
  批量改同一模块的不同属性参数不同，安全。
验收标准：
  1. 四项全绿，且**用例数不低于 304**（新增测试必须落在 `src/**/*.test.ts`，并在报告中报出 vitest 自报的
     `Test Files N passed` 与 `Tests M passed` 原文）；
  2. 新增单元测试覆盖：相同指纹第二次调用被判冗余且 handler 未执行、`priorResult` 被带回、
     `stableStringify` 的键序无关性与数组保序、数组顺序不同视为不同指纹、
     `add_module` 同名模块返回 `REDUNDANT_MODULE`、打满轮次 `outcome = partial`；
  3. **效果验收（对 `TASK-003-B` 冻结的基线）**：`add_module` 场景单轮工具调用数下降、单轮 tokens 下降、
     摘要中出现 `redundant_call` 计数、打满轮次不再记为 `success`；
     采集由 QA 在 `TASK-003` 交付后另发测试卡执行，本卡交付时只需给出**改前对照的数字位置**，不得自行宣称「已优化 X%」；
  4. 交付报告写明：改前/改后行为差异（含被打回的调用示例），不贴 Key。
改前基线：`TASK-003-B`（由 QA 出具，PM 冻结后填入本栏：数值位置与档位）
成本预算：0 tokens（本卡不真调模型；效果验收由 QA 另卡执行）
----
（PM 裁决区）
