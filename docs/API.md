# 前后端接口 v0.1

状态：前端 HTTP 适配器已实现；下面的后端尚未实现。模拟模式使用相同业务接口，不经过网络。

## 共同约定

- 前端与 API 同站点，通过 HTTPS；所有接口都是 POST JSON，`credentials: same-origin`。
- `/api/access` 建立服务端会话。所有生成、辅助和向量请求都必须验证会话，前端按钮状态不属于服务端权限检查。
- API Key 是临时请求参数，不能写入日志、数据库、错误响应或 Cookie。供应商由 `providerId` 白名单映射到服务器配置地址，不能接受任意 URL 转发。
- 校验参数、大小、频率和输出长度；服务端只读取必要的私有设定。不提供私有原文、完整提示词或可供遍历的设定查询接口。
- 对返回内容实行公开字段白名单。模型输出只能是文本和结构化数据，禁止将任意脚本作为 MVU 执行。
- 401／403 表示访问未授权，429 表示频率限制，5xx 表示服务故障。前端不直接展示服务器错误正文。
- 示例中的角色、事件、模型名和 Key 都是虚构占位。正式数据以 `src/domain/contracts.ts` 为准。

## 1. 验证朋友访问

`POST /api/access`

```json
{ "invite": "朋友输入的邀请凭据" }
```

成功返回 200，并设置 HttpOnly、Secure、SameSite 的会话 Cookie；仅用于身份会话，不存剧情。邀请凭据服务端验证、限速，不存于前端 IndexedDB。

```json
{ "capabilities": { "continue": true } }
```

如暂不支持续写，返回 false；也可以返回 204，默认关闭续写按钮。需要校验同站点请求来源，正式部署应实现相应 CSRF 保护及会话失效机制。

## 2. 一轮剧情／重演／续写

`POST /api/generate`

```json
{
  "sessionId": "本地存档ID",
  "turnId": "行动ID",
  "persona": { "name": "访客", "appearance": "", "personality": "", "background": "" },
  "opening": "公开开局",
  "input": "询问公开站点的情况。",
  "history": [{ "role": "user", "content": "上轮行动" }, { "role": "assistant", "content": "上轮公开回复" }],
  "memories": ["检索到的一条有效记忆"],
  "state": {
    "player": { "id": "player", "name": "访客", "energy": 80, "focus": 70, "affinity": 0, "present": true },
    "characters": [{ "id": "guide", "name": "样例引导员", "energy": 80, "focus": 70, "affinity": 30, "present": true }]
  },
  "dice": { "value": 73, "grade": "顺遂", "rulesVersion": "d100-v1" },
  "profile": { "id": "main", "name": "剧情接口", "providerId": "approved-provider", "model": "story-model", "temperature": 0.7, "maxTokens": 1600 },
  "presets": ["玩家允许公开的叙事要求"],
  "key": "仅本次请求使用的玩家Key"
}
```

骰子关闭时不发送 `dice`。重试、重演沿用同一 `turnId`、行动和骰点，客户端保存多稿。客户端输入和状态均是不可信上下文；服务端不能把预设或人设当作修改私有规则的授权。

续写额外发送：

```json
{ "continuation": { "partial": "已经收到的半截正文" } }
```

续写响应仅输出剩余文本，不重复 partial。最后的 outcome 描述完整回合的最终公开结果。续写要由服务端和所选模型实际支持才能在 access 中声明能力。

响应类型：`Content-Type: text/event-stream`，UTF-8。每个 data JSON 后空一行。可以发送心跳注释，前端忽略非 data 行。

```text
data: {"type":"delta","text":"接待站的指示灯亮起。"}

data: {"type":"delta","text":"引导员向你招手。"}

data: {"type":"done","outcome":{"player":{"energy":78},"characters":[{"id":"guide","affinity":34}],"event":"访客与引导员交流。"}}

```

- 必须输出一次最终 `done`；只有流关闭却没有 done 时，前端保留部分稿件并标记未完成。
- 客户端收到 done 后结束读取；后端需要在此之前发送完公开正文。
- `outcome.player` 只支持绝对值 energy／focus（0～100）；characters 只支持已有 ID 的 affinity（0～100）；event 必须为 1～500 字非空文本。额外字段会被前端拒绝。
- 无合法 outcome 时，完整正文仍保留，原状态不变，不添加事件或自动事件记忆。
- 状态变化是受限首版协议，尚不支持完整 MVU、任意字段、人物新增／离场或全部酒馆插件。
- SSE 错误可发 `data: {"type":"error"}`；错误响应不得含私有提示词、堆栈、Key。
- 用户停止通过 AbortSignal 断开请求；后端应取消上游调用。中断后前端保留同轮骰点和已收到正文。
- 公共代理不能缓冲整个响应再一次返回，应及时转发流式分片。

## 3. 摘要与建议

`POST /api/utility`

```json
{
  "task": "suggestions",
  "texts": ["本轮行动", "本轮公开正文"],
  "profile": { "id": "aux", "name": "摘要与建议", "providerId": "approved-provider", "model": "utility-model", "temperature": 0.7, "maxTokens": 1600 },
  "key": "仅本次请求使用"
}
```

`task` 为 `suggestions` 或 `summary`。摘要传最近五个有效事件标题，响应：

```json
{ "items": ["第一条建议或摘要", "第二条建议"] }
```

建议最多四条；摘要使用第一条。未提供副模型 Key 时，前端可以改用主模型档案。辅助任务失败不会撤销已完成的剧情。

## 4. 文本向量

`POST /api/embeddings`

```json
{
  "texts": ["需要编码的公开记忆"],
  "profile": { "id": "embed", "name": "向量接口", "providerId": "approved-provider", "model": "embedding-model", "temperature": 0.7, "maxTokens": 1600 },
  "key": "仅本次请求使用"
}
```

```json
{ "vectors": [[0.12, -0.08, 0.3]] }
```

向量数量必须与 texts 一致，非空、数值有限、维数不超过 8192。同一模型必须使用稳定维数，服务端验证模型支持 embeddings。前端保存模型指纹和原文，再由本地 Worker 排序。索引批次最多 16 条，查询编码一条输入。

## 下一次后端接入的顺序

1. 朋友验证和会话，服务器配置批准的模型供应商。
2. 接通 generate，服务器内读取私有设定，先完成文字流。
3. 按公开字段协议提供有效 outcome。
4. 接通 utility 和 embeddings。
5. 把示例公开角色、地图和游戏时间改成正式结构，并新增版本化的公开资料接口；不能在此过程中返回私有原文。

本地预览的 `/api/*` 返回 404，不假装真实接口已经存在。

