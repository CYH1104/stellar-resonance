# 阶段 B 与定向收尾交接（2026-10-25，本地未提交）

> 阶段 C 更正（2026-10-25）：下方“私聊不回流正文公共记忆”只表示 note/向量/公共召回排除私聊，**不等于私聊对正文模型不可见**。玩家与 A 的私聊必须让 A 记得并在正文自然接续，未参与角色不得知情；正确实现与验收见 `docs/handoffs/2026-10-25-phase-c-private-chat.md`。

基线：`main` `e4e9ffe`。阶段 A 未提交改动全部保留并继续使用，未覆盖。本轮未提交、未 push、未部署。

## 结果逐项

1. 群头像位置：`TerminalConversation` 新增可选 `avatarPosition {x,y}`（0–100，默认 50）；`validateTerminal` 校验有限数与范围，旧群无字段合法。`GroupAvatar` 列表、聊天头、群资料统一 `object-fit:cover` + `object-position:x% y%`。群资料新增水平/垂直两条滑条，`@input` 本地即时预览、`@change` 保存；仅群主/管理员可见，保存动作层再次验权。换新图/移除图片会清除位置，重启/刷新/云合并保持对应关系。未扩展 `GroupChatPhone`。
2. 终端固定头像框：桌面 `.pt-own`、资料、聊天、群成员、国王头像改为 `cover`；新增共享 `avatarFrameStyle`，沿用既有 `avatarView`/角色图片 `scale,x,y`，把偏移映射到 `object-position`（0–100）并限制缩放，不再用可露出底色的 `translate`；未改主页自由立绘、整图查看入口或存档值。
3. 重复离开：删除完成块内“暂时离开”，保留下方 `u.go('games')`；完成页实测只有一个离开按钮，command/respond 仍各一个。离开后重进保留轮次；结束仍需确认。
4. NPC 国王格式：prompt 明确占位符正例与禁止项；姓名黑名单改为当前局参与者 + 国王 + 玩家，客户端与服务端同一列表，非参与者常用词（如“开心”）不再误杀；`participantNames` 只用于校验，不进入模型上下文。`betrayalPattern` 区分“自己的小秘密”与泄露他人秘密。格式失败带安全枚举 `reason`（如 `MODEL_JSON_INVALID`、`KING_TEMPLATE_FORMAT`、`KING_TARGETS_MISMATCH`、`KING_COMMAND_BETRAYAL`、`KING_REACT_BETRAYAL`），服务端对可修正格式最多纠正一次，沿用同一批锁定 targets 与同一 signal；越权/背叛不自动纠正。初稿与纠正稿同时保留，单段 24k、总预算 48k 并带截断标记。
5. 自定义角色国王：修正 `kingContext` 对 targets 的前 2 截断（按 7 保留），未改随机规则。自定义联系人完成邀请→抽签→出令→回应→互动→下一轮→离开恢复→结束的完整测试；内置角色原有测试继续通过。
6. 阶段 A 收尾：终端 raw 与主生成 raw 均带明确截断标记；客户端日志 raw 同样限长标记；`cleanTerminalMainContext` 先验证 contacts 形状再构造 known 集合，恶意/异常输入不再抛 `TypeError`；取消生成浏览器实测无完成提示。

## 准确文件与关键 diff

