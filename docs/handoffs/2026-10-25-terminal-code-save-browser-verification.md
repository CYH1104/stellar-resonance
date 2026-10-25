# 2026-10-25 终端码保存修复的浏览器入口验收

## 实现

- `src/domain/mvu.ts`：当整块 `/custom` replace/add/insert 未携带终端码表时，继承上一状态已有号码；空表或部分表只补齐缺失且合法的旧号码。显式改号、置空、删除号码表/号码、绑定未知 ID、整块更新同时操作号码路径仍按原严格校验失败。
- `src/domain/story.ts`：`parseBackup` 校验变体时把失败来源（session / turn / variant / round）附加到错误；`saveFailureLocation` 只读取这些定位字段。
- `src/app/useWorkspace.ts`：保存失败日志使用 `saveFailureLocation`，不再用当前页面会话；同时抑制 `problem` watcher 对同一次保存失败生成的、指向当前页面的重复运行记录。

## 已执行验证

- `npx vitest run tests/api-workspace.test.ts tests/terminal-code-legacy-snapshot-save.test.ts tests/terminal-code-save-regression.test.ts`：3 文件 89 项通过。
- `npx vue-tsc --noEmit`：通过。
- `npm run build`：通过（构建脚本改写的 `星穹游戏终端 (1).html` 已还原，未纳入本轮改动）。
- 浏览器验收入口 `.integration/save-e2e/`（已 gitignore）：Vite 5199，playwright-core 1.64.1 + 本机 Edge，正式 `useWorkspace` + 实际 `IndexedDbRepository` + 实际 `SavesView` + 官方“立即保存/导出全部备份”按钮；`/api/bootstrap` 返回合成服务。
  - 场景一：缺失/空/部分码表的三个历史存档经 UI 保存成功；刷新后正文、门禁变量和原有终端码（含未选稿历史稿）不变；保存前后导出的完整备份 SHA-256 均为 `75CD04EA...F4237B`，可再次解析。
  - 场景二：非当前会话未选稿显式改号后点“立即保存”仍失败；运行日志记录为 `sess-b / b2 / b2v1 / 第 2 轮`，而非当前页面 `sess-a`；IndexedDB 旧快照字节未变，UI 导出的完整备份保留未落盘正文。
  - 375 与 1280 宽度截图均无横向溢出；`pageerror=0`，`console error=0`。脚本退出码 0，11 项检查全部通过。
  - 证据：`.integration/save-e2e/evidence/`（`report.json`、01/02/10/12/13 截图、03/04/11 备份）。

## 未验证范围

- 未在 iOS/夸克真机测试，未读取或覆盖该用户的真实浏览器资料/存档/密钥，因此不声称复现或确认其公网真实根因。
- 未部署、未访问服务器、未提交或推送；远程 `main` 只读核对仍为 `8b98dd3`，与本地 HEAD 一致。
