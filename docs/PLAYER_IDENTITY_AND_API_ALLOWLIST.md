# 玩家身份与 API 白名单

主剧情原本已有完整玩家人设；此次补齐独立论坛评论请求，发送当前会话完整 persona 与当前关系参考。主剧情及论坛共用泛用身份规则，适用于校长、教师、学生、访客、校外职业、多重身份与未知身份，不默认玩家是新生、同校成员、下属或熟人。角色身份与既有关系按角色 ID 提供参考。

规则区分身份关系、认识程度、亲密关系和好感。参考明确人设与有时间依据的剧情变化，证据不足使用中性称呼；不从同校、岗位、年龄等擅自推断直属师生、同班、年级、熟悉程度或好感。论坛人物不能因系统知道秘密而自动知道秘密。同人内容不作为主线事实。本次不新增模型调用，不持久化新的推断关系表，也不保证模型百分百遵循提示词。

管理员登录 `/editor/` 后进入 `/editor/accounts` 的“允许使用的 API 地址与端口”，先读取白名单，再新增、删除和保存条目。条目为 origin，例如 `https://relay.example:8443` 或 `https://relay.example`，允许粘贴带 `/v1`、`/api/v3` 等路径的完整接口地址，自动提取 origin；不包含用户名、密钥、参数、片段。默认 HTTPS 端口为 443，HTTP 为 80；是否可使用 HTTP 仍受现有接口 URL 校验限制。

按协议、域名和端口精确匹配，不使用通配符。普通用户不能读写管理接口。服务器在配置接口及发出每个上游请求前校验，覆盖正文、补修、续写、摘要、人设、论坛、随机事件、向量、测试连接和查询模型。重定向被拒绝，不会自动转发密钥和提示词至另一个地址。移除自定义条目后（官方预置地址除外），已经保存的连接也不能继续发请求；不需要重启。

生产账号模式默认放行代码中核验过的官方公共端点，文件不存在或自定义列表为空时仍禁止其他地址；读取异常时全部不放行。管理员可另加自定义中转站，不从用户历史接口记录自动放行。无账号的 localhost 开发预览在没有配置任何条目时保留原调试行为；一旦添加条目，也按白名单执行。

配置保存在账号目录内 `relay-policy.json`（默认 `server/private/accounts/relay-policy.json`），不入库提交，不含密钥。服务器更新时保留该目录。地址数量最多 100 条。当前管理修改按整份列表保存，多管理员同时编辑前应先重新读取。

## 官方公共端点（2026-10-20 核验）

内置16个精确 HTTPS origin（默认443端口）：OpenAI、Anthropic、Google Gemini、DeepSeek、阿里百炼（北京/新加坡/美国）、火山方舟、腾讯混元、百度千帆、智谱、Z.AI、Moonshot、MiniMax、xAI、Mistral。管理页“读取白名单”后可展开查看官方列表，与自定义列表分开。官方地址更新即自动生效，无需写入已有私有配置文件。默认允许不等于所有协议均已适配，模型可用性仍由现有适配器、模型和账号决定。

此表覆盖常用公共端点，不声称穷尽所有企业的全部地址。Azure、AWS、Vertex 等租户/部署/地域专属域名以及其他官方区域端点由管理员按完整地址新增；不通配放行整个云厂商域名。官方域名的其他端口或HTTP地址不自动放行，重定向仍禁止。

核验来源：
- [OpenAI](https://platform.openai.com/docs/api-reference/debugging-requests?lang=curl)
- [Anthropic](https://platform.claude.com/docs/en/api/overview)
- [Gemini](https://ai.google.dev/api/models)
- [DeepSeek](https://api-docs.deepseek.com/guides/search_fetch)
- [阿里百炼 Base URL 总览](https://help.aliyun.com/zh/model-studio/base-url)
- [火山方舟](https://docs.volcengine.com/docs/ark/context-management?lang=en)
- [腾讯混元](https://cloud.tencent.com/document/product/1729/111007)
- [百度千帆](https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y)
- [智谱](https://docs.bigmodel.cn/api-reference/智能体-api（旧）/创建新会话)
- [Z.AI](https://docs.z.ai/guides/overview/quick-start)
- [Moonshot 官方代码](https://github.com/MoonshotAI/moonpalace/blob/main/endpoint.go)
- [MiniMax](https://platform.minimax.cn/docs/api-reference/text-openai-api)
- [xAI](https://docs.x.ai/developers/rest-api-reference/inference)
- [Mistral](https://docs.mistral.ai/api)

## 历史接口一键加入

管理页“查看接口记录”查询后，每条记录有“一键加入白名单”，另有“将当前查询结果全部加入白名单”。邮箱留空查询最近200条全部账号记录，填写邮箱则查询该账号最近200条；批量按钮以该查询范围为准，不表示遍历全部历史。加入的是完整协议、域名与端口组合，而不是向所有域名开放同一端口。

只有管理员可调用加入接口；服务器重新读取观测记录，不接受未记录的地址。追加操作在服务器写队列内读取最新白名单后合并，保留已有配置、去重并跳过官方预置。返回实际新增数量，立即生效，不需要再点保存。超过100条自定义上限会整批拒绝，原配置不变。操作会同步刷新白名单编辑区，如有未保存编辑应先保存。
