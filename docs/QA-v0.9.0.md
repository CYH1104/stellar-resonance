# v0.9.0 按功能选择 API 与向量教程

日期：2026-10-15。

文字任务分别使用 storyProfile、summaryProfile、suggestionsProfile、personaProfile，默认全部主 API。旧版剧情显式选择保留；新增选择默认主 API，不再自动挑第一个副 API。主 API 始终必填；副 API 仅在被某功能选用时要求完整和确认。全空或未选用草稿不阻拦，重排副 API 不改变路由，删除副 API 让所有引用它的任务回到主 API。向量独立且按开关必填。确认按钮登记必需及已完整配置的接口，跳过未选用的不完整草稿。

测试验证主 API 独用时五轮剧情的摘要／建议调用均为主 API；另一个场景把剧情、摘要、建议分别交给不同接口，检查实际请求档案和临时 Key；AI 人设辅助也检查独立接口。备份、刷新本机凭据恢复保留四项任务选择；主 API 即使没有被任务直接选用仍必填。建议接口故障不会阻断独立摘要接口的第五轮摘要。

向量设置旁内置新手攻略，含注册／登录、按平台要求认证、创建 Key、地址及模型填写、开启和建立索引、常见错误。官方价目表 https://www.siliconflow.cn/pricing 于2026-10-15核对：BAAI/bge-m3、BAAI/bge-large-zh-v1.5、BAAI/bge-large-en-v1.5 标为免费；Pro/BAAI/bge-m3 收费。注册与Key流程参考 https://docs.siliconflow.cn/docs/userguide/quickstart ，接口参考 https://docs.siliconflow.cn/docs/api/embeddings-post 。教程明确不保证永久免费或不限流，以账号当前模型详情为准。没有代用户注册、实名认证、创建 Key 或发送付费请求。

本轮测试使用合成档案与 Key，不读取真实 Key。本机凭据保持原 IndexedDB 记录与备份隔离，不升级数据库或清除已有设置。此前浏览器读取被策略拒绝，本轮未绕过；视觉仍待用户试用。

最终结果：64项前端／存储／工作区测试、37项服务器／模型适配测试，共101项通过；类型检查与生产构建通过。本机 v0.9.0 按正常网络权限启动，health 版本已核对，仍使用 http://127.0.0.1:5173/。
