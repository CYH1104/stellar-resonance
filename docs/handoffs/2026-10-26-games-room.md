# 游戏室扩展（国王游戏耐受度/罚酒/afterparty）实施与验证

日期：2026-10-26。基线 main `f28111d`（HEAD=origin/main，干净 FF，无覆盖）。执行：glm-5.3-flash（具体实施者）；Vesper 负责人验收。**未 commit/push/deploy**，工作区含未提交改动，交 Vesper 审查。

## 范围落地（对照批准范围）

1. **游戏列表**：游戏室页新增 7 项列表（国王游戏、真心话大冒险、每日占卜、狼人杀、日麻、斗地主、十一点半）；仅国王游戏可点（创建房间），其余 6 项灰色不可点击并标“暂未开放”；原进行中/已结束（回看/未开始）房间入口保留可达。
2. **存档级耐受度**：`PersonalTerminal.tolerances: Record<稳定角色ID, 1..10>`（含 `player`）。开始新一轮时对缺失参与者调用新终端任务 `tolerance`，AI 按人设生成整数；`missingTolerances` 只补缺失，成功后先 `commit` 持久化再 `drawKingRound`；重试只补缺失、禁止覆盖、无随机默认；请求迟到/取消/存档或 API 变更由既有 request 守卫丢弃。服务端 roster 为 tolerance 注入 player 伪角色。UI：房间成员行与国王轮页 `pt-drunk-strip` 显示 `醉酒/耐受`（未生成显示 `?`）。
3. **罚酒记账**：`syncKingDrunk`（程序计账，非 AI）：所有 `refused` 且 penalty 非空的回应（NPC react、game-interact、玩家“拒绝并接受惩罚”）每条 +2 杯（`kingPenaltyDrunk=2`）；事件 id=`轮号:回应标识`（稳定），存 `room.penaltyEvents`，重试/重复返回永不复扣；正常完成 0；drunk 按房间累计、刷新/暂停不重置、新房间从 0。
4. **醉酒结束**：react/interact 提交后 `maybeDrunkEnd`：任一参与者 `drunk>=tolerance`（含 4→6 跨奇数 5）→ `saveGameEnd('drunk',triggers)` 原子保存 `endedAt/endReason/endTriggers/afterparty(pending)` 与游戏记忆 endedAt，再请求 `afterparty`；**先结束保存、后请求长文**；结束后无法出令/下一轮/继续惩罚（既有守卫保持）。多触发者合并一篇。正常无人醉的手动结束走原 `endGame`（endReason 不写、绝不调 afterparty）；未开局结束保留“不生成回看”规则。
5. **afterparty 长文**：新终端任务 `afterparty`，服务端 instructions 要求 ≥1200 字（不含空白）、重点触发者、贴人设、分段、不揭露匿名编号、返回 `{text,summary}`；`parseTerminalResult` 以去空白可见正文 ≥1200 校验（`AFTERPARTY_LENGTH` retryable），上限 8000 字符；`server/app.mjs` afterparty 专用 `maxTokens=4000`、内容上限 24000（其余任务不变）。客户端二次校验可见字数；持久化于 `room.afterparty{status,text,summary,error,triggers,at}`；失败/取消/字数不足保留原文与错误（status failed），`retryAfterparty` 仅补长文——不加酒、不重开局、不重掷耐受。已结束房间专用受控写入路径 `commitAfterparty`（只允许改 afterparty 字段，保持 commit 的 ended 房间整体保护不变）。过期防护：session 守卫 + storageStatus 检查。
6. **记忆互通/备份**：summary 写入游戏记忆条目 `games[].afterparty`（knownBy=房间参与者快照），`formatTerminalSegment`/`formatTerminalMemory` 追加“复盘：摘要”——召回候选含剧情摘要，历史房间保留全文；`recordTerminalChat` 复盘段 knownBy=participants，不广播给未参加角色。`validateTerminal` 新增 tolerances（1..10 整数、≤300 项）、drunk/penaltyEvents/endReason/endTriggers/afterparty（ready 必须可见字数≥1200）校验；旧档懒初始化（字段可选，不清旧数据）；备份走 sessions 快照原路径（本地完整/云端 v2 均携带），parseBackup 对损坏新字段在写入前拒绝。

## 关键改动文件

