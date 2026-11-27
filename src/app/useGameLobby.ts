import {computed,ref,watch,onScopeDispose} from 'vue';
import type {ViewModel} from './useWorkspace';
import {HttpGateway} from '../gateway/http';
import {taskApi} from '../domain/apis';
import {MODEL_REQUEST_TIMEOUT_MS} from '../domain/requestTimeout';
import {terminalMemoryInjection} from '../domain/memoryInjection';
import {emptyTerminal,terminalId,validateTerminal,type PersonalTerminal} from '../domain/personalTerminal';
import {terminalAnchor,terminalAnchorActive} from '../domain/terminalLedger';
import {storyGameNames,type StoryGameKind} from '../domain/storyGameInvites';
import {gameSeatCount,cleanGameHostDecision,cleanGameGuestDecision} from '../domain/gameRecruitment';
import {lobbyMembers,lobbyCapacity,lobbyReady,lobbyPending,visibleGameLobbies,type GameLobby,type LobbyRequest} from '../domain/gameLobby';
import {createPartyRoom,partyParticipants} from '../domain/partyGames';
import {createWerewolf} from '../domain/werewolf';
import {terminalStoryClock} from '../domain/storyScene';
export function useGameLobby(w:ViewModel){
 const lobbyId=ref(''),working=ref(false),error=ref(''),progress=ref('');
 const lobbies=computed(()=>w.active?visibleGameLobbies(w.active):[]),lobby=computed(()=>lobbies.value.find(l=>l.id===lobbyId.value));
 const actors=computed(()=>[...(w.state?.characters||w.active?.initial.characters||[]),...(w.active?.terminal?.contacts||[]).filter(a=>!w.state?.characters.some(c=>c.id===a.id))]);
 const name=(id:string)=>id==='player'?w.active?.persona.name||'我':actors.value.find(a=>a.id===id)?.name||id;
 const friends=computed(()=>actors.value.filter(a=>w.active?.terminal?.friends.some(f=>f.id===a.id&&f.status==='accepted'&&(!f.anchor||terminalAnchorActive(w.active!,f.anchor)))));
 const members=computed(()=>lobby.value?lobbyMembers(lobby.value):[]),pending=computed(()=>lobby.value&&lobbyPending(lobby.value));
 const available=computed(()=>friends.value.filter(a=>!members.value.includes(a.id)));
 const outsiders=computed(()=>actors.value.filter(a=>!members.value.includes(a.id)&&!friends.value.some(f=>f.id===a.id)));
 const blocked=computed(()=>working.value||w.busy||w.terminalBusy||w.backupWorking||w.restoreInterrupted||!w.active);
 const profile=()=>taskApi(w.preferences,'terminal'),signature=()=>JSON.stringify([profile(),w.credentials[profile()?.id||'']]);
 let controller:AbortController|undefined;
 const cancel=()=>controller?.abort();watch(()=>[w.active?.id,w.terminalEpoch,signature(),lobbyId.value],cancel);onScopeDispose(cancel);
 type Save=(fn:(t:PersonalTerminal)=>void)=>Promise<void>;
 async function operation(fn:(save:Save,check:()=>void,signal:AbortSignal)=>Promise<void>){
  if(blocked.value)return;const session=w.active!,epoch=w.terminalEpoch,sig=signature(),anchor=terminalAnchor(session),selected=lobbyId.value;
  let baseline=JSON.stringify(session.terminal);const c=new AbortController();controller=c;
  const check=()=>{c.signal.throwIfAborted();if(w.active!==session||epoch!==w.terminalEpoch||signature()!==sig||!terminalAnchorActive(session,anchor)||w.restoreInterrupted||JSON.stringify(session.terminal)!==baseline||lobbyId.value!==selected)throw Error('房间、存档、剧情或终端API已改变，迟到的回应未写入。');};
  const save:Save=async(fn)=>{check();const before=session.terminal,next:PersonalTerminal=JSON.parse(JSON.stringify(before||emptyTerminal()));fn(next);validateTerminal(next);check();session.terminal=next;const applied=session.terminal;try{await(w.saveTerminal?w.saveTerminal(session):w.save());if(String(w.storageStatus)==='failed')throw Error('房间未保存成功，请重试。');}catch(e){if(session.terminal===applied)session.terminal=before;throw e;}baseline=JSON.stringify(next);check();};
  working.value=true;w.terminalBusy=true;error.value='';try{await fn(save,check,c.signal);}catch(e){error.value=c.signal.aborted?'已停止。已保存的答复保留，可继续等待未答复的人。':e instanceof Error?e.message:'房间邀请失败';}finally{working.value=false;w.terminalBusy=false;progress.value='';controller=undefined;}
 }
 async function create(kind:StoryGameKind,title='',style='',partyRoomId?:string){
  let created='';await operation(async(save)=>{
   if(!Object.hasOwn(storyGameNames,kind)||title.length>60||style.length>40)throw Error('房间资料不正确');
   const old=partyRoomId?w.active!.terminal?.partyRooms?.find(r=>r.id===partyRoomId):undefined;
   if(partyRoomId&&(!old||old.kind!==kind||old.rounds.length||old.endedAt||!old.members.includes('player')||old.invitationId))throw Error('只能在尚未开局的本人房间补充邀请');
   const existing=lobbies.value.find(l=>partyRoomId&&l.partyRoomId===partyRoomId&&!l.targetId);if(existing){created=existing.id;return;}
   const l:GameLobby={version:1,id:terminalId(),kind,name:old?.name||title.trim()||storyGameNames[kind]+'房间',style:old?.style||style,at:new Date().toISOString(),anchor:terminalAnchor(w.active!),initialMembers:old?partyParticipants(old):['player'],requests:[],...(partyRoomId?{partyRoomId}:{})};
   if(old){const unseated=old.members.filter(id=>id!=='player'&&old.invitations[id]!=='accepted');if(unseated.length)l.requests.push({id:terminalId(),helperId:'player',input:'原房间的入座邀请',maxGuests:unseated.length,excludedIds:[...l.initialMembers],host:{accepted:true,reply:'原房间已发送的邀请',friendEstimate:unseated.length,candidates:unseated.map(id=>({id,basis:'memory',reason:'原房间邀请记录'})),selectedIds:unseated},guests:unseated.filter(id=>old.invitations[id]==='declined').map(id=>({id,accepted:false,reply:old.inviteReplies[id]||'婉拒这次邀请'}))});}
   await save(t=>{if((t.gameLobbies||[]).length>=40)throw Error('等候房间已达上限，请先备份整理。');(t.gameLobbies||=[]).push(l);});created=l.id;
  });if(created)lobbyId.value=created;return created;
 }
 function activeLobby(){const l=lobby.value;if(!l||l.targetId||!w.active||!terminalAnchorActive(w.active,l.anchor))throw Error('此等候房间已不可修改');if(l.partyRoomId){const r=w.active.terminal?.partyRooms?.find(r=>r.id===l.partyRoomId);if(!r||r.rounds.length||r.endedAt||JSON.stringify(partyParticipants(r))!==JSON.stringify(l.initialMembers))throw Error('原房间已经改变，请重新进入');}return l;}
 async function ask(l:GameLobby,r:LobbyRequest,actorId:string,host:boolean,check:()=>void,signal:AbortSignal){
  check();activeLobby();const p=profile();if(!p)throw Error('请先配置终端API');if(!w.connectionReady(p)&&!await w.connectProfile(p))throw Error('终端API连接失败');check();
  const state={characters:actors.value.map(a=>({id:a.id,name:a.name,identity:(a.identity||'').slice(0,300),...(a.id===actorId?{relationship:(a.relationship||'').slice(0,3000)}:{})}))};
  const result=await new HttpGateway().terminal({task:host?'game-friends-host':'game-friends-guest',sessionId:w.active!.id,actorIds:[actorId],persona:{name:w.active!.persona.name},input:host?r.input:(name(r.helperId)+'邀请你加入'+l.name+'，一起玩'+storyGameNames[l.kind]+'。').slice(0,500),context:{state,recruitment:{kind:l.kind,mode:'joined',hostId:r.helperId,room:{memberIds:r.excludedIds,openSeats:r.maxGuests,...(host&&r.wantedId?{wantedId:r.wantedId}:{})}},memories:terminalMemoryInjection(w.active!,[actorId],[]).map(m=>m.slice(0,3000))}},p,w.credentials[p.id]||'',AbortSignal.any([signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]));check();activeLobby();return result;
 }
 async function recruit(requestId:string,save:Save,check:()=>void,signal:AbortSignal){
  let l=activeLobby(),r=l.requests.find(r=>r.id===requestId)!;if(!r)throw Error('邀请记录不存在');
  if(!r.host){progress.value='正在等'+name(r.helperId)+'决定是否帮忙邀请…';const decision=cleanGameHostDecision(await ask(l,r,r.helperId,true,check,signal),r.helperId,r.maxGuests,new Set(actors.value.map(a=>a.id)));if(decision.selectedIds.some(id=>r.excludedIds.includes(id)||r.wantedId&&id!==r.wantedId))throw Error('角色选择了已有座位或未指定的对象，未发送邀请。');await save(t=>{t.gameLobbies!.find(l=>l.id===lobbyId.value)!.requests.find(x=>x.id===requestId)!.host=decision;});}
  l=activeLobby();r=l.requests.find(r=>r.id===requestId)!;if(!r.host?.accepted)return;
  for(const id of r.host.selectedIds){l=activeLobby();r=l.requests.find(r=>r.id===requestId)!;if(r.guests.some(g=>g.id===id))continue;progress.value='正在等待'+name(id)+'回应邀请…';const answer=cleanGameGuestDecision(await ask(l,r,id,false,check,signal),id);await save(t=>{t.gameLobbies!.find(l=>l.id===lobbyId.value)!.requests.find(x=>x.id===requestId)!.guests.push(answer);});}
 }
 function newRequest(helperId:string,input:string,wantedId?:string):LobbyRequest{
  const l=activeLobby(),seated=lobbyMembers(l),space=lobbyCapacity(l.kind)-seated.length;if(lobbyPending(l))throw Error('请先处理尚未完成的邀请');if(space<1)throw Error('房间座位已满');
  if(helperId!=='player'&&!friends.value.some(f=>f.id===helperId))throw Error('只能拜托自己的好友');if(!input.trim()||input.length>500)throw Error('请填写500字以内的邀请留言');
  if(wantedId&&(!actors.value.some(a=>a.id===wantedId)||seated.includes(wantedId)||wantedId===helperId))throw Error('邀请对象无效或已经入座');
  return {id:terminalId(),helperId,input:input.trim(),...(wantedId?{wantedId}:{}),maxGuests:wantedId?1:Math.min(space,Math.max(1,gameSeatCount(l.kind)-seated.length)),excludedIds:[...seated],guests:[]};
 }
 const help=(helperId:string,input:string,wantedId?:string)=>operation(async(save,check,signal)=>{const r=newRequest(helperId,input,wantedId);await save(t=>{t.gameLobbies!.find(l=>l.id===lobbyId.value)!.requests.push(r);});await recruit(r.id,save,check,signal);});
 const direct=(ids:string[])=>operation(async(save,check,signal)=>{const l=activeLobby();if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!available.value.some(f=>f.id===id))||ids.length>lobbyCapacity(l.kind)-lobbyMembers(l).length)throw Error('请选择未入座的好友，不能超过空位数');const r=newRequest('player','邀请你来房间一起玩');r.maxGuests=ids.length;r.host={accepted:true,reply:'你发出的入房邀请',friendEstimate:ids.length,candidates:ids.map(id=>({id,basis:'memory',reason:'玩家已添加的好友'})),selectedIds:[...ids]};await save(t=>{t.gameLobbies!.find(l=>l.id===lobbyId.value)!.requests.push(r);});await recruit(r.id,save,check,signal);});
 const resume=()=>operation(async(save,check,signal)=>{const r=lobbyPending(activeLobby());if(r)await recruit(r.id,save,check,signal);});
 async function start(){let target='';await operation(async(save)=>{const l=activeLobby();if(!lobbyReady(l))throw Error('人数不足或仍有人未答复，不能开局');const ids=lobbyMembers(l);if(ids.some(id=>id!=='player'&&!actors.value.some(a=>a.id===id)))throw Error('入座角色已不在存档');await save(t=>{const current=t.gameLobbies!.find(x=>x.id===l.id)!;if(l.kind==='werewolf'){const clock=terminalStoryClock(w.state,w.active!.opening),g=createWerewolf(ids.map(id=>({id,name:name(id)})),l.anchor,[clock.label,clock.time].join(' '));if((t.werewolfGames||[]).length>=1000)throw Error('对局已达上限');(t.werewolfGames||=[]).push(g);current.targetId=g.id;}else{const r=createPartyRoom(l.kind,ids.slice(1),l.name,l.style,l.partyRoomId||terminalId());r.invitations=Object.fromEntries(ids.filter(id=>id!=='player').map(id=>[id,'accepted']));r.inviteReplies=Object.fromEntries(current.requests.flatMap(q=>q.guests.filter(g=>g.accepted).map(g=>[g.id,g.reply])));if(l.partyRoomId){const i=t.partyRooms!.findIndex(x=>x.id===l.partyRoomId);if(i<0)throw Error('原房间不存在');r.inviteReplies={...Object.fromEntries(Object.entries(t.partyRooms![i].inviteReplies).filter(([id])=>r.members.includes(id))),...r.inviteReplies};t.partyRooms![i]=r;}else{if((t.partyRooms||[]).length>=20)throw Error('聚会房间已达上限');(t.partyRooms||=[]).push(r);}current.targetId=r.id;}target=current.targetId!;});});return error.value?'':target;}
 return {lobbyId,lobby,lobbies,members,friends,available,outsiders,pending,blocked,working,error,progress,name,create,help,direct,resume,start,cancel};
}
