# ENG_REPORT —— 开发工程师 ENG 的汇报文件

唯一写者：ENG。只在末尾追加，不删改旧条目。条目之间用 `----` 分隔。
条目类型：领取 / 阻塞 / 交付汇报。

创建：2026-09-16。

---

## [2026-09-16] TASK-001 领取
ENG：“我的理解是：把 `README.md` 第 95、97、203 行的过时信息改成实测值 —— 用例数 `230` → `304`，
类型检查命令 `npx tsc --noEmit` → `npx tsc -b`（根 tsconfig 是空壳，旧命令对真实类型错误也返回 0）。
只改这三行，不新增说明段落、不引入动态生成机制，改动仅限 `README.md`。”

----
## [2026-09-16] TASK-002 领取
ENG：“我的理解是：删除两个未被版本库跟踪、无任何引用的残留备份文件
`src/components/AI/ChatPanel.tsx.orig` 与 `src/engine/skillExecutor.ts.orig`，其余文件一律不碰。
因为 `*.orig` 被 `.gitignore` 忽略，本任务不产生任何代码提交，所以本批次提交只包含 `README.md`。”

----
## [2026-09-16] TASK-001 + TASK-002 交付汇报（第 1 次）
提交：sha=ff0826c，commit message=[TASK-001] docs: 修正 README 过时用例数与类型检查命令
改动文件清单：
  - README.md（对照白名单：在范围内；第 95、97、203 行共 3 行替换）
  - src/components/AI/ChatPanel.tsx.orig（白名单内，已删除；因被 `.gitignore` 忽略，不出现在提交里）
  - src/engine/skillExecutor.ts.orig（白名单内，已删除；同上）
  - 无新建文件；无新建测试（本批次是纯文档改动 + 删除无引用备份文件，不涉及行为，无需新增测试）
全绿汇报（原文粘贴，不许改写数字）：
  - 类型检查：npx tsc -b → 退出码 0
  - lint：npx eslint . --max-warnings 0 → 退出码 0，0 告警
  - 测试：npm test → Test Files  17 passed (17) / Tests  304 passed (304)
    （原文：`Test Files  17 passed (17)`、`Tests  304 passed (304)`；Duration 2.98s）
  - 构建：npm run build → ✓ built in 1.05s；JS 产物 dist/assets/index-CL9SHyth.js 849,296 B（gzip 268.06 kB），
    分块产物 resumeParser-BdMSs-MC.js 11,857 B
验收标准逐条对照：
  - TASK-001-1 `grep -n "230" README.md` → 无输出（grep 退出码 1）✅
  - TASK-001-2 `grep -n "tsc --noEmit" README.md` → 无输出；`grep -n "tsc" README.md` → `97:npx tsc -b         # 类型检查` ✅
  - TASK-001-3 第 95、203 行数字 304 与本次 `npm test` 实测（304）一致 ✅
  - TASK-001-4 `git diff --stat` → `README.md | 6 +++---`，`1 file changed, 3 insertions(+), 3 deletions(-)`（仅一个文件）✅
  - TASK-002-1 `ls src/components/AI/ChatPanel.tsx.orig src/engine/skillExecutor.ts.orig` → `No such file or directory`（退出码 2）✅
  - TASK-002-2 `git status --short src/components/AI/ChatPanel.tsx src/engine/skillExecutor.ts` → 无输出（两文件未被改动）✅
  - TASK-002-3 `grep -rn "\.orig" src` → 无输出（退出码 1）✅
  - TASK-002-5 本批次唯一提交只含 `README.md`；TASK-002 不产生任何提交 ✅
测试变化：基线（PROJECT_STATE.md 记录值）304 → 304（±0），新增文件：无；删除文件：两个未被跟踪的 `.orig`（不参与测试收集）
技术汇报（≤10 行）：
  - 做了什么：按卡把 `README.md` 三处过时信息改为实测值（用例数 230 → 304；类型检查命令 `npx tsc --noEmit` → `npx tsc -b`），
    并删除两个重构期残留的 `.orig` 备份文件。
  - 为什么这么做：根 `tsconfig.json` 是 `files: []` + references 空壳，`npx tsc --noEmit` 对真实类型错误也返回 0，
    照抄会误导使用者；用例数 230 已过时（实测 304）。`.orig` 只允许删除，删除后 `src` 内无引用、不参与类型检查/构建/测试。
  - 为什么这么改：只做最小替换，不加动态生成机制、不新增说明段落、不顺手重排对齐（保持原有列宽）。
  - 残余风险：README 的用例数是**静态快照**，用例增加后会再次过时；PM 已在卡里明确不要动态机制，故本卡不处理，仅记录。
