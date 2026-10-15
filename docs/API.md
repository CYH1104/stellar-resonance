# 接口说明 v0.11.0

正文与状态末尾强制隐藏结束标记，缺少完整标记自动续写最多3次，SSE 增加 continuation 进度事件；手动继续沿用 generationType:'continue' 和 continuation.partial。具体协议、超时与提交条件见 LOCAL_SERVER.md。

主 API 必填，四种文字任务独立选择主或副 API，默认全部主 API；向量独立配置。路由保存在 Preferences 的 storyProfile、summaryProfile、suggestionsProfile、personaProfile，由网页把相应档案和 Key 交给后台。不存在按副 API 顺序自动抢选的逻辑。

当前实际接口和返回行为以 [LOCAL_SERVER.md](LOCAL_SERVER.md)、`src/domain/contracts.ts`、`src/gateway/http.ts` 为准，世界卡流程见 [CARD_LOGIC.md](CARD_LOGIC.md)。

v0.4 已接入真实模型请求路径，删除本机资料摘录生成与手工选人。模型 URL 在本机设置页明确登记，Key 随单次请求临时传递，后台不持久保存；v0.8.0 浏览器可单独记住 Key，刷新后恢复已确认接口，不进入备份。缺少配置直接报错。当前未附带任何已配置的外部模型服务。

公网部署目标仍为服务端固定供应商／模型／密钥、HTTPS、朋友账号和授权、限流。不能直接把本机接口的“确认模型 URL”功能公开给普通玩家。v0.7.0 已接入可配置的真实 embeddings 接口；完整酒馆脚本运行环境、正式 MVU 路径与好感度规则尚未接入。
