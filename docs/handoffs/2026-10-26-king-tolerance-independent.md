# 修复：国王游戏「抽签被酒量耐受度请求卡住」

日期：2026-10-26　基线：`15802db`（远程 main）　状态：本地已验证，未提交/未推送/未部署

## 问题（#12）

抽签开始游戏时，代码先发一次「酒量耐受度」模型请求，再抽签。该请求失败（模型没按 JSON 契约返回，例如返回散文或 `{date,reading[]}` 之类结构）时，`startRound` 直接抛错中止：

- 玩家点「抽签开始游戏」→ 报错 → **本轮抽签根本没发生，进不了游戏**
- 与"游戏开始回复"的调用分开成两次，且第一次的失败会连带整个开局失败

## 根因

`src/app/usePersonalTerminal.ts` 旧 `startRound`：

```
const missing = missingTolerances(...)
if (missing.length) { const r = await request('tolerance', ...) ; await commit(...校验 1..10，不合法就 throw...) }
await commit(... drawKingRound ...)   // 抽签在耐受度之后
```

即：**耐受度请求是抽签的前置条件**，且校验失败会抛错。测试 `rejects invalid tolerance results without saving or drawing` 曾把这个行为固化。

## 修改

`src/app/usePersonalTerminal.ts`

1. 新增 `fillTolerances(id)`：单独负责补取耐久度。只有通过校验（`1..10` 整数、且属于本次缺失名单）的条目才落库；无有效条目只记日志，不抛错。
2. `startRound` 改为**先本地抽签落库**（`drawKingRound` + `commit` + `go('king')`），再调用 `fillTolerances`。抽签不依赖任何模型调用，耐受度失败只写活动日志「酒量耐受度未获取（不影响本局）」，不阻塞本局。
3. 增加 `toleranceLoading` 单飞标记，避免同一房间并发补取。
4. 撤掉过试做的"进房间预取"方案：它会破坏既有保证「打开/重开房间不产生任何请求」（`terminal-ui-recovery.test.ts` 有对应断言）。

`tests/king-games-room.test.ts`

- 原 `rejects invalid tolerance results without saving or drawing` → 改为 `draws the round even when the tolerance answer is malformed, and fills it later without blocking`：非法耐受度不再阻止抽签，值不落库；打完一轮后下一轮自动补取成功。
- `a mid-request archive switch drops late tolerance replies` → 改为迟到的耐受度回复仍然不写入，但**已抽出的轮次保留**（抽签是本地操作，不再因模型迟到而丢失）。

## 验证（实跑）

```
vue-tsc --noEmit                     0 错误
vitest run（全量前端）                123 文件 672 项全部通过
node --test tests/*.test.mjs（后端）  401 项：397 通过 / 0 失败 / 4 跳过
sync-terminal + vite build            通过
```

定向：`king-games-room.test.ts` 23/23、`king-custom-flow.test.ts` 1/1。

## 行为变化与遗留问题

- 行为变化：耐受度未知时本局仍可进行，醉酒条的耐受度显示 `?`；`kingOverLimit` 对未知耐受度跳过，因此**该局不会因醉酒提前结束**，下一轮补取成功后恢复。
- 未改：`tolerance` 提示词、服务端校验、备份结构、数据结构（`tolerances` 仍是存档级 `Record<id, 1..10>`，向后兼容）。
- 待决策（交 Codex）：如果希望「抽签时刻完全不发这次请求」，需要另定具体时机（例如建房/邀请成功时预取），但那会与「进入房间不发请求」的既有保证冲突，需要权衡；本次先保证不阻塞开局。

## 未实测

- 真实付费模型下 `tolerance` 的实际返回质量（本轮测试 key 已失效，全部为本地 stub 上游）。
- 浏览器点击级 UI 回归、手机真机。
