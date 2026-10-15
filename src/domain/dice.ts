import type {Dice,DiceEvent} from './contracts';
export function diceGrade(value:number):string{
  if(!Number.isInteger(value)||value<1||value>100)throw new Error('骰点必须为 1～100 的整数');
  return value<=5?'大凶':value<=35?'不利':value<=65?'平平':value<=94?'顺遂':'大吉';
}
export function cleanDice(value:unknown):Dice|undefined{
  if(value===undefined||value===null)return;
  const d=value as Dice;
  if(typeof value!=='object'||Array.isArray(value)||d.rulesVersion!=='d100-v1'||diceGrade(d.value)!==d.grade)throw new Error('骰点或判定不正确');
  return {value:d.value,grade:d.grade,rulesVersion:'d100-v1'};
}
export function dicePlan(dice:Dice){
  const direction=dice.value<=35?'negative':dice.value<=65?'neutral':'positive';
  const requirement=direction==='negative'?'发生对 user 不利的具体事件，带来阻碍、代价、挫折或风险':direction==='positive'?'发生对 user 有利的具体事件，带来帮助、线索、机会或实际进展':'发生中性的具体插曲或变化，不强行转为纯粹好事或坏事';
  return {direction,requirement,intensity:dice.value<=5||dice.value>=95?'strong':'ordinary'} as const;
}
export function cleanDiceEvent(value:unknown):DiceEvent{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('骰子事件格式不正确');
  const v=value as DiceEvent;
  if(Object.keys(value).some(k=>!['direction','description'].includes(k))||!['negative','neutral','positive'].includes(v.direction)||typeof v.description!=='string'||!v.description.trim()||v.description.length>1000)throw new Error('骰子事件格式不正确');
  return {direction:v.direction,description:v.description.trim()};
}
/** Old rounds may have a score without event metadata; new metadata must match its round. */
export function assertDiceEventBinding(event:DiceEvent|undefined,dice:Dice|undefined){
  if(!event)return;const roll=cleanDice(dice);
  if(!roll||event.direction!==dicePlan(roll).direction)throw new Error('骰子事件与本轮骰点不一致');
}
