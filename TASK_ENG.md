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
状态：待开始（**依赖 TASK-014-I 的探针结论**，未出结论前不要动手）
优先级：P0
链式：全链·不改指标
依赖：TASK-014-I（探针）
允许改动文件：
  - `src/utils/aiConfig.ts`（新增 DeepSeek 预设；`ProviderQuirks` 增加开关）
  - `src/components/AI/useAiChat.ts`（按开关组装请求体）
  - `src/utils/aiConfig.test.ts`、`src/components/AI/useAiChat.test.ts`（若不存在可新建 `src/components/AI/*.test.ts`）
  - `README.md` 的 AI 配置小节（仅在需要说明新服务商时改，允许不改）
  **不得**改动 `baseline/**`（属 QA，同步工作由 TASK-016-I 承担）。
描述：
  现状：`useAiChat.ts:150` 固定发送 `tool_choice: isUpload ? 'required' : 'auto'`。
  DeepSeek 官方端点在思考模式下对显式 `tool_choice` 直接 400，导致整条对话链路不可用。

  目标：把「发不发 `tool_choice`」变成**按服务商可配置**的能力，而不是写死。
  实现要点（以 TASK-014-I 的探针结论为准，下面的形状在探针出结论前不得定稿）：
  1. `ProviderQuirks` 增加一个语义明确的开关（例如 `omitToolChoice`），并在 `PROVIDER_PRESETS` 增加 DeepSeek 预设
     （baseUrl `https://api.deepseek.com`、模型档位 `deepseek-flash`——老板 2026-09-16 指定；
     若 TASK-014-I 证明该档位名不可用，以探针结论为准并回报 PM）；
  2. 开关打开时：**整个 `tool_choice` 字段不发**；原本需要 `'required'` 的上传场景退化为不发该字段，
     并靠提示词侧强化「必须调用工具」的措辞补偿（措辞改动要最小，不得重写整段 prompt）；
  3. 不引入任何新依赖；
  4. 新增单元测试覆盖：开关开 / 关两种情况下，请求体中 `tool_choice` 字段的出现与否，以及上传场景的退化行为
     （测试文件必须是 `src/**/*.test.ts`——`.tsx` 会被 vitest 静默忽略）；
  5. 若探针发现 `'required'` 之外还存在「思考模式必须关闭」的结论，本卡可一并加入「思考开关」，
     但**思考内容的显示层过滤不在本卡范围**（另有任务）。
验收标准：
  1. 在 DeepSeek 官方端点配置下，用老板报错的那条指令（如「帮我删除工作经历模块」）发起的真实请求**不再返回 400**；
     若老板无法亲自复验，则由 QA 用同一请求体形状经 harness 证明（探针证据可复用）；
  2. 阿里云百炼与 OpenAI 预设的请求体**逐字节不变**（除新增字段外），`tool_choice` 行为不变；
  3. 新增测试通过，且**用例总数不低于当时基线**（当前 304）；
  4. 四项全绿；
  5. 交付报告写明：改前 / 改后请求体差异（只列字段名，不贴 Key）。
改前基线：无。理由：本卡是修复型任务（把「不可用」变为「可用」），不声称改变任何工程指标，
  不作为优化结论引用，故免两级基线；采集类数据一律另走 TASK-003-B / TASK-016-I。
成本预算：0 tokens（本卡不真调模型；验证走 TASK-014-I 已采证据或老板手动复验）
----
（PM 裁决区）
