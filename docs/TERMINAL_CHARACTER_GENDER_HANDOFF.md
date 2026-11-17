# 角色性别与终端世界书上下文修复

## 现场诊断

9000 test当前结构化角色卡为`pro-11 / 颜 希`，`primaryGender=男`、`sex=Omega`。编辑后台世界书有已启用的常驻条目，明确写“性别:男omega”及“详细设定:男性”。正文构造会选中该常驻条目；但既有普通终端 actor摘要仅投影id/name/identity/relationship/title/description，不含primaryGender、secondaryGender，也不接服务器worldbooks。终端模型因此会从姓名/ABO/语气自行猜性别。

## 修复

新增`server/terminal-character-context.mjs`：
- 结构化服务器角色卡/authoritative roster性别字段以id为准；primaryGender与secondaryGender独立，未明确保持未明确，不从ABO猜第一性别。
- 终端实际persona、命令/占卜专用匿名约束仍在；personaReference不是NPC自动知情。
- 服务端世界书沿用activeWorldEntries、resolveWorldbooks的开关/触发/角色筛选；再按规范化角色名标题分段。只把明确归属到当前可访问角色的段落给该角色的任务；段落涉及多个角色或无归属时不向定向actor转发，避免通用包覆盖私密设定。server原始数据不改写。
- 正文promptState与独立authoritative gender system block附带性别事实，不恢复displayFields或hiddenPrompt原文至全体正文上下文。
- party及十一点半脱敏自己的接口载荷后追加actor reference；十一点半仍不会把牌、choices或玩家rawText放入公开talk请求。command保持匿名且不注入玩家性别/玩家profile；NPC divination仅加入target，不加入玩家persona。
- 服务端app路由须调用`terminalPlan(source,data,privateBooks)`及`terminalFollowupPlan(...,privateBooks)`。

## 验证

`tests/terminal-character-context.test.mjs` 7/7通过，覆盖颜希男Omega、客户端冲突字段不覆盖权威、未知性别不推断、终端/主线自动/补修/聚会任务、private/world lore heading范围、匿名命令、NPC占卜玩家隐私、正文enabled/disabled状态协议。另测worldbooks 22项、terminal-private-chat 7项、terminal-workflow 1项、party API 17项通过；`pnpm check`通过。

服务器上管理后台总条目的其他角色资料按分段/定向规则选择；无法明确归属的文本不猜测式分配。引用是扮演参考，不代表角色自动知晓他人秘密。未改世界书私有文件、角色资料或存档。

## 邀请界面与异步等待

聚会重新邀请使用终端内居中小弹窗，发送同步捕获目标/留言/房间后立即收起。pendingInvite表示当前等待的角色，顶部返回优先回房间列表；PartyGameRoom第一次进入后保持挂载并v-show切页，返回终端其他页不会取消请求。请求完成按捕获的存档/房间写入；失败重试不读取已清空的输入框。切存档、关闭终端能力或切换API会阻止迟到写入。全局terminalBusy避免另一终端写入操作覆盖后台邀请。

## 集成验证及发布约定

完整前端898项通过，服务端490通过/5跳过，类型检查和构建通过。最后并发保护补丁另跑28项终端/邀请定向回归及构建通过。真实HTTP测试验证私有世界书+颜希男Omega+当前用户人设进入上游提示且不暴露世界书原文；模拟邀请回信测试验证发送即关闭、列表等待、回信正确房间以及失败重试。

仅发布9000，8807和8088不修改。AGENTS约定的旧D盘agent-hub工具仍不存在，交接由本文件记录，不声称已完成hub读写。模型实际回复仍需用户刷新后验证，程序不重写历史性别错误。