- `src/domain/personalTerminal.ts`：KingAfterparty、常量、visibleTextLength、tolerances/drunk/penaltyEvents/afterparty/endReason/endTriggers 字段、syncKingDrunk/kingOverLimit/missingTolerances、validateTerminal 扩展。
- `src/domain/terminalLedger.ts`：games 条目 `afterparty` + 段落/记忆文本追加复盘摘要。
- `src/app/usePersonalTerminal.ts`：tolerances/toleranceValue/retryAfterparty 暴露；startRound 先补耐受再抽签；react/interact 提交内 syncKingDrunk + maybeDrunkEnd；saveGameEnd/requestAfterparty/ensureAfterparty/commitAfterparty；requestAfterparty 专用路径清除 operationRoom 守卫。
- `src/components/PersonalTerminal.vue`：游戏列表（6 项锁定）、房间耐受小字、king 页 `pt-drunk-strip`、history 页散场复盘卡（ready 全文+摘要 / failed 错误+重试 / pending 提示）。
- `server/personal-terminal.mjs`：`tolerance`/`afterparty` instructions；tolerance 注入 player；tolerance 需 ≥1 id；解析分支（tolerance 覆盖校验、afterparty 可见字数与 summary）。
- `server/app.mjs`：afterparty 专用 token/内容预算。
- 测试：新增 `tests/king-games-room.test.ts`（10 用例）、`tests/king-games-server.test.mjs`（3 用例）；更新 `tests/king-custom-flow.test.ts`、`tests/terminal-workflow.test.ts`（tolerance mock 与调用序断言）。

## 验证证据（实际执行）

- `npx vue-tsc --noEmit`：0 错误（本树）。
- `npx vitest run`（全前端）：**620 通过 / 1 失败 / 621**。唯一失败 `tests/terminal-main.test.ts`（“私聊-陆离”不应出现在 note）**在干净 HEAD f28111d（git stash 后）同样失败——既有失败，与本轮无关**，未修复（超范围），已留待负责人裁决。
- `npm run test:server`（全后端）：**379 通过 / 4 跳过 / 0 失败**（含新 `king-games-server.test.mjs` 3 项）。
- 定向新套件：`tests/king-games-room.test.ts` 10/10、相邻国王/终端/记忆套件 58/58 通过。
- 覆盖点（单元）：7 列表/禁用/旧房可达；耐受同档固定不重掷/仅补新角色/值 1 与 10/非法(0、11、1.5、重复、越名)拒绝且不保存不抽签；玩家与 NPC 拒绝各 +2、正常完成 0、重复计账 0；奇数 3→5 与 4→6 跨阈值结束、多人同次合并触发者；先保存 endedAt 再请求；失败/取消保留原文与错误、retry 仅长文且不加酒不复扣不重开局；中途凭证变更迟到丢弃（tolerances 不落盘）；未醉手动结束 0 请求、备份往返 v1 兼容 + ready 短文/越界耐受导入拒绝。
- 真实 Edge + 本地 Vite UI（`.integration/games-room-verify.mjs`，Playwright 路由 mock bootstrap/connection/personal-terminal，**mock 与真实 provider 未验明确区分**）：游戏列表 7 项/6 禁用/旧房可达；进临界房 → 耐受条（玩家 `0/?`、阿一 `3/5`）→ 获取角色回应（拒罚 +2 → 5≥5 自动结束）→ 历史页散场复盘 ≥1200 字全文+摘要；已结束房 failed 复盘重试成功（drunk/penaltyEvents/轮数不变）；抽签开始下一轮仅补 player 耐受（请求审计恰好 1 次 tolerance、actorIds=['player']）且先持久化再开局；手动结束无 afterparty 请求；afterparty 恰好 2 次。断言读取 IndexedDB 实际存档（r1 endedAt/endReason/endTriggers/drunk.a=5/penaltyEvents/afterparty.ready）。证据：`.integration/games-room-verify-result.txt`（ALL CHECKS PASSED）。未读真实用户存档，未搜索凭据。
- `npm run build`（sync-terminal + vue-tsc + vite）：通过。

## 遗留 / 决策

- **既有失败**：`tests/terminal-main.test.ts` 1 项在基线 f28111d 即失败（私聊 note 断言），非本轮引入，未动。
- 正常无人醉的手动结束走原 `endGame`，不生成 afterparty——这是本轮明确范围（"无人醉正常结束不生成醉后文"），并非"手动已醉不生成是用户要求"；达到醉酒阈值时由 recoverDrunkEnd/openRoom 守卫先按 drunk 结束并生成复盘，手动路径不绕过阈值保护。
- afterparty summary 由模型返回或取正文前 240 可见字兜底；记忆只存摘要，全文只在房间。
- `agent-hub`（AGENTS.md 中 `D:/QQ/QQ文件/agent-hub/hub.mjs`）本机不存在，未跑接力棒命令；AGENTS.md 内项目路径已与实际（g:\workspace\stellar-resonance）不符，未修改。
- 未 commit/push/deploy；未操作服务器；未新增依赖（复用外部 playwright-core 路径）；`.integration` 不入 git。

