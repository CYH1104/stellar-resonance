# 《群星共振》开发约定

先阅读 docs/PROJECT_OVERVIEW.md、REQUIREMENTS.md、ARCHITECTURE.md、SECURITY.md、ST_COMPATIBILITY.md 和 DEVELOPMENT_PLAN.md。

## 已确定目标

- 星际 ABO 背景的群像 AI 互动游戏。既有人设由作者提供，不自行编造为正式内容。
- Vue 3 + TypeScript + Tauri 2 客户端，先 Windows，后续 Android。
- Cloudflare Workers + D1 后端，模型请求通过服务端白名单网关。
- 玩家可设置 API Key、模型、允许的预设和 User 人设。
- 作者世界书、隐藏人设、核心正则与剧情规则保留在可信服务端，不打包到客户端或公共素材中。
- 优先实现小规模 10～50 人内测的 MVP，再扩展群像玩法与兼容范围。

## 工作规则

- Issue 是开发任务来源；实现前阅读目标、验收标准及依赖，PR 关联 Issue。
- 先检查仓库现状，使用小范围变更；不要把计划中的功能描述为已经实现。
- 不提交真实 Key、部署凭据、真实私有世界书、完整聊天记录或玩家存档。
- 客户端输入与模型输出均视为不可信。所有资源访问在服务端检查玩家归属。
- 变量更新先校验，再持久化；模型输出只能提出变更，不能直接决定解锁。
- 每次变更评估作者资料保密、玩家隔离和变量持久化。按风险验证相关边界。
- 使用虚构测试资料。日志不得包含 Key、完整 Prompt 或隐藏条目正文。
- 未经明确任务授权，不部署、不合并 PR、不邀请协作者、不更改仓库可见性、不产生付费负载。
- 兼容目标是明确的格式与行为子集，不直接承诺运行完整 SillyTavern 或任意插件。
- 不用客户端加密或混淆替代服务端保密；不得承诺提示词防泄漏的绝对效果。

## 协作约定

文档位于 docs/。任务模块标签为 frontend、backend、worldbook、st-compat、variables、api、security、testing、infra；优先级为 P0/P1/P2；阶段为 MVP/Alpha/Beta；看板状态为 Todo、In Progress、Testing、Done。阶段和优先级不代替状态。
