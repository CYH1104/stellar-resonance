# 群聊包含玩家成员时整份通讯被丢弃

基于 main 05c791d，已保留伙伴手动保存、终端时钟及课表修复。

用户提供的 terminal.groups.members 为 ["player", "pro-03", ...]。程序群成员内部只保存 NPC，玩家通过 joined 隐含加入；cleanTerminalBatch 原先将 player 当作未知 NPC，整份终端数据变为 STATE_TERMINAL_RETAINED，通讯列表为空。

只在群成员校验前移除显式 player，使用现有隐含加入表示；ownerId/adminIds 仍按既有权限规则校验，不添加好友或改变权限。已有固定群的成员比较也采用规范化结果。提示词明确 members 列 NPC，不重复列 player；messages 仍禁止模型代玩家发言，未知 NPC、固定群元数据改写等校验保留。

新增服务端回归先复现缺失，然后验证主模型解析 -> finishVariant -> applyTerminalBatch -> 备份导入 -> 活跃分支消息可见，首次初始化及已有群后续回复均接受显式 player，重复应用不重复消息，player 发言仍拒绝。

验证：前端 94 文件 487 项通过；后端 346 项中 342 通过、4 项跳过；类型检查通过。合成响应，无真实模型调用。

限制：没有读取用户实际存档；用户粘贴 JSON 末尾本身不完整，本次复现针对可见群结构。其他独立格式错误或真实输出截断仍可能拒绝通讯。旧服务已丢弃且存档中不含 terminal 的消息无法仅刷新还原；不清理或改写玩家现有存档。
