# 第三步验证结果与保护边界

日期：2026-10-28；分支rebuild/sillytavern-native；基于ff94d1f。结论：**代表性原生行为验证通过；私有资料/思考锁定验收未通过，暂不进入全面功能迁移。**

后续：用户已授权修正，新受控路径的实施与范围验证见PROTECTION.md。下文原生默认暴露证据保留，不因新路径增加而改写为通过。

这是运行真实上游模块所得的结果，不是对现有公网系统的漏洞报告，也不是声称整个预设生态已经兼容。没有修改生产server/src、使用真实角色卡/Key/存档或部署。

## 本次实际执行

使用第二步同一锁定版本的原生酒馆与助手，另开8840和`.integration/native-step3/data`，不接入8833的玩家预览数据。原生浏览器通过真实`Generate(..., true)`组装提示词，记录`CHAT_COMPLETION_PROMPT_READY`事件；不是复制几条字符串模拟PromptManager。

从锁定上游读取官方`default/content/presets/openai/Default.json`，经助手`importRawPreset`走原生预设保存/加载，再在该预设上添加合成验证条目。等待上游`getPresetApplicationPromise()`完成后操作，避免loadPreset的同步返回误当全部应用结束。

世界书通过真实助手接口创建并绑定，走原生世界书扫描；使用合成关键词和内容，不读取作者资料。脚本通过真实`replaceScriptTrees`安装到助手全局脚本树，由助手自己的iframe runner执行，不是仅在Playwright里直接调用几个函数就称脚本运行成功。

## 16项代表性行为

1. 官方Default原始预设成功导入。
2. 原生完整Generate dry-run组装消息。
3. user/char宏展开。
4. 原生实验宏引擎的嵌套setvar/getvar展开；旧宏与实验宏模式分开记录，不擅自永久切换用户选项。
5. 自定义预设条目的相对顺序。
6. 停用预设条目不进入请求。
7. 深度0注入与assistant角色保留。
8. normal专用触发在regenerate时不执行。
9. 世界书关键词激活与递归激活。
10. 原生世界书输出顺序（本夹具结果LORE_B在LORE_A前，不凭直觉重新排序）。
11. 停用与概率0条目不出现。
12. 无关键词时不激活。
13. 预算cap=1排除超预算条目。
14. 完整Generate将世界书深度2条目以assistant角色插入。
15. 真实助手脚本执行并写读聊天变量。
16. 没有调用任何模型生成端点（dry-run）。

最终pageerror=0、HTTP失败=0。原生默认Horde连接的状态/列表请求被明确以空响应替代，避免无关外部访问；**这两项后台状态请求做了mock，提示词编排/世界书/宏/助手执行没有mock**。所有浏览器外部HTTP(S)被阻止；不能拿这项设置当助手原生自带的外联限制。

## 实际复现的原生暴露面

只用`SYNTHETIC_PRIVATE_CANARY_8840`和`synthetic-key-only`合成内容。

| 检查 | 实际结果 | 对学院方案的含义 |
| --- | --- | --- |
| 助手getCharacter读取description | 可以读取合成私有标记 | 不能把完整私有卡加载到玩家原生页面 |
| 助手iframe脚本读取当前角色描述 | 可以 | 不能靠禁用角色卡编辑UI保护原文 |
| iframe访问parent.document | 可以 | iframe不是默认安全隔离 |
| iframe读parent.localStorage | 可以读到合成值 | 同源保存Key且允许不受限脚本时存在读取风险；本测试没有真实Key |
| iframe用父页面请求头调用同源API | 可以访问角色列表接口 | 只包一层助手函数白名单不等于限制原生接口 |
| iframe修改show_thoughts | 能改回true | 浏览器取消勾选不是服务端强制关闭 |
| 官方Default默认request_thoughts | true | 导入预设后必须重新施加服务端策略 |

测试进程退出码0表示**上述原生行为和暴露事实按断言复现成功**。报告`privacyGatePassed=false`才是保护验收结果，不能用“脚本运行成功/测试通过”替代保护通过。

## 另外发现的预设数据风险

本夹具直接在原生预设条目设置`injection_trigger=['normal']`，原生normal/regenerate按其执行。随后经助手的类型化`getPreset → replacePreset`往返，该字段丢失，报告`helperTypedPresetRoundtripPreservesInjectionTrigger=false`。

这不是说原生预设不能执行触发，而是**不能把助手类型化Preset对象作为原生原始文件的唯一存储**。学院编辑器应以原始JSON为权威，保留未知字段与扩展元数据；助手脚本修改已知字段时合并到原结构，并做真实往返验证。本轮仅登记问题，未改上游助手实现。

## 需要收紧的设计（未实施）

1. 服务端保管完整角色卡、私有世界书、最终宏展开和完整消息组装；玩家页面只拿公开资料、玩家自有文件和诊断摘要。最终提示词不送回玩家浏览器。
2. 私有编排环境不执行玩家任意JS。原生/助手脚本若必须在玩家端运行，只能处在没有私有卡/Key的环境；与凭据、私有编排隔离。依赖原生父DOM、完整角色卡或完整提示词的脚本明确受限，不能承诺无限制兼容。
3. 在实际模型出口强制关闭思考返回，并在响应流下发前分离已识别思考字段/区块；预设与脚本不能覆盖服务器策略。对协议必要签名仅内部保留，不能盲删破坏后续工具调用。没有标记的模型正文复述仍无法保证绝对识别。
4. 普通客户端不能访问原生角色卡/全用户导出/凭据等后端接口；原生运行端口仅内部使用，学院反向代理显式白名单，身份由服务器绑定。禁止仅隐藏原生页面、仍开放原生完整API。
5. 若继续复用原生浏览器编排，可探索**服务端自有的无头浏览器编排worker**；原生DOM依赖留在服务端。该路线有浏览器资源、会话隔离、并发串行、取消、超时和维护成本，**本轮没有实现或证明其生产可用**。
6. 另一条路线是把编排与宏/世界书依赖改造成服务端可执行模块，需逐一适配浏览器依赖并持续对照固定上游。直接Node import本轮首先因`/scripts/i18n.js`浏览器绝对路径解析失败；这证明“直接导入即可用”不成立，不证明无法移植，也没有完成全部依赖成本审计。

这些是对已有“服务端私有编排”要求的具体化，不是取消原生酒馆方向。目前不能声称这六项已经实现。因此第三步整体保护关口仍未通过，不进入账号/终端等大面积迁移，也不发布公网验证版。

## 复现

按README准备锁定的上游依赖，开启专用环境：

```powershell
node experiments/native/start-compat.mjs
```

另一个终端指定与第二步相同的PLAYWRIGHT_MODULE、CHROMIUM_PATH，再运行：

```powershell
node experiments/native/compatibility-smoke.mjs
```

可用NATIVE_RUNTIME/NATIVE_HELPER指定目录，NATIVE_COMPAT_ORIGIN仅允许IPv4回环HTTP。脚本核对两个Git提交、已安装助手bundle与锁定源码bundle哈希一致，记录官方Default SHA-256。

结果写`.integration/native-step3/compatibility-report.json`，包括16项逐条结果、暴露事实、隐私关口和mock范围；合成消息和截图亦在该目录。脚本退出清除全局测试脚本、合成storage值并关闭思考显示；不抹掉其他人真实资料，因为使用的是独立合成数据根。

本次没有改持久化schema、跑付费模型、测试真实用户预设或证明任意扩展兼容。四项现有终端缺陷仍未修复。