- `src/domain/personalTerminal.ts`：`TerminalAvatarPosition`、`TerminalConversation.avatarPosition`、范围校验。
- `src/components/GroupAvatar.vue`：`position` 覆盖 + `objectFit/objectPosition`。
- `src/app/usePersonalTerminal.ts`：`setGroupAvatarPosition`；换图/移除清位置；`avatarStyle` 改用共享函数；command 发送 `participantNames`；raw 截断标记。
- `src/components/PersonalTerminal.vue`：群资料两条滑条、预览/保存、权限 UI；删除重复离开按钮；桌面头像绑定共享样式；CSS contain→cover。
- `src/app/avatarFraming.ts`（新）：固定画框 `cover`、偏移映射、缩放夹取。
- `src/components/CharacterAvatar.vue`、`src/components/TerminalActorAvatar.vue`：复用共享头像样式。
- `src/domain/cloudBackup.ts`：创建云备份时清除被剥离本地图片的群位置；`mergeCloudSession` 仅在恢复本地图片时恢复对应位置，不覆盖云端新图位置。
- `server/personal-terminal.mjs`：command prompt、参与者姓名黑名单、targets 7 保留、`betrayalPattern`、安全 reason、command/react/interact 错误分类。
- `server/app.mjs`：一次纠正重试、初稿+纠正稿限长、`reason` 响应字段、raw 截断标记；错误响应携带安全 reason。
- `src/gateway/http.ts`：错误展示附安全 reason，保留 raw。
- `src/domain/terminalMain.ts`：contacts 先验证后构造 known；contacts 上下文透传。
- 测试新增/更新：`tests/king-custom-flow.test.ts`、`tests/terminal-correction.test.mjs`、`tests/avatar-framing.test.ts`、`tests/terminal-group-management.test.ts`、`tests/king-blind-targets.test.ts`、`tests/king-blind-context.test.mjs`、`tests/personal-terminal.test.mjs`、`tests/terminal-main.test.ts`、`tests/king-avatar.test.ts`、`tests/nickname-images.test.ts` 等。

## 实际验证

- `pnpm test`：109 文件、568 项通过，0 失败。
- `pnpm test:server`：371 项，367 通过、4 跳过、0 失败。
- `pnpm exec vue-tsc --noEmit`：退出 0。
- `pnpm build`：退出 0；`星穹游戏终端 (1).html` 已恢复 HEAD 字节，SHA256 `C2D0E2C2552B6D22DAE7323977F36E21921CE215362F5C9EA088E66D3A79FEC8`。
- 定向：`node --test tests/terminal-correction.test.mjs` 2 通过（格式错→纠正成功、持续非法→502、越权/背叛不重试、超长 raw 标记）；`pnpm exec vitest run tests/king-custom-flow.test.ts` 1 通过；群头像/角色头像/主上下文定向测试均通过。
- 浏览器：`node .integration/phase-b-verify.mjs`，正式 `App.vue`、真实点击、合成存档、Playwright 路由 mock 模型；18 项检查通过、页面脚本异常 0、commandAttempts=2。证据：`.integration/phase-b-report.json`、`phase-b-verify.mjs`、`phase-b-group-wide-preview.png`、`phase-b-group-tall-375.png`、`phase-b-avatar-home.png`、`phase-b-avatar-king.png`、`phase-b-cancel.png`。
- 浏览器检查覆盖：两滑条横/竖图预览、保存、刷新恢复；375px 无横向溢出；群主/管理员/普通成员 UI 权限；列表/聊天头/群资料 cover；桌面/资料/聊天/群成员/国王固定头像；NPC 出令失败 reason + 锁定目标不变、重试成功；自定义角色完成、下一轮、离开恢复、结束确认；取消生成无成功提示。

## 未验证 / 限制

- 未使用真实模型、真实平台 token、真实账号或用户存档；所有模型响应为路由 mock。
- 未做真机/真实移动浏览器验证；375px 为桌面 Chromium 视口模拟。
- 浏览器证据使用本地 Vite 正式 `App.vue`；为启用生产终端样式，在页面挂载后将 `#app` 节点改名为 `#academy-workspace`，未使用公网 `/terminal` 入口或部署环境。
- 未运行真实上游模型格式纠错；HTTP 纠正路径使用本地 synthetic 上游。
- 未提交、未 push、未部署；等待 Vesper 审查。
- #8 记忆压缩与热更新按用户要求未出方案、未实现。
- 其他旁路问题只调查未扩展：未改 `GroupChatPhone`、主页自由立绘、随机抽签规则或整图查看入口。
