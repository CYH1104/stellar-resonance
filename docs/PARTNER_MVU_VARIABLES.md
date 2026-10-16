# 状态变量（当前实现）

当前使用每轮结构化状态更新驱动界面，尚未运行酒馆 MVU 脚本引擎。变量与剧情、论坛、小剧场、建议在同一次剧情请求中生成，不另发状态请求。

人设填写初值 → 服务器提供当前变量和变更规则 → AI 在正文后返回隐藏 SR_STATE → 后端与前端校验 → 完整回复提交 → 状态栏读取当前变量。截断或校验失败不提交，旧状态保留。切稿／回退／读档会重放对应回合更新。

| 变量 | 含义 | 初始值与变更 |
| --- | --- | --- |
| player.mentalPowerLevel | 玩家的精神力等级 | 人设填写；只在已有规则支持且剧情明确发生评级变化时更新，无规则维持原值 |
| characters[id].mentalPowerLevel | char 的精神力等级 | 服务器资料已有明确等级时提取；之后按同样规则更新 |
| characters[id].affinity | char 对 user 的好感度 | 当前范围 −100～100；初见按人设关系与实际互动生成，此后沿用数值并随事件变化；正式增减规则待定 |
| characters[id].present | 是否在场 | AI 根据主线剧情判断 |
| player.spiritThought / characters[id].spiritThought | 精神体 OS | 每轮按剧情生成，精神体种类必须已有设定 |
| characters[id].innerThought | char 的内心想法 | 由剧情生成；不生成玩家本人内心想法 |

字段定义：src/domain/contracts.ts。校验、合并、读档和回退：src/domain/story.ts。服务器变更指令及协议整理：server/ai.mjs；补修指令：server/story-stream.mjs。状态展示：src/components/ActorCard.vue。

精神力等级为最多100字的字符串，支持用户世界观自己的等级写法；没有擅自规定 S/A/B 等级顺序、升级经验或阈值。提供正式好感度、等级升降规则后，应将规则加入服务器指令，并将能确定的阈值／边界加入服务端校验。无需把整张角色卡或私有规则放在前端，也无需让玩家每轮手动填写变量。
