# 2026-10-26 每日占卜（塔罗）交付

基线 main `10d1ab3`（HEAD=remote=10d1ab3；未提交，等待 Vesper 审查，不要 force/reset）。

## 末轮收尾（终审后最小轮，2026-10-26）

1. **午夜后真实点击取新日**：`go('divination')` 打开占卜页、`drawDaily`/`peekDaily`/`retryDivination` 三个今天入口均先 `refreshDay()` 用真实 Asia/Shanghai 日键——30 秒 timer 未 tick 的午夜后点击不再画进昨天。`backfillDivination(day,actor)` 保持显式旧日不动 `dayNow`；解读回写走 `record.day` 原请求日，不回滚可见日。新增回归 `tests/divination.test.ts`「午夜后 1 秒 timer 未 tick 真实 click」：入口刷新、draw/peek/retry 落新日、昨日记录不动、backfill 原日且 dayNow 不变。
2. **尾随空白清零**：`usePersonalTerminal.ts` watch 行、`PersonalTerminal.vue` titles/back 行（本轮新增 `go` 行一并）CRLF→LF，`git diff --check` 现为干净（0 输出）；仅动本轮行，未改 gitconfig，未全文件重排。
3. **猫图 SHA256 复核**：源 `exec-a71d141c…png` 与 `public/assets/divination-cat.png` 完全一致（`8b81375806e1dba6c1d5b7c09ba7870b9eb1a8e611e7c3e684a35aebd4a846c2`，2,979,606 字节），原图未改。
4. **定向验证（本末轮实际执行）**：`npx vitest run tests/divination.test.ts tests/divination-archive.test.ts tests/king-games-room.test.ts` **37/37**（divination 16、archive 3、king-games-room 18）；`node --test tests/divination-server.test.mjs` **6/6**；`npx vue-tsc --noEmit` 0 错误；`npx vite build` 通过（exit 0）。第 64 轮全套记录（vitest 118 文件 646/646、server 395/0/4）保留为历史证据，本末轮未重跑全套。

## 返工 63（本轮收尾，2026-10-26 第二次会话）

上一棒因 `tests/divination-archive.test.ts:31` 的 `drawThreeCards(()=>0)` 触发同步无限循环被 Vesper 主动取消（挂死的 vitest 进程已确认无残留）。本轮为**收尾/验证**而非重做，实际改动：

1. **死循环根因修复**：`drawThreeCards` 去重改为有界（≤16 次重试，失败后从剩余池按随机抽取），坏随机函数不再可能挂死；随机源校验保留。测试 fixture 改用有限序列 `seqRandom([0,1,0,2,3,1,4,5,0])`，无 while 随机。
2. **持久化证明改为指纹键**：`persistedDraws`（WeakSet 对象身份）→ `persistedKeys`（`sid|day|actorId|cardsFingerprint`）。原因：解读 commit 会克隆 terminal，克隆后的记录丢失"已持久化"身份，导致 retry 误做重复持久化并在 save 失败时打不通 API。指纹键下：先落盘后 API、失败回退、双页乐观冲突语义全部保持，且"同 NPC 固定 0 新请求"的对象同一性恢复。
3. **真日历校验**：`validateTerminal` 的占卜 day 从正则升级为真实日历日期（拒绝 `2026-02-30`）。
4. **草稿提取修正**：`divinationDraftText` 先剥代码围栏再判 JSON——` ```json {...} ``` ` 形态现在解析保留可读段落而非整段 JSON 误当正文；不可解析 JSON 仍丢弃。
5. **跨页测试顺序修正**：page B 的 baseline 读取移到 page A 写入之前，真实触发 repository 乐观锁拒绝（disk 只保留 winner draw，loser 0 API 调用，重读恢复 winner）。
6. **类型清理**：移除 `as any`（reading status 用 `as const`/`TerminalDivination` 类型标注），archive 测试补非空断言与显式类型。
7. 生产静态路由实测：本地起 `server.mjs` 后 `GET /assets/divination-cat.png` → **200，2,979,606 字节**，与 public/ 副本一致（用户此前已确认原图），验证后进程已停止。

