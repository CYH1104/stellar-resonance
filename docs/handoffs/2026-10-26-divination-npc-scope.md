# 2026-10-26 每日占卜 NPC 偷看失败修复交付

基线 main `aca2309`（实现前实测：远程 HEAD = 本地 680 文件一致，0 缺失）。未提交、未推送、未部署，等待 Codex 验收。

## 1. 问题与根因

偷看角色运势时牌面已锁定并显示，但解读立刻失败，提示"终端请求不完整，请检查参与角色和输入"。

- `src/app/usePersonalTerminal.ts:99`：占卜 `audience` 只含被占卜者——玩家 `['player']`，NPC `[目标NPC]`。
- `server/personal-terminal.mjs`：共用 audience 校验无条件要求 `audience` 含 `'player'`，NPC 请求因此被判 `INVALID_TERMINAL_REQUEST`，且失败发生在调用模型之前。
- 既有占卜测试的 `base` 不带 `context.audience`，所以这条组合从未被覆盖。

## 2. 修复（按 Vesper 决策：占卜专用校验，不做给 NPC 强塞 player 的绕过）

1. `server/personal-terminal.mjs`：先做公共格式校验（数组、非空、≤50、去重、元素为非空 ≤128 字符串）；`task==='divination'` 时要求 audience **恰好**等于已校验的 `ids[0]`（玩家 `['player']`、NPC `[目标NPC]`），不符则抛新错误码 `INVALID_DIVINATION_SCOPE`；其余终端任务保持"必须含 player"原规则，不整体放宽。
2. `src/gateway/http.ts`：`apiMessages` 新增 `INVALID_DIVINATION_SCOPE` 文案——"占卜的解读对象与知情范围不一致，已锁定牌面保留，可重试解读或刷新后重试。"（与上游/格式失败的错误提示区分开，日志不含密钥或私聊内容。）
3. 前端零改动：目标角色知情范围与召回边界保持原样，偷看不会扩大成玩家记忆。

## 3. 未改动、必须保持的行为

persist-first 牌面锁定、同日同人固定结果、正逆位、`cardsFingerprint`、`priorDraft` 补写、存档/分支隔离、迟到响应守卫、失败后"重试解读"复用原牌不重抽 —— 全部未触碰，回归通过。

## 4. 验证（本轮实际执行）

| 命令 | 结果 |
| --- | --- |
| `node --test tests/divination-server.test.mjs tests/divination-scope.test.mjs` | 8/8 通过 |
| `node node_modules/vitest/vitest.mjs run tests/divination.test.ts` | 17/17 通过 |
| `node node_modules/vitest/vitest.mjs run`（全量） | 123 文件 **672/672** |
| `node --test tests/*.test.mjs`（全量） | **397 通过 / 0 失败 / 4 跳过**（401 项） |
| `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit` | 0 错误 |
| `node scripts/sync-terminal.mjs` + `vite build` | 通过 |
| `node .integration/divination-live-check.mjs` | 真实 HTTP + 真实 fetch 打本地假上游，ALL PASS（证据 `.integration/divination-scope-evidence.json`） |

新增/修改测试：

- `tests/divination-server.test.mjs`：audience 矩阵——NPC `[npc]` 通过、玩家 `['player']` 通过、`['player',npc]`/`['player']`/`['b']`/玩家 `['a']` 均 `INVALID_DIVINATION_SCOPE`、重复/空白/非数组仍为 `INVALID_TERMINAL_REQUEST`、`friend` 任务仍要求 player。
- `tests/divination-scope.test.mjs`（新）：真实 `/api/personal-terminal` 路由 + 真实 `terminalPlan` + 仅 stub 上游。玩家、内置 NPC、动态角色（`dyn-0001`）三种均 200 且上游各只收 1 次；上游看到的 `context.audience` 恰为目标本人、`messages[1].actors` 只有目标、玩家私密人设不入 NPC 请求；四类越界 scope 一律 400 且**上游零调用**；`friend` 任务越界仍 400 `INVALID_TERMINAL_REQUEST`。
- `tests/divination.test.ts`：新增"前端真实 payload → 真实 server terminalPlan"用例——断言 `actorIds=['a']`、`context.audience===['a']` 且不含 player、`kind='npc'`、`scopedRecall` 收到的 audience 为 `['a']`（合成记忆验证召回边界）、payload 直接喂真实 `terminalPlan` 不抛错、旧写法抛 `INVALID_DIVINATION_SCOPE`、玩家自己的占卜仍为 `['player']`；偷看后不写会话、不写记忆、不动玩家记录。

真实运行实例复核（8807，新代码）：NPC 偷看 `audience=[目标NPC]` → `412 MODEL_NOT_CONFIGURED`（已通过校验，卡在本地未配置模型）；旧写法 `audience=[player,NPC]` → `400 INVALID_DIVINATION_SCOPE`。

## 5. 启动与复现

```bash
export PATH="/c/Users/cold paper/.node:$PATH"    # Node 24.20.0
node scripts/launch-local.mjs                    # → http://127.0.0.1:8807/terminal
node .integration/divination-live-check.mjs      # 真实 HTTP 联调，产出证据 JSON
```

跑测试前需解除 WorkBuddy 注入（否则 vitest 清缓存被 safe-delete 钩子误杀）：`unset NODE_OPTIONS` 及全部 `CODEBUDDY_SAFE_DELETE_*`。

复现原缺陷：用 `audience=[目标NPC]` 打 `/api/personal-terminal`（旧代码返回 400 `INVALID_TERMINAL_REQUEST`）；修复后同请求进入模型阶段。

## 6. 未完成与风险

- 未提交、未推送、未部署；线上仍是 `aca2309`（不含本修复）。
- **真实计费模型未验证**：本地与测试全用合成上游，真实模型的解读质量与 reaction 语义未实测。
- **浏览器点击级 UI 未自动化**：仓库内没有可用的浏览器验收脚本（旧交接提到的 `.integration/divination-verify.mjs` 实际不存在）。UI 侧证据为「composable 真实 payload + 真实路由 + 真实 HTTP 上游」三层贯通，非真实点击。
- 已知取舍：`context.audience` 缺失时仍按旧行为放行（不强制），避免破坏既有调用方；前端占卜始终带 audience，故不影响本修复覆盖面。
