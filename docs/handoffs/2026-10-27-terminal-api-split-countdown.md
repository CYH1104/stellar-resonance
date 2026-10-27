# 9000 终端独立 API 拆分与牌面定时刷新 · 交付

日期：2026-10-27
执行者：Codeg（DeepSeek-V4.1-Flash，High）
状态：**本地实施、测试、类型检查、构建完成；未提交、未推送、未部署**，交 Codex 独立验收。

> 第二轮返工（Codex 首轮验收不通过）见 [2026-10-27-terminal-rework.md](2026-10-27-terminal-rework.md)。
> 本文件保留首轮交付原貌；其中「终端先不产生社交动作」及相关「未完成」项**已被返工取代**，以返工文件为准。

## 1. 基线保护

上一轮桌面 WB 的性能修改先复制到 `.integration/WB_TERMINAL_20261027_BASELINE/`：

- `src/components/PersonalTerminal.vue`
- `src/domain/terminalLedger.ts`
- `tests/terminal-anchor-cache.test.ts`
- `docs/handoffs/2026-10-27-perf-anchor-cache.md`

缓存算法与既有优化全部保留。`terminalAnchor` / `terminalAnchorActive` 的哈希实现一字未改，旧锚点逐位兼容；`tests/terminal-anchor-cache.test.ts` 通过。

## 2. 修改文件

新增：

- `src/domain/terminalAuto.ts`：终端独立阶段（计划、请求边界、写回、去重、失败状态）
- `src/domain/countdown.ts`：绝对截止时间倒计时驱动（可见才跑、到 0 只校准一次）
- `src/components/DivinationCountdown.vue`：占卜页局部倒计时
- `tests/terminal-split.test.ts`（6 项）
- `tests/divination-countdown.test.ts`（4 项）
- `tests/terminal-auto-server.test.mjs`（4 项）

修改：

- `src/domain/apis.ts`：`taskApi('terminal')` 不再回退主 API；新增 `terminalApiIssues`；终端不进入必需的正文配置；迁移时明确保留/丢弃终端引用
- `src/domain/contracts.ts`：`Preferences.terminalEnabled/terminalOrder`，`GenerateRequest.terminalFacts`
- `src/domain/story.ts`：默认值、`cleanPreferences` 白名单（两个新字段）
- `src/app/useWorkspace.ts`：三层状态、顶栏开关、两种顺序、独立请求、迟到保护、手工重试
- `src/app/usePersonalTerminal.ts`：单个日界线 timeout 取代 30 秒轮询；导出刷新时刻
- `src/components/WorkspaceNavigation.vue`：顶栏「手机终端 · 已开启/已关闭」
- `src/components/PersonalTerminal.vue`：通讯顺序开关；未完成阶段列表改读 `auto` 任务；占卜页去日期字样
- `src/components/FloatingGroupChat.vue`：把「窗口是否展开」传给终端，供倒计时判断可见
- `server/terminal-main.mjs`：改为独立任务提示词 `terminalAutoPrompt`（无正文协议）
- `server/personal-terminal.mjs`：新增 `main-auto` 任务与校验/解析
- `server/ai.mjs`：正文提示词不再注入任何终端协议；接收并注入 `terminalFacts`
- `server/app.mjs`：`/api/generate` 一律丢弃 `terminalContext`；不再把终端上下文传给流
- 测试更新：`channel-terminal-gate`、`api-workspace`、`apis`、`channel-stable-memory`、`terminal-ui-recovery`、`king-blind-targets`、`king-custom-flow`、`king-end-game`、`terminal-main.test.mjs`、`divination.test.ts`；`terminal-anchor-cache` 仅补一个缺失的 `at` 字段（原本就无法通过 `vue-tsc`）

## 3. 已完成行为

### 3.1 顶栏启停与配置门槛

