import {computed,ref,watch,onScopeDispose,toRaw} from 'vue';
import type {ViewModel} from './useWorkspace';
import {HttpGateway} from '../gateway/http';
import {terminalStoryClock} from '../domain/storyScene';
import {taskApi} from '../domain/apis';
import {MODEL_REQUEST_TIMEOUT_MS} from '../domain/requestTimeout';
import {emptyTerminal} from '../domain/personalTerminal';
import {terminalAnchor,terminalAnchorActive,recordTerminalChat,syncTerminalMemoryNotes,isTerminalMemoryNote} from '../domain/terminalLedger';
import {createWerewolf,replayWerewolf,wolfView,wolfRequest,wolfActionFromResult,actWerewolf,wolfRole,wolfNightReady,type WerewolfGame,type WolfAction,type WolfTask} from '../domain/werewolf';

const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
export function useWerewolf(w:ViewModel){
 const gameId=ref(''),picked=ref<string[]>([]),draft=ref(''),target=ref(''),error=ref(''),working=ref(false),active=ref(true);
 const terminal=computed(()=>w.active?.terminal||emptyTerminal());
 const actors=computed(()=>[...(w.state?.characters||w.active?.initial.characters||[]),...(terminal.value.contacts||[]).filter(c=>!w.state?.characters.some(a=>a.id===c.id))]);
 const name=(id:string)=>id==='player'?w.active?.persona.name||'我':actors.value.find(a=>a.id===id)?.name||id;
 const friends=computed(()=>terminal.value.friends.filter(f=>f.status==='accepted'&&(!f.anchor||!!w.active&&terminalAnchorActive(w.active,f.anchor))).map(f=>({id:f.id,name:name(f.id)})));
 const games=computed(()=>(terminal.value.werewolfGames||[]).filter(g=>!!w.active&&terminalAnchorActive(w.active,g.anchor)));
 const game=computed(()=>games.value.find(g=>g.id===gameId.value));
 const state=computed(()=>game.value?replayWerewolf(game.value):undefined);
 const view=computed(()=>game.value?wolfView(game.value,'player'):undefined);
 const profile=computed(()=>taskApi(w.preferences,'terminal'));
 const signature=()=>JSON.stringify([profile.value,w.credentials[profile.value?.id||'']]);
 let abort:AbortController|undefined;
 function cancel(){abort?.abort();}
 watch(()=>[w.active?.id,w.terminalEpoch,signature(),active.value],cancel);
 watch(()=>w.active?.id,()=>{gameId.value='';picked.value=[];draft.value='';error.value='';});
 onScopeDispose(cancel);
 const humanAction=computed(()=>{
  const s=state.value,g=game.value;if(!s||!g)return '';
  if(['speech','lastwords'].includes(s.phase)&&s.order[s.index]==='player')return 'speak';
  if(!s.alive.includes('player'))return '';
  if(s.phase==='vote'&&s.order.includes('player')&&!Object.hasOwn(s.votes,'player'))return 'vote';
  if(s.phase!=='night')return '';
  if(wolfRole(g,'player')==='wolf'&&!s.night.target&&(!s.alive.some(id=>id!=='player'&&wolfRole(g,id)==='wolf')||s.night.opinions))return 'knife';
  if(wolfRole(g,'player')==='seer'&&!s.night.inspected)return 'inspect';
  if(wolfRole(g,'player')==='witch'&&(s.antidote||s.poison)&&s.night.target&&!s.night.medicine)return 'medicine';
  return '';
 });
 const targets=computed(()=>{
  const v=view.value;if(!v)return [];
  return v.players.filter(p=>p.alive&&(humanAction.value==='vote'?v.voteTargets.includes(p.id):humanAction.value==='inspect'?p.id!=='player':true));
 });
 const blocked=computed(()=>working.value||w.busy||w.terminalBusy||w.backupWorking||w.restoreInterrupted||!active.value);
 function toggle(id:string){if(blocked.value)return;picked.value=picked.value.includes(id)?picked.value.filter(w=>w!==id):picked.value.length<5?[...picked.value,id]:picked.value;}
 async function run(fn:(check:()=>void,signal:AbortSignal)=>Promise<void>){
  if(blocked.value||!w.active)return;
  const session=w.active,epoch=w.terminalEpoch,sig=signature(),anchor=terminalAnchor(session);abort=new AbortController();const signal=abort.signal;
  const check=()=>{signal.throwIfAborted();if(!active.value||w.active!==session||w.active.id!==session.id||w.terminalEpoch!==epoch||signature()!==sig||!terminalAnchorActive(session,anchor)||w.restoreInterrupted)throw Error('存档、剧情分支或终端API已改变，本次操作停止。');};
  working.value=true;w.terminalBusy=true;error.value='';
  try{await fn(check,signal);}catch(e){error.value=signal.aborted?'已暂停。已保存的行动会保留，回来后可继续。':e instanceof Error?e.message:'操作失败，原记录保留。';}finally{working.value=false;w.terminalBusy=false;abort=undefined;}
 }
 async function save(nextGame:WerewolfGame,beforeGame:string|undefined,check:()=>void){
  check();const session=w.active!,before=session.terminal,priorNotes=copy(session.memories.filter(isTerminalMemoryNote));
  const existing=before?.werewolfGames?.find(g=>g.id===nextGame.id);
  if(JSON.stringify(existing)!==beforeGame)throw Error('这一局已发生变化，请重新打开后继续。');
  const next=copy(before||emptyTerminal()),list=next.werewolfGames||=[];const at=list.findIndex(g=>g.id===nextGame.id);
  if(at<0){if(list.length>=1000)throw Error('狼人杀记录已达1000局，请先备份整理。');list.push(nextGame);}else list[at]=nextGame;
  // Only public participation/result goes to shared recall. Secret roles remain in the game and per-request projections.
  const s=replayWerewolf(nextGame),summary=`${nextGame.storyDate}（现实时间${nextGame.at}），${nextGame.seats.map(p=>p.name).join('、')}一起玩六人狼人杀。${s.phase==='complete'?(s.winner==='wolf'?'狼人':'好人')+'阵营获胜；本局已结束，身份不公开。':'对局进行中，身份保密。'}`;
  recordTerminalChat(next,nextGame.anchor,{id:'werewolf:'+nextGame.id,title:'狼人杀',group:true},nextGame.seats.map(p=>p.id),summary,[],nextGame.seats.map(p=>p.id));
  session.terminal=next;syncTerminalMemoryNotes(session);
  try{await (w.saveTerminal?w.saveTerminal(session):w.save());if(String(w.storageStatus)==='failed')throw Error('存档写入失败，行动未提交，请检查存储后重试。');}
  catch(e){if(toRaw(session.terminal)===next){session.terminal=before;session.memories=[...session.memories.filter(m=>!isTerminalMemoryNote(m)),...priorNotes];}throw e;}
  check();void w.indexTerminalNotes?.();
 }
 async function commit(actions:WolfAction[],check:()=>void){const g=game.value;if(!g)throw Error('当前对局已改变。');await save(actWerewolf(g,actions),JSON.stringify(g),check);target.value='';}
 async function request(g:WerewolfGame,task:WolfTask,actor:string,check:()=>void,signal:AbortSignal){
  check();const p=profile.value;if(!p)throw Error('请先设置终端API。');
  const r=wolfRequest(g,task,actor);
  const traits=r.actorIds.map(id=>{const a=actors.value.find(a=>a.id===id);return {id,personality:a?[a.identity,a.relationship].filter(v=>typeof v==='string').join('\n').slice(0,6000):''};});
  const answer=await new HttpGateway().terminal({task,sessionId:w.active!.id,actorIds:r.actorIds,context:{werewolf:r,traits}},p,w.credentials[p.id]||'',AbortSignal.any([signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]));check();return wolfActionFromResult(r,answer);
 }
 async function batch(tasks:{task:WolfTask;actor:string}[],check:()=>void,signal:AbortSignal){
  if(!tasks.length)return;check();const p=profile.value;if(!p)throw Error('请先设置终端API。');
  if(!w.connectionReady(p)&&!await w.connectProfile(p))throw Error('终端API连接失败。');check();
  const snapshot=copy(game.value!),before=JSON.stringify(game.value);
  const results=await Promise.allSettled(tasks.map(t=>request(snapshot,t.task,t.actor,check,signal)));check();
  if(JSON.stringify(game.value)!==before)throw Error('等待期间对局已改变，回复没有写入。');
  const actions=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  if(actions.length)await commit(actions,check);
  if(results.some(r=>r.status==='rejected'))throw Error('部分角色未能完成本次回应。成功的行动已保存，点击继续只重试未完成部分。请检查终端API连接或模型返回格式。');
 }
 async function advance(check:()=>void,signal:AbortSignal){
  const phase=state.value?.phase;if(!game.value||phase==='complete')return;
  if(phase==='night'){
   const g=game.value,s=state.value!,tasks:{task:WolfTask;actor:string}[]=[];
   const wolf=s.alive.find(w=>w!=='player'&&wolfRole(g,w)==='wolf'),seer=s.alive.find(w=>w!=='player'&&wolfRole(g,w)==='seer');
   if(wolf&&!s.night.opinions)tasks.push({task:'werewolf-council',actor:wolf});
   if(seer&&!s.night.inspected)tasks.push({task:'werewolf-inspect',actor:seer});
   await batch(tasks,check,signal);
   if(humanAction.value||!state.value?.night.target)return;
   const witch=state.value.alive.find(w=>wolfRole(game.value!,w)==='witch');
   if(witch&&!state.value.night.medicine){
    if(!state.value.antidote&&!state.value.poison)await commit([{type:'medicine',actor:witch,save:false,poison:null}],check);
    else if(witch!=='player')await batch([{task:'werewolf-medicine',actor:witch}],check,signal);
   }
   if(wolfNightReady(game.value!,state.value!))await commit([{type:'dawn'}],check);
   return;
  }
  if(phase==='speech'||phase==='lastwords'){
   // Sequential requests: each speaker sees only already published messages.
   while(state.value?.phase===phase&&!humanAction.value){const actor=state.value.order[state.value.index];if(!actor)break;await batch([{task:'werewolf-speak',actor}],check,signal);}
   return;
  }
  if(phase==='vote'){
   const s=state.value!;
   await batch(s.order.filter(id=>id!=='player'&&!Object.hasOwn(s.votes,id)).map(actor=>({task:'werewolf-vote',actor})),check,signal);
   if(state.value?.order.every(id=>Object.hasOwn(state.value!.votes,id)))await commit([{type:'tally'}],check);
  }
 }
 const resume=()=>run(advance);
 function start(){return run(async(check,signal)=>{
  if(picked.value.length!==5||picked.value.some(id=>!friends.value.some(f=>f.id===id)))throw Error('请选择5位已添加的好友，加上你一共6人。');
  const g=createWerewolf(['player',...picked.value].map(id=>({id,name:name(id)})),terminalAnchor(w.active!),[terminalStoryClock(w.state,w.active!.opening).label,terminalStoryClock(w.state,w.active!.opening).time].join(' '));
  await save(g,undefined,check);gameId.value=g.id;draft.value='';await advance(check,signal);
 });}
 function submit(kind:string){return run(async(check,signal)=>{
  const mode=humanAction.value;if(!mode)throw Error('尚未轮到你行动。');let action:WolfAction;
  if(mode==='speak'){if(!draft.value.trim())throw Error('请先输入发言。');action={type:'speak',actor:'player',text:draft.value.trim()};}
  else if(mode==='knife')action={type:'knife',target:target.value};
  else if(mode==='inspect')action={type:'inspect',actor:'player',target:target.value};
  else if(mode==='vote')action={type:'vote',actor:'player',target:kind==='abstain'?null:target.value};
  else action={type:'medicine',actor:'player',save:kind==='save',poison:kind==='poison'?target.value:null};
  await commit([action],check);if(mode==='speak')draft.value='';await advance(check,signal);
 });}
 function open(id:string){if(working.value)return;gameId.value=id;target.value='';draft.value='';error.value='';}
 function back(){cancel();if(gameId.value){gameId.value='';return true;}return false;}
 return {gameId,picked,draft,target,error,working,view,friends,games,humanAction,targets,blocked,toggle,start,resume,submit,open,back,setActive:(v:boolean)=>{active.value=v;},cancel};
}
