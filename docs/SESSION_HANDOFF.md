> **2026-11-26 小游戏记忆与卡顿：**最近游戏结果和所在剧情回合时间优先进入角色上下文；日麻重复保存和记忆索引并发已优化。前端1185项、Linux后端541项通过；仅9000，发布状态见 [本轮交接](handoffs/2026-11-26-game-memory-performance.md)。

> **2026-11-26 麻将牌背与牌局音效：**麻将改为带象牙白厚边的专用牌背；麻将落牌音效、斗地主报牌及催促语音、两桌左上角喇叭开关已接入。音效仅当前页面会话开关，不新增持久化字段。已发布9000（0eb817669134c729），8807进程和资源未变；原生Node导入错误已修复，验证和收据见 [本轮交接](handoffs/2026-11-26-table-audio.md)。

> **2026-11-26 麻将牌背和扑克牌素材：**采用 CC0 蓝白纹样牌背与完整 54 张扑克牌，保留麻将正面留白。所有牌局展示位置接入本地图片，手机横屏重叠手牌角标放大。已发布 9000（b5fb0fce1fe84ea5），8807 未变。测试与发布收据见 [本轮交接](handoffs/2026-11-26-card-artwork.md)。

> 2026-11-26 澄清：留白对象为万筒条等麻将牌面，吃碰杠胡恢复大图案。见 [牌面留白交接](handoffs/2026-11-26-mahjong-tile-spacing.md)。仅9000发布，8807不动。

> 2026-11-26 麻将动作图标留白：见 [本轮交接](handoffs/2026-11-26-mahjong-icon-spacing.md)。仅9000，8807不动，发布状态以收据为准。

> 2026-11-23 麻将吃碰杠胡图片按钮与手牌右上方布局：见 [本轮交接](handoffs/2026-11-23-mahjong-action-buttons.md)。仅9000，8807不动，发布状态以交接收据为准。

> 2026-11-23 课表校验、退群首页通知与麻将图片修复：见 [本轮交接](handoffs/2026-11-23-terminal-schedule-notification-tiles.md)。仅发布 9000，状态以该交接最新发布收据为准。

> 2026-11-23 当前交接：四人日麻与斗地主每小局结算发言，仅9000发布、8807不动。详见 [本轮交接](handoffs/2026-11-23-mahjong-settlement.md) 与 [日麻说明](MAHJONG.md)。

> 2026-11-21 当前授权：9000 测试版单独修复发布，8807 稳定版不动。此前双端共同发布描述不适用于本轮。见 [审计交接](handoffs/2026-11-21-terminal-audit-fixes.md) 与 [终端 API 切换补充](handoffs/2026-11-21-terminal-api-switch.md) 与 [斗地主结算/气泡补充](handoffs/2026-11-21-landlord-settlement-bubbles.md)。

# 跨会话工作交接

> **2026-10-26 Codex：频道最终方案修复。** 基线远程 main `539eb416`；保留已部署的 `b70f0228` 请求错误防崩溃修复。终端分群计数/缺额定向补齐、结构化群邀请、生成时聊天浏览、模型列表选择、国王游戏1杯/15轮与分角色醉后篇已实现。保存改为独立长文本草稿、显式配置草稿提交、正文完成或中断落盘；IndexedDB版本2按稳定记录写入，原快照保留且受控原子迁移。完整说明见 [TERMINAL_FINAL_PLAN.md](TERMINAL_FINAL_PLAN.md)，备份规则见 [BACKUP_COMPATIBILITY.md](BACKUP_COMPATIBILITY.md)。验收：前端123文件671项通过；后端395项通过、4跳过；类型检查和生产构建通过；独立Chromium桌面1440/移动390px真实UI与完整备份往返通过。真实计费模型和iOS/安卓真机未实测。发布后以远程main及实际服务器HEAD为准；不要重复套用已撤回的流式周期保存方案。

