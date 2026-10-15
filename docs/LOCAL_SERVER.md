# 本机世界卡接口 v0.12.0

状态格式错误现在触发只重建隐藏状态的补修，正文及骰点保持固定；与截断续写共用最多3次额外请求。SSE新增 `{type:'repair',attempt,maxAttempts:3,code}`，code 仅为安全静态类别，不回传原 JSON、字段值或供应商错误。耗尽返回 STATE_REPAIR_LIMIT 和 reasonCode；网页将其映射为可读原因。补修时即使模型复述正文也不会产生公开delta，最终仍须合法状态与结束标记才提交。

手动只补状态使用 `continuation:{partial:'已经完整的正文',mode:'state'}`，其他 mode 拒绝。第一条上游请求即要求完整状态块；可再追加最多3次。普通续写不带 mode。允许状态块内部的标准 JSON Markdown 围栏并去掉围栏后严格 JSON.parse，不执行脚本或猜测数值。未知角色、字段错误、事件摘要、人物状态、论坛和小剧场分别给出独立错误类别。骰子结果缺少或方向冲突依旧直接报错，不凭空创造剧情后果。

player.spiritThought 是 AI 动态生成的精神体 OS。已设置玩家 spiritAnimal 时，每轮必须返回非空 OS，不接受“未提供”“未知”“待生成”等占位值；否则 SSE 报 PLAYER_SPIRIT_THOUGHT_MISSING，不发 done，正文保留。精神体尚未设置时，不擅自补种类或其 OS；这个要求与 user 自己的 innerThought 不同，后者仍过滤。未完成或旧回合不在读取时触发付费补写。

浏览器可独立保存 API 凭据，默认开启；使用与存档相同的 IndexedDB 数据库和独立 api-credentials 记录，既有数据库版本与存档格式不变。重新打开时读取凭据，仅对地址、模型匹配的旧确认重新 POST /api/connection，不发起服务商请求。Key 不在该登记 body 中，仍只在模型请求中临时传递，后台不落盘。关闭保存擦除持久凭据但保留页面内存，清除全部则也清除页面 Key。备份与预设导出始终排除本机凭据。

前端维护主 API、有序副 API、向量 API 的任务分工；后台按请求中已登记的 profile 验证地址。剧情、摘要、建议、AI 人设辅助分别选择主或副 API，默认全部主 API；仅检查主 API、被选用的副 API 和开启检索时的向量 API，未选用副 API 草稿不阻拦。向量使用独立 embedding profile。前端入口检查必需配置，未启用向量不要求它。这个检查是游戏使用流程，不是公网鉴权。

新增 POST `/api/models`：`{apiBaseUrl,key}`，要求本机会话，地址使用同样的 HTTPS／本机 HTTP 校验。由服务器 GET 基础地址的 `/models`，不要求先选择或登记模型，不自动确认用于剧情的接口。只发送临时 Bearer Key，不发送私有卡片或聊天。20秒超时，禁止重定向，响应最多1MB／5000条，返回去重排序后的 `{models:[id...]}`；支持常见 data／models 列表。上游错误正文不回传，失败时可手填。

v0.6 生成请求增加 `promptEntries`、`generationType`、`theaterSettings`；结果增加 `theaters`，人物公开状态增加 `spiritAnimal`、`spiritThought`。受支持的采样参数通过 profile 白名单转发。小剧场设置固定4个位置，私有资料仍由服务器统一组织。详见 PRESETS_AND_THEATERS.md。

同一个 Node 进程提供 `dist` 静态网页和 `/api`。仅监听 `127.0.0.1`，校验本机 Host 和同源 Origin，JSON 请求限制 2MB。bootstrap 建立 HttpOnly / SameSite=Strict 本机会话，其他业务 POST 要求该会话；不是公网账号认证。