---

## 返工记录（2026-10-26 第二轮，Vesper 验收未通过后集中修复）

仍基于 main f28111d，同一未提交工作区。执行：glm-5.3-flash。未 commit/push/deploy。7 项问题逐条修复：

1. **UI 进度条与禁用按钮**：房间成员行、king 页 `pt-drunk-strip`、history 页新增真实 `<progress>`（max=耐受度、value=醉酒值，含 aria-label "某某醉酒度进度"）+ 数值；仅实际参与者（player + invitations=accepted）显示，declined/pending 成员显示"未参加/等待回应"，不显示醉态。6 个占位从 `div aria-disabled` 改为原生 `<button disabled>`，名称与"暂未开放"保留。浏览器证据：Playwright 原生 click + 鼠标滚轮滚动（`scrollIntoView` 不再需要——发现 dev 骨架缺 `#academy-workspace` 挂载层导致组件样式全失效，脚本内按生产结构补齐包裹层后布局与生产一致）。
2. **afterparty pending/failed 补写入口**：history 页 pending 状态提供"补写复盘"按钮、failed 提供"重试生成复盘"，working 时禁用；不自动重复加酒；正常 ended（手动）无 afterparty 不显示。证据：刷新后 pending → 按钮 → 成功且不复扣（drunk/penaltyEvents/轮数不变）。
3. **顺序与原子性**：玩家拒绝（refuse）第一笔 commit 后立即阈值判定，触发则直接在同一/下一 commit 结束保存，**不再发送普通 game-interact 请求**，pending interaction 标 `stopped`（新状态，validate/UI 同步）。NPC react / game-interact 的回应、+2 记账与 endedAt/endReason/endTriggers/afterparty(pending) 在**同一个持久化 commit** 内完成（applyDrunkEnd）；afterparty 请求严格在其后。openRoom/startRound/command/react/interact 所有入口均有安全恢复（recoverDrunkEnd）：drunk>=耐受仍 active 的房间先结束保存再动作。
4. **syncKingDrunk 收敛范围**：改为按目标 room 计账（签名 `(t, room?, countRound?)`），跳过 ended 房间、archived 分支轮；新增 `room.drunkFrom` 采纳标记——新建房间 drunkFrom=0，旧档活跃房间首次 scoped sync 惰性记为当前轮数，旧拒绝永不回算。ended guard 保留（commit 的 ended 房间整体保护未动）。测试覆盖：ended 历史房、旧 active 历史、archived 分支、多 room 隔离、重试去重。
5. **afterparty 上下文与快照**：结束时保存 `afterparty.participants` 快照（player + 实际 accepted，排除 declined/pending）；请求 actorIds=快照 NPC（server 为 afterparty 注入 player 伪角色，人设完整注入）；context 走 scoped 路径（audience=快照，scopedRecall，无最近正文/全局记忆）；knownBy 与长文记忆按快照。commitAfterparty 绑定 session+room+endedAt+roomFingerprint（不含 afterparty），切档/迟到失败绝不写错房；失败记账同样绑定。王游戏 command 匿名保护未动。证据：私密 canary 与开场正文在全部 afterparty 请求体中不出现。
6. **短文草稿**：短文/失败时以安全正文片段（从 raw JSON 提取 text 字段或纯文本，绝不存整 JSON）保留 `afterparty.draft`（≤8000，validate/备份兼容），补写请求携带 `context.priorDraft`；取消保留先前草稿；成功清除。服务器 instructions 支持在草稿基础上扩写。备份 v1 往返 + 损坏拒绝测试更新（draft/participants/drunkFrom 均校验）。
7. **terminal-main 基线失败**：确认为 f28111d 引入 #private 笔记后断言过时（非产品 bug）。最小修正断言并增强语义校验（公共笔记不含私聊段、#private 笔记含 audience 标签），见 .integration/terminal-main-baseline-failure.txt。

## 返工验证（实际执行）

