import {internalPrompt} from './internal-prompts.mjs';
/** One world card hosts many NPCs; it is not a SillyTavern group chat. */
export function conversationParticipants(card,persona){
  const name=typeof card.world?.name==='string'&&card.world.name.trim()&&card.world.name.length<=100?card.world.name.trim():'群星共振世界卡';
  return {user:{id:'player',name:persona.name},char:{id:'world-card',name,role:'narrator'},npcs:card.characters.map(c=>({id:c.id,name:c.name}))};
}
export function personaDescription(persona){
  const labels={name:'姓名',identity:'身份（院系/职业）',ability:'异能',spiritName:'精神体姓名',spiritAppearance:'精神体外貌',spiritPersonality:'精神体性格',spiritAbility:'精神体能力',appearance:'外貌',primaryGender:'第一性别',mentalPowerLevel:'精神力等级',secondaryGender:'第二性别',personality:'性格',background:'背景',spiritAnimal:'精神体',pairingPreference:'配对偏好',other:'其他',rawText:'玩家人设原文'};
  return Object.entries(labels).filter(([key])=>typeof persona[key]==='string'&&persona[key].trim()).map(([key,label])=>label+'：'+persona[key]).join('\n');
}
export function identityRule(participants){
  return '[会话身份] USER='+JSON.stringify(participants.user.name)+internalPrompt("participants.2")+JSON.stringify(participants.char.name)+internalPrompt("participants.1");
}
export function historyMessage(message,participants,cleanAssistant){
  const user=message.role==='user',speaker=user?participants.user:participants.char;
  return {role:user?'user':'assistant',content:`[${user?'USER':'CHAR'} / ${speaker.id} / ${JSON.stringify(speaker.name)}]\n`+(user?message.content:cleanAssistant(message.content))};
}