- 服务端能力、用户开关、终端配置三个状态分开：`terminalCapability` / `preferences.terminalEnabled` / `terminalConfigured`。
- 顶栏按钮只在有手机功能面的实例出现（8807 无按钮）；按下后需要明确选择终端 API，并成功确认该接口才会开启。
- 没有终端 API 时开启会被拒绝并跳到设置页；正文不受影响。
- 停用只关手机：手机卸载、终端请求停止、历史记录与记忆完整保留；正文继续生成。
- 浮窗右上角 × 仍是**最小化**（`open=false`，组件保留），与顶栏停用是两件事。
- 停用不会误杀正在独立生成的正文；`stop()` 同时终止正文与终端请求。

### 3.2 正文与手机彻底分开

- 正文请求不再携带 `terminalContext`，服务端 `/api/generate` 即使收到旧字段也直接丢弃，正文提示词无任何终端输出协议。
- 终端使用 `POST /api/personal-terminal` 的 `task:'main-auto'`，自己的档案、Key、AbortController、日志与错误提示。
- 缺少终端配置时不会用主 API 顶替：`taskApi('terminal')` 只返回用户明确选择的档案。
- 好友申请仍走原有副 API 规则（未改动）。

### 3.3 终端内顺序

- 账户页新增「通讯顺序：正文 → 终端 / 终端 → 正文」，默认正文先。
- 正文先：正文落盘后，以本轮已确认正文为界生成一次终端通讯；终端失败不回滚正文。
- 终端先：只用已确认历史 + 本轮输入生成通讯，落盘后正文请求带 `terminalFacts`（已确认事实，明确标注为数据）。
- 每轮只产生一次自动通讯：任务 ID 含轮次与变体/锚点，已完成的阶段不会再生成；失败阶段可手工重试，重试复用同一任务与槽位，不重复落库。
- 旧的 `outcome.terminal` / `main-followup` 记录不被重放、不被清空；旧合并路径在服务端已被隔离（新客户端从不请求，旧页面即使发送也只会被丢弃）。

### 3.4 停止、停用、切档、换接口、迟到响应

- 写回前复核：功能仍开启、存档未切换、轮次与变体未变、分支锚点有效、终端接口签名未变。
- 任一不满足即丢弃结果，并保留可重试的失败任务（「终端请求已停止/终端部分未完成」）。
- 用户手工停止或停用会 abort 终端请求；中止不写入任何消息。

### 3.5 备份兼容

- 新增的 `terminalEnabled` / `terminalOrder` 随 `snapshot.preferences` 整体往返（本地下载、云端、导入、覆盖、覆盖前恢复副本都基于同一份 `preferences`，无需新增采集入口）。
- 旧档没有这两个字段：`terminalEnabled=false`、`terminalOrder='story-first'`；旧档若历史上已选择终端接口，迁移按原选择判断（仍需接口完整且已确认才会真正开启）。
- 终端消息、任务（含新的 `auto` 任务）原样往返，不截断、不清空。
- API/仓库密钥、运行日志仍不进入备份；云端仍排除本地图片。

### 3.6 牌面：单次定时刷新与局部倒计时

- 删除每 30 秒日期轮询，改为**一个** `setTimeout` 对准下一个既有日界线（Asia/Shanghai，固定 +08:00，不使用设备本地 `setHours`），触发后更新日键并重新安排。
- 挂载、聚焦、可见性恢复、进入占卜页、抽牌/偷看/重试前都会重新校准。
- 倒计时只显示「距离刷新 HH:mm:ss」，由绝对截止时间推导，等宽数字；只在占卜页且终端窗口展开、页面可见时运行，隐藏即停，回到可见立即重算。
- 到 0 只触发一次校准，不循环、不重算终端/剧情、不写存档、不调用模型。
- 换日不自动抽牌、不调用 API；锁牌、重试、历史、跨日迟到写回原日期全部保留。
- 界面无「北京时间／现实时间／时区／零点」等字样（`src/`、`dist/` 全库检索 0 命中；仅 `server/.local/releases` 的旧发布快照与本次基线备份副本仍保留旧文案）；占卜页不再显示日期。

## 4. 验证命令与结果

