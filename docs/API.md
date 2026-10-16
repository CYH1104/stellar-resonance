v0.19.0：新增 POST /api/memory，由现有 summaryProfile 每轮整理完整结构化记忆，取消自动五轮汇总。开启向量后自动建立新记忆索引，每轮按人物与场景检索；固定携带未履行约定。任务失败可独立补记／重建索引，详见 MEMORY.md。

# 接口说明 v0.18.2

正文与状态末尾强制隐藏结束标记，缺少完整标记自动续写最多3次，SSE 增加 continuation 进度事件；手动继续沿用 generationType:'continue' 和 continuation.partial。具体协议、超时与提交条件见 LOCAL_SERVER.md。

主 API 必填。剧情（正文、人物状态、四个已开启小剧场、下一步建议）、记忆摘要、AI 人设辅助各自选择主或副 API，默认主 API；向量独立配置。路由为 storyProfile、summaryProfile、personaProfile。建议在剧情回复的隐藏状态中一起返回，不再单独请求；旧 suggestionsProfile 仅保留用于旧备份兼容，不参与接口校验或路由。

当前实际接口和返回行为以 [LOCAL_SERVER.md](LOCAL_SERVER.md)、`src/domain/contracts.ts`、`src/gateway/http.ts` 为准，世界卡流程见 [CARD_LOGIC.md](CARD_LOGIC.md)。

v0.4 已接入真实模型请求路径，删除本机资料摘录生成与手工选人。模型 URL 在本机设置页明确登记，Key 随单次请求临时传递，后台不持久保存；v0.8.0 浏览器可单独记住 Key，刷新后恢复已确认接口，不进入备份。缺少配置直接报错。当前未附带任何已配置的外部模型服务。

公网部署目标仍为服务端固定供应商／模型／密钥、HTTPS、朋友账号和授权、限流。不能直接把本机接口的“确认模型 URL”功能公开给普通玩家。v0.7.0 已接入可配置的真实 embeddings 接口；完整酒馆脚本运行环境、正式 MVU 路径与好感度规则尚未接入。
