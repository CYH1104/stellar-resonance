# 阶段 C 交接：私聊知情范围与旧客户端兼容返修（2026-10-25，本地未提交）

基线：`main` `e4e9ffe`。阶段 A/B 未提交改动全部保留，未 reset、未覆盖、未提交、未 push、未部署。
执行人：CodeBuddy。等待 Vesper 审查。

## 返修：真实生成请求改用本次输入点名（2026-10-25，待复审）

Vesper 定向审查指出：`terminalMainContext(s,before)` 内部用 `s.turns[before-1]?.input` 作为私聊点名 hint，而正式生成在 `useWorkspace` 调用 `terminalMainContext(session,index)`，当前输入实际是 `turns[index].input`。超过 8 个私聊会话时，上一轮未点名 A 会被最近 8 个挤出，本轮正文点名 A 也无效。

修复（仅参数传递，保留 A/B/C 全部 dirty）：

- `src/domain/terminalMain.ts`：`terminalMainContext(s,before=s.turns.length,hint='')`；私聊上下文改为 `terminalPrivateChats(s,before,hint)`。`before` 过滤范围仍是 `index`，没有改成 `index+1`。
- `src/app/useWorkspace.ts`：正式 `GenerateRequest` 调用改为 `terminalMainContext(session,index,turn.input)`。
- 其他调用（如 `applyTerminalBatch`、既有 helper 测试）不传 hint，仍然兼容；它们不使用私聊排序 hint。
- `tests/api-workspace.test.ts`：新增真实 `useWorkspace` + `HttpGateway.generate` mock 回归。9 个私聊会话，A 最旧；上一轮“今天去图书馆”不提 A，本轮“去找陆离确认旧约定”点名 A。断言捕获的 `terminalContext.privateChats` 为 8 条、首条为 A、`knownBy=['player','npc0']`、含玩家原句和 A 回复；不含仅挂在无效分支的“无关知情”会话/文本；有效锚点消息保留。

实际验证（未全量重跑、未重跑浏览器）：

- `pnpm exec vitest run tests/api-workspace.test.ts --testNamePattern=uses --reporter=dot` → 1 项通过、77 项跳过（仅新增回归）。
- `pnpm exec vitest run tests/api-workspace.test.ts --reporter=dot` → 1 文件 78 项通过（受影响工作区文件，未跑其他前端文件）。
- `pnpm exec vitest run tests/terminal-private-chat.test.ts tests/terminal-main.test.ts tests/terminal-ledger.test.ts tests/terminal-workflow.test.ts tests/terminal-sync-report.test.ts tests/terminal-group-members.test.ts --reporter=dot` → 6 文件 29 项通过。
- `pnpm exec vue-tsc --noEmit` → 退出 0。

附带核实（未改实现）：`cleanPrivateChats` 校验 sender 仅为 `player` 或该 `participantId`，`knownBy` 恰为两项，消息 1–12 条、文本 ≤808（800+截断标记）、会话 ≤8、总文本 ≤8000；生成侧同样受 8/12/800/8000 限制，截断标记长度在余量内，未见明显超限。不同私聊之间没有互相注入 sender 或知情标记。


## 先纠正旧结论（重要）

阶段 A/B 的“私聊不进入公共记忆/note/向量”是正确目标，但**不能解读为“私聊完全不进主请求、正文模型必须不知道”**。
玩家与角色 A 的一对一私聊是已经发生的事实：A 必须记得并能在正文里自然接续；未参与的角色 B 不能凭空知道。
旧 handoff / 证据里若把“公共召回排除私聊”说成“私聊对正文不可见”，该结论已被本阶段取代。原公共 note/向量排除继续保留，不改。

## 目标一：独立带知情范围的私聊上下文

### 实现