发现但未处理（可选）：
  - README 的「测试」小节仍按文件罗列测试覆盖面（`engine/utils/AI 组件`），新增测试文件不会自动出现在该列表里，属同类「静态描述会漂移」问题，未在卡范围内，未动。
  - `README.md` 第 95/97/203 行以外的用例数/命令未再逐行核对，如还有其它过时数字需 PM 另开卡。
自查五项：
  ① 全绿汇报的数字是本次实测原文，未改写
  ② 零越界：改动文件全部在任务卡白名单内（README.md 三行替换 + 白名单内两个 `.orig` 删除）
  ③ 未删改、跳过、放松任何既有测试（用例数 304 与基线一致）
  ④ 未运行 ai-baseline、未消耗任何 API 额度
  ⑤ 未改任何文档要求外内容（`README.md` 之外未动任何文件；协作文件未提交）
【传话块】
收件人：PM
结论：TASK-001 + TASK-002 已交付（提交 ff0826c，四项全绿，17 files / 304 tests），TASK-002 不产生提交
需要对方做什么：按审查清单复核两项验收（`grep`/`ls`/`git diff --stat` + 四项全绿），TASK-002 按卡免 QA 回归；确认后收口批次 0
需要老板拍板：无

----
## [2026-09-17] TASK-015 领取
ENG：“我的理解是：把 `tool_choice` 从写死改为**按服务商 quirks 可配置** —— 新增 DeepSeek 预设（`https://api.deepseek.com`，档位 `deepseek-flash`），
并加两个开关：① 非上传轮次整个不发 `tool_choice`；② 上传轮次发 `tool_choice:'required'` 的同时发 `thinking:{type:'disabled'}`。
阿里云 / OpenAI / 自定义预设的行为与请求体逐字节不变。请求体组装抽成纯函数以便单测断言字段出现/缺席。
不改 `baseline/**`，不真调模型，不新增依赖。”

----
## [2026-09-17] TASK-015 阻塞（已按白名单完成 quirks 层并提交，但验收标准 1 不可观测）
提交：sha=d057664，commit message=[TASK-015] feat: tool_choice/thinking 按服务商 quirks 配置并新增 DeepSeek 预设
  （该提交只覆盖授权范围内的实现，**不构成交付**，原因见下）
改动文件清单：
  - src/utils/aiConfig.ts（对照白名单：在范围内；ProviderQuirks 加两个开关 + 新增 DeepSeek 预设）
  - src/components/AI/useAiChat.ts（在范围内；请求体组装抽成纯函数 buildChatRequestBody 并接入 fetch）
  - src/utils/aiConfig.test.ts（在范围内；追加 3 个用例）
  - src/components/AI/useAiChat.test.ts（新建，白名单覆盖；10 个用例）
  - README.md（在范围内；AI 配置表加 1 行 DeepSeek）
四项全绿（本次实测原文）：
  - 类型检查：npx tsc -b → 退出码 0
  - lint：npx eslint . --max-warnings 0 → 退出码 0，0 告警
  - 测试：npm test → Test Files  18 passed (18) / Tests  317 passed (317)（基线 304 → 317，+13）
  - 构建：npm run build → ✓ built in 840ms；入口 dist/assets/index-DqYyJYW4.js 850,008 B（gzip 268.30 kB）、
    resumeParser-*.js 11,857 B（体积为单次采样，按协议不得作为对比依据，仅记录）
阻塞原因（一句话）：验收标准 1 要求的「非上传轮次」在现有实现里**根本不可达**，`isUpload` 恒为真。
实测证据（不是推断，已固化为用例）：
  1. `useAiChat.ts:141` 用 `msgs.some(m => m.content?.includes('[上传文件]'))` 判定上传轮次；
  2. 每轮请求的第 0 条都是 system 消息，而 `buildSystemPrompt()` 正文自带 `[上传文件]` 字面量（`src/engine/aiPrompt.ts:666`）；
  3. ⇒ `isUpload` 恒为真 ⇒ 改造前**所有**请求发的都是 `tool_choice:'required'`；
  4. 实测：jsdom 渲染 hook + mock fetch，发普通指令「帮我删除工作经历模块」，抓到的请求体是
     `{model, messages, tools, tool_choice:'required', temperature}`（`useAiChat.test.ts` 中已固化，另有一条根因用例断言 prompt 含该字面量）。
