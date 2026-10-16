export function narrativeViewpoint(player){return {playerId:'player',playerName:player.name,secondPersonRefersTo:'player',npcViewpoint:'third-person'};}
export function narrationRule(playerName){
  const name=JSON.stringify(playerName||'当前玩家');
  return `[固定玩家视角] 本存档唯一user/player是${name}。正文叙述中的“你”永远指这个玩家，“你的”永远属于这个玩家；不能因为NPC行动、角色预设、助手预填或上一段主语切换，就让“你”变成char。所有char用各自姓名或第三人称叙述。保持第二人称玩家视角，不把user写成被“你”观察的另一个人，不把char的身体、性别、精神体、经历或行动套给“你”。出现“你看向${name}”“你命令${name}”等把玩家与叙述中的你分成两人的情形时，应在输出前改为“char姓名看向你/对你说”。历史中若已有这种串位，视为历史表述错误，不能据此互换身份；延续情节事实，但后续恢复你=user。尊重玩家的行动决定，不替玩家额外作重大选择或代说台词。NPC直接引语中的称呼按对话对象使用，不得改变引语外的叙述主体。此约束只针对主线正文；群聊各消息有明确speaker，精神体日记的“我”是精神体，二者不能反过来改变主线视角。只输出修正后的正文，不展示自检、分析或思维链。`;
}
export function anchorNarration(messages,player,input){
  const result=messages.map(m=>({...m})),guard={role:'system',content:narrationRule(player.name)},at=result.findLastIndex(m=>m.role==='user'&&m.content===input);
  // Preserve preset roles, order and switches, including a deliberate assistant prefill.
  result.splice(at<0?result.length:at,0,guard);return result;
}