| 接口 | 行为 |
| --- | --- |
| GET `/api/health` | 版本、数据集、项目和进程实例标识，用于安全复用／停止本项目服务 |
| GET `/api/bootstrap` | 世界卡名称、原迎新、数量、公开地图及能力；不返回完整角色定义，也不提供选人列表 |
| POST `/api/access` | 重建本机测试会话 |
| POST `/api/connection` | `{profileId,apiBaseUrl}`，登记所选地址，不进行模型网络调用，不保存 Key |
| POST `/api/new-game` | `{persona}`，返回必要公开初始状态和开局；所有角色 `present:false`，等待 AI；拒绝 `presentCharacterIds` |
| POST `/api/persona` | `{wish,draft,profile,key}`，结合服务器世界观生成玩家人设；只返回校验后的 persona 字段，不创建存档 |
| POST `/api/place` | `{id}`，读取所点击地点原介绍 |
| POST `/api/generate` | 世界卡 + persona + 历史 + 本地记忆 → 真实模型 → SSE 正文与校验后的 outcome |
| POST `/api/utility` | 真实模型生成公开剧情摘要／建议；不需要再次带私有卡片 |
| POST `/api/embeddings` | `{texts,profile,key}` → 已登记地址的 `/embeddings` → `{vectors}`，不发送世界卡或聊天历史 |

生成 body 见 `src/domain/contracts.ts` 的 GenerateRequest，额外含本次临时 `key`。profile 的 `apiBaseUrl` 必须与登记地址一致，模型服务使用 `${基础地址}/chat/completions`。支持 SSE delta 和返回 JSON 的兼容接口。首次调用及每次续写各自超时180秒，最多首次+3次自动续写；辅助任务60秒。生成中每15秒发送 SSE 注释心跳。续写可能计费，页面说明且可随时停止。首次调用尚未建立响应时的认证／连接错误直接按 HTTP 错误返回。

完整协议为正文 + `<SR_STATE>合法JSON</SR_STATE><SR_DONE>`，两种标记都在服务端隐藏，只有最后的结束标记加合法状态才发 done；仅服务商 `[DONE]` 或 finish_reason 不算完整。缺少完整状态或结束标记时，后台携带累计原始前缀从断点继续，并保持卡片、采样参数、原行动和骰点。边界只去除至少8字符的完全重复片段，不猜测语义重复。格式、字段及未知角色 ID 会进入固定正文的状态补修；骰子方向冲突等内容错误仍直接拒绝，不能借补修改写剧情。

手动续写传 `generationType:'continue'` 和 `continuation:{partial:'已保存正文'}`；partial 必须非空，最多200000字符，另允许只补状态的 mode 字段，除此之外不允许其他字段。首次手动请求也可再自动追加最多3次。前端复用当前未完成稿，只追加新正文；浏览器不保存或回传隐藏协议块。

人设辅助超时90秒，愿望最多3000字，模型结果必须为合法的人设 JSON。字段为 name、appearance、primaryGender、secondaryGender、personality、background、spiritAnimal、other；不允许额外字段。网页收到完整结果才补空白，不覆盖玩家原填写。精神体与其他会进入存档和后续叙事请求。

SSE 事件为 `{type:'delta',text}`、`{type:'continuation',attempt:1..3,maxAttempts:3}`、`{type:'done',outcome}` 或 `{type:'error',code}`。三次续写仍未补全时返回 AUTO_CONTINUE_LIMIT，不发 done。客户端只有收到合法 done 才提交状态、事件记忆和论坛结果，随后才调用建议／摘要。任何错误不回传服务商原错误正文或 Key。停止会取消本机上游请求并阻止后续自动调用；已经发送的请求是否计费仍由服务商决定。

仅 `/`、`index.html`、`favicon.svg` 和受限 `/assets/` 可静态访问。源码、私有目录、编码路径穿越均返回 404；不返回完整系统提示词。应用不记录请求正文或 Key。运行日志与非敏感进程记录位于 `server/.local`。

启动脚本复用同一项目、同一实例、同一版本的服务；否则选择空闲端口，不杀其他程序。停止脚本校验实例和 PID 后才结束记录的本项目进程。运行时需要 Node 24.12+ 及源码中的共用领域模块。

向量每批1～32条，每条非空且最多16000字；上游响应最多8MB，60秒超时，禁止重定向。验证返回索引、条数、有限浮点数、统一维度（最多8192维）后按输入顺序返回。网页每批16条建立本地索引，换地址／模型或修改记忆原文后旧向量不参与语义比较，需要重新索引。Key 和本机确认不进入备份。

开启骰子的 generate 请求含既有 dice：value、grade、rulesVersion。本版校验数值和等级，并在上下文添加由服务器推导的 dicePlan，返回 outcome.diceEvent:{direction,description}。DiceEvent 缺失或方向不匹配会发错误事件而不提交状态。新游戏 persona 可含 identity（最多200字）；公开 player 状态可更新 identity、spiritThought，不返回 user 内心想法。