对卡内「未解释点」的结论（**原 400 已完全解释**）：
  - 非上传轮次实际发的也是 `'required'`，正好命中探针唯一不可用的组合「思考开启 + 'required'」→ 400。
  - 所以「显式发送在某些配置下仍有风险」这个猜测不成立；真实成因是浏览器端一直发 `required`。
  - 因此本卡实现后 DeepSeek 的应用内行为是：**每轮都走 required + thinking disabled**（探针实测该组合返回 200 + tool_calls），可用；
    但「非上传轮次不发 tool_choice」这一形状在应用里不会出现，只有纯函数单测覆盖它。
已完成的实现（授权范围内的全部内容）：
  - ProviderQuirks 增加 `omitAutoToolChoice` / `disableThinkingWithRequiredToolChoice`（阿里云 / OpenAI / 自定义 / 未知服务商均为 false）；
  - DeepSeek 预设：baseUrl `https://api.deepseek.com`（不加 /v1）、档位 `deepseek-flash`、视觉同档位、两个开关打开；
  - 纯函数 `buildChatRequestBody`：阿里云 / OpenAI / 自定义 / 未知服务商的字段与**顺序**逐字节等同改前（单测直接与改前字面量 `JSON.stringify` 对照）；
  - 新增 13 个用例：两分支字段出现/缺席、字段顺序、与改前逐字节一致、以及「请求体真的接进了 fetch」的集成断言。
为什么不自行修掉 `isUpload` 判定（没有硬做、没有猜）：
  - 该判定是**全服务商共享**的：修掉后阿里云 / OpenAI 的非上传轮次会由 `required` 变 `auto`，与验收标准 2「行为不变」字面冲突；
  - 既有 AI 采集数据都在「恒 required」形状下采集，改动会让历史数据与新数据不可比（口径问题不属于 ENG 决定）；
  - 且 `src/engine/aiPrompt.ts` **不在本卡白名单**，措辞侧也改不了。
需要 PM 裁决（二选一，ENG 不自行决定）：
  - 方案 A（ENG 倾向）：本卡按「quirks 层」验收通过，`isUpload` 恒真作为**独立缺陷另开卡**（建议 P0：它同时影响所有服务商的工具调用自由度，
    并与 TASK-003-B / TASK-008-I 的采集可比性相关）。代价：验收标准 1 的字面要求改由纯函数单测覆盖，应用内不可观测。
  - 方案 B：本卡扩权，一并修 `useAiChat.ts:141`（最小改法：只匹配 `role === 'user'` 的消息；`aiPrompt.ts:666` 的措辞仍不能改）。
    代价：阿里云 / OpenAI 非上传轮次行为改变，需 PM 改写验收标准 2 并评估采集口径影响。
发现但未处理（可选）：
  1. `src/utils/aiConfig.ts` 的 `isVisionModel()` 正则不匹配 `deepseek-flash`，而 `resumeParser.ts:368` 用它做图片上传前置校验 ⇒
     装了 DeepSeek 预设后，**图片**上传会报「当前视觉模型「deepseek-flash」不支持图片解析」（文本 .txt 上传不受影响）。
     探针实测该档位支持图片输入，所以这是客户端校验的漏配。`resumeParser.ts` 不在白名单、`isVisionModel` 属 aiConfig 但不在本卡授权语义内，未改。
  2. `RECOMMENDED_MODELS` 里仍是 `deepseek-chat`，与预设档位 `deepseek-flash` 不一致（该列表当前无调用方，属死数据），未动。
自查五项：
  ① 全绿汇报的数字是本次实测原文，未改写
  ② 零越界：改动文件全部在任务卡白名单内（新建测试按规则视为覆盖并已逐项列出）；`baseline/**`、`aiPrompt.ts`、`resumeParser.ts` 未碰
  ③ 未删改、跳过、放松任何既有测试（用例数 304 → 317，无删除）
  ④ 未运行 ai-baseline、未消耗任何 API 额度
  ⑤ 未改任务卡要求外的文档（README 只加了 DeepSeek 一行，属卡内允许项）