1. `src/domain/terminalLedger.ts`
   - 新增纯函数 `terminalPrivateChats(session, before, hint?)`，来源仅 `terminal.conversations` 的一对一私聊（`group === false`、单 NPC 成员）。
   - 消息过滤：去掉 `archived`；有 `anchor` 时按 `terminalAnchorActive(session, anchor, before)` 判断当前轮/分支是否有效。保留玩家发言、终端角色回复、主模型 `privateMessages` 落库后的消息。
   - 每条输出包含 `participantId`、`participantName`、`knownBy: ['player', participantId]`、`messages[{sender,text}]`、`source: terminal.conversations/<id>`。
   - 预算：最多 8 个会话、每会话 12 条、每条 800 字、总 8000 字（常量 `terminalPrivateChatLimits`）。先按“当前输入是否点名”排序，再按最近消息时间；点名旧角色不会被最近 8 个挤出。超长单条和超预算被截断时带 `truncated` 与 `…（已截断）` 标记。
   - `earlierTopic` 仅从 `terminal.memories` 已记录的私聊 `summary/topics` 派生，带 `source: terminal.memories/<anchorKey>/chats/<chatId>`；没有记录就不生成，禁止编造。
   - 旧存档没有新字段时，直接从已有 `conversations` 派生。

2. `src/domain/terminalMain.ts`
   - `TerminalMainContext` 新增可选 `privateChats?: TerminalPrivateChat[]`。
   - `terminalMainContext` 用当前轮输入作为 hint 生成私聊上下文，非空才附加。
   - `cleanTerminalMainContext` 先验形状再访问：最多 8 项、参与者唯一且非 player、`knownBy` 必须恰为 `['player', participantId]`、每条消息 sender 只能是 `player` 或该参与者、消息 1–12 条、单条长度、总会话长度、`source`/`earlierTopic.source` 前缀、布尔标记；异常输入直接拒绝，不抛 `TypeError`。

3. `server/terminal-main.mjs`
   - 主正文系统提示新增“私聊知情范围，适用于本轮正文叙述与角色台词，不仅是终端输出”。
   - 明确 A 本人参与过所以必须记得并自然延续其中的约定/事实/称呼/承诺，不能装不知道；`knownBy` 之外的角色不得自动知道、引用或暗示；历史不是本轮新私聊，不得重复发送或替玩家补写；`earlierTopic` 只能引用有来源的记录。
   - `privateChats` 作为数据附在终端上下文 JSON 中；公共 note、向量召回、`memories` 不混入私聊。

### 未改动
- 没有恢复 `includePrivate=true`，没有重构 memoryEngine，没有删除原始终端历史、`priorTopic`、备份或用户手写 note。
- 公共 note/向量继续只含群聊与游戏；终端私聊原文仍在 `conversations` 中。

## 目标二：旧客户端 command 兼容与背叛规则收口

1. `server/personal-terminal.mjs`
   - `participantNames` 改为**可选**：缺省时不 400/500，走原有安全兜底名单 `roster 姓名 + 玩家名`；存在时仍严格校验（1–8 个、非空、≤80 字），且只用于服务端校验/黑名单，不进入模型 prompt。
   - 新客户端继续只传本局参与者姓名，避免全卡姓名误杀非本局常用词（如“开心”）。
   - `betrayalPattern` 增加“其他对象”分支：保留“自己的小秘密”放行，但 `透露自己的及玩家的秘密`、`透露自己的和玩家的秘密`、`透露玩家和自己的秘密`、`透露自己的秘密以及玩家的隐私`、`泄露他人的隐私` 等明确涉及玩家/他人的混合对象仍拦截。命令返回仍为 `KING_COMMAND_BETRAYAL` 且不可自动纠正。

## 准确文件与关键 diff

