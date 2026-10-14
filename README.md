# 群星共振 · Stellar Resonance

星际 ABO 背景的群像 AI 互动游戏，采用响应式网页，让手机和电脑玩家通过浏览器进入。

**当前为规划阶段，游戏运行代码尚待实现。** 技术栈：Vue 3 + TypeScript + Vite、Cloudflare Workers、D1。第一阶段交付可登录、配置玩家 Key、流式聊天、保存并恢复进度的网页内测版本；独立 EXE / APK 无限期延后，可能不实施。

## 从这里开始

- [第一阶段需要做什么](docs/MVP_PLAN.md)
- [项目概览](docs/PROJECT_OVERVIEW.md)
- [功能需求](docs/REQUIREMENTS.md)
- [架构](docs/ARCHITECTURE.md)
- [保密与访问边界](docs/SECURITY.md)
- [酒馆兼容范围](docs/ST_COMPATIBILITY.md)
- [46 项任务索引](docs/DEVELOPMENT_PLAN.md)
- [开发约定](AGENTS.md)
- [开发看板](https://github.com/users/CYH1104/projects/1)

作者私有设定保留在服务端。浏览器仅接收当前玩家可见的内容；Key 默认只保留当前页面内存，刷新后重新输入。网站形态本身不保证资料保密。

任务使用模块、优先级与阶段标签，看板状态为 Todo → In Progress → Testing → Done。建议目录 apps/web、workers/gateway、workers/story 与共享 packages 在初始化任务中建立。运行和发布命令在真实实现并验证后补充。
