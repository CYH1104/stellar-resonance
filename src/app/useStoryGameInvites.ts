import {computed,ref,watch,onScopeDispose} from 'vue';
import {HttpGateway} from '../gateway/http';
import {taskApi} from '../domain/apis';
import {MODEL_REQUEST_TIMEOUT_MS} from '../domain/requestTimeout';
import {cleanGameHostDecision,cleanGameGuestDecision,requiredGameNpcs,refreshGameRecruitment} from '../domain/gameRecruitment';
import {terminalMemoryInjection} from '../domain/memoryInjection';
import type {ViewModel} from './useWorkspace';
import {emptyTerminal,terminalId,validateTerminal,type PersonalTerminal} from '../domain/personalTerminal';
import {visibleStoryGameInvites,storyGameNames,storyGameSeats,type StoryGameInvite} from '../domain/storyGameInvites';
import {createHostedPartyRoom} from '../domain/partyGames';
import {createWerewolf} from '../domain/werewolf';
import {terminalStoryClock} from '../domain/storyScene';
import {terminalAnchor,terminalAnchorActive} from '../domain/terminalLedger';

export function useStoryGameInvites(w:ViewModel,options:{automatic?:boolean}={}){
 const working=ref(false),error=ref(''),progress=ref('');
 const invitations=computed(()=>w.active?visibleStoryGameInvites(w.active):[]);
 const actors=computed(()=>[...(w.state?.characters||w.active?.initial.characters||[]),...(w.active?.terminal?.contacts||[]).filter(a=>!w.state?.characters.some(c=>c.id===a.id))]);
 const name=(id:string)=>id==='player'?w.active?.persona.name||'我':actors.value.find(a=>a.id===id)?.name||id;
 const blocked=computed(()=>working.value||w.busy||w.terminalBusy||w.backupWorking||w.restoreInterrupted||!w.active);

 const friends=computed(()=>actors.value.filter(a=>w.active?.terminal?.friends.some(f=>f.id===a.id&&f.status==='accepted'&&(!f.anchor||terminalAnchorActive(w.active!,f.anchor)))));
 const profile=computed(()=>taskApi(w.preferences,'terminal'));
 const signature=()=>JSON.stringify([profile.value,w.credentials[profile.value?.id||'']]);
 let abort:AbortController|undefined;
 const cancel=()=>abort?.abort();
 watch(()=>[w.active?.id,w.terminalEpoch,signature()],cancel);onScopeDispose(cancel);
 async function operation(fn:(save:(mutate:(t:PersonalTerminal)=>void)=>Promise<void>,check:()=>void,signal:AbortSignal)=>Promise<void>){
  if(blocked.value)return;
  const session=w.active!,epoch=w.terminalEpoch,sig=signature(),anchor=terminalAnchor(session);let baseline=JSON.stringify(session.terminal);
  const controller=new AbortController();abort=controller;const signal=controller.signal;
  const check=()=>{signal.throwIfAborted();if(w.active!==session||epoch!==w.terminalEpoch||sig!==signature()||!terminalAnchorActive(session,anchor)||w.restoreInterrupted||JSON.stringify(session.terminal)!==baseline)throw Error('存档、剧情、终端API或邀请记录已改变，本次回应未写入。');};
  const save=async(mutate:(t:PersonalTerminal)=>void)=>{
   check();const before=session.terminal,next:PersonalTerminal=JSON.parse(JSON.stringify(before||emptyTerminal()));mutate(next);validateTerminal(next);check();
   session.terminal=next;const applied=session.terminal;
   try{await(w.saveTerminal?w.saveTerminal(session):w.save());if(String(w.storageStatus)==='failed')throw Error('邀请未能保存，请重试。');}
   catch(e){if(session.terminal===applied)session.terminal=before;throw e;}
   baseline=JSON.stringify(next);check();
  };
  working.value=true;w.terminalBusy=true;error.value='';
  try{await fn(save,check,signal);}catch(e){error.value=signal.aborted?'已停止。已保存的回应会保留，继续时只询问尚未答复的人。':e instanceof Error?e.message:'好友邀请失败，已保存记录保留。';}
  finally{working.value=false;w.terminalBusy=false;progress.value='';abort=undefined;}
 }
 async function ask(i:StoryGameInvite,actorId:string,host:boolean,check:()=>void,signal:AbortSignal){
  check();const p=profile.value;if(!p)throw Error('请先配置终端API。');
  if(!w.connectionReady(p)&&!await w.connectProfile(p))throw Error('终端API连接失败。');check();
  if(!actors.value.some(a=>a.id===actorId))throw Error('邀请中的角色已不在当前存档。');
  const r=i.recruitment!,state={characters:actors.value.map(a=>({id:a.id,name:a.name,identity:(a.identity||'').slice(0,300),...(a.id===actorId?{relationship:(a.relationship||'').slice(0,3000)}:{})}))};
  // Each guest receives only their own known facts, not the host's friend estimates or other guests' replies.
  const input=host?(r.source==='story'?('你在正文中主动提出游戏邀约：'+i.quote+'。现在按你自己的意愿联系熟悉的人；'+r.input).slice(0,500):r.input):name(i.hostId)+'邀请你玩'+storyGameNames[i.kind]+'，你愿意参加吗？';
  const answer=await new HttpGateway().terminal({task:host?'game-friends-host':'game-friends-guest',sessionId:w.active!.id,actorIds:[actorId],input,persona:{name:w.active!.persona.name},context:{state,recruitment:{kind:i.kind,mode:r.mode,hostId:i.hostId},memories:terminalMemoryInjection(w.active!,[actorId],[]).map(m=>m.slice(0,3000))}},p,w.credentials[p.id]||'',AbortSignal.any([signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]));
  check();return answer;
 }
 async function recruit(id:string,save:(mutate:(t:PersonalTerminal)=>void)=>Promise<void>,check:()=>void,signal:AbortSignal){
  let i=invitations.value.find(i=>i.id===id);if(!i?.recruitment||i.status!=='negotiating')return;
  if(!i.recruitment.host){
   progress.value=name(i.hostId)+'正在联系自己的朋友…';
   const decision=cleanGameHostDecision(await ask(i,i.hostId,true,check,signal),i.hostId,requiredGameNpcs(i.kind,i.recruitment.mode)-1,new Set(actors.value.map(a=>a.id)));
   await save(t=>{const x=t.gameInvitations!.find(x=>x.id===id)!;x.recruitment!.host=decision;refreshGameRecruitment(x);});
  }
  i=invitations.value.find(i=>i.id===id)!;
  if(!i.recruitment!.host?.accepted)return;
  for(const actorId of i.recruitment!.host.selectedIds){
   i=invitations.value.find(i=>i.id===id)!;if(i.recruitment!.guests.some(g=>g.id===actorId))continue;
   progress.value='正在等待'+name(actorId)+'答复'+name(i.hostId)+'的邀请…';
   const decision=cleanGameGuestDecision(await ask(i,actorId,false,check,signal),actorId);
   await save(t=>{const x=t.gameInvitations!.find(x=>x.id===id)!;x.recruitment!.guests.push(decision);refreshGameRecruitment(x);});
  }
 }
 const continueRecruitment=(id:string)=>operation((save,check,signal)=>recruit(id,save,check,signal));
 async function respond(id:string,mode:'joined'|'spectating'|'declined'):Promise<StoryGameInvite|undefined>{
  if(blocked.value)return;const session=w.active!,before=session.terminal,epoch=w.terminalEpoch;
  const invite=invitations.value.find(i=>i.id===id);if(!invite||(mode==='declined'?!['negotiating','unfilled','refused','pending'].includes(invite.status):invite.status!=='pending'))return;
  working.value=true;w.terminalBusy=true;error.value='';
  try{
   const next:PersonalTerminal=JSON.parse(JSON.stringify(before||emptyTerminal())),i=next.gameInvitations!.find((i:StoryGameInvite)=>i.id===id)!;
   if(mode!=='declined'){
    const seats=storyGameSeats(i,mode),anchor=terminalAnchor(session);
    if(seats.some(id=>id!=='player'&&!actors.value.some(a=>a.id===id)))throw Error('邀请中的角色已不在当前存档。');
    if(i.kind==='werewolf'){
     const games=next.werewolfGames||=[];if(games.length>=1000)throw Error('对局记录已满，请先备份。');
     const clock=terminalStoryClock(w.state,session.opening),g=createWerewolf(seats.map(id=>({id,name:name(id)})),anchor,[clock.label,clock.time].join(' '),{hostId:i.hostId,invitationId:i.id});games.push(g);i.targetId=g.id;
    }else{
     const rooms=next.partyRooms||=[];if(rooms.length>=20)throw Error('聚会房间最多20个，请先备份整理。');
     const room=createHostedPartyRoom(i.kind,seats,i.hostId,i.id,(name(i.hostId)+'的'+storyGameNames[i.kind]).slice(0,60),terminalId());rooms.push(room);i.targetId=room.id;
    }
   }
   i.status=mode;validateTerminal(next);
   if(w.active!==session||w.terminalEpoch!==epoch||!invitations.value.some(i=>i.id===id))throw Error('存档或剧情分支已经改变，邀请未接受。');
   session.terminal=next;const applied=session.terminal;
   try{await(w.saveTerminal?w.saveTerminal(session):w.save());if(String(w.storageStatus)==='failed')throw Error('邀请未能保存，请重试。');}catch(e){if(session.terminal===applied)session.terminal=before;throw e;}
   return w.active===session?i:undefined;
  }catch(e){error.value=e instanceof Error?e.message:'邀请操作失败';return undefined;}
  finally{working.value=false;w.terminalBusy=false;}
 }
 if(options.automatic){
  const attempted=new Set<string>();
  watch(()=>[w.active?.id,w.terminalEpoch,signature(),blocked.value,w.preferences.terminalEnabled,w.loading,invitations.value.map(i=>i.id+':'+i.status).join('|')],()=>{
   if(blocked.value||w.loading||!w.preferences.terminalEnabled)return;
   const i=invitations.value.find(i=>i.recruitment?.source==='story'&&i.status==='negotiating'&&!attempted.has(w.active!.id+':'+w.terminalEpoch+':'+i.id));
   if(!i)return;attempted.add(w.active!.id+':'+w.terminalEpoch+':'+i.id);void continueRecruitment(i.id);
  },{immediate:true,flush:'post'});
 }
 return {invitations,friends,working,error,progress,blocked,name,respond,continueRecruitment,cancel};
}
