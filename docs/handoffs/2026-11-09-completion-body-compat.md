# 9000 空正文：响应读取兼容

基线 main / 本机 HEAD 均为 9c75171，Codex 持棒，开工已读 agent-hub。用户新的报错为 MODEL_EMPTY_RESPONSE，模型 gemini-3.8-flash、af.52kele.cn、输出 4096，已不同于此前上游 HTTP 400/500。没有拿到该次真实响应体，不能宣称已确认该渠道返回哪种格式。

## 已复现并修正的代码问题

新增回归在旧读取器下首先 4 项失败：choices[].text 被忽略；空 delta 遮住完整 message；普通 JSON 被标成 text/event-stream 时被读成空回复；纯工具响应也被当成普通空回复。

- 保留 /chat/completions 纯文本请求，不增加 tools、不切换模型/地址/输出预算、不增加付费调用或自动重试。
- 响应按实际可识别的 OpenAI JSON/SSE 字节读取，兼容错误或缺失的 Content-Type；仅接受 choices 中已知的可见内容字段。HTML、未知 JSON 和不明协议仍明确拒绝，不能把整个原始响应显示为正文。
- 兼容 choices[].text，空 delta 可使用完整 message.content；既有文本数组和隐藏推理过滤保留，不将 reasoning、tool_calls/function_call 参数当正文。
- 工具/函数调用但无正文单独报 MODEL_TOOL_CALL_ONLY；不执行调用。真正空白、只有推理、未闭合推理、过滤拒绝、输出耗尽仍分开处理。
- SSE 错误事件的固定安全分类保留到现有错误链路；原始上游内容不回显、不持久化。取消覆盖到首字节判别阶段，预先取消也会释放读取器。
- 沿用原有 2MB 总响应、100KB SSE 帧上限，判别前最多 8KB 空白/前缀；不放宽无界读写，不改变有效预设和世界书内容。
- 新代码仅扩展既有运行诊断类别，无业务字段或数据库新增；运行日志和原始输出仍排除在本地下载、云端上传、导入、拉取覆盖及恢复副本之外。业务备份格式未改。

## 验证

- 定向 72 项通过，新增兼容套件最终 5 项覆盖 JSON/SSE/错误 MIME、legacy text、空 delta、工具参数保护、隐藏推理、真正空回复、逐字节 UTF-8/CRLF、已取消和读取中取消。首次 4 项失败是修复前的真实复现，未写作通过。
- 实际 HTTP A/B 上游对照：B 改为 JSON choices[].text + 错误 SSE 类型，正文可正常送达；保留同一 profile 切换地址/模型/Key、旧请求迟到失败、取消后迟到及下一次发送回归。
- Edge 原生 IndexedDB + 实际 useWorkspace / StoryView + 本地 HTTP：首次 500 留错，查看本轮日志后显式重试，模拟上游返回上述 legacy text/错误类型，页面正常显示正文并保留两稿和输入。调用均为合成上游，未使用客户 Key、未调用真实付费模型。
- 客户端全套 789 通过、1 个既有 expected fail；后端全套 450 通过、4 跳过；类型检查、生产构建通过。全套含慢请求、超时、取消、保存失败、后台记忆与设置/存档并发及完整备份往返；已有 terminal-first 旧 facts 复用风险未修复，跳过的原生验收未当作通过。

## 发布及未决项

按 server/ 完整更新，仅 9000。旧快照 f5d0f1106bbe41d9 保留；等待模型连接空闲、停目标实例并备份一致性私有状态，检查成功再推进 current；8807/8088 不改。

已发布快照 76bc1677bd61c2b5，PID 3250157；dataset/projectId 保持。339 份运行文件与包清单校验、公网 35 份 JS/CSS 哈希均通过。包 SHA256 0544f85d7c01e729dafd7f6ff9c0ba213cfddc1166e0a363f934a99a463d5e63；入口 SHA256 c5b06f99e1025a3af200443ac77b95b0abb6f7dfdb2570c8535dadfc55e34066。服务器目录 server/.local/frontend-fixes/completion-body-20261109/ 留有一致性私有副本和旧指针。8807 进程/入口、8088 资源哈希发布前后相同。额外直接从新快照导入 completionChunks，用合成字节验证 legacy text + 错误 SSE MIME 和工具参数不展示，运行版本核验通过；没有请求真实模型或写入客户资料。

**实现和合成模型已验收，真实用户接口仍需确认。** 用户下次若出现 MODEL_TOOL_CALL_ONLY，说明确实只收到工具内容，不能靠读工具参数伪造正文；若仍 MODEL_EMPTY_RESPONSE，按该轮的安全结束原因/计数继续核查，不归罪于已证伪的输出上限猜测。