> **2026-10-26 每日占卜（塔罗）交付（返工 63 收尾完成，未提交，等待 Vesper 审查）：**基线 main `10d1ab3`（实现前实测 HEAD=remote=10d1ab3 干净）。游戏室七项中「每日占卜」解锁为可用入口（未抽过也可点进查看），其余 5 项仍原生 disabled，国王游戏不变、不接罚酒。每存档每天（Asia/Shanghai 日键）每人一份：78 张稳定塔罗牌程序抽 3 张去重+随机正逆位（基调/关系/行动），先原子持久化 draw 再调终端 API 生成四板块；retry 只补解读同牌不重抽，成功重进 0 请求；跨午夜落原请求日，旧签只读回看。偷看角色运势：本档已知 NPC 首次懒生成当天签后固定，不占 player 次数，含独立人设自评，NPC 不知道被偷看，不写终端聊天/记忆/正文。持久化 `session.terminal.divinations` optional 强校验（唯一键 session+day+actor，**无 2000 条条数上限**、day 为真日历日期，不静默删史），本地/完整 v2/云 save v2/导入/恢复全部往返。解读写入绑定 session+day+actorId+cardsFingerprint+anchor，迟到/换档/分支/指纹不符拒绝且牌面保留；跨页并发靠 repository 乐观锁+only-if-missing；"已持久化"证明用 sid|day|actor|指纹键（非对象身份），解读 commit 克隆后不丢先落盘语义。返工 63 根因修复：`drawThreeCards` 去重有界化（坏随机函数不再同步死循环，archive 测试 `(()=>0)` 挂死已消除）；草稿提取先剥围栏再判 JSON，不保留整 JSON 误当正文。黑猫 Rätselhaft 用户确认原图已复制 `public/assets/divination-cat.png`（contain 不裁脸帽，暗金/酒红主题），生产 `/assets/` 路由实测 200。验证：`npx vitest run` 118 文件 646/646；`npm run test:server` 395/0/4（含 divination-server 6 项）；`npx vue-tsc --noEmit` 0 错误；`npx vite build` 通过；真实 Edge+本地 Vite（生产宿主结构、mock model）`node .integration/divination-verify.mjs` ALL CHECKS PASSED exit 0。真实 provider 未验证（无凭据）；agent-hub 路径不存在未走接力棒；未部署。末轮收尾（同日终审后）：午夜后今天入口（drawDaily/peekDaily/retry）与打开占卜页先 refreshDay 用真实 Asia/Shanghai 日键、原 day 回写与 backfill(day,actor) 不改日，新增 timer 未 tick 真实 click 回归（divination 16 项）；usePersonalTerminal watch 行与 PersonalTerminal.vue titles/back 行尾随空白清零，`git diff --check` 干净；猫图源/仓库 SHA256 一致（8b813758…）；本末轮定向 divination 16+archive 3+king-games-room 18=37/37、server 6/6、vue-tsc 0 错、build 通过，第 64 轮全套 646/646+395/0/4 记录保留未重跑；provider 真实语义仍未验、双 tab 仅 fakeIDB actual repo 覆盖、未部署。随本轮已审文件一并提交（push HEAD:main 仅当远端仍 10d1ab3）。详见 [docs/handoffs/2026-10-26-daily-divination.md](handoffs/2026-10-26-daily-divination.md)。
> **2026-10-26 游戏室扩展交付（已重放到 b70f022 基线并提交推送；commit 见 git log -1）：**基线 main `b70f022`（含朋友的 request error/disconnect 稳定性修复与 tests/request-error.test.mjs，完整保留）。本轮交付：游戏室页 7 项游戏列表（仅国王游戏可用，其余 6 项原生 disabled"暂未开放"）；存档级耐受度 `terminal.tolerances`（含 player，AI 生成 1..10，仅首次参与生成、先持久化再抽签、重试只补缺失、迟到丢弃）；罚酒程序计账 `syncKingDrunk`（refused+penalty 每条 +2，稳定事件 id 存 `room.penaltyEvents` 防复扣，drunkFrom 惰性采纳不回算旧档）；任一参与者 drunk>=tolerance 自动整局结束（原子保存 endedAt/endReason/endTriggers/afterparty pending 后再请求长文，recoverDrunkEnd 守卫不绕过阈值）；afterparty ≥1200 可见字（服务端校验+客户端二次校验+专用 maxTokens 4000/内容上限 24000），失败/取消保留原文与草稿，`retryAfterparty` 受控路径 `commitAfterparty` 绑定 session+room+endedAt+fingerprint+**请求时 terminalAnchor**（同档异步分支切换后迟到成功与失败记账均不落笔）；正常无人醉的手动结束不生成醉后文（本轮范围），pending/failed 提供补写入口；备份 v2 兼容。验证：定向 5 套件 34/34（king-games-room 18/18）；`npm run test:server` 389 通过/0 失败/4 跳过（含朋友 request-error 回归）；`npx vue-tsc --noEmit` 0 错误；`npm run build` 通过；真实 Edge+本地 Vite（生产 #academy-workspace 宿主结构、真实 click+scroll、mock terminalAPI）ALL CHECKS PASSED 且进程 exit 0。真实 model/embedding 未配置未验证；浏览器使用 mock；未部署，未操作服务器。改动前完整备份（不含密钥/真实数据）保留于 `.integration/backup-20261026-preb70/`。详见 [docs/handoffs/2026-10-26-games-room.md](handoffs/2026-10-26-games-room.md)。
> **2026-10-25 二次复审收尾修复（已提交推送；含上述最小返工一并交付）：**基线 main `4d09b74`，本轮只补一项复审必要兼容遗漏，不扩展范围。遗漏与修复：useWorkspace 生成前仅 rebuildTerminalMemoryNotes，只遍历已有 note，不会为旧存档以前被删掉的 pure-private bucket 创建新 #private sibling，升级旧用户首次正文召回会丢旧私聊、直到下一次 terminal commit 才修复。修复：`recall()` 入口（generate 与 scopedRecall 共同路径）检索前调用 `syncTerminalMemoryNotes(session)` 幂等同步 terminal.memories 为 public/#private notes，generate 入口原 rebuild 调用同步升级；同步只改派生 note 文本/向量，不删除真实终端记录，旧 unknown knownBy 原样保留，纯私聊 bucket 不产生公开聚合 note。新增回归：tests/api-workspace.test.ts「旧存档只有private bucket而无note时，首次正文生成前自动补齐#private note并召回带知情标签的canary」（真实 useWorkspace request 捕获）；tests/memory-scope-regression.test.ts M（纯私聊 #private 新 note 完整备份往返一致 + 再同步幂等不清除向量 + unknown knownBy 保留）。命令与证据：`npx vitest run` 定向 4 文件 103/103 通过（api-workspace 80、memory-scope-regression 16、terminal-knownby-filter 1、terminal-ledger 6），相邻 6 个终端/备份套件 33/33 通过；`npx vue-tsc --noEmit` 0 错误；`npm run build` 通过。如实声明：本地工程验收覆盖 mock model/embed，真实 provider 语义未验证（无凭据）；每 10 轮压缩未实现；未部署。
> **2026-10-25 二次复审最小返工（未提交；待 Vesper 复审）：**基线同上条（main 4d09b74 + 未提交工作区），只修两项复审遗漏，未重复全套 605/376。(1) 私聊旧记忆→正文向量路径补全：syncTerminalMemoryNotes 现为每个 bucket 维护两张 note——公共聚合 note 仍排除 private，新增 `terminal:{key}#private` 兄弟 note 承载本 bucket 私聊段（带 knownBy 标签），纯私聊 bucket 不再被清空删除；terminalSegmentCandidates 叙事者（空 audience）改为返回分段候选（公共 note 出群聊/游戏段、#private note 出私聊段，各自 factVectors 独立向量），排名用纯文本、命中后由 labelNarratorFacts 新增的 segmentLabel 回调追加（知情：player、a）标签；不再依赖最近 8 会话/12 消息窗口；scoped 请求仍按 factAudienceCovers 先过滤，A 私聊不会进 B 的请求；indexFactVectors 同步按公共/私聊拆分索引，避免重复向量；earlierPrivateTopic 改按 conversationId 匹配（兼容旧无 conversationId 的 id 直等），修复 #hash 段 ID 失效；branch/rewind 过滤（terminalAnchorActive/terminalNoteVisible）与备份格式不变（note 为普通 memory，走原 roundtrip）。(2) derivedFacts 改逐动作覆盖判断：原来 c.actions.some(covered) 一条被覆盖即丢弃整个人物全部动作，现仅派生未覆盖动作；covered 增加保守护栏 f.text.length>=2，单字事实不再吞掉长动作；约定（commitments）判定不变。测试：tests/memory-scope-regression.test.ts 新增 K（私聊 canary 叙事者向量召回+标签、纯私聊 bucket 独立 note、scoped 隔离、earlierPrivateTopic 按 conversationId）与 L（逐动作派生/单字事实/ A 可召回 B 无）；tests/api-workspace.test.ts 新增真实 useWorkspace 正文 request 捕获测试（canary 私聊远期埋点后加 >12 消息、>9 会话，最近窗口无 canary，request.memories 含 canary 且标 知情：player、guide，A scopedRecall 命中、B 不含）；更新 terminal-ledger（私聊兄弟 note/分支过滤计数）与 terminal-workflow（terminalKey note 计数）既有断言。命令与证据：`npx vitest run tests/terminal-ledger.test.ts tests/memory-scope-regression.test.ts tests/api-workspace.test.ts`（100/100）、相邻 11 个终端/备份套件 57 项通过、`npx vue-tsc --noEmit` 0 错误、`npm run build` 通过；未重复全套 605/376，真实 provider 语义遵循仍未验证（无凭据）。不要 commit/push/deploy。


