import type {Session} from './contracts';
import type {TerminalAnchor} from './terminalLedger';
import {terminalAnchorActive} from './terminalLedger.ts';
import {storyGameNames,type StoryGameKind} from './storyGameInvites.ts';
import {gameSeatCount,cleanGameHostDecision,cleanGameGuestDecision,type GameHostDecision,type GameGuestDecision} from './gameRecruitment.ts';
export interface LobbyRequest {id:string;helperId:string;input:string;wantedId?:string;maxGuests:number;excludedIds:string[];host?:GameHostDecision;guests:GameGuestDecision[]}
/** Waiting rooms contain invitation decisions only; roles/cards are created after seats are confirmed. */
export interface GameLobby {version:1;id:string;kind:StoryGameKind;name:string;style:string;at:string;anchor:TerminalAnchor;initialMembers:string[];requests:LobbyRequest[];partyRoomId?:string;targetId?:string}
export const lobbyCapacity=(kind:StoryGameKind)=>['truth','liar','eleven'].includes(kind)?8:gameSeatCount(kind);
export const lobbyMembers=(l:GameLobby)=>[...l.initialMembers,...l.requests.flatMap(r=>(r.host?.selectedIds||[]).filter(id=>r.guests.some(g=>g.id===id&&g.accepted)))];
export const requestPending=(r:LobbyRequest)=>!r.host||r.host.accepted&&r.host.selectedIds.some(id=>!r.guests.some(g=>g.id===id));
export const lobbyPending=(l:GameLobby)=>l.requests.find(requestPending);
export const lobbyReady=(l:GameLobby)=>!l.targetId&&!lobbyPending(l)&&lobbyMembers(l).length>=gameSeatCount(l.kind);
export const visibleGameLobbies=(s:Session)=>(s.terminal?.gameLobbies||[]).filter(l=>terminalAnchorActive(s,l.anchor));
function fail():never{throw Error('游戏等候房间格式不正确');}
const obj=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:any,n:number)=>typeof v==='string'&&v.length<=n;
const id=(v:any)=>text(v,128)&&v.length>0&&!/[\s\u0000-\u001f]/u.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const unique=(a:any,min:number,max:number)=>Array.isArray(a)&&a.length>=min&&a.length<=max&&a.every(id)&&new Set(a).size===a.length;
const keys=(v:any,allowed:string[])=>{if(!obj(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();};
export function validateGameLobbies(raw:unknown):asserts raw is GameLobby[]{
 if(!Array.isArray(raw)||raw.length>40||new Set(raw.map(l=>l?.id)).size!==raw.length)fail();
 for(const l of raw){
  keys(l,['version','id','kind','name','style','at','anchor','initialMembers','requests','partyRoomId','targetId']);
  if(l.version!==1||!id(l.id)||!Object.hasOwn(storyGameNames,l.kind)||!text(l.name,60)||!l.name.trim()||!text(l.style,40)||!text(l.at,60)||!Number.isFinite(Date.parse(l.at))||!unique(l.initialMembers,1,lobbyCapacity(l.kind))||l.initialMembers[0]!=='player'||!Array.isArray(l.requests)||l.requests.length>100||new Set(l.requests.map((r:any)=>r?.id)).size!==l.requests.length||l.partyRoomId!==undefined&&(!id(l.partyRoomId)||l.kind==='werewolf')||l.targetId!==undefined&&!id(l.targetId))fail();
  keys(l.anchor,['key','turnId','variantId','path']);if(!text(l.anchor.key,500)||!l.anchor.key||!text(l.anchor.turnId,128)||!text(l.anchor.variantId,128)||!Array.isArray(l.anchor.path)||l.anchor.path.length>10000||l.anchor.path.some((p:any)=>!text(p,500)||!p))fail();
  let members=[...l.initialMembers];
  for(const [index,r] of l.requests.entries()){
   keys(r,['id','helperId','input','wantedId','maxGuests','excludedIds','host','guests']);
   if(!id(r.id)||!id(r.helperId)||!text(r.input,500)||!r.input.trim()||r.wantedId!==undefined&&(!id(r.wantedId)||r.wantedId==='player')||!Number.isInteger(r.maxGuests)||r.maxGuests<1||r.maxGuests>lobbyCapacity(l.kind)-members.length||!unique(r.excludedIds,1,8)||JSON.stringify(r.excludedIds)!==JSON.stringify(members)||!Array.isArray(r.guests)||r.guests.length>7)fail();
   if(r.host!==undefined){cleanGameHostDecision(r.host,r.helperId,r.maxGuests);if(r.host.selectedIds.some((a:string)=>members.includes(a)||r.wantedId&&r.wantedId!==a))fail();}
   if(new Set(r.guests.map((g:any)=>g?.id)).size!==r.guests.length)fail();
   for(const g of r.guests){if(!r.host?.accepted||!r.host.selectedIds.includes(g?.id))fail();cleanGameGuestDecision(g,g.id);}
   if(requestPending(r)&&index!==l.requests.length-1)fail();
   members.push(...r.guests.filter((g:GameGuestDecision)=>g.accepted).map((g:GameGuestDecision)=>g.id));
  }
  const seated=lobbyMembers(l);if(!unique(seated,1,lobbyCapacity(l.kind))||l.targetId&&(lobbyPending(l)||seated.length<gameSeatCount(l.kind)))fail();
 }
}
