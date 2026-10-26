# 双通道审查返工：R1–R6 修复（2026-10-26）

范围：只修 `.integration/CODEX_DUAL_PORT_REVIEW.md` 的 R1–R6。已验收的 NPC 占卜范围修复、#12 国王耐受度改动、全部存档/备份字段均未回滚。**未提交、未推送、未部署、未重启线上**；线上仍是 `15802db`。

## R1 [P1] 两个通道没有独立发布快照

- 新增 `server/release.mjs`：把请求期真正读取的运行时资产（`dist/`、`星穹游戏终端 (1).html`、`server/auth-ui/`、`server/editor-ui/`、`server/example/`）按内容哈希复制成不可变快照 `server/.local/releases/<instance>/<buildId>/`，并原子写 `current.json` 指针；同内容复用同一 `buildId`，保留最近 3 份。
- `server/index.mjs`：启动即 `createReleaseSnapshot`，把 `releaseDir` 传给 `createLocalServer`；编辑器服务也从同一快照根读取 `server/editor-ui` 与 `server/example` 回退数据。
- `server/app.mjs`：所有请求期读取（`dist`、auth-ui、终端页）改为从 `runtimeRoot`（= releaseDir）取；`/api/health` 增 `port` 与 `release`（buildId）。
- `scripts/update-server.sh`：新增全局代码树锁 `server/.local/update-tree.lock`（`reset/install/build/快照`期间持有，最多等 30 分钟），快照生成后立刻释放；新增 `scripts/release-snapshot.mjs`；部署健康检查改为同时校验 `channel`、`instanceName` 和 `release` 非空；工作树备份排除 `server/.local/releases`。
- 效果：更新测试实例只改自己的快照目录，稳定实例的页面与资源哈希、进程身份不变。

## R2 [P1] 耐受度仍把整个操作锁到请求结束

- `src/app/usePersonalTerminal.ts`：耐受度补取改成独立任务——自己的 `AbortController`、自己的 `toleranceTask` 单飞键、自己的守卫 `{sid, roomId, anchor}` 与 API 签名；**不再**走 `run()`，因此不再设置 `working`/`terminalBusy`，也不共享 `operationSession`/`operationAnchor`/`controller`。
- 新增 `commitTolerances`：只在同一存档、同一分支、房间仍存在时写入，且只补缺失项（已知值永不重掷）；写入与 `commit` 共用新的 `exclusiveWrite` 串行写队列，克隆-修改-保存整体互斥，迟到的耐受度落盘不会覆盖同时进行的抽签/出令/结束存档。
- `startRound` 抽签落盘并切页后 `void` 触发补取；出令按钮与 `command()` 立刻可用。

## R3 [P2] 两个端口的管理登录互相覆盖

- `server/editor-gateway.mjs`：`academy_editor` 改由参数 `editorCookie` 决定，登录、鉴权、注销三处统一使用；稳定版沿用 `academy_editor`，其他实例为 `academy_editor_<instance>`。
- 名称从 `instanceDescriptor()` 派生（见 R5），`server/app.mjs` 不再自己拼 Cookie 名。

## R4 [P2] 缺少运行记录时无法接管已启动服务

- `scripts/launch-local.mjs`：不再使用 `running.port||previous.port`；探测端口单独保存为 `probed`，`previous` 缺失或损坏时用本次实际探测的端口回退；复用条件改为 `projectId + channel + instanceName + version` 全部匹配（`/api/health` 现在也直接返回 `port`）。

## R5 [P2] 通道/实例配置冲突允许写正式数据目录

- `server/channel.mjs`：保留名 `stable`/`test` 不能跨通道（`{channel:'test',explicit:'stable'}` 与反向都抛 `INVALID_TERMINAL_INSTANCE`）；新增 `instanceDescriptor()` 统一派生 `channel`、`instanceName`、`terminal`、`cookieSuffix`、`editorCookie`。
- `server/app.mjs`、`server/index.mjs`、`scripts/launch-local.mjs`、`scripts/stop-local.mjs`、`scripts/release-snapshot.mjs` 都从同一描述/校验取身份；`index.mjs` 在 `mkdir`、复制资料、打开数据库之前就拒绝冲突配置，`stop-local` 额外校验 `instanceName`。

## R6 [P2] 稳定版仍可对旧手机记忆发起模型索引

- `src/app/useWorkspace.ts`：`reindexTerminalNotes` 在 `!terminalEnabled` 时直接返回；`factCandidates` 跳过手机笔记派生的事实候选；`recall` 的候选列表在稳定版排除手机笔记；对外 `scopedRecall` 在稳定版返回空数组。旧记录与旧向量原样保留（不删除、不清空）。

## 新增/改写的回归测试

| 测试 | 覆盖 | 结果 |
|---|---|---|
| `tests/channel-instance.test.mjs`（新，5 项） | ①稳定实例在共享 `dist` 被重构建后，页面哈希/资源哈希/`pid`/`instance`/`release` 全部不变，同时测试实例拿到新内容；②同内容复用同一快照、快照内含终端页与 auth-ui；③两端口管理登录 Cookie 名不同、互不覆盖、退出测试管理页不影响稳定登录；④保留名跨通道被拒 + 生产入口在建目录前退出；⑤无 `runtime.json` 与损坏 `runtime.json` 都能接管已运行实例（不再抛 `reading 'port'`） | 5/5 通过 |
| `tests/king-games-room.test.ts` 新增 1 项 | 耐受度请求挂起时：抽签已落盘、`working` 与 `terminalBusy` 均为 false、SSR 里“发布命令/请国王出令”按钮未禁用、`command()` 真的发出请求；迟到响应仍写入同一房间且不改变轮次 | 24/24 通过 |
| `tests/channel-stable-memory.test.ts`（新，2 项） | 稳定版：旧手机私聊 + 失效向量，`indexTerminalNotes` 不发出任何含手机文本的 embedding，旧记录原样保留，`scopedRecall` 返回空；测试版对照：同一存档确实发出手机文本，证明门控按通道生效 | 2/2 通过 |
| `tests/channel-terminal-gate.test.ts` 新增 1 项 | 稳定版完成一次普通生成后，后台普通记忆仍建立索引，但手机文本从未进入 embedding | 4/4 通过 |

## 实测（本地，非线上）

- `vue-tsc --noEmit` 0 错误；`vite build` 成功。
- 前端 vitest：125 文件 / 679 项全通过。
- 后端 `node --test tests/*.test.mjs`：412 项，408 通过 / 0 失败 / 4 跳过（跳过项与基线一致）。
- 真实入口端到端（`scripts/launch-stable.mjs` + `scripts/launch-test.mjs`）：
  - 稳定 8807 `pid=36120, release=9b3674646b0c06ff`，页面哈希 `174446b6dece5a77`、资源哈希 `d2d0d50fb6450dee`；
  - 给共享 `dist` 加探针文件 → `release-snapshot.mjs --instance test` 生成新快照 `76b80a407509ddcf` → 只重启测试实例；
  - 重查：测试实例能取到 `__r1probe.js`，稳定实例页面哈希、资源哈希、`pid` 三项完全不变。

## 仍未实测（如实列出）

- 真实公网双实例部署（需要新建 `stellar-resonance-test.service` 并设 `TERMINAL_CHANNEL=test`，本轮未做）。
- 真实手机访问双端口、浏览器点击级 UI（本轮 UI 断言为 SSR 渲染层）。
- 备份导出/导入往返（本轮未改存档结构）。
- 真实计费模型（本轮未调用任何真实模型）。