【传话块】
收件人：PM
结论：TASK-015 阻塞 —— quirks 层已实现并提交（sha=d057664，四项全绿，18 files / 317 tests），但验收标准 1「非上传轮次不发 tool_choice」不可观测：
      `isUpload` 恒为真（system prompt 自带 `[上传文件]` 字面量），且这**完全解释了老板最初那次 400**（非上传轮次发的其实是 `required`）
需要对方做什么：裁决方案 A（本卡按 quirks 层验收 + isUpload 恒真另开 P0 卡）还是方案 B（本卡扩权修 `useAiChat.ts:141`，需改写验收标准 2 并评估采集口径）
需要老板拍板：有 —— ① 选 A 还是 B；② 是否同意「恒 required」这一既有形状的变更涉及 AI 采集口径（影响 TASK-003-B / TASK-008-I 可比性），归 PM/老板决定

----
## [2026-09-17] TASK-015 交付汇报（第 2 次 · 方案 B）
提交：sha=6435a60，commit message=[TASK-015] fix: 修正 isUpload 恒真与视觉能力判定（方案 B）
  （本卡第一轮提交 d057664 已在库内，本轮为其上的方案 B 修订）
改动文件清单：
  - src/components/AI/useAiChat.ts（白名单内；新增纯函数 `isUploadTurn`，判定只认 `role === 'user'` 的消息）
  - src/utils/aiConfig.ts（白名单内；新增 `isVisionCapableModel`「显式配置优先」判定）
  - src/utils/resumeParser.ts（白名单内「附条件授权」；两处 `isVisionModel` 调用改为 `isVisionCapableModel`，其余未动）
  - src/components/AI/useAiChat.test.ts（白名单内；10 → 13 个用例）
  - src/utils/aiConfig.test.ts（白名单内；6 → 10 个用例）
  - 未新建其它文件；未动 `baseline/**`、`src/engine/aiPrompt.ts`、`RECOMMENDED_MODELS`、`resumeParser.test.ts`
全绿汇报（原文粘贴，不许改写数字）：
  - 类型检查：npx tsc -b → 退出码 0
  - lint：npx eslint . --max-warnings 0 → 退出码 0，0 告警
  - 测试：npm test → Test Files  18 passed (18) / Tests  324 passed (324)（基线 317 → 324，+7）
  - 构建：npm run build → ✓ built in 897ms；入口 dist/assets/index-BfKqI_Gq.js 850,192 B（gzip 268.30 kB）、
    resumeParser-CuT6CSdA.js 11,879 B（单次采样，按协议不得作对比依据）
验收标准逐条对照：
  1. **请求形状** ✅ 纯函数用例断言字段出现/缺席 + 集成用例断言真实请求体：
     DeepSeek 非上传 → 无 `tool_choice`、无 `thinking`；上传 → `tool_choice:'required'` + `thinking:{type:'disabled'}`（见下方逐字段表）。
  2. **`isUpload` 判定修正** ✅ 新增用例「system 消息含 `[上传文件]` 字面量时，普通用户指令仍判为非上传」，
     改前失败 / 改后通过的实测原文：
       · 改前（临时把 `isUploadTurn` 换回旧的角色无关匹配后复现，未用 stash/checkout/restore，复现后已还原）：
         `Tests  1 failed | 12 skipped (13)`，断言位置 useAiChat.test.ts:77
         `- Expected: false` / `+ Received: true`
       · 改后：`Tests  1 passed | 12 skipped (13)`
  3. **阿里云 / OpenAI / 自定义逐字段差异** ✅ 见下表（差异**只**来自 isUpload 语义修正；字段集合与顺序不变，未新增字段）。
  4. **视觉能力判定** ✅ 改为「显式配置优先」：档位等于服务商预设声明的视觉档位时直接采信预设，名称正则只作兜底；
     新增用例断言「DeepSeek 预设的视觉档位可通过图片上传的前置校验」（同文件同时断言 `isVisionModel('deepseek-flash') === false`，
     证明不是靠扩正则）。既有用例「视觉模型不支持图片解析时抛出提示」（自填 `qwen-plus` 应当被拒）仍通过 —— 未放松任何既有测试。
  5. **用例数** ✅ 317 → 324，不低于入库值 317。
  6. **四项全绿** ✅ 见上。
  7. **报告写明差异与 400 成因** ✅ 见下。