## 范围（按已批准方案 A–F 实现，未重新设计）

- **A**：游戏室名称不变，七项列表中「每日占卜」变为可用入口（未抽过也永远可点进查看），国王游戏保持，其余 5 项保持原生 disabled。不接罚酒/醉酒，不改其他游戏。
- **B**：每存档每天（Asia/Shanghai 北京时间日键，与 journeyName 同规则）每人一份。完整 78 塔罗牌（22 大阿尔卡纳 + 权杖/圣杯/宝剑/星币各 14，稳定 id/名称/花色），程序 `crypto.getRandomValues` 抽 3 张去重并随机正逆位，对应今日基调/关系/行动。先原子保存 draw（含 day/actorId/cards/reading pending），保存成功才调终端 API 生成四板块（整体运势/感情/事业学业/注意事项）。AI 只解释锁定牌面，server 校验结构与牌面绑定。retry 只补解读、同牌同正逆位；成功后再进不触发请求。跨午夜落原请求日（记录按存储 day 键定位，不重算）；不写明日、旧签只读回看。
- **C**：占卜页两页签：我的今日占卜 / 偷看角色运势。NPC 候选为本档已知角色（state.characters+contacts），首次偷看懒生成当天签后固定；不消耗 player 次数、不批量预生成。NPC 结果含四板块 + 该角色按人设的独立反应（server 要求 reaction，缺失/过短拒绝）。偷看不写终端聊天/记忆/正文（A 签不进 B 终端），不把预测当已发生事实；prompt 只给目标 actor 人设与 audience 过滤后的 scoped context（NPC audience 仅本人，不含 player，NPC 不知道被偷看）。本期无分享系统。
- **D**：黑猫 Rätselhaft 原图（1024x1536 竖版，绒黑猫金绿眼红领结紫蓝星月帽）复制至 `public/assets/divination-cat.png`（2,979,606 字节，未修改，源文件保留在 C:\Users\chan\.codex\generated_images\01a16cdf…\exec-a71d141c….png）。静态路径 `/assets/divination-cat.png`（生产白名单兼容），运行时 `:src` 绑定（避免 SFC 静态资源重写破坏 SSR 测试），`object-fit:contain` 移动端不裁脸/帽。文案优雅神秘带善意调侃，星空暗金/酒红主题。卡面为统一 CSS 视觉（花色符号+名称+正逆位），未用 AI 生成 78 张图，无版权素材。
- **E**：持久化在 `session.terminal.divinations?: TerminalDivination[]`（optional 强校验，旧档懒初始化）。唯一键 session+day+actor（`validateTerminal` 查重）。本地/完整 v2/云 save v2/导入 merge/replace/恢复副本全部经既有 session 快照路径往返（`tests/divination-archive.test.ts` 专项断言）。**无 2000 条条数硬上限**（domain 与 validator 均无，>2000 长期记录可写并有测试，历史 UI 分页每页 20 按需展开）；容量保护为存档级真实大小限制，不静默删除。
- **F**：复用 repository 乐观锁（跨页写入冲突即 abort 报“存档已被其他页面修改”）+ commit only-if-missing（`ensureDivination` 幂等），保存成功后从持久层重读 winning draw。解读写入走专用 `commitDivination` 守卫：绑定 sid+day+actorId+cardsFingerprint+anchor；迟到/换档/分支切换/指纹不符一律拒绝且已抽牌保留；不用时间随机 seed；pending/failed 恢复按钮常在，不假 spinner。

## 关键文件