- `npx vue-tsc --noEmit`：0 错误。
- `npx vitest run`：**627 通过 / 0 失败 / 627**（此前基线失败的 terminal-main 修复；新增 7 个返工测试）。
- `npm run test:server`：**380 通过 / 4 跳过 / 0 失败**（新增 afterparty plan 注入 player + priorDraft 透传测试）。
- `npm run build`：通过。
- 真实 Edge + 本地 Vite（`.integration/games-room-verify.mjs`，mock 与真实 provider 未验明确区分）：**ALL CHECKS PASSED**（`.integration/games-room-rework-result.txt`）。覆盖：7 游戏/6 原生 disabled/无 aria-disabled；king/history 进度条；临界房真实点击拒绝→结束→ready；pending 补写→短文 failed 保留草稿→刷新→重试带 priorDraft→ready 不复扣；婉拒房 declined 显示"未参加"、不进醉态条、快照排除；手动结束无 afterparty；tolerance 恰好 1 次仅 player；afterparty 恰好 4 次（r1、r2 短文、r2 补写、r4）；canary 全请求不泄露。
- 备注：verify 种子房间带 `drunkFrom:0`（UI 新建房间即此值；旧档房间走惰性采纳）。

## 遗留

- 手动结束不生成 afterparty 仅限"无人醉的正常结束"（本轮范围）；醉酒阈值由 recoverDrunkEnd 守卫保护，手动路径不绕过。
- agent-hub（D:/QQ/QQ文件/agent-hub/hub.mjs）本机不存在，接力棒命令仍无法执行。
- 真实 provider 未配置，未验证真实模型行为。
- 未 commit/push/deploy；等 Vesper 审查，禁止自称用户验收通过。

---

## 第三轮收尾（2026-10-26，基线重放到 b70f022 并交付）

1. **基线重放**：朋友的 `b70f022`（fix: contain request errors and disconnects without crashing server sessions，频道明确交接的稳定性修复）经 `git fetch` 确认为远程 main。本地 delta（10 个 tracked 修改 + 3 个 untracked 新文件）先做可恢复备份（`.integration/backup-20261026-preb70/`，8 个文件含 tracked.patch/untracked 原件/verify 脚本与结果，SHA-256 已记录，不含密钥与真实数据），随后 FF 到 b70f022 并 3-way 重放 delta。`server/app.mjs` 中朋友的 error/disconnect catch 加固与 `tests/request-error.test.mjs` 完整保留，与本轮 afterparty token 预算改动（187 区 vs 292 区）无重叠，两个改动共存已验证。
2. **commitAfterparty 追加 request anchor 绑定**：guard 在原 session+room+endedAt+fingerprint 之外新增请求时 `terminalAnchor(session)`；`commitAfterparty` 在写入前校验 `terminalAnchorActive`，失败则拒绝写入。这样同档异步分支切换后，`request()` 守卫丢弃迟到回复转成的 failure（markAfterpartyFailure）也不会在旧 branch 记账。回归：tests/king-games-room.test.ts 新增"同档分支切换下迟到成功与迟到失败均不落笔，切回原分支失败仍正常记账，二次切换保持 failed 记录不变"。
3. **git diff --check 清零**：15 处 CRLF 行尾（LF 文件中混入的 `\r`）按行精准归一为 LF（usePersonalTerminal.ts 8 行、PersonalTerminal.vue 7 行、terminal-main.test.ts 1 行），保留原 EOL，不整文件重排，无全局配置改动。
4. **验证证据（实际执行）**：
   - `npx vitest run`（定向 5 套件 king-games-room/king-custom-flow/terminal-main/terminal-workflow/terminal-ledger）：34/34 通过（king-games-room 18/18）。
   - `npm run test:server`（全后端，含朋友 request-error 回归 + king-games-server + 备份相关）：**389 通过 / 0 失败 / 4 跳过**。
   - `npx vue-tsc --noEmit`：0 错误；`npm run build`：通过。
   - 真实 Edge + 本地 Vite（`.integration/games-room-verify.mjs`，生产 `#academy-workspace` 宿主结构、原生 click+滚轮、mock bootstrap/connection/personal-terminal）：**ALL CHECKS PASSED 且 node 进程 exit 0**（日志 `.integration/games-room-verify-run-b70.log` 含 NODE_EXIT_0 标记）。
5. **如实声明**：mock terminalAPI，真实 model/embedding 未配置未验证；未部署，未操作服务器；频道播报由 Vesper 发送。
6. 交付：明确选择本轮 10 个修改文件 + 3 个新文件（docs/handoffs/2026-10-26-games-room.md、tests/king-games-room.test.ts、tests/king-games-server.test.mjs）提交推送 main；`.integration`、密钥、日志、存档不入 git。备份保留于 `.integration/backup-20261026-preb70/` 直到确认交付。