> **2026-10-25 终端/正文记忆互通与知情范围（未提交；Vesper 首轮验收未通过，已完成四项返工，尚未复审，不得自宣通过）：**基线 main `4d09b74`，工作区含未提交实现，禁止覆盖。已实现：终端/正文记忆双向召回（含旧轮次与旧终端摘要）、按 audience（player+会话成员）先过滤后排名的角色级知情权限（player 仅作 UI 参与者，不作为知情门槛；A 私密事实仍不进含 B 的群请求）、独立事实向量（factVectors，含 fingerprint/模型/维度校验与安全降级）、群聊按成员在场时段分段（X/Y/Z 三段并存，knownBy 快照）、完整备份 v2 经 BackupArchive 采集入口保留 facts/factVectors/群段/knownBy/source/revisions 并兼容 v1、空关键词无任意兜底。Vesper 驳回后返工：(1) sendChat 群聊请求按消息 knownBy 对当前全部受众过滤 conversation.history，旧无快照群消息保守不投递（私聊按唯一参与者确定性投递）；priorTopic 群聊不再回退到无快照旧段；真实群聊入口 HTTP 全量捕获测试 X/Y 不在任意字段、Z 保留（tests/terminal-knownby-filter.test.ts）。(2) scoped 召回 query 改为当前聊天输入而非最近正文，定向命中、单次 query embed。(3) memory.1 提示词改为完整可知事实协议：公共/共见事件也进 facts 并带准确 knownBy；projectScoped 在已有 facts 时仍派生未被覆盖的本人 charAction/开放约定（knownBy 仅本人，不推公共；与事实逐字重复的跳过）；权衡：模型改写措辞时可能出现语义重复候选，属保守取舍。(4) normalizeMemoryResult 知情条目先验类型再映射，非字符串（如 42）/空白明确诊断并降级未知，不再 String() 化错配；同名角色真实双角色状态测试（稳定 ID/唯一姓名/歧义诊断/同义映射去重）。验证：前端 605/605（含 memory-scope-regression 13 项与新增 terminal-knownby-filter）、后端 376 通过/4 跳过、vue-tsc --noEmit 当前树与 HEAD 隔离基线（临时 detached worktree）均为 0 错误（此前“47 项 .vue 既有误报”说法未复现，已撤回）、vite build 通过；真实 Edge+Playwright（mock 模型/向量路由）final-verify.mjs 全部检查通过（断言已按派生协议更新为“事实向量+未覆盖本人行动派生向量”），证据 `.integration/memory-audit/final-evidence.json`。真实 provider 语义遵循未验证（无凭据）。不要 commit/push/deploy。

