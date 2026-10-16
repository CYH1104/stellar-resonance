# 原星际终端与 v0.11.2 功能整合

来源分支：`preview/local-v0.11.2-20261016`，提交 `f7b9eb7af0bd86bdd1e81402093f737462d4b4e7`。

原学院主页、开屏、立绘、角色轮播和编年史保留。`/terminal` 从同源 `/assets/` 加载 Vue 功能模块，直接挂载到原页面的 `#academy-workspace`。没有使用 iframe，也不改变站点来源，因此接口 Cookie 和 IndexedDB 存档可复用。

`npm run build` 会先运行 `scripts/sync-terminal.mjs`，把 `terminal-skin.css`、`terminal-skin.js`、`terminal-workspace.js` 和版画重新嵌入原 HTML，避免维护两份代码。

- 进入剧情 → 新版叙事、状态、记忆、关系、地图、小剧场和存档。
- 设置接口 / 导入预设 → 新版模型与预设配置。
- 学生档案 / 玩家资料 → 新版玩家人设与 AI 辅助填写。
- 导出 / 记忆模块 → 对应的功能区。
- 功能区的“返回学院”保留当前游戏，返回原主页；“继续存档”读取新版 IndexedDB 存档。

原终端 localStorage 的独立指令、角色频道记录及旧版备份保留，**没有自动转换为新版游戏存档**。新存档由新版领域逻辑管理，防止旧演示回复被误当作已验证的 AI 状态。原指令终端仍能导出旧备份。

世界卡从本地原终端脚本通过 TypeScript AST 提取纯字面量：14 人、5 院系、12 地点、100 条事件素材。写入 `server/private/extracted-pro.json`，受 gitignore 排除；缺失的世界书与规则不自动补造。原 HTML 本身仍包含原作者的角色与地图资料，不应将它视作对这些旧资料的保密边界。

使用 Node 24.12+，先 `npm run build`，再 `npm start` 或双击“启动后端.cmd”。默认地址 `http://127.0.0.1:8807/terminal`。根路径保留新版独立界面。`server.config.json` 是旧服务配置；新版 API 由网页中的“模型与预设”设置，不读取旧文件里的 Key。模型未配置时明确提示，不会自动伪造真实回复。

本次整合前源码备份为 `.integration/before-integration.zip`。`.integration/`、`server/private/`、`server/.local/` 不上传。

## Visual update
The original academy typography, opening, perspective, waves and card layout are restored. Only theme colors are overridden; the added engraving and bird introduction are no longer injected. Backend integration is retained.
