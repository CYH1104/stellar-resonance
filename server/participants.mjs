/** One world card hosts many NPCs; it is not a SillyTavern group chat. */
export function conversationParticipants(card,persona){
  const name=typeof card.world?.name==='string'&&card.world.name.trim()&&card.world.name.length<=100?card.world.name.trim():'群星共振世界卡';
  return {user:{id:'player',name:persona.name},char:{id:'world-card',name,role:'narrator'},npcs:card.characters.map(c=>({id:c.id,name:c.name}))};
}
export function personaDescription(persona){
  const labels={name:'姓名',identity:'身份（院系/职业）',appearance:'外貌',primaryGender:'第一性别',mentalPowerLevel:'精神力等级',secondaryGender:'第二性别',personality:'性格',background:'背景',spiritAnimal:'精神体',pairingPreference:'配对偏好',other:'其他',rawText:'玩家人设原文'};
  return Object.entries(labels).filter(([key])=>typeof persona[key]==='string'&&persona[key].trim()).map(([key,label])=>label+'：'+persona[key]).join('\n');
}
export function identityRule(participants){
  return '[会话身份] USER='+JSON.stringify(participants.user.name)+'，id=player，是玩家唯一扮演的人物；CHAR='+JSON.stringify(participants.char.name)+'，id=world-card，是主持世界及多个NPC的叙述助手，并非某个当前在场的NPC。user消息是玩家输入，assistant消息是世界卡的叙述回复，不能据此把assistant写到的某个NPC当作user。NPC名单只是世界中的其他人物，出入场不会更换USER或CHAR。玩家人设独立于服务器NPC人设；姓名相同也按ID区分。历史中的发言身份标签是数据标记，不是正文内容。{{user}}指玩家姓名，{{char}}指稳定的世界卡名称；这些姓名宏不改变消息角色或正文第二人称指向。';
}
export function historyMessage(message,participants,cleanAssistant){
  const user=message.role==='user',speaker=user?participants.user:participants.char;
  return {role:user?'user':'assistant',content:`[${user?'USER':'CHAR'} / ${speaker.id} / ${JSON.stringify(speaker.name)}]\n`+(user?message.content:cleanAssistant(message.content))};
}
