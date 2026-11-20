import {classifyLandlord,enumerateLandlordPlays,landlordRank,landlordDeck} from './landlordCards.ts';
import type {LandlordAction,LandlordPublicContext} from './landlord.ts';
export interface LandlordStyle {skill:number;aggression:number;cooperation:number;caption:string}
export const neutralLandlordStyle:LandlordStyle={skill:3,aggression:3,cooperation:3,caption:'看牌势决定进退'};
export function validLandlordStyle(value:unknown):value is LandlordStyle{if(!value||typeof value!=='object'||Array.isArray(value))return false;const v=value as Record<string,unknown>;return Object.keys(v).length===4&&Object.keys(v).every(key=>['skill','aggression','cooperation','caption'].includes(key))&&['skill','aggression','cooperation'].every(key=>Number.isInteger(v[key])&&Number(v[key])>=1&&Number(v[key])<=5)&&typeof v.caption==='string'&&!!v.caption.trim()&&v.caption.length<=40;}
function counts(hand:readonly string[]){const result=new Map<number,number>();for(const card of hand){const rank=landlordRank(card);result.set(rank,(result.get(rank)||0)+1);}return result;}
function shapeCost(hand:readonly string[]){if(!hand.length)return 0;const groups=counts(hand),ordered=[...groups.keys()].sort((a,b)=>a-b);let cost=groups.size;for(const [rank,n]of groups){if(n===1&&rank<12)cost+=.65;if(n===4)cost-=.35;}for(let i=1;i<ordered.length;i++){const a=ordered[i-1]!,b=ordered[i]!;if(b===a+1&&b<15){cost-=.12;if(groups.get(a)!>=2&&groups.get(b)!>=2)cost-=.12;}}return cost;}
function noise(view:LandlordPublicContext,cards:readonly string[]){const text=[view.actor,...view.hand,...cards,String(view.moves.length)].join('|');let n=2166136261;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return (n>>>0)/4294967296-.5;}
/** Conservative upper bound: unknown cards are never assigned to a specific opponent. */
function opponentCouldBeat(view:LandlordPublicContext,cards:readonly string[]){
 const pattern=classifyLandlord(cards);if(!pattern)return true;if(pattern.kind==='rocket')return false;
 const opponents=view.participants.filter(id=>id!==view.actor&&(view.landlord===view.actor||id===view.landlord)),maxCards=Math.max(...opponents.map(id=>view.counts[id]));
 const seen=new Set([...view.hand,...view.moves.flatMap(m=>m.kind==='play'?m.cards:[])]),unknown=counts(landlordDeck.filter(card=>!seen.has(card)));
 const rocket=maxCards>=2&&unknown.has(16)&&unknown.has(17);const bomb=maxCards>=4&&[...unknown].some(([rank,n])=>n===4&&(pattern.kind!=='bomb'||rank>pattern.main));if(rocket||bomb)return true;if(pattern.kind==='bomb')return false;if(maxCards<pattern.size)return false;
 const n=pattern.kind==='single'?1:pattern.kind==='pair'?2:pattern.kind==='triple'||pattern.kind==='triple-single'||pattern.kind==='triple-pair'?3:0;
 return n?[...unknown].some(([rank,count])=>rank>pattern.main&&count>=n):true;
}
/** The signature intentionally accepts the actor's public projection, never a full round/opponent hands. */
export function chooseLandlordAction(view:LandlordPublicContext,style:LandlordStyle=neutralLandlordStyle):LandlordAction{
 const skill=style.skill/5,risk=style.aggression/5,cooperation=style.cooperation/5;
 if(view.phase==='bidding'){
  const groups=counts(view.hand);let strength=0;for(const [rank,n]of groups){if(rank>=16)strength+=1.8;if(rank===15)strength+=n*.9;if(n===4)strength+=2.7;if(n===3&&rank<15)strength+=.55;if(n===1&&rank<=9)strength-=.2;}strength+=noise(view,[])*(1-skill)*2.5+(risk-.5)*2;
  const desired=strength>=7?3:strength>=4.5?2:strength>=2?1:0;return {kind:'bid',score:desired>view.highestBid?desired:0};
 }
 if(view.phase!=='playing')throw Error('当前阶段不需要出牌');const plays=enumerateLandlordPlays(view.hand,view.lead?.cards);const winning=plays.find(cards=>cards.length===view.hand.length);if(winning)return {kind:'play',cards:winning};
 const farmer=view.landlord!==view.actor,teammateLead=farmer&&!!view.lead&&view.lead.id!==view.landlord&&view.lead.id!==view.actor;
 const opponents=view.participants.filter(id=>id!==view.actor&&(!farmer||id===view.landlord)),danger=Math.min(...opponents.map(id=>view.counts[id]));
 if(teammateLead&&cooperation>=.6&&(danger>1||skill>=.8&&!opponentCouldBeat(view,view.lead!.cards)))return {kind:'pass'};
 if(!plays.length){if(view.lead)return {kind:'pass'};throw Error('没有可出的合法手牌');}
 if(skill>=.8&&danger===1&&view.lead&&classifyLandlord(view.lead.cards)?.kind==='single'){const controls=plays.filter(cards=>classifyLandlord(cards)?.kind==='single'&&!opponentCouldBeat(view,cards)).sort((a,b)=>landlordRank(a[0]!)-landlordRank(b[0]!));if(controls.length)return {kind:'play',cards:controls[0]!};}
 const original=counts(view.hand);let best=plays[0]!,bestScore=-Infinity;
 for(const cards of plays){const pattern=classifyLandlord(cards)!,used=new Set(cards),rest=view.hand.filter(card=>!used.has(card));let score=cards.length*(1.1+skill*.5)+(shapeCost(view.hand)-shapeCost(rest))*(1+skill*1.6);
  let splits=0;const taken=counts(cards);for(const [rank,n]of taken){const had=original.get(rank)!;if(n<had)splits+=had===4?5:had===3?2.5:had===2?1.6:0;}
  score-=splits*(.5+skill*1.4)*(1.2-risk*.4);score-=cards.reduce((sum,card)=>sum+Math.max(0,landlordRank(card)-13),0)*(.15+skill*.16);
  if(pattern.kind==='bomb'||pattern.kind==='rocket')score-=(2.2+skill*2.5)*(1.4-risk);
  if(skill>=.6&&!opponentCouldBeat(view,cards))score+=skill*(danger<=2?3:1.2);
  if(view.lead)score-=pattern.main*.045;else score-=pattern.main*.018;
  if(teammateLead)score-=2+cooperation*8;
  if(danger===1){if(!view.lead&&pattern.kind==='single')score-=skill*18;if(pattern.kind==='single')score+=pattern.main*skill*1.2;if(pattern.kind==='bomb'||pattern.kind==='rocket')score+=skill*8;}
  if(danger===2&&!view.lead&&pattern.kind==='pair')score-=skill*6;
  score+=noise(view,cards)*(1-skill)*3+(view.lead?risk*1.5:0);
  if(score>bestScore){bestScore=score;best=cards;}
 }
 if(view.lead&&teammateLead&&bestScore<2+cooperation*3)return {kind:'pass'};
 return {kind:'play',cards:best};
}
