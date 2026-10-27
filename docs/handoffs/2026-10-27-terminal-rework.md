# 9000 终端拆分返工（第二轮）· 交付

日期：2026-10-27
执行者：Codeg（DeepSeek-V4.1-Flash，High）
依据：`.integration/WB_REWORK_TERMINAL_20261027.md`（Codex 首轮验收不通过）
状态：**本地修复、测试、类型检查、构建完成；未提交、未推送、未部署**，交 Codex 再次独立验收。

本轮唯一写者为本会话；未启动其他 agent，未调用付费模型，未读取真实存档或密钥，未发公开频道。

## 1. 返工基线

上一轮交付副本（21 个文件）先复制到 `.integration/rework-baseline-20261027/`，文件名用 `__` 代替路径分隔符：

- 源码：`useWorkspace.ts`、`usePersonalTerminal.ts`、`terminalAuto.ts`、`terminalLedger.ts`、`terminalMain.ts`、`terminalFollowup.ts`、`personalTerminal.ts`、`apis.ts`
- 组件：`PersonalTerminal.vue`、`WorkspaceNavigation.vue`
- 服务端：`app.mjs`、`ai.mjs`、`personal-terminal.mjs`、`terminal-main.mjs`
- 测试：`codex-terminal-review.test.ts`、`terminal-split.test.ts`、`terminal-main.test.ts`、`terminal-auto-server.test.mjs`
- 文档：`docs/handoffs/2026-10-27-terminal-api-split-countdown.md`、上一轮执行单与本次返工单

上一轮的性能成果（锚点哈希与 `branchMemo` / `segmentHashes` 缓存）与牌面倒计时实现未改动；`tests/terminal-anchor-cache.test.ts` 8 项、`tests/divination-countdown.test.ts` 4 项均通过，旧锚点逐位兼容。

## 2. 逐条对照验收单

### 必修 1：生成中停用不可用 —— 已修

- `setTerminalEnabled` 只在**开启**时要求空闲（`busy||terminalBusy`）；**停用**不再受生成中限制。
- 新增 `terminalEpoch`：停用、`stopTerminal()`、切换顺序、替换终端接口（选择或地址/模型/Key 变化，`watch(...,{flush:'sync'})`）都会推进它。
- `runTerminalStage` 在请求前记录 `{epoch, 路由签名}`，回包后先判 `stale()`：停用、换接口、切顺序、换存档、换分支一律丢弃，**即使上游忽略 abort 也不写回**，并移除本次新建的幽灵任务。
- `WorkspaceNavigation.vue` 的顶栏按钮不再因 `busy` 锁死关闭方向；停用只 abort 终端阶段，正文继续。
- `usePersonalTerminal`：手动请求与后台耐受度都记录 `w.terminalEpoch`，停用后 `watch(terminalEpoch)` 立即 abort，`commit()`/`commitTolerances()` 在写队列内再核 epoch，迟到的旧结果不落库（不依赖组件卸载）。

### 必修 2：终端先首轮重试按钮无效 —— 已修

- `TerminalJob` 新增持久化字段 `turnId` / `variantId` / `mode`（`story-first` | `terminal-first` | `social-review`），阶段任务记录**执行目标**而不是知情边界。
- 新增公开解析器 `terminalJobTurnIndex(session,job)`（`terminalLedger.ts`）：优先用任务自身的 `turnId`；旧任务只有边界锚点，按 `mode` 区分（终端先的锚点是上一个已确认轮，目标是下一轮）。
- 新增 `retryTerminalJob(jobId)`：按任务定位轮次**并沿用该任务自己的阶段**，之后切换顺序也不会把旧任务跑到另一种阶段上。
- `PersonalTerminal.vue` 的重试按钮改为 `w.retryTerminalJob(job.id)`，手机停用时不显示。
- 复现测试第 2 项按返工单允许的方式改为验证真实的新绑定（`job.turnId`/`variantId`/`mode`、公开解析器、真实重试成功后落库 8 条），不再复现旧模板表达式；**没有**把锚点改成不存在的未来正文。

### 必修 3：终端先的已提交事实在正文重试时消失 —— 已修

- 阶段完成后把**已提交事实**写入任务 `job.facts`（私聊行带「仅X与玩家知情」标注）。
- `terminalJobFacts(session,job)`：优先返回已提交事实；旧任务无该字段时从 `job.id` 前缀的消息重建（群按会话标题+发言者 `displayName`，私聊带知情标注）。
- `runTerminalStage` 在 `planTerminalAuto` 判定「本阶段已完成」时不发请求，直接返回该阶段事实；正文重试、续写、页面重载后都一样，且不再写消息。
- 消息新增 `displayName`（已验证字段），使重建不依赖当时的名册。

### 必修 4：终端先拿不到已确认历史；群聊拿不到本群对话 —— 已修

- 终端上下文新增（`terminalMain.ts`，均带预算）：
  - `history`：边界前的已确认正文+玩家行动，最多 18 条 / 8000 字；
  - `memories`：只取带 `knownBy` 的结构化记忆事实（未知知情者一律不发），最多 8 条 / 3000 字；
  - `groups[].history`：每群最近 6 条、每条 400 字、全局 9000 字，只含该群自己的消息。
