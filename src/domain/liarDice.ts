import {validateGameDialogue} from './gameDialogue.ts';
import type {PartyRoom,PartyReply} from './partyGames';
import type {TerminalAnchor} from './terminalLedger';
export interface LiarBid {count:number;face:number;pure:boolean}
export type LiarAction='bid'|'open'|'split';
export interface LiarMove {id:string;action:LiarAction;bid?:LiarBid;targets?:string[];text:string;replies:PartyReply[];pending?:boolean;replyWithNext?:boolean;dialogueVersion?:1}
export interface LiarDuel {target:string;bid:LiarBid;actual:number;winner:string;loser:string;cups:1|2}
export interface LiarChallenge {opener:string;action:'open'|'split';duels:LiarDuel[];penalties:Record<string,number>;nextStarter:string}
export interface LiarRolls {initial:Record<string,number[]>;counts:Record<string,number>;lastScatter:Record<string,number[]>;confirmed:boolean}
export interface LiarRound {kind:'liar';number:number;rulesVersion:'liar-v1'|'liar-v2';dice:Record<string,number[]>;starter:string;turn:string;phase:'rolling'|'playing'|'complete';moves:LiarMove[];winner?:string;loser?:string;actual?:number;anchor?:TerminalAnchor;archived?:boolean;replies?:PartyReply[];dialogueVersion?:1;seatOrder?:string[];rolls?:LiarRolls;challenge?:LiarChallenge;nextStarter?:string}
const fail=():never=>{throw Error('大话骰记录或叫号不正确');};
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max;
const idValid=(v:unknown):v is string=>typeof v==='string'&&/^[^\s\u0000-\u001f]{1,128}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
function keys(v:unknown,allowed:readonly string[]):asserts v is Record<string,any>{if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();}
function exactRows(v:unknown,ids:readonly string[]):asserts v is Record<string,any>{if(!object(v)||Object.keys(v).length!==ids.length||ids.some(id=>!Object.hasOwn(v,id)))fail();}
const sameArray=(a:readonly unknown[],b:readonly unknown[])=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const diceValid=(v:unknown):v is number[]=>Array.isArray(v)&&v.length===5&&v.every(n=>integer(n,1,6));
export function isScatterDice(v:readonly number[]){return diceValid(v)&&new Set(v).size===5;}
export function validLiarBid(v:unknown,n:number):v is LiarBid{return object(v)&&Object.keys(v).length===3&&Object.keys(v).every(k=>['count','face','pure'].includes(k))&&integer(v.count,n,n*5)&&integer(v.face,1,6)&&typeof v.pure==='boolean';}
export function isLegalLiarBid(previous:LiarBid|undefined,next:unknown,n:number):next is LiarBid{if(!validLiarBid(next,n))return false;if(!previous)return true;if(previous.pure===next.pure)return next.count>previous.count||next.count===previous.count&&next.face>previous.face;return previous.pure?next.count>=previous.count+2:next.count>=previous.count;}
export function minimumLiarCount(previous:LiarBid|undefined,pure:boolean,face:number,n:number){if(!integer(face,1,6))return Infinity;if(!previous)return n;return previous.pure!==pure?Math.max(n,previous.count+(previous.pure?2:0)):Math.max(n,previous.count+(face<=previous.face?1:0));}
export function legalLiarBids(previous:LiarBid|undefined,n:number){const out:LiarBid[]=[];for(let count=n;count<=n*5;count++)for(const pure of [false,true])for(let face=1;face<=6;face++){const bid={count,face,pure};if(isLegalLiarBid(previous,bid,n))out.push(bid);}return out;}
export const liarBidLabel=(b:LiarBid)=>`${b.count}个${b.pure?'斋':'非'}${b.face}`;
export function countLiarDice(dice:Record<string,number[]>,b:LiarBid){return Object.values(dice).flat().filter(face=>face===b.face||!b.pure&&b.face!==1&&face===1).length;}
function cryptoIndex(n:number){const a=new Uint32Array(1),limit=Math.floor(0x100000000/n)*n;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%n;}
function randomIndex(n:number,random:(n:number)=>number){const v=random(n);if(!integer(v,0,n-1))fail();return v;}
function rollFive(random:(n:number)=>number){return Array.from({length:5},()=>randomIndex(6,random)+1);}
export function startLiarRound(ids:string[],number:number,starter?:string,anchor?:TerminalAnchor,random:(n:number)=>number=cryptoIndex):LiarRound{
 if(!Array.isArray(ids)||ids.length<3||ids.length>8||new Set(ids).size!==ids.length||ids.some(id=>!idValid(id))||!integer(number,1,500))fail();
 const first=starter||ids[randomIndex(ids.length,random)];if(!ids.includes(first))fail();const dice:Record<string,number[]>={},initial:Record<string,number[]>={},counts:Record<string,number>={},lastScatter:Record<string,number[]>={};
 for(const id of ids){let hand=rollFive(random),count=0;initial[id]=[...hand];if(id!=='player'){while(isScatterDice(hand)&&count<64){lastScatter[id]=[...hand];hand=rollFive(random);count++;}if(isScatterDice(hand))throw Error('连续散点过多，请重试开局。');}dice[id]=hand;counts[id]=count;}
 const waiting=!!dice.player&&isScatterDice(dice.player);return {kind:'liar',number,rulesVersion:'liar-v2',seatOrder:[...ids],dice,starter:first,turn:waiting?'player':first,phase:waiting?'rolling':'playing',moves:[],rolls:{initial,counts,lastScatter,confirmed:!waiting},...(anchor?{anchor:structuredClone(anchor)}:{})};
}
function current(room:PartyRoom):LiarRound{const r=room.rounds.filter(r=>!r.archived).at(-1);if(r?.kind!=='liar')throw Error('当前不是大话骰');return r;}
export function canRerollLiar(r:LiarRound,id='player'){return r.rulesVersion==='liar-v2'&&r.phase==='rolling'&&id==='player'&&r.moves.length===0&&r.rolls?.confirmed===false&&isScatterDice(r.dice.player);}
export function canRerollLiarPlayer(r:LiarRound){return canRerollLiar(r);}
export function rerollLiar(room:PartyRoom,id='player',random:(n:number)=>number=cryptoIndex){const r=current(room);if(room.endedAt||!canRerollLiar(r,id))fail();const rolls=r.rolls!;if(!integer(rolls.counts.player,0,Number.MAX_SAFE_INTEGER-1))fail();const previous=[...r.dice.player],next=rollFive(random);rolls.counts.player++;rolls.lastScatter.player=previous;r.dice.player=next;if(!isScatterDice(next)){rolls.confirmed=true;r.phase='playing';r.turn=r.starter;}return r;}
export function confirmLiarRoll(room:PartyRoom){const r=current(room);if(room.endedAt||!canRerollLiar(r))fail();r.rolls!.confirmed=true;r.phase='playing';r.turn=r.starter;return r;}
export function lastLiarBid(r:LiarRound){return [...r.moves].reverse().find(m=>m.action==='bid');}
function latestBids(history:LiarMove[]){const map=new Map<string,LiarMove>();for(const m of history)if(m.action==='bid')map.set(m.id,m);return map;}
function optionsFor(r:LiarRound,actor:string,history:LiarMove[]){const last=[...history].reverse().find(m=>m.action==='bid');if(r.rulesVersion==='liar-v1')return last&&last.id!==actor?[{id:last.id,bid:last.bid!}]:[];const latest=latestBids(history);return (r.seatOrder||Object.keys(r.dice)).filter(id=>id!==actor&&latest.has(id)).map(id=>({id,bid:latest.get(id)!.bid!}));}
export function liarChallengeOptions(r:LiarRound,actor=r.turn){return r.phase==='playing'&&Object.hasOwn(r.dice,actor)?optionsFor(r,actor,r.moves):[];}
function checkReplies(rows:PartyReply[],ids:string[],version?:1){if(version!==undefined){validateGameDialogue({version,lines:rows},ids.filter(id=>id!=='player'));return;}const npcs=ids.filter(id=>id!=='player');if(!Array.isArray(rows)||rows.length!==npcs.length||new Set(rows.map(r=>r?.id)).size!==npcs.length)fail();for(const row of rows){keys(row,['id','text']);if(!npcs.includes(row.id)||!text(row.text,240)||!row.text.trim())fail();}}
function computeChallenge(r:LiarRound,actor:string,action:'open'|'split',selected:string[]|undefined,history:LiarMove[],ids:string[]):LiarChallenge{
 if(r.rulesVersion==='liar-v1'&&(action!=='open'||selected!==undefined))fail();const last=[...history].reverse().find(m=>m.action==='bid');const targets=selected===undefined?(last?[last.id]:[]):selected,options=optionsFor(r,actor,history);if(!Array.isArray(targets)||!targets.length||targets.length>ids.length-1||new Set(targets).size!==targets.length||targets.some(id=>id===actor||!options.some(o=>o.id===id)))fail();
 const cups:1|2=action==='split'?2:1,duels=targets.map(target=>{const bid=options.find(o=>o.id===target)!.bid,actual=countLiarDice(r.dice,bid),success=actual>=bid.count;return {target,bid:{...bid},actual,winner:success?target:actor,loser:success?actor:target,cups};});
 const penalties=Object.fromEntries(ids.map(id=>[id,0])) as Record<string,number>;for(const duel of duels)penalties[duel.loser]+=duel.cups;const seats=r.seatOrder||ids;let nextStarter=seats[0];for(const id of seats.slice(1))if(penalties[id]>penalties[nextStarter])nextStarter=id;return {opener:actor,action,duels,penalties,nextStarter};
}
export function applyLiarMove(room:PartyRoom,actor:string,action:LiarAction,bid:LiarBid|undefined,textLine='',replies:PartyReply[]=[],version?:1,targets?:string[]):LiarRound{
 const r=current(room),ids=room.members.filter(id=>Object.hasOwn(r.dice,id));if(room.endedAt||r.phase!=='playing'||r.turn!==actor||r.moves.at(-1)?.pending||r.moves.length>=500||!text(textLine,500))fail();if(version!==undefined||replies.length)checkReplies(replies,ids,version);
 let challenge:LiarChallenge|undefined;if(action==='bid'){if(targets!==undefined||!isLegalLiarBid(lastLiarBid(r)?.bid,bid,ids.length))fail();}else if((action==='open'||action==='split')&&bid===undefined)challenge=computeChallenge(r,actor,action,targets,r.moves,ids);else fail();
 const m:LiarMove={id:actor,action,...(action==='bid'?{bid:{...bid!}}:{}),...(challenge&&r.rulesVersion==='liar-v2'?{targets:challenge.duels.map(d=>d.target)}:{}),text:textLine,replies:replies.map(row=>({...row})),pending:version===1?false:replies.length===0,...(version===1?{dialogueVersion:1 as const}:{})};
 r.moves.push(m);if(!challenge){r.turn=ids[(ids.indexOf(actor)+1)%ids.length];return r;}
 r.phase='complete';r.turn='';if(r.rulesVersion==='liar-v2'){r.challenge=challenge;r.nextStarter=challenge.nextStarter;}
 if(challenge.duels.length===1){const d=challenge.duels[0];r.winner=d.winner;r.loser=d.loser;r.actual=d.actual;}else{delete r.winner;delete r.loser;delete r.actual;}for(const id of ids)room.drunk[id]=(room.drunk[id]||0)+challenge.penalties[id];return r;
}
export function applyLiarTurn(room:PartyRoom,actor:string,action:LiarAction,bid:LiarBid|undefined,replies:PartyReply[],version?:1,targets?:string[]){const r=current(room),prior=r.moves.at(-1);checkReplies(replies,Object.keys(r.dice),version);const fold=!!prior?.pending&&prior.id==='player'&&prior.action==='bid';if(fold){prior!.pending=false;prior!.replyWithNext=true;}try{return applyLiarMove(room,actor,action,bid,'',replies,version,targets);}catch(error){if(fold){prior!.pending=true;delete prior!.replyWithNext;}throw error;}}
export function completeLiarMove(room:PartyRoom,replies:PartyReply[],version?:1){const r=current(room),m=r.moves.at(-1);if(!m||!m.pending)throw Error('没有等待回应的行动');checkReplies(replies,Object.keys(r.dice),version);m.replies=replies.map(row=>({...row}));m.pending=false;if(version===1)m.dialogueVersion=1;return r;}
function validateRolls(r:LiarRound,ids:string[]){
 if(r.rulesVersion==='liar-v1'){if(r.phase==='rolling'||r.seatOrder!==undefined||r.rolls!==undefined||r.challenge!==undefined||r.nextStarter!==undefined)fail();return;}
 if(!Array.isArray(r.seatOrder)||!sameArray(r.seatOrder,ids))fail();keys(r.rolls,['initial','counts','lastScatter','confirmed']);const rolls=r.rolls as LiarRolls;if(typeof rolls.confirmed!=='boolean')fail();exactRows(rolls.initial,ids);exactRows(rolls.counts,ids);keys(rolls.lastScatter,ids);
 for(const id of ids){const first=rolls.initial[id],now=r.dice[id],count=rolls.counts[id],prior=rolls.lastScatter[id];if(!diceValid(first)||!integer(count,0,Number.MAX_SAFE_INTEGER))fail();if(count===0){if(!sameArray(first,now)||prior!==undefined)fail();}else if(!isScatterDice(first)||!diceValid(prior)||!isScatterDice(prior))fail();if(id!=='player'&&isScatterDice(now))fail();}
 if(r.phase==='rolling'){if(rolls.confirmed||r.moves.length||r.turn!=='player'||!isScatterDice(r.dice.player))fail();}else if(!rolls.confirmed)fail();
}
function validateStoredChallenge(r:LiarRound,expected:LiarChallenge){
 keys(r.challenge,['opener','action','duels','penalties','nextStarter']);const ch=r.challenge as LiarChallenge;if(ch.opener!==expected.opener||ch.action!==expected.action||ch.nextStarter!==expected.nextStarter||r.nextStarter!==expected.nextStarter||!Array.isArray(ch.duels)||ch.duels.length!==expected.duels.length)fail();
 for(let i=0;i<ch.duels.length;i++){const d=ch.duels[i],e=expected.duels[i];keys(d,['target','bid','actual','winner','loser','cups']);if(!validLiarBid(d.bid,Object.keys(r.dice).length)||d.target!==e.target||d.actual!==e.actual||d.winner!==e.winner||d.loser!==e.loser||d.cups!==e.cups||d.bid.count!==e.bid.count||d.bid.face!==e.bid.face||d.bid.pure!==e.bid.pure)fail();}
 const ids=Object.keys(r.dice);exactRows(ch.penalties,ids);if(ids.some(id=>ch.penalties[id]!==expected.penalties[id]))fail();
}
export function validateLiarRound(value:unknown,ids:string[]):asserts value is LiarRound{
 keys(value,['kind','number','anchor','archived','replies','dialogueVersion','rulesVersion','dice','starter','turn','phase','moves','winner','loser','actual','seatOrder','rolls','challenge','nextStarter']);const r=value as LiarRound;
 if(r.kind!=='liar'||!['liar-v1','liar-v2'].includes(r.rulesVersion)||!integer(r.number,1,500)||r.archived!==undefined&&typeof r.archived!=='boolean'||!ids.includes(r.starter)||!['rolling','playing','complete'].includes(r.phase)||!Array.isArray(r.moves)||r.moves.length>500)fail();exactRows(r.dice,ids);for(const hand of Object.values(r.dice))if(!diceValid(hand))fail();validateRolls(r,ids);
 if(r.dialogueVersion===undefined){if(r.replies!==undefined)fail();}else{if(r.dialogueVersion!==1||!Array.isArray(r.replies)||r.replies.length>256)fail();for(const line of r.replies||[]){keys(line,['id','text']);if(!ids.includes(line.id)||!text(line.text,line.id==='player'?2000:3000)||!line.text.trim())fail();}}
 let turn=r.starter,previous:LiarMove|undefined,challenge:LiarChallenge|undefined;
 for(const [index,m]of r.moves.entries()){
  keys(m,['id','action','bid','targets','text','replies','pending','replyWithNext','dialogueVersion']);if(challenge||m.id!==turn||!text(m.text,500)||typeof m.pending!=='boolean'||!Array.isArray(m.replies))fail();if(m.dialogueVersion!==undefined){if(m.pending)fail();checkReplies(m.replies,ids,m.dialogueVersion);}
  if(m.replyWithNext!==undefined&&m.replyWithNext!==true)fail();if(m.replyWithNext){const next=r.moves[index+1];if(m.id!=='player'||m.action!=='bid'||m.pending||m.replies.length||!next||next.id==='player'||next.pending||next.replyWithNext)fail();}else if(m.pending){if(index!==r.moves.length-1||m.replies.length||m.dialogueVersion!==undefined)fail();}else if(m.dialogueVersion===undefined)checkReplies(m.replies,ids);
  if(m.action==='bid'){if(m.targets!==undefined||!isLegalLiarBid(previous?.bid,m.bid,ids.length))fail();previous=m;turn=ids[(ids.indexOf(turn)+1)%ids.length];}
  else if((m.action==='open'||m.action==='split')&&m.bid===undefined){if(index!==r.moves.length-1)fail();challenge=computeChallenge(r,m.id,m.action,m.targets,r.moves.slice(0,index),ids);turn='';}else fail();
 }
 if(r.phase==='rolling'){if(r.moves.length||r.challenge!==undefined||r.nextStarter!==undefined||r.winner!==undefined||r.loser!==undefined||r.actual!==undefined)fail();return;}
 if(!challenge){if(r.phase!=='playing'||r.turn!==turn||r.challenge!==undefined||r.nextStarter!==undefined||r.winner!==undefined||r.loser!==undefined||r.actual!==undefined)fail();return;}
 if(r.phase!=='complete'||r.turn!=='')fail();if(r.rulesVersion==='liar-v2')validateStoredChallenge(r,challenge);
 if(challenge.duels.length===1){const d=challenge.duels[0];if(r.winner!==d.winner||r.loser!==d.loser||r.actual!==d.actual)fail();}else if(r.winner!==undefined||r.loser!==undefined||r.actual!==undefined)fail();
}
