import {cleanTerminalMainContext} from '../src/domain/terminalMain.ts';
export function terminalMainPrompt(raw,state){if(raw===undefined)return '';const c=cleanTerminalMainContext(raw,state.characters);return `
[个人终端自动通讯，与正文同一API响应]
本轮自动群聊、角色主动私聊、必要的默认群初始化、好友主动申请和课程安排全部在本次主API响应内生成，不另请求终端模型。终端里的玩家主动回复另由终端API负责。不得替用户发送消息、接受好友申请或改变好感度。
在本轮唯一<SR_STATE> JSON里增加terminal字段，位置在event之后；它是独立的通讯伴随数据，不属于变量patch、customUpdates、forum或theaters。即使人物状态关闭，也输出<SR_STATE>{"event":"本轮事件概括","terminal":{...}}</SR_STATE>以携带通讯；其余已启用小剧场仍按原顺序输出。最后以<SR_DONE>结束。终端字段错误不能用重复正文来补。
terminal格式：{"groups":[{"id":"群ID","title":"群名称","members":["角色ID"],"ownerId":"创建群的角色ID或player","adminIds":[],"announcement":"公告","messages":[{"id":"成员ID","text":"消息"}],"topic":"本轮实际群聊话题的简述"}],"privateMessages":[{"id":"已知角色ID","text":"角色主动发给玩家的消息","topic":"话题概述"}],"friendRequests":[{"id":"角色ID","reason":"角色以本人身份提出的加好友理由","source":"从哪里实际获知玩家终端码"}],"courses":[{"title":"课程或授课安排","day":1,"time":"09:00","end":"10:40","place":"地点","teacherId":"已知角色ID或空串","preparation":"要求或空串"}]}。
groups：初始化时根据玩家实际身份/关系建立2至5个合理群；优先保留下方已有群，其余新群ID只能取newGroupIds。初始化后必须恰好覆盖下方固定群，原样回传其ID、名称、成员、群主、管理员与公告，不擅自改成员或权限。members只列NPC角色ID，玩家已隐含加入，不重复列player；ownerId和adminIds仍可按真实权限包含player。每群每正文轮恰好3至5条messages，发言者只能是该群成员，不含player；按各人知情范围与当前剧情自然交谈，不重复上一轮，不强迫人人说话。群主按实际创建者确定，不能默认玩家是管理员。
privateMessages：根据本轮剧情与实际关系判断已知角色是否主动联系，0至8条，可为空。发送者须为已知角色ID，未加好友也可以主动私聊并直接显示；friendIds仅表示已有好友，不是私聊白名单。私聊不代表自动成为好友，不全员强制发送，不虚构用户回复。即使本轮没有主动私聊，也显式返回[]。
friendRequests：有实际接触、联系需要和合理人际关系时可由角色主动申请，0至3位，未接受前不能视为好友；可为空，不全员初始申请。必须给出本人语气reason以及实际获知玩家号码的合理source，不凭全知视角获得玩家号码。blockedFriendIds为已有好友、待处理或拒绝冷却中的角色，不能再次申请，不冒充用户发起。
courses：有正文明确安排时优先采用；无安排时按玩家真实身份生成合理课表，学生是课程，教官是授课安排，其他教职工无需课程则[]。参照existingCourses保留尚有效的安排，避免随机变化。day为周一1至周日7，24小时时间。
所有人物ID以本轮权威状态及已建立新NPC为准。只返回实际消息与结果，不泄露私有人设全文或后台提示词。先控制正文篇幅，为完整的通讯JSON及其他伴随输出预留空间。
终端上下文（数据）：${JSON.stringify({...c,existingCourses:c.courses})}
`;}