- `cleanTerminalMainContext` 对三处新字段做严格校验（服务端同一函数），并把上下文上限按预算放宽到 100000 字符。
- `server/terminal-main.mjs` 增加「已确认剧情历史 / 记忆片段（knownBy 知情）/ 各群本群历史」段落，明确终端先行时只能依据 history + 本轮输入 + 各群历史。
- 新增 `tests/terminal-context-server.test.mjs`：断言 canary 正文、记忆文本、各群历史**出现在真正发给模型的 messages 里**，并断言甲群内容不出现在乙群对象、乙群内容不出现在甲群。

### 必修 5：切换终端接口后旧回包仍写入 —— 已修

- 守卫从「旧档案 id」改为 `terminalRouteSignature()`：当前选择 + 完整接口签名（地址/模型/Key），并叠加 `terminalEpoch` 与有效启用状态。
- 回包后、写回前都判 `stale()`；同样档案内改 Key/模型也会作废旧回包。

### 必修 6：坏掉的可选终端配置仍阻塞正文 —— 已修

- `requiredApis` 不再包含终端接口（正文必需配置与终端就绪彻底分离）；终端就绪只由 `terminalApiIssues` 在开启时把关。
- `tests/apis.test.ts` 相应更新：断言终端不在 `requiredApis`、`apiConfigurationIssues` 不含终端条目、`terminalApiIssues` 单独报缺 Key/未确认（旧断言编码的是「终端进正文必需配置」的缺陷行为）。
- 顶栏按钮改为按**用户意图**显示：`已开启` / `配置未就绪` / `已关闭`；配置失效时点一下就明确关闭，不会在「开启失败」里循环。

### 补齐 A：主动好友/群邀请不再因顺序整体禁用 —— 已修

- 正文先：`social` 恒为 true（是否真的产出由模型按关系/知情/号码来源判断，写入端仍保留 `applySocialActions` 与好友申请的既有约束）；「正文已声称发送」只在**没拿到结构化动作**时才判失败并给重试，文案注明「不代表角色拒绝」。
- 终端先：正文确认后新增**只出动作**的核验阶段（`socialOnly`，任务 id `auto:<turn>:<variant>:social`，`mode=social-review`）：
  - 上下文清空 groups/privateRecipientIds，服务端二次强制清空并拒绝 `mode!=='story-first'` 或没有正文的请求；
  - 只允许 `friendRequests`/`groupActions`，不重生成群聊或正文；群消息即使被模型返回也在服务端被丢弃（测试断言 `groups=[]`）；
  - 同一轮一次性任务，ready 后不再请求，不能无限补修；空结果不算失败（除正文明确声称却没有动作）。
  - 触发条件：正文出现好友/号码/邀请类接触信号（`terminalSocialSignal`），无信号时零额外请求。

### 补齐 B：正文侧私聊知情规则 —— 已恢复

- 终端事实里私聊行改为 `私聊·X（仅X与玩家知情）：…`。
- `server/ai.mjs` 的 `terminalFacts` 系统消息恢复独立的知情约束：标注为私聊的内容只有玩家与该角色知道，其他角色不得提起、暗示、据此行动或转述进群聊。
- 没有重新引入自动通讯生成协议（正文仍无终端输出协议）。

### 补齐 C：保存失败保护与备份兼容 —— 已补

- 阶段应用与落盘作为一个事务：`applyTerminalAuto` 后 `persist()` 失败则回滚 `session.terminal` 与派生记忆（含 `job.status`/`job.facts`），不留 ready 内存状态，重试仍会落盘。
- 新增字段进入 `validateTerminal`：`turnId`/`variantId`/`mode`（枚举）/`facts`（≤6000）；随 `snapshot` 全链路往返（本地下载、云端、导入、覆盖、覆盖前副本都是同一份 `terminal`）。
- 测试含故障注入（写失败一次→回滚→重试成功）与备份往返 + 非法 `mode` 拒收。

## 3. 修改 / 新增文件

修改：

- `src/domain/terminalAuto.ts`：阶段绑定字段、`terminalAutoJobId`、`terminalJobFacts`、`socialOnly`/`socialRequired`、`terminalSocialSignal`、私聊事实标注、`job.facts` 持久化
- `src/domain/terminalLedger.ts`：`TerminalJob.turnId/variantId/mode/facts`、`terminalJobTurnIndex`
- `src/domain/terminalMain.ts`：`history`/`memories`/`groups[].history` 及预算与校验
- `src/domain/apis.ts`：`requiredApis` 移除终端
- `src/domain/personalTerminal.ts`：终端任务新字段校验
- `src/app/useWorkspace.ts`：`terminalEpoch`/路由签名、停用解禁、迟到丢弃与幽灵任务清理、已完成阶段返回已提交事实、`retryTerminalJob`、正文后社交核验、保存失败回滚
- `src/app/usePersonalTerminal.ts`：手动/耐受度 epoch 守卫与停用后取消
- `src/components/PersonalTerminal.vue`：按任务重试
- `src/components/WorkspaceNavigation.vue`：按用户意图显示并允许生成中停用
- `server/terminal-main.mjs`、`server/personal-terminal.mjs`、`server/ai.mjs`：见上
- `tests/apis.test.ts`：终端与正文必需配置隔离的新契约
- `tests/codex-terminal-review.test.ts`：仅第 2 项改为新绑定断言（原因见必修 2）

