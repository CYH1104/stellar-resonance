import type {StoryGameKind,StoryGameInvite} from './storyGameInvites';
export interface GameFriendCandidate {id:string;basis:'profile'|'memory'|'inference';reason:string}
export interface GameHostDecision {accepted:boolean;reply:string;friendEstimate:number;candidates:GameFriendCandidate[];selectedIds:string[]}
export interface GameGuestDecision {id:string;accepted:boolean;reply:string}
export interface GameRecruitment {source:'player'|'story';input:string;mode:'joined'|'spectating'|'either';host?:GameHostDecision;guests:GameGuestDecision[]}
export const gameSeatCount=(kind:StoryGameKind)=>kind==='landlord'?3:kind==='mahjong'?4:kind==='werewolf'?6:3;
export const requiredGameNpcs=(kind:StoryGameKind,mode:GameRecruitment['mode'])=>gameSeatCount(kind)-(mode==='joined'?1:0);
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,n:number)=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const id=(v:unknown):v is string=>text(v,128)&&!/[\s\u0000-\u001f]/u.test(v as string)&&!['player','__proto__','prototype','constructor'].includes(v as string);
function fail():never{throw Error('好友组局回应格式不正确');}
function keys(v:unknown,allowed:string[]):asserts v is Record<string,any>{if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();}
export function cleanGameHostDecision(raw:unknown,hostId:string,maxGuests:number,known?:Set<string>):GameHostDecision{
 keys(raw,['accepted','reply','friendEstimate','candidates','selectedIds']);
 if(typeof raw.accepted!=='boolean'||!text(raw.reply,500)||!Number.isInteger(raw.friendEstimate)||raw.friendEstimate<0||raw.friendEstimate>30||known&&raw.friendEstimate>known.size-1||!Array.isArray(raw.candidates)||raw.candidates.length>12||!Array.isArray(raw.selectedIds)||raw.selectedIds.length>maxGuests)fail();
 const candidates=raw.candidates.map((c:unknown)=>{keys(c,['id','basis','reason']);if(!id(c.id)||c.id===hostId||known&&!known.has(c.id)||!['profile','memory','inference'].includes(c.basis)||!text(c.reason,300))fail();return {id:c.id,basis:c.basis,reason:c.reason} as GameFriendCandidate;});
 if(new Set(candidates.map(c=>c.id)).size!==candidates.length||raw.friendEstimate<candidates.length||new Set(raw.selectedIds).size!==raw.selectedIds.length||raw.selectedIds.some((v:unknown)=>!id(v)||!candidates.some(c=>c.id===v))||!raw.accepted&&raw.selectedIds.length)fail();
 return {accepted:raw.accepted,reply:raw.reply,friendEstimate:raw.friendEstimate,candidates,selectedIds:[...raw.selectedIds]};
}
export function cleanGameGuestDecision(raw:unknown,expectedId:string):GameGuestDecision{
 keys(raw,['id','accepted','reply']);if(raw.id!==expectedId||!id(raw.id)||typeof raw.accepted!=='boolean'||!text(raw.reply,500))fail();return {id:raw.id,accepted:raw.accepted,reply:raw.reply};
}
export function validateGameRecruitment(raw:unknown,kind:StoryGameKind,hostId:string):asserts raw is GameRecruitment{
 keys(raw,['source','input','mode','host','guests']);
 if(!['player','story'].includes(raw.source)||!text(raw.input,500)||!['joined','spectating','either'].includes(raw.mode)||raw.source==='player'&&raw.mode==='either'||!Array.isArray(raw.guests)||raw.guests.length>5)fail();
 const host=raw.host===undefined?undefined:cleanGameHostDecision(raw.host,hostId,requiredGameNpcs(kind,raw.mode)-1);
 if(!host&&raw.guests.length||new Set(raw.guests.map((g:any)=>g?.id)).size!==raw.guests.length)fail();
 for(const guest of raw.guests){if(!host?.accepted||!host.selectedIds.includes(guest?.id))fail();cleanGameGuestDecision(guest,guest.id);}
}
export function recruitmentStatus(r:GameRecruitment,kind:StoryGameKind){
 if(!r.host)return 'negotiating';if(!r.host.accepted)return 'refused';
 if(r.guests.length<r.host.selectedIds.length)return 'negotiating';
 return 1+r.guests.filter(g=>g.accepted).length===requiredGameNpcs(kind,r.mode)?'pending':'unfilled';
}
export function refreshGameRecruitment(i:StoryGameInvite){
 const r=i.recruitment;if(!r)throw Error('此邀请没有协商记录');
 i.members=[i.hostId,...(r.host?.selectedIds||[]).filter(id=>r.guests.some(g=>g.id===id&&g.accepted))];
 i.status=recruitmentStatus(r,i.kind);if(r.host)i.message=r.host.reply;
}
