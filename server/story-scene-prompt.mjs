import {scenePaths,storyScene} from '../src/domain/storyScene.ts';
export function storyScenePrompt(options={}){
 if(options.repairPlan)return '';
 const current=storyScene(options.state);
 return `\n[剧情时间地点 MVU；场景字段与终端码始终随正文同次输出]
在正文同一次响应的既有 SR_STATE JSON 中增加 openingScene:{"日期":"","星期":"","时间":"","地点":""}，表示本轮正文开场、首个实际场景的快照。日期/时间/地点复用下方MVU格式，星期只在剧情明确或完整日期可推算时填写，否则留空。不能用正文结尾转场后的值覆盖开场；结束场景仍写入既有 customUpdates/MVU。未知项留空，不另写一份纯文字标题，不新增API调用。人物变量关闭时也可用既有SR_STATE携带openingScene，与终端伴随数据合并为同一块。
时间地点变量：${JSON.stringify(scenePaths)}。当前值：${JSON.stringify(current)}。
以本轮主线正文结束时玩家实际所在场景为准，维护日期、时间、地点。日期沿用剧情历法，已知完整日期可用 YYYY-MM-DD；时间为24小时 HH:mm；地点写实际地点名称。正文明确跨日、时间推移或移动地点才更新，未明确的字段保留旧值；首次未知保留空字符串，绝不采用电脑、服务器或现实当前日期时间，不猜测未说明的年份。不从回忆、假设、选项、论坛或小剧场更新主线时间地点。
${options.stateEnabled===false?`即使人物变量更新关闭，允许输出这三个场景字段及 /custom/终端码/{角色ID} 的 MVU，直接附在本次正文后、所有模块完成标记前。使用现有格式 <UpdateVariable><JSONPatch>[{"op":"replace","path":"${scenePaths.时间}","value":"18:42"}]</JSONPatch></UpdateVariable>（时间仅示例，替换为剧情实际值）。只输出需要更新的字段；都不变时输出空数组。除此之外不输出任何人物、好感度或其他变量，不额外请求模型。`:'在本次既有 <SR_STATE> 的 customUpdates 中使用对应路径，set/value 或 keep，并写一句简短事实依据 reason；三个字段都要明确 set 或 keep。直接复用本次结构化状态输出，不新增第二个状态块或 UpdateVariable 块，不额外调用模型。'}
`;
}