```
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
  → 0 错

node node_modules/vitest/vitest.mjs run
  → 134 files / 753 tests passed

node --test tests/*.test.mjs
  → 438 tests：434 pass，4 skipped，0 fail
  → 上一轮记录过的 Windows junction EPERM/EEXIST 用例
    （instance-worldbook-seed「a symlinked entry never pulls files from outside…」）
    本次复跑为 pass，未再复现；本轮未改 server 种子与 worldbook 逻辑。

npm run build
  → vue-tsc 通过，vite build 成功（dist 产出正常）

node --test tests/terminal-auto-server.test.mjs
  → 4 pass（独立请求契约、terminal-first 拒绝未证实社交动作、terminal-first 空正文、8807 仍 403）
```

新增/关键覆盖：

- `tests/terminal-split.test.ts`
  - 正文先：正文请求无 `terminalContext`；终端恰好一次、独立档案 `aux`/独立 Key、`mode='story-first'`、带已确认正文；8 条消息只落一次；重试不再请求、不再落库；正文声明「已发送好友申请」时以结构化动作落为 pending。
  - 终端先：顺序为终端→正文，`story=''`、`allowSocial=false`，正文请求带 `terminalFacts`。
  - 停用后正文正常、终端请求为 0、无新记录。
  - 响应在途时切换存档：迟到结果被丢弃，任务保持未完成。
  - 设置与终端任务/消息的备份往返；旧档缺字段的兼容默认。
- `tests/divination-countdown.test.ts` + `tests/divination.test.ts`
  - 截止时间落在下一个 +08:00 日界线；文本恒非负。
  - 挂载后只有 1 个定时器；推进 30 秒日键不变（无轮询），到 60 秒才换日且仍只有 1 个定时器。
  - 倒计时隐藏时 0 个定时器、无过期触发；可见时到 0 只校准一次；卸载后定时器为 0。
- 既有性能回归 `tests/terminal-anchor-cache.test.ts` 通过（旧锚点逐位一致）。

## 5. 已知风险与刻意取舍

1. **终端先顺序不产生社交动作。**（**已被第二轮返工取代**：正文确认后会跑一次只出动作的社交核验，见返工文件必修 6 之前的「补齐 A」。）没有已确认正文可核对，`friendRequests`/`groupActions` 一律禁止，避免凭空造出好友申请或群邀请。若后续正文里人物声称「已发送好友申请」，本轮不会自动补动作，也不会伪造成功。
2. **旧档迁移的开启判定。** 历史上默认 `terminalProfile='main'` 的存档，迁移后 `terminalEnabled=true`，但仍要求该接口完整且已确认才真正开启；从未配置过的存档不会得到手机。新存档默认关闭。
3. **暂停手机后正文仍会带上手机历史。** 终端记忆召回/索引跟随「通道能力」而不是用户开关：暂停只是停止请求与入口，已发生的通讯仍是剧情事实，不应失忆；8807 稳定版依旧完全隔离。
4. **服务端仍接受旧页面的 `terminal` 字段（解码层）。** 这是给升级前缓存 bundle 的容错；新客户端从不请求、正文提示词也已删除该协议，因此在产品行为上旧合并路径不再生成任何通讯。
5. **`terminalFollowup.ts` 保留。** 仅用于旧存档 `main-followup` 任务的展示与既有测试，不再参与新生成。
6. **未做真实浏览器双端手点回归。** 本轮按约束未重启/改线上，也没有可用实例做 8807/9000 的实机点击；两端门控由 `tests/channel-terminal-gate.test.ts`、`tests/channel-gate.test.mjs`、`tests/terminal-auto-server.test.mjs` 覆盖（8807 无入口、403、正文无终端协议；9000 有入口但需显式配置）。
7. **未调用付费模型、未读取真实存档或密钥**；所有验证均为 mock。

## 6. 未完成

- 未提交、未推送、未部署、未发频道。
- 未改 `FloatingGroupChat` 常驻挂载（上一轮已说明的临时 UI 状态取舍）。
- 未处理「终端先后顺序」下的社交声明补修（见风险 1）（**第二轮已补**：见返工文件的社交核验阶段）；如验收认为必须，需要再设计一个「正文后仅补社交动作」的独立阶段。