> **2026-10-25 标签图标生产路由修复：**以 81c44d8 为基线。终端 pending 信号已触发，但根目录 favicon-generating.svg / favicon-unread.svg 被生产路由白名单拒绝，开发服务器测试未覆盖此差异。状态图标改为 public/assets 下的 /assets/favicon-*.svg；无初始 favicon 的真实终端页补上默认图标，已读时显式恢复默认，避免缓存蓝点残留。新增开启账号校验的生产静态路由回归与并发请求计数测试；隔离浏览器实际发送模拟终端请求验证灰色→后台蓝点→切回清除（无初始图标场景）。纯前端资源更新，不改数据格式和提示词，部署使用热更新并验证公网图标 HTTP 200。

> **2026-10-25 完整备份修复：**以 cb4dcc1 为基线，补齐独立人设库、17 个人设字段、备注/备忘录、编辑草稿、主人设与主页图片选择、昵称头像和本地图片设置；本地完整文件 version 2、云端 stellar-cloud-save-v2，继续支持旧 v1。统一下载/上传采集入口，保留全部终端记录；按用户要求排除运行日志、模型原始输出及云端本地图片/密钥。旧文件缺少 archive 时保留本机人设库；导入重绑会话与人设 ID；恢复前保存完整副本、失败回退、跨页面恢复租约和中断标记已接入。前端 590 全通过，后端 375 通过/4 跳过，类型检查及生产构建通过；真实浏览器下载→文件导入→人设库显示→模拟平台上传→拉取覆盖通过。以后新功能必须按 AGENTS.md 的数据备份规则和 [BACKUP_COMPATIBILITY.md](BACKUP_COMPATIBILITY.md) 验证一致性。新旧版本解析由前后端共用，本次部署需更新服务进程。

