import {fallbackLandlordPhrases,validLandlordPhrases} from '../domain/landlordSpeech';
import {landlordPublicContext,type LandlordRound} from '../domain/landlord';
import {landlordCardLabel} from '../domain/landlordCards';
import {chooseLandlordAction} from '../domain/landlordStrategy';
import type {GameDialogue} from '../domain/gameDialogue';
import {rerollLiar,confirmLiarRoll,liarChallengeOptions,applyLiarMove,applyLiarTurn,completeLiarMove,lastLiarBid,liarBidLabel,type LiarRound,type LiarBid} from '../domain/liarDice';
import {sanitizeDiceSpeech} from '../domain/diceSpeech';
import {computed,ref,watch,onScopeDispose} from 'vue';
import {sanitizeElevenPublicLine,filterElevenDialogue} from '../domain/elevenSpeech';
import {MODEL_REQUEST_TIMEOUT_MS} from '../domain/requestTimeout';
import type {ViewModel} from './useWorkspace';
import {HttpGateway} from '../gateway/http';
import {taskApi} from '../domain/apis';
import {emptyTerminal,terminalId,afterpartyMinChars,afterpartyMaxChars,type PersonalTerminal} from '../domain/personalTerminal';
import {createPartyRoom,applyPartyLandlordAction,partyParticipants,startPartyRound,isElevenAllBust,elevenLimitHalf,elevenHandRank,ensureElevenWaves,elevenWaveChoice,advanceElevenWave,markElevenBatch,applyElevenBatchResult,elevenBatchPrepared,chooseTruth,finishTruth,settlePartyEnd,endPartyRoom,handRank,cardLabel,type PartyRoom,type PartyKind,type TruthRound,type ElevenRound} from '../domain/partyGames';
import {terminalAnchor,terminalAnchorActive,recordTerminalChat,syncTerminalMemoryNotes,terminalBucket,isTerminalMemoryNote,type TerminalAnchor} from '../domain/terminalLedger';

class RetryBindingChanged extends Error {}

