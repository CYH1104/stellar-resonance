import {beatsLandlord, classifyLandlord, landlordDeck, sortLandlordCards} from './landlordCards.ts';
import type {TerminalAnchor} from './terminalLedger';

export const LANDLORD_START_SCORE = 10_000;
export const LANDLORD_BASE = 100;
export type LandlordAction = {kind:'bid'; score:number} | {kind:'play'; cards:string[]} | {kind:'pass'};
export type LandlordMove = LandlordAction & {id:string; text?:string};
export interface LandlordResult {
 winner:'landlord'|'farmers'|'redeal'; deltas:Record<string,number>; spring:boolean;
}
export interface LandlordRound {
 kind:'landlord'; rulesVersion:1; number:number; anchor?:TerminalAnchor; archived?:boolean; replies?:{id:string;text:string}[]; dialogueVersion?:1;
 participants:string[]; starter:string; initialHands:Record<string,string[]>; hands:Record<string,string[]>; bottom:string[];
 openingScores:Record<string,number>; phase:'bidding'|'playing'|'complete'; turn:string; landlord?:string; highestBid:number;
 moves:LandlordMove[]; lead?:{id:string;cards:string[]}; passes:number; multiplier:number; result?:LandlordResult;
}
const fail = () => {throw Error('斗地主牌局或操作不合法');};
const validCards=(value:unknown,length?:number):value is string[]=>Array.isArray(value)&&(length===undefined||value.length===length)&&new Set(value).size===value.length&&value.every(c=>landlordDeck.includes(c));
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function matchesKeys(v:unknown,ids:string[]):v is Record<string,unknown>{return record(v)&&Object.keys(v).length===ids.length&&ids.every(id=>Object.hasOwn(v,id));}
export function landlordOpeningScores(ids:readonly string[]){return Object.fromEntries(ids.map(id=>[id,LANDLORD_START_SCORE]));}
export function landlordScores(round:LandlordRound){return Object.fromEntries(round.participants.map(id=>[id,round.openingScores[id]+(round.result?.deltas[id]??0)]));}
function nextSeat(round:LandlordRound,id:string){return round.participants[(round.participants.indexOf(id)+1)%3]!;}
function makeRound(participants:string[],number:number,starter:string,initialHands:Record<string,string[]>,bottom:string[],openingScores:Record<string,number>):LandlordRound{
 return {kind:'landlord',rulesVersion:1,number,participants:[...participants],starter,initialHands:Object.fromEntries(participants.map(id=>[id,[...initialHands[id]]])),hands:Object.fromEntries(participants.map(id=>[id,[...initialHands[id]]])),bottom:[...bottom],openingScores:{...openingScores},phase:'bidding',turn:starter,highestBid:0,moves:[],passes:0,multiplier:1};
}
export function startLandlordRound(ids:string[],number:number,scores:Record<string,number>,random:(n:number)=>number,anchor?:TerminalAnchor){
 if(ids.length!==3||new Set(ids).size!==3||!ids.includes('player')||!ids.every(id=>Number.isInteger(scores[id])&&scores[id]>0))fail();
 const pick=(n:number)=>{const v=random(n);if(!Number.isInteger(v)||v<0||v>=n)fail();return v;};
 const deck=[...landlordDeck];for(let i=deck.length-1;i>0;i--){const j=pick(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
 const starter=ids[pick(3)]!,initial=Object.fromEntries(ids.map((id,i)=>[id,sortLandlordCards(deck.slice(17*i,17*i+17))]));
 const round=makeRound(ids,number,starter,initial,sortLandlordCards(deck.slice(51)),scores);
 if(anchor)round.anchor=structuredClone(anchor);
 return round;
}
export function legalLandlordBids(highest:number){return [0,1,2,3].filter(score=>score===0||score>highest);}
function settle(round:LandlordRound,finisher:string){
 const landlord=round.landlord!,farmers=round.participants.filter(id=>id!==landlord),landlordWins=finisher===landlord;
 const plays=round.moves.filter(m=>m.kind==='play');
 const spring=landlordWins?!plays.some(m=>m.id!==landlord):plays.filter(m=>m.id===landlord).length===1;
 if(spring)round.multiplier*=2;
 const stake=LANDLORD_BASE*round.highestBid*round.multiplier,deltas=Object.fromEntries(round.participants.map(id=>[id,0]));
 if(landlordWins){
  for(const farmer of farmers){const paid=Math.min(stake,round.openingScores[farmer]);deltas[farmer]=-paid;deltas[landlord]+=paid;}
 }else{
  const paid=Math.min(2*stake,round.openingScores[landlord]);
  deltas[landlord]=-paid;deltas[farmers[0]]=Math.ceil(paid/2);deltas[farmers[1]]=Math.floor(paid/2);
 }
 round.result={winner:landlordWins?'landlord':'farmers',deltas,spring};round.phase='complete';round.turn='';
}
export function applyLandlordAction(round:LandlordRound,id:string,action:LandlordAction,text?:string){
 if(round.turn!==id||!round.participants.includes(id)||round.phase==='complete'||text!==undefined&&(typeof text!=='string'||text.length>200||!text.trim()))fail();
 const spoken=text?{text}:{};
 if(round.phase==='bidding'){
  if(action.kind!=='bid'||!legalLandlordBids(round.highestBid).includes(action.score))return fail();
  round.moves.push({id,kind:'bid',score:action.score,...spoken});
  if(action.score)round.highestBid=action.score;
  if(action.score===3||round.moves.length===3){
   const winning=round.moves.find(m=>m.kind==='bid'&&m.score===round.highestBid);
   if(!round.highestBid||!winning){round.phase='complete';round.turn='';round.result={winner:'redeal',deltas:Object.fromEntries(round.participants.map(p=>[p,0])),spring:false};return;}
   round.landlord=winning.id;round.hands[winning.id]=sortLandlordCards([...round.hands[winning.id],...round.bottom]);round.phase='playing';round.turn=winning.id;
  }else round.turn=nextSeat(round,id);
  return;
 }
 if(action.kind==='pass'){
  if(!round.lead||round.lead.id===id) return fail();
  round.moves.push({id,kind:'pass',...spoken});round.passes++;
  if(round.passes===2){round.turn=round.lead.id;delete round.lead;round.passes=0;}else round.turn=nextSeat(round,id);
  return;
 }
 if(action.kind!=='play')return fail();
 const hand=round.hands[id],pattern=classifyLandlord(action.cards);
 if(!pattern||!action.cards.every(card=>hand.includes(card))||!beatsLandlord(action.cards,round.lead?.cards))return fail();
 const cards=sortLandlordCards(action.cards),played=new Set(cards);
 round.moves.push({id,kind:'play',cards,...spoken});round.hands[id]=hand.filter(card=>!played.has(card));round.lead={id,cards:[...cards]};round.passes=0;
 if(pattern.kind==='bomb'||pattern.kind==='rocket')round.multiplier*=2;
 if(!round.hands[id].length)settle(round,id);else round.turn=nextSeat(round,id);
}
function equal(left:unknown,right:unknown):boolean{
 if(left===right)return true;
 if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,i)=>equal(value,right[i]));
 return record(left)&&record(right)&&Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(k=>Object.hasOwn(right,k)&&equal(left[k],right[k]));
}
/** Replay imported moves from the original deal and compare all derived state. */
export function validateLandlordRound(round:LandlordRound,ids:string[],scores:Record<string,number>){
 if(!record(round)||round.kind!=='landlord'||round.rulesVersion!==1||!Number.isInteger(round.number)||round.number<1||round.number>500||round.archived!==undefined&&typeof round.archived!=='boolean'||!equal(round.participants,ids)||ids.length!==3||!ids.includes(round.starter)||!equal(round.openingScores,scores)||!ids.every(id=>Number.isInteger(scores[id])&&scores[id]>0)||!matchesKeys(round.initialHands,ids)||!validCards(round.bottom,3)||!Array.isArray(round.moves)||round.moves.length>165)return fail();
 const initial=round.initialHands;if(!ids.every(id=>validCards(initial[id],17))||new Set([...ids.flatMap(id=>initial[id]),...round.bottom]).size!==54)return fail();
 const replay=makeRound(ids,round.number,round.starter,initial,round.bottom,scores);
 for(const move of round.moves){
  if(!record(move)||typeof move.id!=='string'||!['bid','play','pass'].includes(move.kind)||Object.keys(move).some(k=>!['id','kind','text',...(move.kind==='bid'?['score']:move.kind==='play'?['cards']:[])].includes(k)))return fail();
  applyLandlordAction(replay,move.id,move,move.text);
 }
 const {anchor,archived,replies,dialogueVersion,...saved}=round;void anchor;void archived;if(replies!==undefined||dialogueVersion!==undefined){if(dialogueVersion!==1||!Array.isArray(replies)||replies.length>256||replies.some(line=>!record(line)||Object.keys(line).some(k=>k!=='id'&&k!=='text')||!ids.includes(line.id)||typeof line.text!=='string'||!line.text.trim()||line.text.length>3000))return fail();}
 if(!equal(saved,replay))return fail();
}
export function landlordPublicContext(round:LandlordRound,actor:string){
 if(round.turn!==actor||round.phase==='complete'||!round.participants.includes(actor))return fail();
 return {actor,phase:round.phase,participants:[...round.participants],hand:[...round.hands[actor]],
  counts:Object.fromEntries(round.participants.map(id=>[id,round.hands[id].length])),scores:{...round.openingScores},highestBid:round.highestBid,
  ...(round.landlord?{landlord:round.landlord,bottom:[...round.bottom]}:{}),...(round.lead?{lead:{id:round.lead.id,cards:[...round.lead.cards]}}:{}),
  moves:round.moves.map(move=>move.kind==='play'?{id:move.id,kind:move.kind,cards:[...move.cards]}:move.kind==='bid'?{id:move.id,kind:move.kind,score:move.score}:{id:move.id,kind:move.kind})};
}
export type LandlordPublicContext=ReturnType<typeof landlordPublicContext>;