改前 / 改后请求体逐字段差异（阿里云 / OpenAI / 自定义 三类预设相同；`thinking` 一律不发）：

| 字段 | 非上传·改前 | 非上传·改后 | 上传·改前 | 上传·改后 |
|---|---|---|---|---|
| model | 有 | 有（不变） | 有 | 有（不变） |
| messages | 有 | 有（不变） | 有 | 有（不变） |
| tools | 有 | 有（不变） | 有 | 有（不变） |
| tool_choice | `'required'`（因 isUpload 恒真） | `'auto'`（回到设计意图） | `'required'` | `'required'`（不变） |
| temperature | 0.1 | 0.1（不变） | 0.1 | 0.1（不变） |

字段顺序改前后一致：model → messages → tools → tool_choice → temperature（`tool_choice` 插入位置未变）；
DeepSeek 预设为新增，无「改前」：非上传 = 上述字段去掉 `tool_choice`；上传 = `tool_choice:'required'` + 追加 `thinking:{type:'disabled'}`。
原 400 成因：**已完全解释** —— 判定恒为真时非上传轮次发的也是 `'required'`（探针唯一不可用的组合），本卡已消除该形状。

技术汇报（≤10 行）：
  - `isUploadTurn`：只匹配用户消息的字符串 content，避免把 system prompt 正文里的流程说明当成上传标记；数组 content（图片消息）与缺字段的旧消息都安全返回 false。
  - `isVisionCapableModel(provider, model)`：档位与预设视觉档位一致 → 直接采信（人工维护的权威数据）；否则退回名称正则，保持既有语义。
  - 为什么这样切：预设档位是项目维护的显式配置，比「按名字猜能力」可靠；而自填档位若一律采信，会让既有用例
    「自填 `qwen-plus` 作为视觉模型应当被拒」失效（该用例不在白名单、不许放松），故保留正则兜底。
  - 残余风险 1：自填的、正则认不出的新档位仍会被拒（例如把非预设的视觉模型名填进 visionModel），需扩预设或另议。
  - 残余风险 2：按 PM 口径，本卡交付即 AI 采集口径切换点；`TASK-003-B` / `TASK-008-I` 排在其后，历史「恒 required」数据不可与新数据直接对比。
  - 真调模型复验（非上传轮次真实请求 200）由 `TASK-016-I` 冒烟承担，本卡未消耗任何额度。
发现但未处理（可选）：
  1. `resumeParser.test.ts` 不在本卡白名单，故「图片上传前置校验」的断言落在 `aiConfig.test.ts` 的 `isVisionCapableModel` 上（前置校验已全量改为调用它）；
     若 PM 要求端到端断言（构造 `File` 调 `parseResumeFile`），需授权该测试文件或另开卡。
  2. `RECOMMENDED_MODELS` 里的 `deepseek-chat` 按 PM 指示**未动**。
自查五项：
  ① 全绿汇报的数字是本次实测原文，未改写
  ② 零越界：改动文件全部在任务卡白名单内（`resumeParser.ts` 属附条件授权，仅改两处调用点）
  ③ 未删改、跳过、放松任何既有测试（324 ≥ 317，无删除；`resumeParser.test.ts` 原样通过）
  ④ 未运行 ai-baseline、未消耗任何 API 额度
  ⑤ 未改任务卡要求外的文档（本轮未改 README；`TASK_ENG.md` 的未提交改动是 PM 自己的文件，未碰）
【传话块】
收件人：PM
结论：TASK-015 已交付（sha=6435a60，四项全绿，18 files / 324 tests，≥ 基线 317）—— quirks 层 + isUpload 修正 + 视觉能力判定三件都已落地，
      原 400 成因已完全解释并在应用里消除；阿里云 / OpenAI / 自定义的请求体差异只有「非上传轮次的 tool_choice 由恒真的 required 回到 auto」一项
需要对方做什么：按验收标准 1~7 复核（重点：isUpload 改前失败/改后通过的原文、逐字段差异表、`resumeParser.ts` 两处调用点），并确认视觉判定的口径
      （PRESET 档位为权威、用户自填档位仍走正则 —— 这是为了不放松既有 `qwen-plus` 用例）；确认后下发 TASK-015-T
需要老板拍板：无
