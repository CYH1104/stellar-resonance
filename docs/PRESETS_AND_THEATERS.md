v0.7.1：导入支持 `role: "model"`，转换为 `assistant`（模型发言），显示转换条数；启停、排序和位置不变。参考 [Gemini Content 角色定义](https://ai.google.dev/api/generate-content#Content)。

v0.7.0：采样参数编辑、导入应用和导出使用当前选中的剧情接口（主 API 或副 API）。

# 酒馆预设与小剧场 v0.6

v0.6.2 修复：取消导入250条和全库30万字限制。5MB文件大小边界保留，全部条目正常存档；客户端只把本轮有效条目提交后台，后台也独立按启用状态、占位、内容与触发时机筛选，再检查本轮有效文字是否超过30万字。停用条目仍可查看与编辑，不发送到模型。空 prompts 使用单独的“列表为空”错误，不能把所有 JSON 报错混同为格式错误。

## 预设兼容

以 SillyTavern 官方 [Prompt Manager](https://docs.sillytavern.app/usage/prompts/prompt-manager/) 和 [默认 Chat Completion 预设](https://github.com/SillyTavern/SillyTavern/blob/release/default/content/presets/openai/Default.json) 为结构参考。

| 内容 | 当前处理 |
| --- | --- |
| 文件选择 | 本机读取 JSON，最多5MB，不上传原文件 |
| `prompts`、`prompt_order` | 分组导入，保留名称、标识、启停、顺序；优先角色分组100001，其次第一个分组 |
| 多份预设 | 保留在本地，可选择一份用于当前生成；不会把所有预设一起发送 |
| role | System、User、Assistant，实际进入相应消息角色 |
| injection_position/depth/order | 支持历史内按深度和顺序插入；深度0在当前输入之后，1在当前输入之前 |
| 历史前后 | 按聊天历史占位的前后顺序判断，亦可在可视化列表中修改 |
| injection_trigger | 保留官方字符串触发类型；本项目实际使用 normal、regenerate，其他时机不会执行 |
| 采样 | Temperature、最大输出 Token、Top P、Frequency penalty、Presence penalty；导入时应用到当前剧情接口档案 |
| 占位 | 角色／世界／历史资料由服务器统一提供，列表仅显示占位；不会让预设撤掉必需作者设定或输出协议 |
| 占位文本 | 替换 `{{user}}` 与 `{{char}}`；多 NPC 世界卡中 char 表示当前场景角色。复杂宏不执行，会提示检查 |
| 脚本／正则／扩展 | 不导入、不执行，显示兼容说明 |
| 地址／模型／Key | 不从预设文件导入，避免改变已确认的服务地址或保存凭据 |
| 旧三字段预设 | 仍可导入；不再要求所有文件都必须是这种格式 |
| 文本补全模板 | 提取可识别的系统与后置文字；不执行专属上下文模板 |

文件里未知的厂商参数不会全量转发。导入说明列出适配边界，不声称完整酒馆运行环境或脚本兼容。导出生成酒馆结构的 JSON；私有世界设定不包含在其中。

原报错已在实际 `useWorkspace.importPreset` 入口复现：最小 prompts + prompt_order 文件被旧三字段白名单拒绝。回归命令：`node node_modules/vitest/vitest.mjs run tests/preset-import.test.ts`。修复后相同输入通过。没有修改用户原文件，也没有执行预设扩展。

## 四个小剧场

1. 论坛：虚构校园微博动态，保留点赞／评论和来源定位。
2. 群聊：以发言人和消息列表展示独立日常交流。
3. 自定义位置：可用同人文、角色访谈、精神体日记、课后碎片或自行编辑要求。
4. 第二个自定义位置：同样可选择模板或自由填写。

每个位置可以关闭，最多4个。设置在当前网站的本地偏好中，启用／修改从后续生成开始生效；不会重新收费生成已经存在的旧稿。小剧场属于当前存档的有效稿件，切稿、回退后读取相应内容。主线事件记忆不拼接小剧场正文；模型也被要求不把番外作为已发生主线事实。

同人文包含明确的 participantIds：`["player","某个已知charID"]`，拒绝 char-char 元数据。配对计划由服务器根据明确人设生成，模型不能用选择小剧场搭档来改变在场状态。双方明确为男性时识别 BL，攻受看玩家明确偏好；男女搭配时看明确 BG／GB 偏好；缺少第一性别或偏好时标记待补充，不用 Alpha／Omega 和性格推定。若原始设定以后补齐，服务器继续使用正式资料。

提示词约束能指导内容，但不能把生成模型的语义遵循当作绝对保证；实际文风、是否复述和角色表现仍需真实模型试用。当前结构化检查验证位置、字段、已知搭档和配对元数据。

## 精神体与好感

原 pro 数据的 `str` 含“精神体 …”标签，从中提取种类；`shos` 是人物外号，不作精神体。模型只能更新允许公开的 `spiritThought`，不能改写固定种类。原资料缺少的种类和好感度仍保留未提供，不补设定。user 状态卡列出所有已登记 char 的好感，不只在场人物。
# v0.13 独立预设与固定思维链过滤

顶部“预设”独立于模型设置。提示词列表、库中未插入项、相对排序和跨历史占位拖动、深度注入、多选触发、角色、草稿保存／取消、新建／副本／改名／删除确认、导入导出均接通；每份参数独立存于 Preferences.presetParameters，按白名单覆盖剧情 profile，不导入地址、模型或密钥，不影响摘要与建议接口的基础采样。固定提示词不可删除，可启停；服务器设定和结构化协议始终受保护。

参考官方 [Prompt Manager](https://docs.sillytavern.app/usage/prompts/prompt-manager/) 与 [Reasoning](https://docs.sillytavern.app/usage/prompts/reasoning/)。同深度按 User／Assistant／System分组，再按Order排序；深度注入不受相对拖动位置影响。并非复制上游代码或引入完整运行时。下方旧版说明中“模型与预设”入口已迁移，最新入口为顶部“预设”。

思考展示固定关闭，导入文件不能覆盖。API独立reasoning_content、reasoning及thinking块不会被转发；固定标签解析器在正文协议之前运行，跨流式字节、续写、嵌套及未闭合保护。已识别的Think/Thinking/Think_rules/Analysis/Reasoning/Cot/Scratchpad等块和HTML注释不进入聊天、自动记忆、状态或导出，旧存档读取同步清理，向量文本有污染时丢弃索引。角色想法及精神体OS普通文字保留；玩家手工预设内容和笔记不改写。不能声称通用语义识别器可以识别任意无标记推理。

