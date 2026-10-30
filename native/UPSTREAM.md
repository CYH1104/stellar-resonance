# 原版酒馆代码

`SillyTavern/`直接取自官方仓库 https://github.com/SillyTavern/SillyTavern ，固定提交 `06bde939fb1e9c4c8d8641d810f0a916b5bce127`（1.19.0）。直接复制Git原始文件内容，保留原LICENSE、原接口、原文件存储、可执行权限及原生前端依赖；没有改写原生源码。

安装和启动直接调用原版命令：

```
npm run native:install
npm run native:start
```

原生命令参数正常放在外层npm的`--`后，例如`npm run native:start -- --port 8001 --browserLaunchEnabled false`；无需再加第二层分隔符。配置路径和数据目录使用原生`--configPath`、`--dataRoot`选项。

原生默认在自己的目录读配置和用户数据。现有学院CSS和页面保留；目前尚未完成把学院前端全部操作绑定到这个原生入口，不应把“原版已引入并运行”表述为“换皮及旧存档迁移全部完成”。普通原项目启动方式和线上8807/9000本轮不切换。

学院聊天皮肤的第一阶段现通过真正的第三方扩展接入：先运行 `npm run native:skin:install`，再按上述 `native:start` 启动。扩展使用原版 `getContext()`、生成、消息格式化和保存流程；预设、世界书、人设等管理操作仍进入原版面板。原版跟踪源码不改动，完整学院业务/页面和旧资料迁移尚未完成。范围、验证和下一步见 [阶段交接](../docs/handoffs/2026-10-30-native-academy-entry.md)。

后续兼容只做学院页面/特有功能与原生API的连接；不再写一套替代原生的JSONL编码器、workspace文件库和保存状态机。旧浏览器资料保留，迁移须验证全部数据，不自动删除旧库。

指定酒馆助手仍按原固定版本单独安装，不因复制酒馆主仓库就宣称助手玩家界面已接通。
