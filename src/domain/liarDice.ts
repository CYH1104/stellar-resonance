import {validateGameDialogue} from './gameDialogue.ts';
import type {PartyRoom,PartyReply} from './partyGames';
import type {TerminalAnchor} from './terminalLedger';

export interface LiarBid {count:number;face:number;pure:boolean}
export interface LiarMove {id:string;action:'bid'|'open';bid?:LiarBid;text:string;replies:PartyReply[];pending?:boolean;replyWithNext?:boolean;dialogueVersion?:1}
export interface LiarRound {kind:'liar';number:number;anchor?:TerminalAnchor;archived?:boolean;replies?:PartyReply[];dialogueVersion?:1;rulesVersion:'liar-v1';dice:Record<string,number[]>;starter:string;turn:string;phase:'playing'|'complete';moves:LiarMove[];winner?:string;loser?:string;actual?:number}
const fail=():never=>{throw Error('大话骰记录或叫号不正确');};
const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,allowed:string[])=>{if(!obj(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();};
const integer=(v:unknown,min:number,max:number)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
export function validLiarBid(v:unknown,n:number):v is LiarBid{return obj(v)&&Object.keys(v).length===3&&Object.keys(v).every(k=>['count','face','pure'].includes(k))&&integer(v.count,n,n*5)&&integer(v.face,1,6)&&typeof v.pure==='boolean';}
export function isLegalLiarBid(previous:LiarBid|undefined,next:unknown,n:number):next is LiarBid{
 if(!validLiarBid(next,n))return false;if(!previous)return true;
 if(previous.pure===next.pure)return next.count>previous.count||next.count===previous.count&&next.face>previous.face;
 return previous.pure?next.count>=previous.count+2:next.count>=previous.count;
}
export function minimumLiarCount(previous:LiarBid|undefined,pure:boolean,face:number,n:number){
 if(!Number.isInteger(face)||face<1||face>6)return Infinity;
 if(!previous)return n;
 if(previous.pure!==pure)return Math.max(n,previous.count+(previous.pure?2:0));
 return Math.max(n,previous.count+(face<=previous.face?1:0));
}
export function legalLiarBids(previous:LiarBid|undefined,n:number){const bids:LiarBid[]=[];for(let count=n;count<=n*5;count++)for(const pure of [false,true])for(let face=1;face<=6;face++){const b={count,face,pure};if(isLegalLiarBid(previous,b,n))bids.push(b);}return bids;}
export const liarBidLabel=(b:LiarBid)=>`${b.count}个${b.pure?'斋':'非'}${b.face}`;
export function countLiarDice(dice:Record<string,number[]>,bid:LiarBid){return Object.values(dice).flat().filter(face=>face===bid.face||!bid.pure&&bid.face!==1&&face===1).length;}
function randomIndex(n:number){const a=new Uint32Array(1),limit=Math.floor(0x100000000/n)*n;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%n;}
export function startLiarRound(participants:string[],number:number,starter?:string,anchor?:TerminalAnchor,random:(n:number)=>number=randomIndex):LiarRound{
 if(participants.length<3||participants.length>8||new Set(participants).size!==participants.length||!participants.includes('player'))fail();
 const pick=(n:number)=>{const v=random(n);if(!integer(v,0,n-1))fail();return v;};starter=starter||participants[pick(participants.length)];if(!participants.includes(starter))fail();
 return {kind:'liar',number,rulesVersion:'liar-v1',dice:Object.fromEntries(participants.map(id=>[id,Array.from({length:5},()=>pick(6)+1)])),starter,turn:starter,phase:'playing',moves:[],...(anchor?{anchor:structuredClone(anchor)}:{})};
}
export function lastLiarBid(round:LiarRound){return [...round.moves].reverse().find(m=>m.action==='bid');}
function current(room:PartyRoom):LiarRound{const r=room.rounds.filter((r:PartyRoom['rounds'][number])=>!r.archived).at(-1);if(r?.kind!=='liar')throw Error('当前不是大话骰');return r;}
function checkReplies(replies:PartyReply[],ids:string[],dialogueVersion?:1){if(dialogueVersion!==undefined){validateGameDialogue({version:dialogueVersion,lines:replies},ids.filter(id=>id!=='player'));return;}const npcs=ids.filter(id=>id!=='player');if(!Array.isArray(replies)||replies.length!==npcs.length||new Set(replies.map(r=>r?.id)).size!==npcs.length)fail();for(const r of replies){keys(r,['id','text']);if(!npcs.includes(r.id)||!text(r.text,240)||!r.text.trim())fail();}}
export function applyLiarMove(room:PartyRoom,actor:string,action:'bid'|'open',bid:LiarBid|undefined,textLine='',replies:PartyReply[]=[],dialogueVersion?:1):LiarRound{
 const r=current(room),ids=room.members.filter(id=>Object.hasOwn(r.dice,id));if(room.endedAt||r.phase!=='playing'||r.turn!==actor||r.moves.at(-1)?.pending||r.moves.length>=500||!text(textLine,500))fail();if(dialogueVersion!==undefined||replies.length)checkReplies(replies,ids,dialogueVersion);
 const previous=lastLiarBid(r);if(action==='bid'){if(!isLegalLiarBid(previous?.bid,bid,ids.length))fail();}else if(action!=='open'||bid!==undefined||!previous?.bid||previous.id===actor)fail();
 const move:LiarMove={id:actor,action,...(action==='bid'?{bid:{...bid!}}:{}),text:textLine,replies:replies.map(x=>({...x})),pending:dialogueVersion===1?false:!replies.length,...(dialogueVersion===1?{dialogueVersion:1 as const}:{})};r.moves.push(move);
 if(action==='bid')r.turn=ids[(ids.indexOf(actor)+1)%ids.length];else{const actual=countLiarDice(r.dice,previous!.bid!);r.actual=actual;r.winner=actual>=previous!.bid!.count?previous!.id:actor;r.loser=r.winner===actor?previous!.id:actor;r.phase='complete';r.turn='';room.drunk[r.loser]=(room.drunk[r.loser]||0)+1;}return r;
}
/** Save the next NPC action and all table speech in the same commit as completing a player's bid. */
export function applyLiarTurn(room:PartyRoom,actor:string,action:'bid'|'open',bid:LiarBid|undefined,replies:PartyReply[],dialogueVersion?:1){
 const round=current(room),previous=round.moves.at(-1);checkReplies(replies,Object.keys(round.dice),dialogueVersion);
 const folded=!!previous?.pending&&previous.id==='player'&&previous.action==='bid';
 if(folded){previous!.pending=false;previous!.replyWithNext=true;}
 try{return applyLiarMove(room,actor,action,bid,'',replies,dialogueVersion);}catch(error){if(folded){previous!.pending=true;delete previous!.replyWithNext;}throw error;}
}
export function completeLiarMove(room:PartyRoom,replies:PartyReply[],dialogueVersion?:1):LiarRound{const r=current(room),move=r.moves.at(-1);if(!move||!move.pending)throw Error('没有等待回应的行动');checkReplies(replies,Object.keys(r.dice),dialogueVersion);if(dialogueVersion===1)move.dialogueVersion=1;move.replies=replies.map(x=>({...x}));move.pending=false;return r;}
export function validateLiarRound(value:unknown,participants:string[]):asserts value is LiarRound{
 keys(value,['kind','number','anchor','archived','replies','dialogueVersion','rulesVersion','dice','starter','turn','phase','moves','winner','loser','actual']);const r=value as LiarRound;
 if(r.kind!=='liar'||r.rulesVersion!=='liar-v1'||!integer(r.number,1,500)||r.archived!==undefined&&typeof r.archived!=='boolean'||!obj(r.dice)||Object.keys(r.dice).length!==participants.length||participants.some(id=>!Object.hasOwn(r.dice,id))||!participants.includes(r.starter)||!['playing','complete'].includes(r.phase)||!Array.isArray(r.moves)||r.moves.length>500)fail();
 if(r.dialogueVersion===undefined){if(r.replies!==undefined)fail();}else{if(r.dialogueVersion!==1||!Array.isArray(r.replies)||r.replies.length>256)fail();for(const line of r.replies||[]){keys(line,['id','text']);if(!participants.includes(line.id)||!text(line.text,line.id==='player'?2000:3000)||!line.text.trim())fail();}}
 for(const dice of Object.values(r.dice))if(!Array.isArray(dice)||dice.length!==5||dice.some(v=>!integer(v,1,6)))fail();
 let turn=r.starter,previous:LiarMove|undefined,opened=false,winner:string|undefined,loser:string|undefined,actual:number|undefined;
 for(const [i,move]of r.moves.entries()){keys(move,['id','action','bid','text','replies','pending','replyWithNext','dialogueVersion']);if(opened||move.id!==turn||!text(move.text,500)||typeof move.pending!=='boolean'||!Array.isArray(move.replies))fail();if(move.dialogueVersion!==undefined){if(move.pending)fail();checkReplies(move.replies,participants,move.dialogueVersion);}if(move.replyWithNext!==undefined&&move.replyWithNext!==true)fail();if(move.replyWithNext){const next=r.moves[i+1];if(move.id!=='player'||move.action!=='bid'||move.pending||move.replies.length||!next||next.id==='player'||next.pending||next.replyWithNext)fail();}else if(move.pending){if(i!==r.moves.length-1||move.replies.length)fail();}else if(move.dialogueVersion===undefined)checkReplies(move.replies,participants);
  if(move.action==='bid'){if(!isLegalLiarBid(previous?.bid,move.bid,participants.length))fail();previous=move;turn=participants[(participants.indexOf(turn)+1)%participants.length];}
  else if(move.action==='open'){if(move.bid!==undefined||!previous||!previous.bid||previous.id===move.id)throw Error('无效开骰记录');opened=true;actual=countLiarDice(r.dice,previous.bid!);winner=actual>=previous.bid!.count?previous.id:move.id;loser=winner===move.id?previous.id:move.id;turn='';}else fail();
 }
 if(r.turn!==turn||r.phase!==(opened?'complete':'playing')||r.winner!==winner||r.loser!==loser||r.actual!==actual)fail();
}