> **2026-10-25 界面与游戏后续修复：**以 e80bcaa 为基线，按用户最终确认完成标签灰色/蓝点（无页面闪动）、房间重入及已完成轮次继续互动、邀请留言与理由、头像实时预览和串行保存、联系人真实图片 ID、公告折叠、默认关系列表、随机事件暂停和 NPC 候选。不是登录机制改造。详细范围和验证见 [BUGFIX_PLAN.md](BUGFIX_PLAN.md)。前端 582 项通过，后端 373 通过/4 跳过，类型检查与构建通过；独立浏览器交互通过。

> **2026-10-25 终端复核兼容性修复：**`terminalFollowupPlan` 统一继承原请求中的角色状态，为后续检查保留自定义联系人及动态 NPC；国王游戏 `react` 的服务器复核改用该入口，避免角色回复已生成却因复核丢失角色资料而报 `INVALID_TERMINAL_REQUEST`。保留原有 ID 和结果校验，不新增联系人、不改抽签、不绕过复核。新测试覆盖多个自定义角色与内置角色混合参与、邀请/聊天/出令/回应/互动后的角色解析、实际 HTTP 回应到复核及复核拒绝路径。验证：完整后端 373 通过、4 跳过；相关前端 3 通过。后续新增终端二次校验应复用该入口，不手工重建并丢弃原角色状态；线上版本和健康状态以实际部署结果为准。

> **最新交接 2026-10-19：**本轮完成逐轮记忆（旧设置迁移、失败队列隔离、最近 12 轮原文独立保留）及八项界面/状态/小剧场修复。先读 [逐轮记忆交接](PER_ROUND_MEMORY_HANDOFF_20261019.md) 和 [八项修复说明](BUGFIX_HANDOFF_20261019.md)，再看下文历史记录。使用共享 main，公网部署另行执行。

> 2026-10-18 修复补充：NPC 好感度 -100～200、负好感淡红关系线、MVU 整块校验、主副 API 路由及状态结果提示已完成。208 项服务端测试、251 项前端/领域测试、生产构建与 18 项浏览器检查通过。详见 `docs/AFFINITY_RULES.md`、`docs/STATE_UPDATE_RELIABILITY.md`。下文旧提交号为修复前基准，交接时仍须核对远程 main。

更新时间：2026-10-17。先阅读本文，再检查实际文件与远程 main；本文的提交号是交接时的基准，不代表远程以后不会更新。

