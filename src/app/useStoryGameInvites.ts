import {computed,ref} from 'vue';
import type {ViewModel} from './useWorkspace';
import {emptyTerminal,terminalId,validateTerminal,type PersonalTerminal} from '../domain/personalTerminal';
import {visibleStoryGameInvites,storyGameNames,storyGameSeats,type StoryGameInvite} from '../domain/storyGameInvites';
import {createHostedPartyRoom} from '../domain/partyGames';
import {createWerewolf} from '../domain/werewolf';
import {terminalStoryClock} from '../domain/storyScene';
import {terminalAnchor} from '../domain/terminalLedger';

export function useStoryGameInvites(w:ViewModel){
 const working=ref(false),error=ref('');
 const invitations=computed(()=>w.active?visibleStoryGameInvites(w.active):[]);
 const actors=computed(()=>[...(w.state?.characters||w.active?.initial.characters||[]),...(w.active?.terminal?.contacts||[])]);
 const name=(id:string)=>id==='player'?w.active?.persona.name||'我':actors.value.find(a=>a.id===id)?.name||id;
 const blocked=computed(()=>working.value||w.busy||w.terminalBusy||w.backupWorking||w.restoreInterrupted||!w.active);
 async function respond(id:string,mode:'joined'|'spectating'|'declined'):Promise<StoryGameInvite|undefined>{
  if(blocked.value)return;const session=w.active!,before=session.terminal,epoch=w.terminalEpoch;
  const invite=invitations.value.find(i=>i.id===id);if(!invite||invite.status!=='pending')return;
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
 return {invitations,working,error,blocked,name,respond};
}
