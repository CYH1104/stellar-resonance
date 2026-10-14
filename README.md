# 群星共振 · Stellar Resonance

星际 ABO 背景的群像 AI 互动游戏，面向作者与朋友共同开发和小范围内测。

目前是项目规划与交接文档，客户端、Worker 和游戏功能尚待实现。计划技术栈为 Vue 3、TypeScript、Tauri 2、Cloudflare Workers 与 D1。

## 文档入口

- [项目概览](docs/PROJECT_OVERVIEW.md)
- [功能需求](docs/REQUIREMENTS.md)
- [架构](docs/ARCHITECTURE.md)
- [保密与访问边界](docs/SECURITY.md)
- [酒馆兼容范围](docs/ST_COMPATIBILITY.md)
- [45 项开发任务与顺序](docs/DEVELOPMENT_PLAN.md)
- [开发约定](AGENTS.md)

作者私有设定保留在服务端；客户端只获得当前玩家可见的内容。玩家自填 Key，并选择认可的模型供应商。先交付 Windows 内测版本，之后完善群像玩法与 Android。

建议目录在对应初始化任务中创建：apps/client、workers/gateway、workers/story、packages/contracts、packages/compat、packages/rules。当前 README 不提供未经验证的运行命令。

GitHub Issues 负责具体任务，Projects 使用 Todo → In Progress → Testing → Done。完成验收后再关闭任务。