| 文件 | 改动 |
| --- | --- |
| `src/domain/divination.ts`（新） | 78 牌定义、Beijing 日键、drawThreeCards（校验随机源）、cardsFingerprint、ensureDivination only-if-missing |
| `src/domain/personalTerminal.ts` | PersonalTerminal.divinations 可选字段 + validateTerminal 完整校验（重复键/牌面/板块长度/ready 完整性/NPC reaction） |
| `src/app/usePersonalTerminal.ts` | divinationToday/myDivination/peekRecord/peekCandidates/divinationHistory、drawDaily/peekDaily/retryDivination、commitDivination 守卫、失败记账保草稿；scopedTask 增加 divination 且 audience=[目标 actor] |
| `src/components/PersonalTerminal.vue` | lockedGames 移除每日占卜（5 个 disabled）、games 页开放入口、divination 页（两页签/日期/猫图/卡面/四板块/反应卡/历史只读）、titles/back 映射、pt-div-* 样式 |
| `server/personal-terminal.mjs` | instructions.divination（禁止抽牌/换牌/极端预言）、plan 校验 lockedDivination（day/actor/kind/3 张合法去重牌）、parse 四板块（各≥15 可见字≤1500）+ NPC reaction（≥4 字≤800）、player 伪角色注入 |
| `tests/divination.test.ts`（新，16 项） | 78 牌完整唯一/抽 3 去重与正逆位（含坏随机源拒绝）/午夜切换/午夜后 timer 未 tick 真实点击落新日/固化幂等含 >2000 记录/失败保牌重试/保存失败 0 请求/偷看独立固定/历史只读/迟到指纹与换档拒绝/validate（含真日历与非法日期）+旧档兼容/重试先补持久化+解读保存失败回退/草稿非 JSON 正文/backfill 原日不重抽 |
| `tests/divination-archive.test.ts`（新，3 项） | 真实 collectWorkspaceArchive+backup v2+createCloudSave v2 往返、导入 merge 换 ID 保留占卜+覆盖前恢复副本、跨页乐观冲突 winner/loser（真实 IndexedDbRepository+fake-indexeddb） |
| `tests/divination-server.test.mjs`（新，6 项） | plan 参数与牌面绑定校验、四板块与 reaction 结构/长度/可读性、server 从 id 重建牌面拒绝伪造、真日历+kind/actor 一致+priorDraft+猫人设、NPC 不收请求者私人 profile、prompt 仅目标 actor 人设不含全名单 |
| `tests/king-games-room.test.ts` | locked 数 6→5，每日占卜断言改为解锁入口 |
| `public/assets/divination-cat.png`（新） | 用户确认原图 |

## 验证（实际执行，返工 63 后）

- `npx vitest run`（全套）**118 文件 646/646 通过**（含 divination 15、divination-archive 3、king-games-room 18、backup-archive 8、cloud-backup 7），exit 0。
- `npm run test:server` **395 通过 / 0 失败 / 4 跳过**（含 divination-server 6 项），exit 0。
- `npx vue-tsc --noEmit` 0 错误（exit 0）；`npx vite build` 通过（exit 0），`dist/assets/divination-cat.png` 随 public/ 复制。
- 真实 Edge Playwright（本地 Vite + 生产 #academy-workspace 宿主结构、synthetic 存档、mock terminalAPI，无凭据）：`node .integration/divination-verify.mjs` **ALL CHECKS PASSED，exit 0**。覆盖：游戏室 7 项可见/5 个原生 disabled/每日占卜入口非 disabled、猫图 HTTP 200 + naturalWidth 1024×1536 + object-fit contain、失败→failed UI→重试（牌面不变）→四板块、刷新同签 0 请求、偷看阿一懒生成+自评+玩家签不动+第二次 0 请求+请求仅含该 actor、历史 2026-10-25 只读可见；divination 请求共 3 次（1 失败+1 成功+1 NPC）。finally 清理 dev server。
- 生产静态路由：本地 `node server.mjs` 实测 `GET /assets/divination-cat.png` 200（2,979,606 字节），验证后进程停止。
- agent-hub 不可用：`D:\QQ\QQ文件\agent-hub\hub.mjs` 路径不存在（`D:\QQ` 下已无 QQ文件 目录），无法按 AGENTS.md 读写接力棒，本文件即交接载体。

## 遗留 / 未验明确

- 真实 provider（模型）语义未验证（无凭据），浏览器验证使用 mock；「不编灾害/剧情状态」为提示词约束+结构校验，未做语义回归。
- 跨页并发以 repository 乐观锁+only-if-missing+指纹守卫覆盖并有对应测试；未做双真实浏览器并发演示。
- 未部署（含 server/ 改动，发布需走完整更新而非热更新）。未 commit/push，等 Vesper 审查。
