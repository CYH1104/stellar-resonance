# 原前端接原生后端：请求与终端任务检查点

基线 `bda27f8`。本轮继续实现并验证真实原生请求，不改原 UI，不部署半成品。**整体仍未接齐，8088 仍旧简化入口；8807/9000 未动。**

## 实际新增

- `src/native/completions.ts` 使用真实 `SillyTavern.getContext().ChatCompletionService` 的 createRequestData、presetToGeneratePayload、sendRequest 和原生 extractMessageFromData。没有另写模型 HTTP 客户端或 SSE 解析器。
- 每次请求明确提供 URL、模型、采样参数和 secret_id／临时 Authorization；清除活动连接的 reverse_proxy、proxy_password、自定义 body/header 和 tools 等覆盖。正文、终端可以并发使用不同接口，原生全局活动 Key 和 API 设置不被切换。请求参数立即取快照。
- 原生自定义后端会自行追加 `/chat/completions`，适配旧配置的尾斜线／完整 endpoint，避免双斜线、重复后缀。没有擅自追加 `/v1` 或改写保存的接口地址。
- 非流式回复保留原生 finish_reason，length/refusal/空回复明确失败并保留返回文字；SDK 的上游错误正文不直接显示。流式文字由原生 SDK 提供，消费方停止或取消时中止请求。**原生 SDK 流式输出不提供 finish_reason，不能杜撰 stop；实际正文仍须验证业务完整结束协议。**
- `src/native/api.ts` 修复真实浏览器才会触发的 fetch receiver 问题。Node 直接测试不会出现此问题；真实浏览器第一次暴露 Illegal invocation，修复后已完整重跑。
- `src/native/prompts.ts` 经原生 Generate 的 dryRun / PromptManager / 宏 / 世界书组装提示词，临时替换已有上下文，不插入真实对话；完成、失败后恢复聊天、元数据及扩展提示，拒绝把旧上下文恢复到另一个会话。实际预设和关键词世界书均已验证。
- **这个 dryRun 不是完整实际生成链路。** 原生明确跳过 sticky/cooldown 检查和推进。当前检测到有此类条目或现有计时状态便明确停止，不能静默当成普通条目使用。不能把此预览组装器直接登记为完整生产 Gateway；后续必须让真实原生生成处理跨轮效果并在成功稿提交。
- `native/academy-plugin/` 是原生插件，复用原有学院终端业务提示／输出校验，只负责 plan/finish/cancel；不调用模型、不写用户文件。实际模型仍由上述原生 SDK 完成，实际用户资料仍由原生端点保存。
- 插件计划绑定原生账号，仅在内存里保留、到期回收、一次消费；最多一次格式纠正，不重新抽取目标。react 生成后建立独立、同账号绑定的 review 计划。匿名国王命令排除玩家私有人设、隐藏号码和其他参与者；角色资料来自本次显式 scoped state，没有全局玩家资料兜底。
- `src/native/terminal.ts` 串起原生插件准备／校验与真实 SDK；模型格式最多纠正一次，react 再作原业务复核；整个任务及纠正/复核共享十分钟上限，不无限重试。失败保留原文，不写终端存档；应用端仍须做原有任务来源/分支锚点检查。
- `native:compat:install` 仅在官方忽略的 plugins 目录生成导入入口，不改官方跟踪源码，不自动启用插件或重启任何实例。检测同名未知入口时停止覆盖。独立部署时须显式启用这个可信插件，并保持插件自动更新关闭。

## 验证

- 最终类型检查通过。
- 全套 Vitest：154 文件通过、1 文件跳过；943 项通过、1 项跳过。另有本轮增量定向 15 项通过。
- Node 原生插件测试 7 项通过：自定义 NPC、账号隔离、一次消费、有限纠正、过期/取消、原生登录、错误脱敏、匿名游戏、react 复核。原完整 HTML/加载检查 3 项通过。原前端生产构建通过。
- 浏览器关闭后，再通过显式隔离实例运行 `native-storage-original.test.ts`，原生存储往返实测 1 项通过，确认本轮 fetch 改动未破坏实际聊天、人设图片、草稿、预设及恢复文件读写。
- 真实浏览器 + 未修改原生后端 + 本地合成上游：**18 项通过**。验证原生 SDK 并发主/终端 URL 及独立 Key、错误活动 Key 不被误用、流式、length 截断保留、Generate 预览只出现一次输入、宏、真正选中的预设和关键词世界书、上下文恢复、原生插件好友申请全链路、无未处理异常。模型请求确实经过 `/api/backends/chat-completions/generate`；终端业务经过原生插件，不走旧 `/api/personal-terminal`。
- 没调用真实计费模型。18 项里的完整好友请求是隔离调用链验收，**不是原 App 的手机页面已经挂上这个端口**。
- 脱敏证据在 `docs/evidence/native-completions/browser.json`；完整可复跑脚本/合成上游在忽略的 `.integration/native-completion-proof/`。测试浏览器使用独立 profile 和端口 19488、禁用扩展，避免首次同步/外部扩展干扰。初次 Vite 动态依赖扫描测试不可靠，最终改为独立构建的库模块，使用原生页面实际上下文调用。
- 官方源码树仍为 `9218207b1e3bfe78224afe10e71ece3b8e79f572`。原学院 HTML、Vue 模板/样式、原加载动画和旧端口源代码未改。

## 数据兼容

没有新增用户持久化字段、数据库或浏览器存档。插件 token 是未完成请求的短期句柄，不是存档数据，不写入 BackupArchive。消息及终端结果仍应由应用成功提交后，进入上一轮原生存储适配及完整备份采集；运行日志、模型原始输出和密钥继续排除。不能把内存计划或 SDK 原文单独混进完整备份。

## 下一步必须继续（尚未完成）

1. 真正实现并安装完整 WorkspacePorts/Gateway：原 App 目前仍未装上这些服务，不能宣称已恢复上线。缺少 bootstrap/newGame、人格辅助、地图、论坛、记忆/向量、终端码、分享以及主 Generate 的完整最终适配。
2. 解决主 Generate 的原生实际状态生命周期：dryRun 会跳过持续/冷却，不能靠预览代替；不能重扫导致概率/分支改变，也不能复制另一个世界书引擎。原生完整调用、上下文隔离、成功稿计时快照、取消/失败不推进，均须实测。原 `cleanNativeEffects` 只允许 PlayerRuntime-* 名称，与账户原生文件名存在差异；改动前确定版本兼容与作者资料边界，不能直接放宽后声称兼容。
3. 让原生运行时内存与 API 写入的 settings/accountStorage/personas/presets/worldbooks 同步；避免原生自动保存把新文件覆盖成旧内存。主调用使用本档完整历史、实际 Session 人设及所选接口，而非默认活动用户/模型。
4. 当前终端插件只有业务协议，没有独立为辅助任务执行原生预设 prompt_order、宏和世界书。SDK presetToGeneratePayload 负责参数，不会组装预设里的完整 prompt 列表。这个差分必须补齐或明确处理，尤其匿名命令不能通过原生全局 {{user}} / persona 再泄漏身份。禁止把正文提示词或未筛选历史塞进终端。
5. 接入原完整顶层学院和原加载动画、原生账号；严禁用另一套 NativeAcademy 简化视图交付。
6. 上轮记录的原子并发／多文件失败恢复、五路真实备份、重置预设规范值回读、受保护 Key 导出仍待完成。使用既有完整采集入口，不能仅备份 sessions。
7. 最终真实 UI、完整生成及数据往返验收后，只更新 8088 独立服务。不要触碰 8807/9000，也不要因本轮请求层验证通过就部署不完整前端。