## 项目位置与版本

- 本机项目目录：`D:\QQ\QQ文件\星穹学院终端`
- 本文位置：`D:\QQ\QQ文件\星穹学院终端\docs\SESSION_HANDOFF.md`
- 仓库：`https://github.com/CYH1104/stellar-resonance`
- 双方共享分支：`main`
- 最近已推送的功能提交：`e23b0a3ba5b38d00bb02dbe17534c364c384ea2e`
- 提交链接：<https://github.com/CYH1104/stellar-resonance/commit/e23b0a3ba5b38d00bb02dbe17534c364c384ea2e>
- 本交接文档是在该功能提交之后新增的本地文件，尚未随该提交上传。
- 服务器目录：`/home/ubuntu/stellar-resonance`
- 公网应用：`http://43.138.251.91:8807/terminal`
- 受保护管理页：`http://43.138.251.91:8807/editor/`
- 8808 是本机私有编辑服务，监听回环地址，不能以公网访问是否成功判断其状态。

## 双方协作约定

以 `docs/SHARED_WORKFLOW.md` 为正式协作说明。用户明确要求双方以共享 main 的最新完整代码继续开发，今后不做反复的旧版本融合，不按特殊版本号或分支时间挑版本。

开始新工作前确认伙伴是否已经更新 main。若更新，先备份当前尚未交付的文件，再按既定流程覆盖到最新代码；不要把本目录旧快照直接上传盖掉伙伴的新改动。正常推送，不强制覆盖远程历史。覆盖更新文件不等于删除历史提交，旧 Git 提交仍可用于回退。

不要自动部署或登录服务器。本轮及此前的交付方式是：本机完成、检查并推送，用户在服务器终端运行更新命令。

## 最近完成的功能

### 随机事件与开场白

最近提交已实现：

- 随机事件由本地脚本按设置概率判定；未命中不发送事件生成指令。
- 命中后自动投骰并继续本轮，不再要求先接受候选。
- 跟随主 API 时随正文一次生成，不单独请求事件候选；明确指定独立事件接口时，先生成事件，再自动衔接正文。
- 上方事件卡片显示当前回复的实际 `diceEvent.description`，缺失有效元数据时退回本轮事件摘要，不显示通用候选占位说明。
- 重试、重演保留已确定的事件类别与骰点；续写和仅补状态不要求重复骰子事件。
- 旧存档的待确认事件可以继续生成；准备失败可以重试或跳过。
- 管理编辑页新增“初始开场白”，停止输入约 650 毫秒后自动保存，也可立即保存。
- 多行和空行保留，服务器无需重启；新建存档读取新开场，已有存档保留旧开场。
- 旧数据没有开场字段时沿用原值，旧客户端保存时也不会清空已有开场。

详见 `docs/EVENTS_AND_OPENING.md`。

### 需要保持的调用规则

用户对额外模型调用非常敏感，不能为补格式、快捷回复或小剧场擅自增加调用。

- 全部跟随主 API 时，一次主调用同时输出正文、启用的小剧场/论坛/群聊、快捷回复和 MVU 状态。
- 明确设置状态副 API 时，主 API 负责正文及侧内容，状态副 API 单独判断 MVU 变化；状态格式规则按实际路由发送。
- 正常前端请求使用 `singleStateCall:true`，不能失败后自动循环付费修复；保留正文与有效字段，支持用户手动补全。
- 向量记忆使用独立 embedding 调用。
- 整理记忆只在累计轮数达到阈值时批量调用，不是每轮都整理；原始轮次先持久化。
- 关闭状态栏、随机事件或某个小剧场时，省略对应功能提示词和专属内容，不额外拼一条“该功能关闭”的规则。
- 不改变正常剧情历史、记忆检索、记忆整理的既有机制。

### 界面与存档约束

