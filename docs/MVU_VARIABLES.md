# MVU 变量系统

依据用户提供的 `MVU_VARIABLES.md`，实现 MagVarUpdate 0.193.0 的变量协议兼容层，以及酒馆助手中所需的聊天／消息变量接口。这里不是完整的 SillyTavern、MagVarUpdate 或 JS-Slash-Runner 运行环境；没有加载远程 bundle，也不执行模型返回的 JavaScript。

参考来源：

- [MagVarUpdate 0.193.0](https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@0.193.0/)，重点参考 `src/function/global/index.ts`、`src/function/update_variables.ts`、`src/variable_def.ts` 的协议和接口定义。兼容层为本项目独立实现。
- [JS-Slash-Runner / Tavern Helper](https://gitlab.com/novi028/JS-Slash-Runner)，仅实现本页面需要的变量接口，不安装完整扩展。

## 变量和隔离

每个会话从自己的人设和服务器公开初始状态构造变量，不读取其他会话。变量不另发模型请求，随正文生成；旧 SR_STATE 输出和旧存档仍可使用。

```json
{
  "stat_data": {
    "player": {"id":"player","name":"玩家","present":true,"mentalPowerLevel":"填写的等级"},
    "characters": {"实际角色ID":{"id":"实际角色ID","name":"角色姓名","present":false}},
    "custom": {}
  }
}
```

角色字典使用服务器角色 ID，而非姓名或数组位置。`custom` 用于本会话额外的 JSON 变量。返回数据为副本，修改副本不会自动写入存档。

| 字段 | 规则 |
| --- | --- |
| player.mentalPowerLevel | 从人设中的精神力等级初始化，最多100字；没有明确世界规则和主线评级变化时维持原值 |
| characters[id].mentalPowerLevel | 从服务器明确标注的精神力等级提取；不猜测等级顺序或升级阈值 |
| characters[id].affinity | −100～100，首次按已知关系及互动生成，之后按实际事件渐进变化 |
| characters[id].present | 根据本轮主线完整在场名单判断 |
| player.spiritThought / characters[id].spiritThought | 已有精神体时才生成本轮精神体 OS |
| characters[id].innerThought | 可展示的角色内心想法，不生成玩家内心想法 |
| player.identity | 依据主线明确发生的入学、任职等身份变化更新 |

固定姓名、性别、角色 ID 和精神体种类不能通过模型 MVU 更新修改。好感度边界是确定性校验；等级升降仍按已知世界规则约束模型，未杜撰数值门槛。人设编辑仍由人设档案页面完成。

## 同轮输出

```text
正文……
<UpdateVariable><JSONPatch>[
  {"op":"add","path":"/characters/实际角色ID/affinity","value":12},
  {"op":"add","path":"/custom/地点","value":"接待区"}
]</JSONPatch></UpdateVariable>
<SR_STATE>{"presentCharacterIds":["实际角色ID"],"characters":[{"id":"实际角色ID","affinity":12}],"event":"本轮摘要"}</SR_STATE><SR_DONE>
```

论坛、小剧场、精神体 OS 和骰子后果仍按已有 SR_STATE 协议完整返回；开启功能时不能省略。MVU 块可以在 SR_STATE 前，或在 SR_STATE 后、SR_DONE 前。两个块若同时更新同一字段，数值必须一致。

支持 JSONPatch 的 `replace`、`add`、`remove`、`move`、`copy`、`test`，以及 MVU 的 `delta` 和 `insert`。支持 JSON Pointer 转义和数组插入。replace/delta 必须指向已有路径；新增可选字段使用 add。

兼容常用旧命令的字面值形式：`_.set(path,new)`、`_.set(path,old,new)`、`_.add(path,delta)`、`_.insert/assign(path,key,value)`、`_.insert/assign(path,object)`、`_.remove/unset/delete(path[,key])`。允许字符串、数字、布尔值、null 和标准 JSON 对象／数组；不会运行表达式、函数调用、Math、任意脚本或 JSON5 对象语法。数组追加可用 JSONPatch 的 `/-`。没有实现旧 MVU 的描述值自动转换、任意 Zod/schema 脚本和世界书初始化扫描。

## 提交和恢复

完整正文、变量块、状态块和 SR_DONE 全部校验通过后才提交。流式中间内容只更新正文；截断、停止或无效更新不会提交变量。MVU 控制文本不显示在正文。现有的有限续写／补修机制继续适用，不为 MVU 另设常规请求。

每一稿保存自己的操作序列，并从会话初值重放，因此 delta 不会重复累计。切稿、回退、读档使用对应稿件的变量；未完成稿不提交。导出／导入保留操作、自定义变量和消息级修改；写入均校验路径、有限数值、体积和原型污染字段。

## 浏览器兼容接口

- `Mvu.getMvuData(options)` / `Mvu.replaceMvuData(data,options)`
- `Mvu.parseMessage(message,oldData)`，解析变量块或裸 `_.set` 等字面值命令；返回新副本，需 replace 才持久化
- `Mvu.getMvuVariable` / `Mvu.setMvuVariable`，以及旧的 `getCurrentMvuData` / `replaceCurrentMvuData`
- `getVariables` / `replaceVariables`，同时暴露为 `TavernHelper` 的对应方法
- `eventOn`（返回含 stop 的句柄）、`eventEmit`，以及 `getCurrentMessageId`
- `Mvu.events.VARIABLE_INITIALIZED` / `VARIABLE_UPDATE_ENDED`：进入会话及已提交状态改变的通知；`VARIABLE_UPDATE_STARTED` / `BEFORE_MESSAGE_UPDATE` 仅用于显式 replace 的可变数据钩子。回调接收隔离数据，不直接改写已保存状态。

变量作用域只支持当前会话的 `chat` 和 `message`；其他作用域明确报错。消息编号为0开场、1首条用户、2首条回复，依此类推；负数从最新消息倒数，`latest` 为最新位置。用户消息读取上一条已提交状态。显式写入一条完整回复时保存到该稿独立覆盖记录；写入开场时修改本会话初值。生成过程中不能写变量，跨会话或状态变化后的过期写入会被拒绝。

预设条目支持 `{{get_message_variable::stat_data}}`、`{{get_message_variable::stat_data.custom.字段}}` 和同路径的 `{{getvar::...}}`，按当前会话变量替换。没有实现 EJS、世界书、slash 命令、脚本执行器、全局／角色跨会话存储或完整酒馆 API。

核心实现：`src/domain/mvu.ts`、`src/domain/story.ts`、`src/app/mvuBridge.ts`、`server/ai.mjs`。测试：`tests/mvu.test.ts`、`tests/mvu-bridge.test.ts`、`tests/mvu-protocol.test.mjs`。


## v0.20.5 资料补充

人物资料新增独立的 ability（异能），不与 identity（院系／职位）混写。user 人设的精神体资料支持 spiritName、spiritAppearance、spiritPersonality、spiritAbility，并进入模型上下文。精神体 OS 保持 spiritThought，按精神体性格生成即时内心独白。世界书作为补充设定注入，不替代既有 MVU 更新协议。
