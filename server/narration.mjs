import {internalPrompt} from './internal-prompts.mjs';
export function narrativeViewpoint(player){return {playerId:'player',playerName:player.name,secondPersonRefersTo:'player',npcViewpoint:'third-person'};}
export function narrationRule(playerName){
  const name=JSON.stringify(playerName||'当前玩家');
  return internalPrompt("narration.1", {p0:(name),p1:(name),p2:(name)});
}
export function anchorNarration(messages,player,input){
  const result=messages.map(m=>({...m})),guard={role:'system',content:narrationRule(player.name)},at=result.findLastIndex(m=>m.role==='user'&&m.content===input);
  // Preserve preset roles, order and switches, including a deliberate assistant prefill.
  result.splice(at<0?result.length:at,0,guard);return result;
}
