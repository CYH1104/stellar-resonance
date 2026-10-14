# 网页保密与访问边界

## 保护对象

作者完整世界书、隐藏人设、私有正则与规则；玩家 Key；各玩家的身份、聊天、变量、记忆与存档。

## 服务端边界

作者资料存于可信服务端，不能进入网页 JavaScript、静态素材、source map、浏览器缓存或导出的玩家存档。所有作者管理入口独立认证授权；玩家资源先校验归属再操作。

先筛选可见性和解锁状态，再触发世界书与拼装 Prompt。模型输出作为不可信建议，由服务端校验更新范围、权限和事件条件。私有剧情 Worker 仅经资源绑定访问。

模型入口由服务端 providerId 映射固定 HTTPS 域名和路径，限制请求、连接与参数，避免内网目标和跨白名单重定向。浏览器不提交任意 baseURL。

## 网页与 Key

Key 默认只保留当前页面内存，刷新或退出后重新输入；不放入 URL、localStorage、sessionStorage、IndexedDB、Service Worker 缓存或服务器数据库。TLS 请求中 Gateway 和认可的供应商仍然会处理 Key，应明确告知玩家这一流程。

认证方案在实现前确认。若使用会话 Cookie，使用 HttpOnly、Secure、适当 SameSite 并进行所需 CSRF 校验；若跨域部署，限制实际允许来源。CORS 本身不能替代认证与资源授权。

模型 Markdown/HTML 作为不可信内容。采用经过评估的安全呈现策略，默认限制原始 HTML、危险 URL 与自动加载的外部图片/追踪资源；验证 XSS 样例。错误与日志不包含完整私有 Prompt、Key 或隐藏正文。

主题与公开偏好可持久保存；聊天和变量通过已认证云端 API 恢复。敏感响应明确设置缓存策略，避免公共缓存或 PWA 离线缓存收集玩家资料。

## 能力边界

玩家可以查看网页代码、接口响应和浏览器存储。资料是否保密取决于是否向客户端下发，而不是网站或安装包的形态。

模型供应商处理注入片段。玩家自选 Key 或中转站可能让请求日志对玩家可见；白名单不能保证站点隐藏请求。核验上游处理方式，并且只注入当前已授权的最少内容。

已注入模型的设定可能通过反问或生成结果透露；提示词约束和输出检查不能提供绝对保密。未解锁秘密根本不进入当前上下文。解密后交给客户端的内容应视为可被提取。

## 网页内测门槛

核心引擎测试、两名玩家跨资源读写删除隔离、未授权作者入口测试和目标浏览器验收通过；Key 与隐藏资料不在客户端、缓存或日志；取消与断线恢复可用；反馈和回退说明齐全。

参考：[OWASP 前端安全](https://cheatsheetseries.owasp.org/cheatsheets/Web_Frontend_Security_Cheat_Sheet.html)、[OWASP LLM 注入防护](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)。
