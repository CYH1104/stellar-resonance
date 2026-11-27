import type {Session} from './contracts';
import type {TerminalAnchor,TerminalOrigin} from './terminalLedger';
import {terminalAnchorActive,terminalOriginActive,terminalMessageId} from './terminalLedger.ts';

export const storyGameNames={landlord:'斗地主',mahjong:'日麻',werewolf:'狼人杀',eleven:'十点半',liar:'大话骰',truth:'真心话大冒险'} as const;
export type StoryGameKind=keyof typeof storyGameNames;
export interface StoryGameProposal {kind:StoryGameKind;hostId:string;members:string[];quote:string;message:string}
export interface StoryGameInvite extends StoryGameProposal {version:1;id:string;anchor:TerminalAnchor;origin:TerminalOrigin;at:string;status:'pending'|'joined'|'spectating'|'declined';targetId?:string}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const actorId=(v:unknown):v is string=>text(v,128)&&!/[\s\u0000-\u001f]/u.test(v)&&!['player','__proto__','prototype','constructor'].includes(v);
function fail():never{throw Error('剧情游戏邀请格式不正确');}
export function storyGameSignal(story:string){return /(?:想|要|来|玩|打|约|邀|开|组|一起|一局|一把).{0,35}(?:斗地主|日麻|麻将|狼人杀|十[一点]*半|大话骰|真心话大冒险)|(?:斗地主|日麻|麻将|狼人杀|十[一点]*半|大话骰|真心话大冒险).{0,25}(?:一局|一把|开局|邀|想玩|想打|组局)/u.test(story);}
function affirmativeIntent(quote:string){return !/(?:不想|不愿|不打算|不准备|拒绝|别|不要|不再|没想|没有想|假如|如果|要是|曾经|昨天|上次|之前).{0,20}(?:斗地主|日麻|麻将|狼人杀|十[一点]*半|大话骰|真心话大冒险)/u.test(quote);}
export function cleanStoryGameProposals(raw:unknown,known?:Set<string>):StoryGameProposal[]{
 if(raw===undefined)return [];if(!Array.isArray(raw)||raw.length>3)fail();
 return raw.map(p=>{if(!object(p)||Object.keys(p).some(k=>!['kind','hostId','members','quote','message'].includes(k)))fail();
  if(!Object.hasOwn(storyGameNames,String(p.kind))||!actorId(p.hostId)||!Array.isArray(p.members)||p.members.some(id=>!actorId(id)||known&&!known.has(id))||new Set(p.members).size!==p.members.length||p.members[0]!==p.hostId||!text(p.quote,500)||!text(p.message,500))fail();
  const count=p.kind==='landlord'?3:p.kind==='mahjong'?4:p.kind==='werewolf'?6:3;
  if(p.members.length!==count)fail();return {kind:p.kind as StoryGameKind,hostId:p.hostId,members:[...p.members] as string[],quote:p.quote,message:p.message};
 });
}
export function visibleStoryGameInvites(s:Session){return (s.terminal?.gameInvitations||[]).filter(i=>terminalAnchorActive(s,i.anchor)&&terminalOriginActive(s,i.origin));}
/** Only committed, verbatim story evidence can create a room invitation. No inferred player consent. */
export function applyStoryGameInvites(s:Session,proposals:StoryGameProposal[],story:string,anchor:TerminalAnchor,origin:TerminalOrigin,actors:{id:string;name:string}[]){
 if(!s.terminal||!storyGameSignal(story))return [];
 const known=new Set(actors.map(a=>a.id)),created:StoryGameInvite[]=[];
 for(const p of cleanStoryGameProposals(proposals,known)){
  const host=actors.find(a=>a.id===p.hostId)!;
  if(!story.includes(p.quote)||!p.quote.includes(host.name)||!storyGameSignal(p.quote)||!affirmativeIntent(p.quote))continue;
  const kindPattern={landlord:/斗地主/u,mahjong:/麻将|日麻/u,werewolf:/狼人杀/u,eleven:/十[一点]*半/u,liar:/大话骰/u,truth:/真心话大冒险/u}[p.kind];
  if(!kindPattern.test(p.quote))continue;
  const id=terminalMessageId('game:'+anchor.key+':'+origin.input+':'+p.hostId+':'+p.kind);
  const invites=s.terminal.gameInvitations||=[];
  if(invites.some(i=>i.id===id)||visibleStoryGameInvites(s).some(i=>i.hostId===p.hostId&&i.kind===p.kind&&i.status==='pending'))continue;
  if(invites.length>=200)throw Error('游戏邀请记录已满，请先导出存档。');
  const invite:StoryGameInvite={...p,version:1,id,anchor:structuredClone(anchor),origin:{...origin},at:new Date().toISOString(),status:'pending'};
  invites.push(invite);created.push(invite);
 }
 return created;
}
export function validateStoryGameInvites(value:unknown){
 if(!Array.isArray(value)||value.length>200||new Set(value.map(v=>v?.id)).size!==value.length)fail();
 for(const i of value){if(!object(i)||Object.keys(i).some(k=>!['version','id','kind','hostId','members','quote','message','anchor','origin','at','status','targetId'].includes(k)))fail();
  cleanStoryGameProposals([{kind:i.kind,hostId:i.hostId,members:i.members,quote:i.quote,message:i.message}]);
  if(i.version!==1||!text(i.id,128)||!text(i.at,60)||!Number.isFinite(Date.parse(i.at))||!['pending','joined','spectating','declined'].includes(String(i.status))||(['joined','spectating'].includes(String(i.status))?!text(i.targetId,128):i.targetId!==undefined))fail();
  const a=i.anchor,o=i.origin;if(!object(a)||Object.keys(a).some(k=>!['key','turnId','variantId','path'].includes(k))||!text(a.key,500)||typeof a.turnId!=='string'||typeof a.variantId!=='string'||!Array.isArray(a.path)||a.path.some(p=>!text(p,300))||!object(o)||Object.keys(o).some(k=>!['turnId','input'].includes(k))||!text(o.turnId,128)||!text(o.input,128))fail();
 }
}
/** The last NPC is a reserve seat, announced before the user joins. Host always stays. */
export function storyGameSeats(i:StoryGameInvite,mode:'joined'|'spectating'){return mode==='joined'?['player',...i.members.slice(0,-1)]:[...i.members];}
