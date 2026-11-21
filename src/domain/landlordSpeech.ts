import {classifyLandlord,landlordRank} from './landlordCards.ts';
import type {LandlordRound} from './landlord.ts';
export const landlordPhraseKinds=['waiting','weak','bomb','lastCards','win','lose'] as const;
export type LandlordPhraseKind=typeof landlordPhraseKinds[number];
export type LandlordPhrases=Record<LandlordPhraseKind,string[]>;
export function validLandlordPhrases(value:unknown):value is LandlordPhrases{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).length===landlordPhraseKinds.length&&landlordPhraseKinds.every(k=>Array.isArray(v[k])&&v[k].length>=1&&v[k].length<=3&&v[k].every((line:unknown)=>typeof line==='string'&&!!line.trim()&&line.length<=40&&!/[\r\n<>]/.test(line)));
}
export function fallbackLandlordPhrases():LandlordPhrases{return {waiting:['慢慢想，我等着呢。','轮到你啦。'],weak:['这手牌得省着点打。','大牌不多，稳一点。'],bomb:['这回该我了！','接住这一手！'],lastCards:['就快出完了。','最后几张了。'],win:['这局打得不错。','承让，继续？'],lose:['下局再来。','这局是你们厉害。']};}
export interface LandlordBubble{id:string;text:string;kind:LandlordPhraseKind;until:number}
/** Local, ephemeral presentation state. No model requests and no effect on moves or scores. */
export class LandlordBubbleDirector{
 private key='';private hand=0;private turn='';private waitingSince=0;private waitCount=0;private serial=0;private lastShown=-Infinity;private weakShown=new Set<string>();private current?:LandlordBubble;
 update(round:LandlordRound,phrases:Record<string,LandlordPhrases>|undefined,now:number,enabled:boolean,busy=false):LandlordBubble|undefined{
  if(!enabled){this.current=undefined;this.key='';this.waitingSince=now;this.waitCount=0;return;}
  if(this.current&&now>=this.current.until)this.current=undefined;
  if(this.hand!==round.number){this.hand=round.number;this.key='';this.turn='';this.current=undefined;this.weakShown.clear();this.lastShown=-Infinity;}
  const key=[round.number,round.moves.length,round.phase,round.turn].join(':'),changed=key!==this.key,hadObservation=!!this.key;this.key=key;
  if(changed){this.waitingSince=now;this.waitCount=0;this.turn=round.turn;}
  const npcs=round.participants.filter(id=>id!=='player');let event:{id:string;kind:LandlordPhraseKind}|undefined;
  if(changed&&round.phase==='complete'&&round.result&&round.result.winner!=='redeal'){
   const id=npcs[this.serial%npcs.length];if(id)event={id,kind:(round.result.deltas[id]??0)>0?'win':'lose'};
  }else if(changed&&hadObservation&&round.phase==='playing'){
   const move=round.moves.at(-1);
   if(move?.kind==='play'&&move.id!=='player'){
    const pattern=classifyLandlord(move.cards)?.kind;
    if(pattern==='bomb'||pattern==='rocket')event={id:move.id,kind:'bomb'};
    else if(round.hands[move.id]?.length<=2)event={id:move.id,kind:'lastCards'};
   }
  }
  if(!event&&!this.current&&round.phase==='playing'&&changed){
   const id=npcs.find(id=>!this.weakShown.has(id)&&round.turn===id&&round.hands[id]?.length>2&&round.hands[id].every(card=>landlordRank(card)<14)&&!round.hands[id].some(card=>round.hands[id].filter(c=>landlordRank(c)===landlordRank(card)).length===4));
   if(id)event={id,kind:'weak'};
  }
  if(busy)this.waitingSince=now;
  if(!event&&!this.current&&!busy&&round.phase!=='complete'&&this.turn==='player'&&this.waitCount<2&&now-this.waitingSince>=18000+this.waitCount*30000){const id=npcs[this.serial%npcs.length];if(id)event={id,kind:'waiting'};}
  const resultEvent=event?.kind==='win'||event?.kind==='lose';
  if(event&&(resultEvent||!this.current&&now-this.lastShown>=10000)){
   const lines=phrases?.[event.id]?.[event.kind]||fallbackLandlordPhrases()[event.kind];
   this.current={...event,text:lines[this.serial%lines.length],until:now+5500};this.serial++;this.lastShown=now;
   if(event.kind==='weak')this.weakShown.add(event.id);if(event.kind==='waiting')this.waitCount++;
  }
  return this.current;
 }
}