/** Separate game controller: all random draws and penalties are committed before model prose. */
export function usePartyGames(w:ViewModel){
 const page=ref<'list'|'create'|'room'|'play'|'history'>('list'),currentKind=ref<PartyKind>('eleven'),roomId=ref(''),picked=ref<string[]>([]),title=ref(''),style=ref('轻松聚会'),draft=ref(''),error=ref(''),working=ref(false),inviteTarget=ref<string|null>(null),inviteNote=ref(''),retryActionLabel=ref('');
 let retryAction:(()=>Promise<void>)|undefined,retryOperation:(()=>Promise<void>)|undefined;let retryAllowsApiSwitch=false;let landlordPaused=false,landlordViewActive=true;
 const pendingInvite=ref<{roomId:string;ids:string[];names:string[]}|undefined>();
  const pendingInvites=computed(()=>room.value?.members.filter(id=>id!=='player'&&room.value!.invitations[id]==='pending')||[]),declinedInvites=computed(()=>room.value?.members.filter(id=>id!=='player'&&room.value!.invitations[id]==='declined')||[]);
 const terminal=computed(()=>w.active?.terminal||emptyTerminal());
 const actors=computed(()=>[...(w.state?.characters||w.active?.initial.characters||[]),...(terminal.value.contacts||[]).filter(c=>!w.state?.characters.some(a=>a.id===c.id))]);
 const name=(id:string)=>id==='player'?w.active?.persona.name||'我':actors.value.find(a=>a.id===id)?.name||'未知角色';
 const friends=computed(()=>terminal.value.friends.filter(f=>f.status==='accepted'&&(!f.anchor||!!w.active&&terminalAnchorActive(w.active,f.anchor))).map(f=>({id:f.id,name:name(f.id)})));
 const visible=(r:{anchor?:TerminalAnchor;archived?:boolean})=>!r.archived&&(!r.anchor||!!w.active&&terminalAnchorActive(w.active,r.anchor));
 const rooms=computed(()=>terminal.value.partyRooms||[]),room=computed(()=>rooms.value.find(r=>r.id===roomId.value)),history=computed(()=>room.value?.rounds.filter(visible)||[]),round=computed(()=>history.value.at(-1));
 const wave=computed(()=>round.value?.kind==='eleven'?round.value.waves?.at(-1):undefined);
 const elevenBatchPending=computed(()=>round.value?.kind==='eleven'&&round.value.batch?.pending===true),elevenPrepared=computed(()=>round.value?.kind==='eleven'&&elevenBatchPrepared(round.value));
 const playerNeedsChoice=computed(()=>round.value?.kind==='eleven'&&round.value.phase==='playing'&&!round.value.stopped.includes('player')&&!wave.value?.choices.player);
 const participants=computed(()=>room.value?partyParticipants(room.value):[]),tolerance=(id:string)=>terminal.value.tolerances?.[id];
 const profile=computed(()=>taskApi(w.preferences,'terminal'));
 let controller:AbortController|undefined,activeSid='',epoch=0,anchor:TerminalAnchor|undefined,cancelled=false;
 const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
 const signature=()=>JSON.stringify([profile.value,w.credentials[profile.value?.id||'']]);
 function guard(){if(cancelled||w.active?.id!==activeSid||w.terminalEpoch!==epoch||anchor&&!terminalAnchorActive(w.active!,anchor))throw Error('存档、剧情分支或终端已改变，操作已停止。');}
 function cancel(){cancelled=true;controller?.abort();}
 watch(()=>[w.active?.id,w.terminalEpoch],cancel);
 // A saved route change must not leave the old provider error looking current.
 // Only invitations can be retried across an API switch: they have no draws or settlement to replay.
 watch(signature,()=>{cancel();if(!working.value&&error.value)error.value=retryAction&&retryAllowsApiSwitch?'终端 API 已更新，旧接口的报错已失效。可重试邀请请求。':'终端 API 已更新，旧接口的报错已失效。请使用当前页面的操作按钮继续。';});onScopeDispose(cancel);
 async function run(action:()=>Promise<void>,label='重试本次操作',retry=action,allowApiSwitch=false){if(working.value||w.busy||w.terminalBusy||w.backupWorking)return;if(w.restoreInterrupted){error.value='请先恢复覆盖前的完整副本。';return;}if(!w.active){error.value='请先打开存档。';return;}
  const startedSignature=signature();working.value=true;w.terminalBusy=true;cancelled=false;activeSid=w.active.id;epoch=w.terminalEpoch;anchor=terminalAnchor(w.active);error.value='';retryAction=undefined;retryOperation=undefined;retryAllowsApiSwitch=allowApiSwitch;retryActionLabel.value='';try{await action();}catch(e){error.value=signature()!==startedSignature?'终端 API 已改变，本次请求已停止。请使用当前页面的操作按钮继续。':e instanceof Error?e.message:'操作失败，原记录已保留。';if(!cancelled&&!(e instanceof RetryBindingChanged)){const failedSid=activeSid,failedRoom=roomId.value,failedEpoch=epoch,failedLifecycle=w.terminalLifecycleEpoch??epoch,failedAnchor=anchor,failedSignature=signature(),failedState=JSON.stringify(room.value);retryOperation=retry;retryAction=async()=>{if(w.active?.id!==failedSid||roomId.value!==failedRoom||(allowApiSwitch?(w.terminalLifecycleEpoch??w.terminalEpoch)!==failedLifecycle||w.preferences.terminalEnabled===false:w.terminalEpoch!==failedEpoch)||(!allowApiSwitch&&signature()!==failedSignature)||failedAnchor&&!terminalAnchorActive(w.active!,failedAnchor)||JSON.stringify(room.value)!==failedState)throw new RetryBindingChanged('房间或接口已改变，请使用当前页面的操作按钮。');await retry();};retryActionLabel.value=label;}}finally{working.value=false;w.terminalBusy=false;controller=undefined;activeSid='';anchor=undefined;}}
 function activeRoom(){const r=room.value;if(!r||r.endedAt)throw Error('游戏已结束，只能回看。');if(history.value.length!==r.rounds.filter(x=>!x.archived).length)throw Error('游戏记录属于其他剧情分支，请返回原分支或新建房间。');return r;}
 function gameName(kind:PartyKind){return kind==='eleven'?'十点半':kind==='liar'?'大话骰':kind==='landlord'?'斗地主':'真心话大冒险';}
 function landlordSummary(r:LandlordRound){
  const phase=r.phase==='bidding'?'正在叫分，最高'+r.highestBid+'分':r.landlord?'地主'+name(r.landlord)+'，公开底牌'+r.bottom.map(landlordCardLabel).join(' '):'等待地主';
  const status=r.result?r.result.winner==='landlord'?'地主胜':r.result.winner==='farmers'?'农民胜':'无人叫分，重新发牌不计分':'剩余张数：'+r.participants.map(id=>name(id)+r.hands[id].length+'张').join('、');
  const actions=r.result?Object.entries(r.result.deltas).map(([id,n])=>name(id)+(n>=0?'+':'')+n+'分').join('，'):'最近动作：'+r.moves.slice(-6).map(m=>name(m.id)+(m.kind==='bid'?'叫'+m.score+'分':m.kind==='pass'?'不出':m.cards.map(landlordCardLabel).join(' '))).join('；');
  const chat=(r.replies||[]).slice(-6).map(line=>name(line.id)+'：'+line.text.slice(0,300)+(line.text.length>300?'…[节选]':'')).join('；');
  return ['第'+r.number+'局',phase,status,actions,chat?'此前公开聊天：'+chat:''].filter(Boolean).join('；');
 }
 function summary(r:PartyRoom){const last=r.rounds.filter(visible).at(-1);if(!last)return gameName(r.kind)+'尚未开始';if(last.kind==='landlord')return landlordSummary(last);if(last.kind==='eleven')return `第${last.number}局，庄家${name(last.banker)}；`+(last.phase==='complete'?(isElevenAllBust(last)?'全员爆牌，无胜负，全员各喝一杯；':`赢家${name(last.winner!)}；`)+Object.entries(last.hands).map(([id,hand])=>name(id)+'：'+hand.map(cardLabel).join(' ')).join('；'):'正在要牌，暗牌尚未揭晓');if(last.kind==='liar'&&last.phase==='rolling')return '正在准备骰子，尚未开始叫号。';if(last.kind==='liar'&&last.challenge)return '第'+last.number+'局，'+(last.challenge.action==='split'?'劈':'开')+'多家逐一结算：'+last.challenge.duels.map(d=>name(d.target)+'叫'+liarBidLabel(d.bid)+'，实际'+d.actual+'个，'+name(d.loser)+'喝'+d.cups+'杯').join('；')+'；下局'+name(last.challenge.nextStarter)+'先叫';if(last.kind==='liar')return `第${last.number}局：`+last.moves.map(m=>name(m.id)+(m.bid?'叫'+liarBidLabel(m.bid):'开骰')+(m.text?'：「'+m.text+'」':'')+(m.replies.length?'；'+m.replies.map(x=>name(x.id)+'说「'+x.text+'」').join('、'):'')).join('；')+(last.phase==='complete'?`。赢家${name(last.winner!)}，${name(last.loser!)}罚酒。`:'');return `第${last.number}轮，${name(last.target)}抽到：真心话「${last.card.truth}」/大冒险「${last.card.dare}」；选择${last.choice||'未选'}；${last.text||'等待回应'}${last.refused?'；拒绝并罚酒一次':''}`;}
 async function write(update:(t:PersonalTerminal)=>void,allowEnded=false){guard();const session=w.active!,before=session.terminal,next=copy(before||emptyTerminal()),priorNotes=copy(session.memories.filter(isTerminalMemoryNote));update(next);
  if(!allowEnded)for(const old of before?.partyRooms||[])if(old.endedAt&&JSON.stringify(old)!==JSON.stringify(next.partyRooms?.find(r=>r.id===old.id)))throw Error('已结束的房间不能修改。');
  for(const r of next.partyRooms||[]){const last=r.rounds.filter(visible).at(-1);if(!last?.anchor)continue;const b=terminalBucket(next,last.anchor),entry={id:r.id+':'+last.number,name:r.name,kind:r.kind,round:last.number,king:last.kind==='landlord'?(last.landlord?name(last.landlord):'待叫分'):last.kind==='eleven'?name(last.banker):last.kind==='liar'?name(last.starter):name(last.target),command:summary(r).slice(0,1000),penalties:Object.entries(r.drunk).filter(([,n])=>n).map(([id,n])=>name(id)+'累计'+n+'杯').join('；'),complete:last.phase==='complete',knownBy:partyParticipants(r),...(r.endedAt?{endedAt:r.endedAt}:{})};const i=b.games.findIndex(x=>x.id===entry.id);if(i<0)b.games.push(entry);else b.games[i]=entry;}
  session.terminal=next;syncTerminalMemoryNotes(session);try{await (w.saveTerminal?w.saveTerminal(session):w.save());if(String(w.storageStatus)==='failed')throw Error('游戏未保存，请先导出备份。');}catch(e){session.terminal=before;session.memories=[...session.memories.filter(m=>!isTerminalMemoryNote(m)),...priorNotes];throw e;}guard();w.indexTerminalNotes?.();}
 async function request(task:string,ids:string[],input:string,extra:object={},timeoutMs=MODEL_REQUEST_TIMEOUT_MS){guard();const p=profile.value;if(!p)throw Error('请先配置终端 API。');const sig=signature();if(!w.connectionReady(p)&&!await w.connectProfile(p))throw Error('请先确认终端 API。');guard();controller=new AbortController();const signal=controller.signal,audience=[...new Set(['player',...ids])];let memories:string[]=[];
  if(w.scopedRecall&&!['party-eleven','party-eleven-talk','party-eleven-batch','party-truth','party-liar-turn','party-liar-reply','party-landlord-style'].includes(task))memories=(await w.scopedRecall(w.active!,input,audience)).map(m=>m.text).slice(0,12);
  guard();signal.throwIfAborted();const timeout=AbortSignal.timeout(timeoutMs),requestSignal=AbortSignal.any([signal,timeout]);const result=await new HttpGateway().terminal({task,sessionId:activeSid,actorIds:ids,input:input.slice(0,2000),persona:w.active!.persona,context:{state:{characters:actors.value},memories,audience,...extra}},p,w.credentials[p.id]||'',requestSignal);guard();signal.throwIfAborted();if(signature()!==sig)throw Error('终端接口已改变，回复未应用。');return result;}
 function partyContext(r:PartyRoom){return {kind:r.kind,participants:partyParticipants(r).map(id=>({id,name:name(id)}))};}
 async function ensureTolerance(r:PartyRoom){const missing=partyParticipants(r).filter(id=>tolerance(id)===undefined);if(!missing.length)return;const result=await request('tolerance',missing,'根据人设确定聚会游戏酒量，已确定的数值不得改变。');await write(t=>{t.tolerances||={};for(const a of result.tolerances||[])if(missing.includes(a.id)&&t.tolerances[a.id]===undefined)t.tolerances[a.id]=a.value;});if(missing.some(id=>tolerance(id)===undefined))throw Error('酒量资料不完整，请重试；尚未开始抽牌或罚酒。');}
 function create(_kind?:PartyKind){let capture:InviteCapture|undefined;return run(async()=>{const kind=_kind||currentKind.value;if(picked.value.some(id=>!friends.value.some(f=>f.id===id)))throw Error('只能邀请当前已添加的好友。');const r=createPartyRoom(kind,picked.value,title.value,style.value,terminalId());await write(t=>{if((t.partyRooms?.length||0)>=20)throw Error('聚会房间最多20个。');(t.partyRooms||=[]).push(r);});roomId.value=r.id;draft.value='';page.value='room';capture=captureInvite(r,r.members.filter(id=>id!=='player'),'');await requestInvites(capture);},'重试邀请请求',async()=>{if(!capture)throw Error('房间尚未创建，请重新创建。');await requestInvites(capture);},true);}
    interface InviteCapture {sid:string;roomId:string;ids:string[];names:Record<string,string>;kind:PartyKind;roomName:string;style:string;note:string;priorReplies:Record<string,string>;participants:{id:string;name:string}[]}
  function captureInvite(r:PartyRoom,ids:string[],note:string):InviteCapture{return {sid:w.active!.id,roomId:r.id,ids:[...ids],names:Object.fromEntries(ids.map(id=>[id,name(id)])),kind:r.kind,roomName:r.name,style:r.style,note:note.trim().slice(0,2000),priorReplies:Object.fromEntries(ids.map(id=>[id,r.inviteReplies[id]||''])),participants:r.members.map(id=>({id,name:name(id)}))};}
  async function requestInvites(capture:InviteCapture){
   if(w.active?.id!==capture.sid||terminal.value.partyRooms?.find(r=>r.id===capture.roomId&&!r.endedAt&&!r.rounds.length)===undefined)throw Error('房间或存档已改变，邀请没有发送。');
   const ids=capture.ids.filter(id=>terminal.value.partyRooms?.find(r=>r.id===capture.roomId)?.members.includes(id)&&terminal.value.partyRooms?.find(r=>r.id===capture.roomId)?.invitations[id]!=='accepted');if(!ids.length){pendingInvite.value=undefined;return;}
   pendingInvite.value={roomId:capture.roomId,ids:[...ids],names:ids.map(id=>capture.names[id])};
   if(capture.note)await write(t=>{const r=t.partyRooms!.find(x=>x.id===capture.roomId)!;r.inviteNotes||={};for(const id of ids)r.inviteNotes[id]=capture.note;});
   try{
    if(w.active?.id!==capture.sid||!terminal.value.partyRooms?.some(r=>r.id===capture.roomId&&!r.endedAt&&!r.rounds.length))throw Error('房间或存档已切换，邀请不再适用。');
    const prior=ids.map(id=>capture.priorReplies[id]?capture.names[id]+'上次答复：'+capture.priorReplies[id]:'').filter(Boolean).join('；').slice(0,600);
    const input=[capture.roomName,capture.style,prior,capture.note?'玩家邀请留言：'+capture.note:''].filter(Boolean).join('；');
    const result=await request('party-invite',ids,input,{party:{kind:capture.kind,participants:capture.participants}});
    if(w.active?.id!==capture.sid||!terminal.value.partyRooms?.some(r=>r.id===capture.roomId&&!r.endedAt&&!r.rounds.length))throw Error('房间或存档已切换，迟到的邀请答复未写入。');
    await write(t=>{const r=t.partyRooms!.find(x=>x.id===capture.roomId)!;for(const d of result.decisions){if(!ids.includes(d.id))continue;r.invitations[d.id]=d.accepted?'accepted':'declined';r.inviteReplies[d.id]=d.reply;}});
   }finally{if(pendingInvite.value?.roomId===capture.roomId)pendingInvite.value=undefined;}
  }
  const invite=()=>{const r=room.value;if(!r)return;const c=captureInvite(r,r.members.filter(id=>id!=='player'&&r.invitations[id]!=='accepted'),'');return run(()=>requestInvites(c),'重试邀请请求',undefined,true);};
  const retryInvites=()=>{const r=room.value;if(!r)return;const c=captureInvite(r,[...pendingInvites.value],'');return run(()=>requestInvites(c),'重试邀请请求',undefined,true);};
  function retryRequest(){const action=retryAction,retry=retryOperation,label=retryActionLabel.value,allowApiSwitch=retryAllowsApiSwitch;if(action)return run(action,label,retry,allowApiSwitch);}
  function beginInvite(id?:string){if(working.value||!room.value||room.value.rounds.length||room.value.endedAt||id&&!declinedInvites.value.includes(id)||!id&&!declinedInvites.value.length)return;inviteTarget.value=id||'*';inviteNote.value=id?room.value.inviteNotes?.[id]||'':'';error.value='';}
  function sendInvite(){if(working.value||w.busy||w.terminalBusy||w.backupWorking||inviteTarget.value===null)return;const r=room.value;if(!r)return;const ids=inviteTarget.value==='*'?[...declinedInvites.value]:declinedInvites.value.includes(inviteTarget.value)?[inviteTarget.value]:[];if(!ids.length){inviteTarget.value=null;return;}const capture=captureInvite(r,ids,inviteNote.value);inviteTarget.value=null;inviteNote.value='';error.value='';return run(()=>requestInvites(capture),'重试邀请请求',()=>requestInvites(capture),true);}
function open(id:string){if(working.value&&id!==pendingInvite.value?.roomId)return;roomId.value=id;draft.value='';if(!working.value){error.value='';retryAction=undefined;retryActionLabel.value='';}inviteTarget.value=null;inviteNote.value='';page.value=room.value?.endedAt?'history':'room';}
 async function afterEnd(){if(room.value?.endedAt){page.value='history';if(room.value.endReason==='drunk')await afterparty();}}
 const startOther=()=>run(async()=>{const r=activeRoom();if(partyParticipants(r).length<3)throw Error('至少需要两位好友接受邀请。');await ensureTolerance(r);await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!;settlePartyEnd(rm,t.tolerances||{});if(!rm.endedAt)startPartyRound(rm,anchor);});if(room.value?.endedAt){await afterEnd();return;}draft.value='';page.value='play';});
 function elevenSpoken(text:string,id:string,round:ElevenRound){return sanitizeElevenPublicLine(text,round.hands[id],round.phase==='complete'||elevenHandRank(round,round.hands[id]).kind==='bust');}
 async function syncElevenBatch(){
  const rm=room.value,rr=round.value;if(!rm||rr?.kind!=='eleven'||!rr.batch?.pending)throw Error('没有等待补全的角色回应。');
  const id=rm.id,fingerprint=JSON.stringify(rr),npcs=partyParticipants(rm).filter(id=>id!=='player'),missing=partyParticipants(rm).filter(id=>tolerance(id)===undefined),w=rr.waves!.at(-1)!;
  const result=await request('party-eleven-batch',npcs,'一次返回全部角色的公开发言和下一步要牌决定；如有玩家留言须自然回应，允许诈唬，不要内心独白或真实报牌。',{party:{kind:'eleven',limitHalf:elevenLimitHalf(rr),round:rr.number,wave:w.number,phase:rr.phase,banker:rr.banker,participants:partyParticipants(rm).map(id=>({id,name:name(id)})),privateHands:npcs.map(id=>({id,hand:rr.hands[id],stopped:rr.stopped.includes(id),...(rr.phase==='playing'&&w.choices[id]?{lockedChoice:w.choices[id]}:{})})),missingTolerances:missing,publicTable:partyParticipants(rm).map(id=>({id,cardCount:rr.hands[id].length,stopped:rr.stopped.includes(id),...(elevenHandRank(rr,rr.hands[id]).kind==='bust'?{bust:true,hand:[...rr.hands[id]],score:elevenHandRank(rr,rr.hands[id]).halfPoints/2}:{})})),...(rr.phase==='complete'?{settlement:isElevenAllBust(rr)?{kind:'all-bust'}:{kind:'winner',winner:rr.winner}}:{}),publicLines:filterElevenDialogue((rr.waves||[]).flatMap(x=>x.speeches)).slice(-24),playerInput:rr.batch.playerInput}});
  if(JSON.stringify(round.value)!==fingerprint)throw Error('本轮牌局已改变，角色回应未保存。');
  const prior=[...(rr.waves||[]).flatMap(wave=>wave.speeches),...(rr.batch.finalReplies||[]),...(rr.replies||[])];
   const candidates=result.dialogue?.lines||result.characters.filter((row:{text?:string})=>row.text).map((row:{id:string;text:string})=>({id:row.id,text:row.text}));
   const lines=filterElevenDialogue(candidates.map((line:{id:string;text:string})=>({id:line.id,text:elevenSpoken(line.text,line.id,rr)})).filter((line:{text:string})=>line.text),prior);
   const dialogue:GameDialogue={version:1,lines};
   const rows=result.characters.map((row:{id:string;choice:'hit'|'stand'|null;text:string})=>({...row,text:lines.find(line=>line.id===row.id)?.text||''}));
   await write(t=>{const r=t.partyRooms!.find(r=>r.id===id)!;t.tolerances||={};for(const a of result.tolerances||[])if(missing.includes(a.id)&&t.tolerances[a.id]===undefined)t.tolerances[a.id]=a.value;
   if(missing.some(id=>t.tolerances![id]===undefined))throw Error('酒量结果不完整，请重试本轮回应。');applyElevenBatchResult(r,rows,dialogue);settlePartyEnd(r,t.tolerances||{});
  },!!rm.endedAt);
  await afterEnd();
 }
 async function startEleven(){
  const r=activeRoom();if(partyParticipants(r).length<3)throw Error('至少需要两位好友接受邀请。');
  await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!;settlePartyEnd(rm,t.tolerances||{});if(!rm.endedAt){startPartyRound(rm,anchor);markElevenBatch(rm);}});
  draft.value='';page.value=room.value?.endedAt?'history':'play';if(room.value?.endedAt){await afterEnd();return;}await syncElevenBatch();
 }
 async function stepEleven(choice?:'hit'|'stand'){
  if(round.value?.kind==='eleven'&&round.value.batch?.pending){await syncElevenBatch();return;}
  const r=activeRoom();if(round.value?.kind!=='eleven'||round.value.phase!=='playing')throw Error('本局已经结算。');
  if(!elevenBatchPrepared(round.value)){
   await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!;ensureElevenWaves(rm);markElevenBatch(rm);});await syncElevenBatch();return;
  }
  const input=draft.value.trim().slice(0,500);
  await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!,rr=ensureElevenWaves(rm),wave=rr.waves!.at(-1)!;
   if(!rr.stopped.includes('player')&&!wave.choices.player){if(!choice)throw Error('请先选择要牌或停牌。');wave.playerText=input;if(input)wave.speeches.push({id:'player',text:input});elevenWaveChoice(rm,'player',choice);}
   else if(!wave.playerText){wave.playerText=input;if(input&&!wave.speeches.some(s=>s.id==='player'))wave.speeches.push({id:'player',text:input});}
   advanceElevenWave(rm);markElevenBatch(rm,input);settlePartyEnd(rm,t.tolerances||{});
  });
  draft.value='';page.value=room.value?.endedAt?'history':'play';await syncElevenBatch();
 }
 const hit=()=>run(()=>stepEleven('hit'),'重试本轮角色回应',()=>round.value?.kind==='eleven'&&round.value.batch?.pending?syncElevenBatch():stepEleven('hit'));
 const stand=()=>run(()=>stepEleven('stand'),'重试本轮角色回应',()=>round.value?.kind==='eleven'&&round.value.batch?.pending?syncElevenBatch():stepEleven('stand'));
 // Kept only as a controller compatibility alias; no separate deal button remains in the UI.
 const dealWave=()=>run(()=>stepEleven(),'重试本轮角色回应');

   function pauseLandlord(){landlordPaused=true;}
  function setLandlordActive(value:boolean){landlordViewActive=value;if(!value)landlordPaused=true;}
  async function advanceLandlord(){
   for(let steps=0;steps<3;steps++){
    guard();const rm=room.value,rr=round.value;if(!rm||rr?.kind!=='landlord')throw Error('请先开始斗地主');if(rm.endedAt){await afterEnd();return;}if(rr.phase==='complete'||rr.turn==='player'||landlordPaused||!landlordViewActive||page.value!=='play')return;
    const actor=rr.turn,fp=JSON.stringify(rr),style=rm.landlordStyles?.[actor];if(!style)throw Error('角色牌风尚未配置');await new Promise(resolve=>setTimeout(resolve,450));guard();if(landlordPaused||!landlordViewActive||page.value!=='play')return;if(JSON.stringify(round.value)!==fp)throw Error('斗地主牌局已改变');const action=chooseLandlordAction(landlordPublicContext(rr,actor),style);
    await write(t=>{const r=t.partyRooms!.find(x=>x.id===rm.id)!;applyPartyLandlordAction(r,actor,action);settlePartyEnd(r,t.tolerances||{});});if(room.value?.endedAt){await afterEnd();return;}
   }
  }
  const resumeLandlord=()=>run(async()=>{landlordPaused=false;await advanceLandlord();},'继续角色出牌',advanceLandlord);
  async function startLandlord(){const startPage=page.value;
   const r=activeRoom(),ids=partyParticipants(r);if(ids.length!==3)throw Error('斗地主需要两位好友接受邀请');const missing=ids.filter(id=>tolerance(id)===undefined);
   if(!r.landlordStyles||missing.length||!r.landlordPhrases){
    const fp=JSON.stringify(r),required=!r.landlordStyles||missing.length>0;let result:any;
    try{result=await request('party-landlord-style',ids.filter(id=>id!=='player'),r.style,{party:{...partyContext(r),missingTolerances:missing,...(r.landlordStyles?{knownStyles:r.landlordStyles}:{})}},required?MODEL_REQUEST_TIMEOUT_MS:12000);}catch(e){guard();if(required)throw e;}
    guard();if(JSON.stringify(room.value)!==fp)throw Error('房间已改变，牌风未写入');
    await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!;if(!rm.landlordStyles)rm.landlordStyles=Object.fromEntries(result.styles.map(({id,...style}:any)=>[id,style]));
     if(!rm.landlordPhrases)rm.landlordPhrases=Object.fromEntries(ids.filter(id=>id!=='player').map(id=>{const lines=result?.phrases?.find((row:any)=>row.id===id)?.lines;return [id,validLandlordPhrases(lines)?lines:fallbackLandlordPhrases()];}));
     t.tolerances||={};for(const a of result?.tolerances||[])if(missing.includes(a.id)&&t.tolerances[a.id]===undefined)t.tolerances[a.id]=a.value;if(ids.some(id=>t.tolerances![id]===undefined))throw Error('酒量资料不完整');});
   }
   if(!landlordViewActive||roomId.value!==r.id||page.value!==startPage)return;await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!;settlePartyEnd(rm,t.tolerances||{});if(!rm.endedAt)startPartyRound(rm,anchor);});if(!landlordViewActive||roomId.value!==r.id||page.value!==startPage)return;draft.value='';page.value=room.value?.endedAt?'history':'play';landlordPaused=false;if(room.value?.endedAt){await afterEnd();return;}await advanceLandlord();
  }
  function landlordStep(action:import('../domain/landlord').LandlordAction){
   const selected=copy(action);let committed=false;
   const step=async()=>{
    if(!committed){const rm=activeRoom(),rr=round.value;if(rr?.kind!=='landlord'||rr.turn!=='player')throw Error('尚未轮到你出牌');await write(t=>{const r=t.partyRooms!.find(x=>x.id===rm.id)!;applyPartyLandlordAction(r,'player',selected);settlePartyEnd(r,t.tolerances||{});});committed=true;}
    if(room.value?.endedAt){await afterEnd();return;}await advanceLandlord();
   };
   return run(step,'继续角色出牌');
  }
  const landlordBid=(score:number)=>landlordStep({kind:'bid',score}),landlordPlay=(cards:string[])=>landlordStep(cards.length?{kind:'play',cards}:{kind:'pass'});