- 保持学院当前米白/深色、衬线文字、细边框风格。
- 状态、在场角色等是可折叠卡片，内部滚动；栏宽调整挤压相邻区域，不让内容框任意拖动乱飞。
- 群聊小手机仅存在于剧情对话页，可以拖动；收起为透明背景 SVG 图标，展开/收起保持位置。
- 输入框空白默认一行，输入多行自适应高度。
- 消息三个点菜单点击外部或 Esc 关闭；多稿切换用箭头，不恢复“第一稿/第二稿”菜单。
- 快捷回复点击填入输入框，可叠加选择，不直接调用模型。
- 首页对话入口进入当前存档；刷新仍有开屏动画。
- 浏览器存档保留完整数据；只渲染最近十楼/论坛分页是隐藏与减少渲染，绝不是删除旧记录。
- 角色卡片、地图和地点仅展示，不充当 AI 世界书；隐藏世界书才提供相应设定。

## 提示词与推理内容的边界

- 内部默认提示词已改为精简英文，包含状态格式示例，要求沉浸式中文角色扮演；不翻译用户世界书或预设原文。
- 已支持一批 SillyTavern 宏、预设消息排序与注入位置；并非完整酒馆插件运行时。范围见 `docs/INTERNAL_MACROS.md`、`docs/PRESET_COMPATIBILITY.md`。
- 管理编辑页可以编辑内部规则并查看组装顺序、程序占位符。用户自己控制的预设/世界书不在该页代改。
- 作者曾经保存的自定义内部规则不会因代码默认值更新而自动覆盖；需要时在编辑页逐项恢复默认。
- 开发者诊断展示实际启用/过滤的预设、宏展开、消息顺序、采样参数、输出检查，帮助判断预设有没有发出，不代表模型一定遵守。
- 开发者邮箱白名单：`1683264627@qq.com`、`2889463835@qq.com`、`237474810@qq.com`；权限由服务端登录身份判定，不能只靠前端隐藏。
- 模型接口显式返回的推理字段、思考标签、隐藏注释由过滤器隐藏。不能保证或声称接口没有返回的内部思考必然存在，不额外请求模型生成私有思维链。
- 角色 `innerThought`、精神体 `spiritThought` 是剧情状态，不应被当作模型推理一起删除。
- 不把服务密钥、私有世界书、账号数据库或推理原文放入普通用户响应、开发者面板、公开文件或交接文档。

## 代码入口

| 文件 | 作用 |
| --- | --- |
| `src/app/useWorkspace.ts` | 会话生成、路由、随机事件、持久化与记忆调度 |
| `src/components/StoryView.vue` | 正文、事件卡片、输入框和消息操作 |
| `src/components/ApiSettings.vue` | 主副接口及功能配置 |
| `src/domain/randomEvents.ts`、`dice.ts` | 本地概率、事件状态和骰点校验 |
| `server/app.mjs` | HTTP/SSE、身份权限、实时编辑数据、生成与新存档接口 |
| `server/ai.mjs`、`story-stream.mjs` | 提示词组装、模型流、格式解析与兼容处理 |
| `server/state-protocol.mjs`、`internal-prompt-defaults.mjs` | 输出协议、状态示例与默认内部规则 |
| `server/editor-store.mjs` | 编辑数据验证、迁移、版本冲突和原子保存 |
| `server/editor-ui/editor.js`、`editor.html` | 编辑页与自动保存，包括开场白 |
| `server/tavern-macro-engine.mjs`、`presets.mjs` | 酒馆宏与预设组装 |
| `server/preset-diagnostics.mjs`、`developer-mode.mjs` | 服务端授权诊断 |
| `src/domain/reasoning.ts` | 显式推理标签过滤及模型数据清理 |
| `scripts/update-server.sh`、`restart-server.sh` | 服务器覆盖更新、备份、构建、重启与健康检查 |

服务器编辑数据在 `server/private/editor-data.json`，保留上一份 `editor-data.previous.json`。这些是私有运行数据，不提交仓库。管理页 `EDITOR_ACCESS_REQUIRED` 表示管理身份失效或缺失，不能通过取消鉴权来修复。

## 本机环境与验证

Shell 为 PowerShell。本会话可用 Node 路径：`C:\Users\cold paper\.node\node.exe`。项目要求 Node >= 24.12.0；服务器曾因 Node 22 更新失败，现已安装 Node 24。

