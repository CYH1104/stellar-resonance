# 2026-11-26 记忆数据库改造交接

用户授权：参考 AlbusKen/shujuku@naiv1.3.7 改进记忆；存档迁移和狼人杀仅给方案；最多2个代理，本轮未使用代理；只部署9000，8807不动。

起点：本地与GitHub main均为 `01dbc47bcf31e503b746f93902499a589041f152`。服务器代码 `d792fdf21fb3aca4a7ce97d31549321928af3688`，9000 release `5b14e87412c11181`。8807基线 release `2714ea237e363c84`、PID `2955979`、instance `3523bfac9402aab5678d61a0b402ca69`，终端资源SHA256 `58bc6cc9976e1d8d4d375ce6b2d642862a434945e5fe136780d559bcd7f2518a`。

已完成：六类记忆表、筛选分页、来源跳转、字段编辑、修订/向量失效/写失败回滚；模型注入预览共用正式组装逻辑；当前约定先按剧情顺序汇总状态，避免旧open结构化约定再次作为待办召回；旧历史保留且分支可恢复；隐藏历史延迟渲染。未新增存储schema或第三方依赖；未执行/打包参考脚本。

新入口：`src/domain/memoryCommitments.ts`、`memoryInjection.ts`、`memoryDatabase.ts`；界面 `MemoryDatabasePanel.vue`、`MemoryRecordEditor.vue`；实际接入useWorkspace及usePersonalTerminal。原始表单和来源账本共用字段编辑器。

验证：最终全量前端194个文件、1193项测试全部通过；Linux隔离后端541项全部通过；vue-tsc及生产构建通过。旧约定最近更新的优先级已增加红转绿回归，按最新剧情出现顺序排序。定向编辑/跨页冲突/失败恢复/本地与云端往返测试通过。真实浏览器使用合成23轮存档，验证分页、地点修改、搜索更新、知情/非知情角色预览，390px页面无横向溢出，表格内部可横滑，控制台无error。未调用真实外部模型来评价自然语言记忆质量。

agent-hub指定脚本 `D:/QQ/QQ文件/agent-hub/hub.mjs` 不存在（开工status/read均MODULE_NOT_FOUND）；无法取得在线接力信息。未声称持棒成功，工作区与远端一致且本轮没有子代理写入。最终handoff继续记录相同限制。

下一步：用户评估9000新记忆界面和狼人杀方案。未经进一步请求不迁移存档、不实现狼人杀。完整方案见 `docs/MEMORY_DATABASE_AND_WEREWOLF_PLAN.md`。

测试环境说明：Linux隔离验证前两次因临时目录缺少dist/依赖、SVG行尾不同失败；补齐构建、依赖及对应静态文件后最终全量通过。生产构建仍提示主包超过500KB，该提示不是构建失败；未以本轮验证宣称所有性能瓶颈已消除。

## 发布收据

- 功能提交：`849d7aed8633ca37fc0c4669f2e4217ca7dd953c`，已正常快进推送GitHub main。
- 仅9000更新：release `23098fec2118ff0f`，PID `1069469`，instance `e72f80e06b7d9d8615e0faa59991e684`。
- 服务器10个关键源码文件与功能提交逐字节一致；原生Node导入预检通过；last-deployed-main指向该提交，无pending release。
- 公网9000健康检查通过，39个JS/CSS文件SHA256与发布目录全部一致。
- 8807仍为release `2714ea237e363c84`、PID `2955979`、instance `3523bfac9402aab5678d61a0b402ca69`，原终端资源SHA256未变。
- 首次Node公网检查因未使用本机HTTP代理连接超时；curl独立检查两端均HTTP 200，Node加 `--use-env-proxy` 后完整校验通过。
- 收工agent-hub handoff仍因指定脚本不存在而失败；已用本文保留完成项、验证和下一步，没有声称在线交接成功。
- 本轮未开启子代理，未迁移用户存档，未实现狼人杀。发布后的收据文档提交不需要再次重启服务。

清理：已停止本轮5199预览服务；临时SSH私钥因只读ACL首次删除失败，随后仅恢复当前用户对该单一文件的权限并删除，已核验文件不存在。