const start=()=>room.value?.kind==='landlord'?run(startLandlord,'继续斗地主',()=>round.value?.kind==='landlord'&&round.value.phase!=='complete'?advanceLandlord():startLandlord()):room.value?.kind==='eleven'?run(startEleven,'重试本轮角色回应',()=>round.value?.kind==='eleven'&&round.value.batch?.pending?syncElevenBatch():startEleven()):room.value?.kind==='liar'?run(startLiar,'重试本轮角色行动',()=>round.value?.kind==='liar'&&(round.value.phase!=='complete'||round.value.moves.at(-1)?.pending)?advanceLiarChain():startLiar()):startOther();
 function liarPublicMoves(rr:LiarRound){return rr.moves.slice(-12).map(m=>({id:m.id,action:m.action,...(m.bid?{bid:m.bid}:{}),text:m.text,replies:m.replies,...(m.targets?{targets:[...m.targets]}:{}),...(m.dialogueVersion===1?{dialogueVersion:1}:{})}));}
 function liarParty(rr:LiarRound){return {...partyContext(room.value!),rulesVersion:rr.rulesVersion,phase:rr.phase,...(rr.phase==='playing'?{challengeOptions:liarChallengeOptions(rr)}:{}),...(rr.challenge?{settlement:rr.challenge}:{}),round:rr.number,starter:rr.starter,turn:rr.turn,moves:liarPublicMoves(rr),...(lastLiarBid(rr)?.bid?{lastBid:lastLiarBid(rr)!.bid}:{})};}
 function safeDiceReplies(rows:{id:string;text:string}[],rr:LiarRound){return rows.map(x=>({id:x.id,text:sanitizeDiceSpeech(x.text,rr.dice[x.id]||[])}));}
 async function finishLiarTalk(){
  const rm=room.value,rr=round.value;if(!rm||rr?.kind!=='liar'||!rr.moves.at(-1)?.pending)throw Error('没有等待接话的行动。');const id=rm.id,fingerprint=JSON.stringify(rr),move=rr.moves.at(-1)!;
  const result=await request('party-liar-reply',partyParticipants(rm).filter(id=>id!=='player'),'本次行动已经保存。请全桌角色接一句说出口的话，不要内心独白，不要透视骰子。',{party:{...liarParty(rr),lastAction:liarPublicMoves(rr).at(-1),playerInput:move.text}});
  if(JSON.stringify(round.value)!==fingerprint)throw Error('当前叫号已改变，回复未应用。');
  await write(t=>{completeLiarMove(t.partyRooms!.find(x=>x.id===id)!,safeDiceReplies(result.replies,rr),result.dialogueVersion);},!!rm.endedAt);
 }
 async function liarNpc(){
  const rm=activeRoom(),rr=round.value;if(rr?.kind!=='liar'||rr.phase!=='playing'||rr.turn==='player')throw Error('当前不需要角色叫号。');
  const actor=rr.turn,fingerprint=JSON.stringify(rr),id=rm.id,playerInput=[...rr.moves].reverse().find(m=>m.id==='player')?.text||'';
  const result=await request('party-liar-turn',[actor],'轮到你叫号或开骰；同一次返回所有角色说出口的接话，有玩家留言须自然回应，不要内心独白。',{party:{...liarParty(rr),ownDice:rr.dice[actor],playerInput}});
  if(JSON.stringify(round.value)!==fingerprint)throw Error('当前牌局已改变，回复未应用。');
  await write(t=>{const r=t.partyRooms!.find(x=>x.id===id)!;applyLiarTurn(r,actor,result.action,result.bid,safeDiceReplies(result.replies,rr),result.dialogueVersion,result.targets);settlePartyEnd(r,t.tolerances||{});});
 }
 async function advanceLiarChain(){
  const id=roomId.value;
  for(let steps=0;steps<18;steps++){
   guard();if(roomId.value!==id)throw Error('房间已切换，自动叫号停止。');const rm=room.value,rr=round.value;if(!rm||rr?.kind!=='liar')throw Error('请先开始大话骰。');
   if(rr.phase==='rolling')return;
   const last=rr.moves.at(-1);
   if(rm.endedAt||rr.phase==='complete'){if(last?.pending)await finishLiarTalk();await afterEnd();return;}
   if(last?.pending&&!(last.id==='player'&&last.action==='bid')){await finishLiarTalk();continue;}
   if(rr.turn==='player')return;
   await liarNpc();
  }
  throw Error('自动叫号轮次异常，原记录已保留。');
 }
 const resumeLiar=()=>run(advanceLiarChain,'重试本轮角色行动',advanceLiarChain);
 async function startLiar(){
  const r=activeRoom();if(partyParticipants(r).length<3)throw Error('至少需要两位好友接受邀请。');await ensureTolerance(r);
  await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!;settlePartyEnd(rm,t.tolerances||{});if(!rm.endedAt)startPartyRound(rm,anchor);});
  draft.value='';page.value=room.value?.endedAt?'history':'play';if(room.value?.endedAt){await afterEnd();return;}await advanceLiarChain();
 }
 function liarPlayerMove(action:'bid'|'open'|'split',bid?:LiarBid,targets?:string[]){
  const selectedBid=bid?copy(bid):undefined,selectedTargets=targets?[...targets]:undefined,text=draft.value.trim().slice(0,500);let committed=false;
  return run(async()=>{
   if(!committed){
    if(round.value?.kind==='liar'&&round.value.moves.at(-1)?.pending){await advanceLiarChain();return;}
    const rm=activeRoom(),rr=round.value;if(rr?.kind!=='liar'||rr.phase!=='playing'||rr.turn!=='player')throw Error(action==='bid'?'尚未轮到你叫号。':'尚未轮到你开骰。');
    await write(t=>{const r=t.partyRooms!.find(x=>x.id===rm.id)!;applyLiarMove(r,'player',action,selectedBid,text,[],undefined,selectedTargets);if(action!=='bid')settlePartyEnd(r,t.tolerances||{});});committed=true;draft.value='';
    if(room.value?.endedAt)page.value='history';
   }
   await advanceLiarChain();
  },action==='bid'?'重试本轮角色行动':'重试本次开劈回应');
 }
 const liarBid=(bid:LiarBid)=>liarPlayerMove('bid',bid);
 const challengeLiar=(action:'open'|'split',targets?:string[])=>liarPlayerMove(action,undefined,targets);
 const liarOpen=(targets?:string[])=>challengeLiar('open',targets),liarSplit=(targets:string[])=>challengeLiar('split',targets);
 const liarReroll=()=>run(async()=>{const rm=activeRoom();await write(t=>{rerollLiar(t.partyRooms!.find(x=>x.id===rm.id)!);});await advanceLiarChain();},'恢复重摇后的游戏',advanceLiarChain);
 const liarConfirmRoll=()=>run(async()=>{const rm=activeRoom();await write(t=>{confirmLiarRoll(t.partyRooms!.find(x=>x.id===rm.id)!);});await advanceLiarChain();},'恢复已封杯的游戏',advanceLiarChain);
 function choiceTalk(id:string,text:string,dialogue?:GameDialogue):GameDialogue{
  if(dialogue?.lines.some(line=>line.id===id&&line.text===text))return dialogue;
  const lines:{id:string;text:string}[]=[];let rest=text;while(rest){let end=Math.min(500,rest.length);if(end<rest.length&&rest.charCodeAt(end-1)>=0xD800&&rest.charCodeAt(end-1)<=0xDBFF)end--;const part=rest.slice(0,end);if(part.trim())lines.push({id,text:part});rest=rest.slice(end);}return {version:1,lines:[...lines,...(dialogue?.lines||[])]};
 }
 const choose=(choice:'truth'|'dare')=>run(async()=>{const r=activeRoom();await write(t=>{chooseTruth(t.partyRooms!.find(x=>x.id===r.id)!,'player',choice);});});
 async function completeTruth(actor:string,text:string,refused:boolean,dialogue?:GameDialogue){const r=activeRoom();await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!;finishTruth(rm,actor,text,refused);if(dialogue){const last=rm.rounds.at(-1)!;if(last.kind==='truth')last.dialogue=dialogue;}settlePartyEnd(rm,t.tolerances||{});});draft.value='';await afterEnd();}
 const answer=(refused=false)=>run(async()=>{if(!draft.value.trim()&&!refused)throw Error('请填写你的回答或行动。');await completeTruth('player',draft.value.trim()||'我选择拒绝，并喝下这一杯。',refused);});
 const npcAction=()=>run(async()=>{if(round.value?.kind==='landlord'){landlordPaused=false;await advanceLandlord();return;}if(round.value?.kind==='eleven'){await stepEleven();return;}if(round.value?.kind==='liar'){await advanceLiarChain();return;}const r=activeRoom(),rr=round.value;if(!rr)throw Error('请先开始一轮。');const fingerprint=JSON.stringify(rr);

   {if(rr.target==='player'||rr.phase==='complete')throw Error('当前不需要角色行动。');const result=await request('party-truth',[rr.target],rr.phase==='choose'?'看到双选题卡后选择真心话或大冒险，不提前执行。':'按人设完成已选题目，或明确拒绝并接受罚酒。',{party:{...partyContext(r),round:rr.number,stage:rr.phase==='choose'?'choose':'respond',target:rr.target,card:rr.card,...(rr.choice?{choice:rr.choice}:{})}});if(JSON.stringify(round.value)!==fingerprint)throw Error('挑战已改变，回复未应用。');if(rr.phase==='choose')await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!;chooseTruth(rm,rr.target,result.choice);const target=rm.rounds.at(-1)!;if(target.kind==='truth')target.choiceDialogue=choiceTalk(rr.target,result.text,result.dialogue);});else await completeTruth(rr.target,result.text,result.refused,result.dialogue);}
 });
 const reactions=()=>run(async()=>{
  const r=activeRoom(),text=draft.value.trim();if(!text)throw Error('请填写你的发言或动作。');if(text.length>2000)throw Error('发言最多2000字。');const ids=partyParticipants(r).filter(id=>id!=='player'),rr=round.value;if(!rr)throw Error('请先开始游戏。');if(rr.kind==='liar'){await advanceLiarChain();return;}if(rr.kind==='eleven'&&rr.phase==='playing'){await stepEleven();return;}
  if((rr.replies?.length||0)>223)throw Error('本轮聊天记录已达上限，请开始下一轮；已有记录完整保留。');
  const fingerprint=JSON.stringify(rr),result=await request('party-reactions',ids,text,{party:{...partyContext(r),round:rr.number,summary:summary(r).slice(0,5000),playerInput:text}});if(JSON.stringify(round.value)!==fingerprint)throw Error('当前轮已改变。');
  const lines=result.dialogue?.lines||result.replies;
  await write(t=>{const rm=t.partyRooms!.find(x=>x.id===r.id)!,last=rm.rounds.at(-1)!;if(last.kind==='liar')throw Error('房间类型已改变');last.replies=[...(last.replies||[]),{id:'player',text},...lines.map((line:{id:string;text:string})=>({id:line.id,text:line.text}))];last.dialogueVersion=1;});draft.value='';
 });
 const end=()=>run(async()=>{const r=activeRoom();await write(t=>{endPartyRoom(t.partyRooms!.find(x=>x.id===r.id)!);});page.value='history';});
 async function afterparty(onlyActor?:string){const session=w.active!,r=room.value;if(!r?.endedAt||!r.afterparty?.scenes)return;for(const initial of r.afterparty.scenes){if(initial.status==='ready'||onlyActor&&initial.actorId!==onlyActor)continue;const id=r.id,actorId=initial.actorId,rm=room.value!,entry=rm.afterparty!.scenes!.find(x=>x.actorId===actorId)!,fingerprint=JSON.stringify(rm),participants=entry.participants;
  try{const result=await request('afterparty',participants.filter(id=>id!=='player'),'为'+gameName(r.kind)+'结束后指定醉酒角色与玩家写独处小剧场。',{afterparty:{room:{name:r.name,style:r.style},targetActorId:participants.find(id=>id!=='player')||actorId,drunkActorId:actorId,playerDrunk:actorId==='player',participants:participants.map(id=>({id,name:name(id),drunk:r.drunk[id]||0,tolerance:tolerance(id)})),triggers:[name(actorId)],rounds:r.rounds.filter(visible).slice(-6).map(rr=>({number:rr.number,summary:rr.kind==='landlord'?landlordSummary(rr):rr.kind==='truth'?rr.text||'':rr.phase==='complete'?(rr.kind==='eleven'&&isElevenAllBust(rr)?'全员爆牌，无胜负，全员各喝一杯':rr.kind==='liar'&&rr.challenge?'逐家开劈结算：'+Object.entries(rr.challenge.penalties).filter(([,n])=>n>0).map(([id,n])=>name(id)+'喝'+n+'杯').join('；'):'赢家'+name(rr.winner!)):'本局未完成'}))},...(entry.draft?{priorDraft:entry.draft}:{})});
   if(typeof result.text!=='string'||result.text.replace(/\s/gu,'').length<afterpartyMinChars||result.text.length>afterpartyMaxChars)throw Error('醉酒小剧场长度不足，可单独重试。');guard();if(w.active!==session||JSON.stringify(room.value)!==fingerprint)throw Error('房间记录已改变，小剧场未应用。');await write(t=>{const rm=t.partyRooms!.find(x=>x.id===id)!,s=rm.afterparty!.scenes!.find(x=>x.actorId===actorId)!;Object.assign(s,{status:'ready',text:result.text,summary:result.summary||'',error:undefined,draft:undefined});rm.afterparty!.status=rm.afterparty!.scenes!.every(x=>x.status==='ready')?'ready':rm.afterparty!.scenes!.some(x=>x.status==='failed')?'failed':'pending';recordTerminalChat(t,anchor!,{id:'party-after:'+id+':'+actorId,title:(r.name+' · '+name(actorId)).slice(0,60),group:false},participants,'醉后小剧场：'+(result.summary||result.text.slice(0,240)),[],participants);},true);
  }catch(e){guard();if(JSON.stringify(room.value)===fingerprint)await write(t=>{const rm=t.partyRooms!.find(x=>x.id===id)!,s=rm.afterparty!.scenes!.find(x=>x.actorId===actorId)!;s.status='failed';s.error=(e instanceof Error?e.message:'生成失败').slice(0,2000);rm.afterparty!.status='failed';},true);error.value=e instanceof Error?e.message:'小剧场失败';if(cancelled)break;}
 }}
 const retryAfterparty=(actorId?:string)=>run(()=>afterparty(actorId));
 function back(){inviteTarget.value=null;inviteNote.value='';draft.value='';if(page.value==='list')return;page.value=page.value==='create'||page.value==='room'||page.value==='history'?'list':'room';}
  function enter(kind:PartyKind){currentKind.value=kind;page.value='list';inviteTarget.value=null;inviteNote.value='';draft.value='';}
 return {setLandlordActive,landlordBid,landlordPlay,resumeLandlord,pauseLandlord,rooms,room,round,wave,elevenPrepared,elevenBatchPending,playerNeedsChoice,dealWave,resumeLiar,liarBid,liarOpen,liarSplit,liarReroll,liarConfirmRoll,history,currentKind,page,picked,title,style,draft,error,working,inviteTarget,inviteNote,pendingInvite,pendingInvites,declinedInvites,retryActionLabel,retryRequest,retryInvites,friends,name,tolerance,participants,create,open,invite,beginInvite,sendInvite,start,hit,stand,npcAction,choose,answer,reactions,end,retryAfterparty,back,enter,stop:cancel};
}