- `src/domain/terminalLedger.ts`：新增 `TerminalPrivateChat*`、`terminalPrivateChatLimits`、`terminalPrivateChats`、`earlierPrivateTopic`、截断/预算逻辑。
- `src/domain/terminalMain.ts`：`TerminalMainContext.privateChats`；`terminalMainContext` 注入；`cleanPrivateChats` 严格校验。
- `server/terminal-main.mjs`：正文私聊知情规则 + privateChats 数据。
- `server/personal-terminal.mjs`：`participantNames` 可选与旧兜底；`betrayalPattern` 混合对象分支。
- `tests/terminal-private-chat.test.ts`（新）：7 项，覆盖来源/知情标记/分支隔离/点名优先/预算截断/摘要来源/形状校验/旧存档派生。
- `tests/terminal-main.test.mjs`：新增服务端 `buildMessages`/`terminalMainPrompt` 私聊事实与边界断言。
- `tests/personal-terminal.test.mjs`：新增旧 command 名单回退、混合秘密正反例。
- `tests/terminal-command-compat.test.mjs`（新）：旧 HTTP 请求缺 `participantNames` 返回 200；新非法列表 400；新名单不进 prompt。
- `.integration/phase-c-verify.mjs`、`.integration/phase-c-report.json`（新）；`.integration/phase-a-verify.mjs` 的“私聊完全不进请求”旧断言已更新为“公共记忆排除、带范围 privateChats 可见”。

## 实际验证

定向前后端测试（仅本阶段相关，未全量重跑）：

- `pnpm exec vitest run tests/terminal-private-chat.test.ts tests/terminal-ledger.test.ts tests/terminal-main.test.ts` → 3 文件 21 项通过。
- `node --test tests/terminal-main.test.mjs tests/personal-terminal.test.mjs tests/terminal-command-compat.test.mjs` → 20 项通过。
- `pnpm exec vitest run tests/terminal-workflow.test.ts tests/terminal-sync-report.test.ts tests/terminal-group-members.test.ts tests/terminal-context.test.ts` → 4 文件 9 项通过。
- `node --test tests/king-blind-context.test.mjs tests/terminal-route.test.mjs tests/server.test.mjs` → 41 项通过。
- `pnpm exec vitest run tests/king-custom-flow.test.ts tests/king-blind-targets.test.ts` → 6 项通过。
- `node --test tests/terminal-correction.test.mjs` → 2 项通过。
- `pnpm exec vue-tsc --noEmit` → 退出 0。
- `pnpm build` → 退出 0。构建后 `星穹游戏终端 (1).html` 已用 `git checkout --` 恢复 HEAD，SHA256 `C2D0E2C2552B6D22DAE7323977F36E21921CE215362F5C9EA088E66D3A79FEC8`。

浏览器（正式 `App.vue` + 本地 Vite，合成存档，Playwright 路由 mock 模型，未访问公网/真实账户）：

- `node .integration/phase-c-verify.mjs` → 6 项检查通过、页面脚本异常 0。
- 第一轮 `terminalContext.privateChats` 恰有 `guide`，`knownBy=['player','guide']`，包含玩家“我答应周六带你去观星台”与向导“我会带星图”，带 conversation 来源；公共 `memories` 不含这些私聊原句。
- 未参与私聊的 `bystander/旁观者` 没有私聊条目或知情标记。
- 第一轮模型产生的 `privateMessages` 落库后，第二轮的 `privateChats` 可见且仍不含旁观者。
- 终端原始私聊历史完整保留，手写 note 原文未改。

## 未验证 / 限制

- **没有可用且已授权的真实模型配置**，因此未调用真实模型；浏览器证据全部为路由 mock。mock 只能证明主请求载荷包含正确事实与知情标记、服务端 `buildMessages` 包含同样事实和正文约束，**不能证明真实模型在自然语言里一定遵守**。
- 单叙述者模型从架构上无法硬保证“只让 A 知道、不让 B 知道”；本阶段通过显式正文系统规则、`knownBy` 数据边界和请求隔离降低风险，实际遵循度仍需真实模型验收。
- 未做真机/真实移动浏览器验证；浏览器为桌面 Chromium 合成存档。
- 未提交、未 push、未部署；根生成 HTML 已恢复 HEAD；其他 A/B dirty 未触碰。
