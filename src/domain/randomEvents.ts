import type {Dice} from './contracts';
import {cleanDice} from './dice.ts';
import {stripReasoning} from './reasoning.ts';
export const specialEventKinds=['突发事件','奇遇事件','危机事件','修罗场事件','惊喜事件'] as const;
export type SpecialEventKind=typeof specialEventKinds[number];
export interface SpecialEvent {kind:SpecialEventKind;title:string;description:string}
export type RandomEventGate={status:'none'|'skipped'}|{status:'preparing'|'failed';kind:SpecialEventKind}|{status:'pending'|'accepted'|'declined';proposal:SpecialEvent};
function randomIndex(size:number){const values=new Uint32Array(1),limit=Math.floor(0x100000000/size)*size;do{crypto.getRandomValues(values);}while(values[0]>=limit);return values[0]%size;}
/** Configurable percentage; the category draw is independent and uniform. No model call is needed for a miss. */
export function drawSpecialEvent(probability=50):SpecialEventKind|undefined{if(!Number.isFinite(probability)||probability<0||probability>100)throw new Error("随机事件概率须为0到100");return randomIndex(100)<probability?specialEventKinds[randomIndex(specialEventKinds.length)]:undefined;}
export function cleanSpecialEvent(value:unknown):SpecialEvent{
  const p=value as SpecialEvent;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['kind','title','description'].includes(k))||!specialEventKinds.includes(p.kind)||typeof p.title!=='string'||typeof p.description!=='string'||p.title.length>100||p.description.length>1200)throw new Error('随机事件候选格式不正确');
  const title=stripReasoning(p.title).trim(),description=stripReasoning(p.description).trim();if(!title||!description)throw new Error('随机事件候选为空');return {kind:p.kind,title,description};
}
export function cleanRandomEventGate(value:unknown,dice?:Dice):RandomEventGate|undefined{
  if(value===undefined)return;const g=value as RandomEventGate;
  if(!g||typeof g!=='object'||Array.isArray(g))throw new Error('随机事件记录不正确');
  if(g.status==='none'||g.status==='skipped'){if(Object.keys(g).some(k=>k!=='status')||dice)throw new Error('未触发事件不能有骰点');return {status:g.status};}
  if(g.status==='preparing'||g.status==='failed'){if(Object.keys(g).some(k=>!['status','kind'].includes(k))||!specialEventKinds.includes(g.kind)||dice)throw new Error('随机事件准备记录不正确');return {status:g.status,kind:g.kind};}
  if(g.status==='pending'||g.status==='accepted'||g.status==='declined'){if(Object.keys(g).some(k=>!['status','proposal'].includes(k))||(g.status==='accepted'?!cleanDice(dice):!!dice))throw new Error('随机事件决定与骰点不一致');return {status:g.status,proposal:cleanSpecialEvent(g.proposal)};}
  throw new Error('随机事件阶段不正确');
}
export function awaitingSpecialEvent(gate?:RandomEventGate){return !!gate&&['preparing','failed','pending'].includes(gate.status);}