本轮通过：TypeScript、245 项 Vitest、203 项 Node 测试、构建、15 项既有浏览器检查，以及包含事件卡片与开场自动保存的 19 项浏览器检查。测试只使用本地模拟接口，不依赖付费模型调用。

标准命令：

```powershell
pnpm check
pnpm test
pnpm test:server
pnpm build
```

如果 pnpm 不在 PATH，可使用上述 Node 执行 `node_modules/vue-tsc/bin/vue-tsc.js --noEmit`、`node_modules/vitest/vitest.mjs run`、`--test tests/*.test.mjs` 等。Windows 沙箱可能对 realpath、本地端口或浏览器测试报 EPERM；先确认环境权限，不直接认定为业务失败。

`.integration` 是本地临时验证目录，不上传。现有辅助文件：

- `validate-state-routing.mjs`：类型检查、完整测试、同步终端、构建、既有浏览器检查。
- `events-opening-browser.mjs`：实际事件卡片、编辑开场自动保存/刷新/实时读取检查。
- `events-final.log`、`events-browser.log`：最近验证记录。
- 浏览器脚本依赖本地 Edge CDP 9224 与隔离测试资料；新会话先检查是否仍存在，不直接假定可用。

## 当前本机的推送方式

本目录在此前会话中没有可用 `.git` 工作树或 Git 可执行程序，采用 `.integration/publish-current.mjs` 经 GitHub REST 正常推进 main。新会话先检查环境，不盲目运行旧发布脚本。

脚本的 `expected` 和 `expectedTarget` 是上次发布前的基准，发布成功后不会自动更新；重用前必须查询远程 main，并核对本地与最新远程的差异。发布流程先生成 `publish-reviewed.json` 审查清单，再使用 `--publish`；脚本拒绝远程移动和强制推送，不能绕过这些检查。最近上传结果在 `.integration/push-result.json`。

脚本通过项目目录外的本地凭据文件读取令牌；不要打印、复制或提交凭据，不把凭据写入命令、文档或聊天记录。不要把 `.integration`、`dist`、`node_modules`、`server/private`、`server/.local`、`server.config.json` 等运行文件批量上传。

## 用户在服务器运行的更新命令

当前终端已使用 Node 24 时：

```bash
cd /home/ubuntu/stellar-resonance &&
bash scripts/update-server.sh http://43.138.251.91:8807
```

新终端若需要加载现有 nvm：

```bash
export NVM_DIR="$HOME/.nvm" &&
. "$NVM_DIR/nvm.sh" &&
nvm use 24 &&
cd /home/ubuntu/stellar-resonance &&
bash scripts/update-server.sh http://43.138.251.91:8807
```

更新脚本会备份、取 main、覆盖、安装、构建、重启、检查服务。GitHub 曾出现 TLS 中断和连接超时；项目 Git 配置使用 HTTP/1.1、单并发，不关闭 TLS 证书校验。详细网络和恢复步骤见 `docs/SHARED_WORKFLOW.md`。

## 新会话接手顺序

1. 阅读本文和 `docs/SHARED_WORKFLOW.md`，核对本地改动、远程 main 与伙伴新提交。
2. 当前可靠性修复和测试已完成。以远程 main 的实际提交为准；先阅读新增的 STATE_UPDATE_RELIABILITY.md，不重新实施全部历史需求。
3. 如果遇到状态或小剧场缺失，先检查原始返回、功能开关、预设诊断和调用路由，保留正文与有效数据，不加无限修复调用。
4. 修改后运行与变更有关的检查，审查上传清单，正常推送 main，再给用户服务器更新命令。

可复制给新会话：

> 请接手 `D:\QQ\QQ文件\星穹学院终端`，先读取 `docs\SESSION_HANDOFF.md` 和 `docs\SHARED_WORKFLOW.md`。最近已推送功能提交为 `e23b0a3ba5b38d00bb02dbe17534c364c384ea2e`，后续先核对远程 main。沿用当前学院风格、单次主 API 调用规则、浏览器存档和服务器覆盖更新流程，不擅自融合旧版本或删除隐藏楼层。然后按照我的新需求继续工作。
