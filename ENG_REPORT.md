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