新增：

- `tests/terminal-rework.test.ts`（9 项）
- `tests/terminal-context-server.test.mjs`（3 项）
- `docs/handoffs/2026-10-27-terminal-rework.md`（本文件）

## 4. 验证命令与结果（实际执行）

```
npx vue-tsc --noEmit
  → 0 错（输出为空，退出码 0）

npx vitest run
  → 136 files / 768 tests passed（含新增 9 + 6 项）

node --test tests/*.test.mjs
  → 441 tests：437 pass，4 skipped，0 fail
  → 4 个 skipped 是 auto-update-server 里 {skip:process.platform!=='linux'} 的既有平台跳过，与本轮无关
  → 首轮验收记录过的 realpath dist EPERM 本次未复现（未改 server 种子/世界书逻辑）

npm run build
  → 同一条链路先跑 scripts/sync-terminal.mjs，再 vue-tsc，再 vite build，成功（仅有既有的 >500kB chunk 提示）

npx vitest run tests/terminal-split.test.ts tests/terminal-main.test.ts \
  tests/terminal-followup.test.ts tests/terminal-ui-recovery.test.ts \
  tests/terminal-anchor-cache.test.ts tests/divination-countdown.test.ts \
  tests/channel-terminal-gate.test.ts tests/personal-terminal.test.ts \
  tests/terminal-rework.test.ts tests/codex-terminal-review.test.ts
  → 10 files / 66 tests passed

node --test tests/terminal-auto-server.test.mjs tests/terminal-main.test.mjs \
  tests/terminal-social.test.mjs
  → 9 pass

node --test tests/terminal-context-server.test.mjs
  → 3 pass
```

新增覆盖明细：

- `tests/terminal-rework.test.ts`
  1. 生成中停用：返回 true、不再写通讯、不留幽灵任务；
  2. 同档案换 Key 的迟到回包被丢弃；
  3. 终端失败后切顺序，重试仍走原阶段（payload `mode=story-first`、带正文）；
  4. 终端先正文失败后重试：不再请求终端、`terminalFacts` 与首次逐字相同；
  5. 正文先无「已发送」字样也能落地主动好友申请；
  6. 终端先正文后社交核验：第二次请求 `mainContext.socialOnly=true`、groups 为空、不重生成群聊、落 pending、ready 后重试不再请求；
  7. 保存失败一次→回滚（无消息、任务非 ready）→重试成功落 8 条；
  8. 阶段绑定字段备份往返 + 非法 `mode` 拒收；
  9. 上下文：已确认历史 canary、按知情范围记忆、每群只带本群历史、未知知情者不广播。
- `tests/terminal-context-server.test.mjs`
  1. 历史/记忆/各群历史确实进入模型 messages，且两群历史互不串群；
  2. 社交核验阶段即使模型返回群消息也被丢弃，只留好友申请；
  3. 社交核验阶段要求已确认正文，终端先顺序与空正文一律 400 且不消耗请求。

## 5. 保留行为（未改）

- 牌面：仍是「下一个既有日界线单次 timeout + 局部倒计时」，界面无现实时间字样；本轮未触碰相关源码。
- 8807 手机始终关闭（无入口、`/api/personal-terminal` 403），新功能只在 9000；两端由 `channel-terminal-gate`、`channel-gate`、`terminal-auto-server` 覆盖。
- 锚点哈希逐位兼容（性能缓存回归通过）。
- 正文请求仍无终端输出协议；旧 `outcome.terminal` / `main-followup` 仍可读、不重放。

## 6. 已知风险与取舍

1. **终端上下文变大。** 预算上限约 20k 字符（历史 8k + 记忆 3k + 各群历史 9k），服务端上下文上限从 70k 放宽到 100k。真实长档可能更早触发截断，但不会丢字段或串群。
2. **单次调用仍共享同一份上下文。** 各群历史按群分数组、私聊与记忆带 `knownBy`，但同一条请求里模型仍能「看到」全部数组，隔离靠结构化标注+提示词约束，不是物理隔离。需要更强隔离就得拆成多次请求，代价是成本与延迟。
3. **社交核验仍是模型判断。** 触发用信号词，是否真的发申请由模型按关系/知情/号码来源判断；结构性约束（成员、冷却、来源字段）仍在写入端。
4. **旧任务（无 `turnId`）的重试靠锚点推断。** story-first 取锚点轮，terminal-first 取锚点下一轮；这是为兼容首轮数据，新的任务都带 `turnId`。
5. **未做实机浏览器点击回归。** 本轮按约束未重启/改线上，8807/9000 的界面行为由组件测试与服务端门控测试覆盖，没有真实双端手点截图。

## 7. 未完成

- 未提交、未推送、未部署、未发公开频道。
- 未做真实模型/真实存档联调（按约束禁止）。
- 交 Codex 再次独立验收。
