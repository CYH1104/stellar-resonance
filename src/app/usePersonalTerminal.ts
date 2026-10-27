import {kingRoundLimitReached,afterpartyScenes} from "../domain/personalTerminal";
import {renderKingCommand} from '../domain/kingCommand';
import {normalizeActorName} from '../domain/dynamicActors';
import {terminalAvatarImage} from './terminalAvatarImage';
import {useAvatarAdjustment} from './useAvatarAdjustment';
import {imageUrl} from '../domain/characterImages';
import {terminalCodeBindings} from '../domain/terminalCodeVariables';
import {completedStoryRounds} from '../domain/terminalPolicy';
import {answerGroupInvitation as answerGroupInvitationEntry} from '../domain/terminalSocial';
import {isTerminalMemoryNote} from '../domain/terminalLedger';
import {terminalStoryClock} from '../domain/storyScene';
import {visibleMemories} from '../domain/story';
import {factAudienceCovers} from '../domain/knowledge';
import {terminalAnchor,terminalAnchorActive,terminalOriginActive,terminalMessageVisible,terminalBucket,recordTerminalChat,audienceSnapshot,findChatSegment,syncTerminalMemoryNotes,type TerminalAnchor,type TerminalJob} from '../domain/terminalLedger';
import {computed,ref,watch,onMounted,onBeforeUnmount} from 'vue';
import {markGenerationComplete,startGeneration,finishGeneration} from './generationCompletion';
import type {ViewModel} from './useWorkspace';
import {taskApi,auxiliaryApis} from '../domain/apis';
import {HttpGateway} from '../gateway/http';
import {emptyTerminal,lockKingTargets,terminalId,requireFriends,createConversation,createKingRoom,drawKingRound,applyKingCommand,applyKingReplies,finishKingRound,targetActors,syncKingDrunk,kingOverLimit,kingParticipants,missingTolerances,visibleTextLength,afterpartyMinChars,afterpartyMaxChars,groupCanManage,groupOwner,groupManagementReady,groupNeedsManagement,groupAutoAdminLimit,applyGroupAction,syncStoryGroups,type StoryGroupSource,type PersonalTerminal,type KingRoom,type KingRound,type KingInteraction} from '../domain/personalTerminal';
import {divinationDay,divinationDeadline,divinationDraftText,findDivination,ensureDivination,cardsFingerprint,divinationSectionMax,divinationReactionMax,divinationDraftMax,type TerminalDivination} from '../domain/divination';
export function terminalContextState(state:{player?:any}|undefined,codes:Record<string,string>,characters:{id:string;name:string;identity?:string;relationship?:string;affinity?:number;present?:boolean}[]){
 return {variables:{终端码:codes},...(state?.player?{player:state.player}:{}),characters:characters.map(({id,name,identity,relationship,affinity,present})=>({id,name,identity,relationship,affinity,present}))};
}
export function usePersonalTerminal(w:ViewModel){
 const addMode=ref<'code'|'name'>('code');
 const lookupCandidates=ref<{id:string;name:string;identity:string;code:string}[]>([]);
 const lookup=ref<{id:string;name:string;identity:string;code:string}>(),bioDraft=ref(''),historyPage=ref(0),automatic=ref(false);

 const conversationFilter=ref<'all'|'private'|'group'>('all'),plusOpen=ref(false);
 const page=ref('home'),previous=ref('home'),search=ref(''),draft=ref(''),title=ref(''),note=ref(''),style=ref('日常'),picked=ref<string[]>([]),targets=ref<number[]>([]),conversationId=ref(''),friendId=ref(''),roomId=ref(''),courseId=ref(''),error=ref(''),working=ref(false),week=ref(false);
 const t=computed(()=>w.active?.terminal||emptyTerminal());
 const boundCodes=computed(()=>terminalCodeBindings(w.state));
 const ownCode=computed(()=>boundCodes.value.player||'');
 const actors=computed(()=>{const known=w.state?.characters||w.active?.initial.characters||[];return [...known,...(t.value.contacts||[]).filter(c=>!known.some(a=>a.id===c.id))];}),name=(id:string)=>id==='player'?(w.active?.persona.name||'我'):actors.value.find(a=>a.id===id)?.name||'未知角色';
 const activeFriends=computed(()=>t.value.friends.filter(f=>!f.anchor||!!w.active&&terminalAnchorActive(w.active,f.anchor)));
 const incoming=computed(()=>activeFriends.value.filter(f=>f.direction==='incoming'&&f.status==='pending'));
 const messages=computed(()=>conversation.value?.messages.filter(m=>!w.active||terminalMessageVisible(w.active,m))||[]);
 const friends=computed(()=>activeFriends.value.filter(f=>f.status==='accepted'));
 const previewChat=ref<import('../domain/personalTerminal').TerminalConversation>();
 const conversation=computed(()=>t.value.conversations.find(c=>c.id===conversationId.value)||previewChat.value?.id===conversationId.value&&previewChat.value||undefined);
 const canManage=computed(()=>!!conversation.value&&groupCanManage(conversation.value));
 const isOwner=computed(()=>!!conversation.value&&groupOwner(conversation.value)==='player');
 const visibleConversations=computed(()=>t.value.conversations.filter(c=>(!c.anchor||!!w.active&&terminalAnchorActive(w.active,c.anchor))&&(!c.producedBy||!!w.active&&terminalOriginActive(w.active,c.producedBy))));
 const room=computed(()=>t.value.rooms.find(r=>r.id===roomId.value));
 const tolerances=computed(()=>t.value.tolerances||{});
 const toleranceValue=(id:string)=>tolerances.value[id];
 const gameHistory=computed(()=>room.value?.rounds.filter(r=>!r.archived&&(!r.anchor||!!w.active&&terminalAnchorActive(w.active,r.anchor)))||[]);
 const round=computed(()=>gameHistory.value.at(-1));
 /** Courses written by a terminal round belong to the action that produced them; after that
  * turn is rewound or its input edited they leave the timetable without deleting the record. */
 const courses=computed(()=>w.active&&t.value.scheduleOrigin&&!terminalOriginActive(w.active,t.value.scheduleOrigin)?[]:t.value.courses);
 const course=computed(()=>courses.value.find(c=>c.id===courseId.value));
 const profile=computed(()=>w.preferences.profiles?.length?taskApi(w.preferences,'terminal'):undefined);
 function requestProfile(task:string){if(!['friend','friend-create'].includes(task))return profile.value;const auxiliary=auxiliaryApis(w.preferences);return auxiliary.find(p=>p.id===profile.value?.id)||auxiliary[0];}
 const ending=ref(false),endConfirm=ref(''),endSaveFailed=ref('');
 let operationRoom='',operationRound=0,operationEpoch=0,operationCancelled=false,operationDone:Promise<void>=Promise.resolve(),finishOperation=()=>{},operationCallId='',operationSucceeded=false;
// 终端存档写入串行化：耐受度补取等后台任务可能与正在进行的操作同时落盘，
// 克隆-修改-保存必须在同一把队列锁内完成，否则晚到的写入会把别人的改动覆盖掉。
let writeQueue:Promise<unknown>=Promise.resolve();
function exclusiveWrite<T>(task:()=>Promise<T>):Promise<T>{const result=writeQueue.then(task,task);writeQueue=result.then(()=>undefined,()=>undefined);return result;}
// 耐受度是独立任务：自己的控制器与守卫，不占用 working/terminalBusy，也不共享出令的 operationSession/operationAnchor。
let toleranceController:AbortController|undefined,toleranceRoom='',toleranceTask:Promise<void>|undefined;
const boundedRaw=(value:string,limit:number)=>{if(value.length<=limit)return value;const marker=`\n…[已截断，原长度 ${value.length} 字符]`;return value.slice(0,Math.max(0,limit-marker.length))+marker;};
function logTerminalActivity(title:string,text:string,callId=operationCallId||crypto.randomUUID(),failed=false,raw=''){
 if(!text.trim()||!w.formatErrors||operationSession&&operationSession!==w.active?.id)return;
 const anchor=operationAnchor||(w.active?terminalAnchor(w.active):undefined);
 const sections:any[]=[{id:'terminal-'+callId,kind:failed?'errors':'terminalActivity',title,text}];if(raw.trim())sections.push({id:'terminal-raw-'+callId,kind:'modelOutput',title:'模型原始输出',text:boundedRaw(raw,48000)});
 void w.formatErrors.record(text,failed?'TERMINAL_OPERATION_FAILED':'TERMINAL_ACTIVITY',w.active?.id||'',anchor?.turnId||'','terminal',{callId,variantId:anchor?.variantId,sections}).catch(()=>{});
}
 const roundLimit=(room:KingRoom)=>kingRoundLimitReached(room,r=>!r.archived&&(!r.anchor||!!w.active&&terminalAnchorActive(w.active,r.anchor)));
 function activeGame(id=roomId.value){const r=t.value.rooms.find(r=>r.id===id);if(!r||r.endedAt)throw Error('游戏已结束，只能回看记录。');operationRoom=id;operationRound=r.rounds.at(-1)?.number||0;return r;}
 let controller:AbortController|undefined;let operationAnchor:TerminalAnchor|undefined;let operationSession='';
 watch(()=>[JSON.stringify(profile.value),JSON.stringify(requestProfile('friend')),w.credentials[profile.value?.id||''],w.credentials[requestProfile('friend')?.id||''],toleranceSignature()],()=>{controller?.abort();toleranceController?.abort();});
 watch(()=>w.active?.id,()=>{controller?.abort();toleranceController?.abort();endConfirm.value=endSaveFailed.value='';inviteTarget.value=inviteNote.value='';page.value='home';conversationId.value=friendId.value=roomId.value=courseId.value='';picked.value=[];draft.value=error.value='';lookup.value=undefined;lookupCandidates.value=[];historyPage.value=0;peekActorId.value='';});
onBeforeUnmount(()=>{controller?.abort();toleranceController?.abort();});
// 停用手机、换终端接口或切顺序都会推进 epoch：在途的手动请求与后台耐受度立即取消，
// 不依赖组件卸载，也不依赖上游是否真的遵守 abort。
watch(()=>w.terminalEpoch,()=>{controller?.abort();toleranceController?.abort();});
 function go(next:string){plusOpen.value=false;previous.value=page.value;page.value=next;error.value='';search.value='';historyPage.value=0;if(next==='divination')refreshDay();if(next==='add'){lookup.value=undefined;lookupCandidates.value=[];note.value='';}if(next==='account'){bioDraft.value=t.value.bio||'';}}
 /** Safety recovery: an active room that is already over the tolerance limit (e.g. the
 * browser was refreshed between the drunk commit and the end save) is ended first,
 * before any further action or request runs on it. */
async function recoverDrunkEnd(id:string){const rm=t.value.rooms.find(r=>r.id===id);if(!rm||rm.endedAt)return false;const over=kingOverLimit(rm,tolerances.value);if(!over.length&&!roundLimit(rm))return false;
 await saveGameEnd(id,over.length?'drunk':'round-limit',over);endSaveFailed.value='';logTerminalActivity('国王游戏因醉酒结束（安全恢复）',`${rm.name} · ${over.map(x=>name(x)).join('、')} 达到耐受度`);go('history');await requestAfterparty(id);return true;}
function openRoom(id:string){const current=t.value.rooms.find(r=>r.id===id);if(!current){error.value='未找到该房间，请重新打开当前存档。';return;}roomId.value=id;draft.value='';targets.value=[];
 if(!current.endedAt&&(kingOverLimit(current,tolerances.value).length||roundLimit(current))){void run(async()=>{await recoverDrunkEnd(id);});return;}
 go(current.endedAt?'history':'room');}
 function toggle(id:string){picked.value=picked.value.includes(id)?picked.value.filter(i=>i!==id):[...picked.value,id];}
 async function commit(update:(next:PersonalTerminal)=>void){const session=w.active;if(!session)throw Error('请先打开存档。');if(operationSession&&session.id!==operationSession||operationAnchor&&!terminalAnchorActive(session,operationAnchor))throw Error('剧情分支已改变，记录未应用。');if(operationCancelled)throw Error('请求已停止。');if(operationEpoch!==w.terminalEpoch)throw Error('手机终端已停用，记录未应用。');if(operationRoom){const r=t.value.rooms.find(r=>r.id===operationRoom);if(!r||r.endedAt||(r.rounds.at(-1)?.number||0)!==operationRound)throw Error('游戏已结束或轮次已改变。');}await exclusiveWrite(async()=>{if(w.active!==session)throw Error('存档已切换，记录未应用。');const next:PersonalTerminal=structuredClone(JSON.parse(JSON.stringify(t.value)));update(next);for(const old of t.value.rooms)if(old.endedAt&&JSON.stringify(old)!==JSON.stringify(next.rooms.find(r=>r.id===old.id)))throw Error("游戏已结束，只能回看记录。");for(const room of next.rooms)for(const round of room.rounds){if(!round.anchor)continue;for(const anchor of [round.anchor,...[...new Map((round.interactions||[]).flatMap(i=>i.anchor&&terminalAnchorActive(session,i.anchor)?[[i.anchor.key,i.anchor] as const]:[])).values()].filter(a=>a.key!==round.anchor!.key)]){const b=terminalBucket(next,anchor),game={id:room.id+':'+round.number,name:room.name,round:round.number,king:name(round.king),command:round.command,penalties:round.replies.filter(r=>r.refused).map(r=>name(r.id)+'：'+r.penalty).join('；'),complete:round.phase==='complete',knownBy:audienceSnapshot(room.members.filter(id=>id!=='player'&&room.invitations[id]==='accepted')),...(room.endedAt?{endedAt:room.endedAt}:{}),interactions:(round.interactions||[]).filter(i=>(!i.anchor||i.anchor.key===anchor.key)&&(!i.anchor||terminalAnchorActive(session,i.anchor))).map(i=>name('player')+'：'+i.text+'；'+i.replies.map(r=>name(r.id)+'：'+r.text+(r.refused?'；惩罚：'+r.penalty:'')).join('；')).join('\n')};const i=b.games.findIndex(g=>g.id===game.id);if(i<0)b.games.push(game);else b.games[i]=game;}}const previous=session.terminal,priorNotes=session.memories.filter(isTerminalMemoryNote).map(m=>JSON.parse(JSON.stringify(m)));session.terminal=next;syncTerminalMemoryNotes(session);try{await (w.saveTerminal?w.saveTerminal(session):w.save());if(String(w.storageStatus)==='failed')throw Error('终端保存失败，请先导出当前存档。');}catch(e){if(session.terminal===next){session.terminal=previous;session.memories=[...session.memories.filter(m=>!isTerminalMemoryNote(m)),...priorNotes];}throw e;}});w.indexTerminalNotes();}

 async function context(audience:string[]=[],query?:string){const s=w.active;
  const scoped=audience.length>0&&!!s;
  // Scoped NPC requests no longer receive raw recent prose; they receive audience-filtered
  // fact/note retrieval plus their own conversation messages. Raw prose stays for
  // service tasks without a character audience. The retrieval query is the current
  // user input, not the most recent prose, so an old-event question is not drowned out.
  const story=scoped?[]:s?.turns.slice(-6).map(turn=>({input:turn.input,text:turn.variants[turn.selected]?.text?.slice(-4000)}));
  const lastTurn=s?.turns.at(-1),lastText=lastTurn?lastTurn.variants[lastTurn.selected]?.text?.slice(-1200)||'':'';
  const memories=scoped&&s?await w.scopedRecall(s,query&&query.trim()||((lastTurn?.input||'')+' '+lastText),audience).then(list=>list.map(m=>m.text.slice(0,700))).catch(()=>[]):s?visibleMemories(s).filter(m=>m.status!=='pending'&&m.status!=='failed').slice(-12).map(m=>m.text.slice(0,700)):[];
  return {state:terminalContextState(w.state,boundCodes.value,actors.value),story,memories,...(scoped?{audience}:{})};
 }
 async function request(task:string,actorIds:string[],input:string,extra:object={}){
  if(operationCancelled)throw Error('请求已停止。');const s=w.active,p=requestProfile(task);if(!s||!p)throw Error(['friend','friend-create'].includes(task)?'请先配置副 API，再发送好友申请。':'请先配置终端 API。');if(!w.connectionReady(p)&&!await w.connectProfile(p))throw Error('请先在 API 设置确认所用接口。');
  if(operationCancelled)throw Error('请求已停止。');const sid=s.id,signature=JSON.stringify([p,w.credentials[p.id]]);controller=new AbortController();
  const apiCallId=crypto.randomUUID();const signal=controller.signal;signal.throwIfAborted();let aborted:()=>void=()=>{};const cancellation=new Promise<never>((_,reject)=>{aborted=()=>reject(new Error('请求已停止。'));signal.addEventListener('abort',aborted,{once:true});});
  startGeneration(apiCallId);
const scopedTask=['chat','invite','react','game-interact','friend','afterparty','divination','group-welcome'].includes(task);
  // Divination is the target actor's private sign: the NPC never learns that the
  // player peeked, and the player's own reading is scoped to the player alone.
  const audience=task==='divination'?[actorIds[0]]:scopedTask?['player',...actorIds]:[];
  const result=await Promise.race([new HttpGateway().terminal({task,sessionId:s.id,actorIds,input,persona:s.persona,context:['command','react','game-interact','tolerance'].includes(task)?{...extra,state:{characters:actors.value.filter(a=>actorIds.includes(a.id))}}:{...(await context(audience,scopedTask?input:undefined)),...extra}},p,w.credentials[p.id]||'',signal),cancellation]).catch(e=>{logTerminalActivity('终端API失败 · '+task,e instanceof Error?e.message:'请求失败',apiCallId,true,typeof (e as any)?.raw==='string'?(e as any).raw:'');throw e;}).finally(()=>{finishGeneration(apiCallId);signal.removeEventListener('abort',aborted);});
  signal.throwIfAborted();if(operationCancelled||operationRoom&&t.value.rooms.find(r=>r.id===operationRoom)?.endedAt)throw Error("游戏已结束，请求未应用。");if(w.active?.id!==sid||operationEpoch!==w.terminalEpoch||operationAnchor&&!terminalAnchorActive(s,operationAnchor)||signature!==JSON.stringify([requestProfile(task),w.credentials[p.id]]))throw Error('存档、手机开关或API已改变，本次回复未应用。');logTerminalActivity('终端API返回 · '+task+'（尚未提交）',JSON.stringify(Object.fromEntries(Object.entries(result).filter(([key])=>key!=='raw'))),apiCallId,false,typeof result.raw==='string'?result.raw:'');operationSucceeded=true;return result;
 }
 async function run(action:()=>Promise<void>){if(w.restoreInterrupted){error.value='上次备份恢复中断，请先恢复覆盖前的完整副本。';return;}if(working.value||ending.value||w.busy||w.backupWorking)return;operationCancelled=false;operationRoom='';operationRound=0;operationCallId=crypto.randomUUID();operationSucceeded=false;operationDone=new Promise<void>(resolve=>{finishOperation=resolve;});working.value=true;w.terminalBusy=true;operationEpoch=w.terminalEpoch;operationSession=w.active?.id||'';operationAnchor=w.active?terminalAnchor(w.active):undefined;error.value='';try{await action();if(operationSucceeded)markGenerationComplete(operationCallId);}catch(e){error.value=e instanceof Error?e.message:'操作失败，原记录已保留。';if(error.value&&!operationCancelled)logTerminalActivity('终端操作失败',error.value,operationCallId,true);}finally{working.value=false;w.terminalBusy=false;controller=undefined;operationSession='';operationAnchor=undefined;operationRoom='';finishOperation();}}
 async function codeRequest(data:object){const s=w.active;if(!s)throw Error('请先打开存档');const sid=s.id,response=await fetch('/api/terminal-code',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sid,state:{variables:{终端码:boundCodes.value},characters:actors.value.map(({id,name,identity})=>({id,name,...(identity?{identity}:{})}))},...data})});if(!response.ok)throw Error(response.status===404?'未找到该终端码，请向角色确认。':'终端码查询失败，请检查完整的11位号码。');const value=await response.json();if(w.active?.id!==sid)throw Error('存档已改变');return value;}
 const lookupCode=async()=>{lookup.value=undefined;lookupCandidates.value=[];error.value='';const query=search.value.trim();if(!query){error.value=addMode.value==='name'?'请输入姓名或关系描述。':'请输入完整的11位终端码。';return;}if(addMode.value==='name'){const key=normalizeActorName(query);const exact=key?actors.value.filter(a=>normalizeActorName(a.name)===key):[];if(exact.length===1){lookup.value={id:exact[0].id,name:exact[0].name,identity:exact[0].identity||'',code:''};return;}const matches=exact.length?exact:(key?actors.value.filter(a=>normalizeActorName(a.name).includes(key)):[]);lookupCandidates.value=matches.map(a=>({id:a.id,name:a.name,identity:a.identity||'',code:''}));if(!matches.length){lookup.value={id:'',name:query,identity:'按姓名或关系描述添加',code:''};lookupCandidates.value=actors.value.filter(a=>a.present&&!friends.value.some(f=>f.id===a.id)).map(a=>({id:a.id,name:a.name,identity:a.identity||'',code:''}));}return;}if(working.value||w.busy){error.value='当前任务正在处理中，请结束后再查找终端码。';return;}await run(async()=>{if(!/^\d{11}$/.test(query))throw Error('请输入完整的11位终端码。');const result=await codeRequest({code:query});lookup.value=result;await commit(t=>{t.discoveredCodes||=[];if(!t.discoveredCodes.some(c=>c.id===result.id))t.discoveredCodes.push({id:result.id,code:query});});});};
 const friendApply=(id:string)=>run(async()=>{const old=t.value.friends.find(f=>f.id===id);if(old?.status==='accepted')return;const code=lookup.value?.id===id?lookup.value.code:old?.code;if(!id){const target=lookup.value?.name.trim();if(!target)throw Error('请填写姓名或关系描述。');if(!note.value.trim())throw Error('请填写好友申请理由。');if(!requestProfile('friend-create'))throw Error('请先配置副 API，再发送好友申请。');const contactId='contact-'+terminalId();const r=await request('friend-create',[],note.value.trim(),{contactTarget:{id:contactId,description:target}});await commit(t=>{t.contacts||=[];t.contacts.push(r.contact);t.friends.push({id:contactId,status:r.accepted?'accepted':'declined',direction:'outgoing',reply:r.reply,note:'',requestReason:note.value.trim(),at:new Date().toISOString()});recordTerminalChat(t,operationAnchor!,{id:'friend:'+contactId,title:r.contact.name,group:false},[r.contact.name],'添加联系人：'+target+'；'+r.reply);});lookup.value={id:contactId,name:r.contact.name,identity:r.contact.identity||'',code:''};logTerminalActivity('新增联系人已保存',r.contact.name+'：'+(r.accepted?'已接受':'未接受')+'；'+r.reply);return;}if(!actors.value.some(a=>a.id===id)||code&&boundCodes.value[id]!==code)throw Error('终端码未绑定当前剧情中的角色，请先确认号码并重新查找。');if(!requestProfile('friend'))throw Error('请先配置副 API，再发送好友申请。');const reason=note.value.trim()||old?.requestReason||'';if(!reason)throw Error('请填写好友申请理由。');await commit(t=>{const f=t.friends.find(f=>f.id===id);const entry={id,...(code?{code}:{}),status:'pending' as const,direction:'outgoing' as const,reply:'等待回应',note:f?.note||'',requestReason:reason.slice(0,1000),at:new Date().toISOString()};if(f)Object.assign(f,entry);else t.friends.push(entry);});const r=await request('friend',[id],reason);await commit(t=>{const f=t.friends.find(f=>f.id===id)!;f.status=r.accepted?'accepted':'declined';f.reply=r.reply;});logTerminalActivity('好友申请已保存',name(id)+'：'+(r.accepted?'已接受':'未接受')+'；'+r.reply);});
 const answerRequest=(id:string,accepted:boolean)=>run(async()=>{await commit(t=>{const f=t.friends.find(f=>f.id===id&&f.direction==='incoming'&&f.status==='pending');if(!f)throw Error('申请已处理。');f.status=accepted?'accepted':'declined';f.reply=accepted?'你已接受好友申请。':'你已拒绝好友申请。';if(!accepted)f.declinedRound=completedStoryRounds(w.active!);recordTerminalChat(t,operationAnchor!,{id:'friend:'+id,title:name(id),group:false},[name('player')],f.reply,['申请理由：'+(f.requestReason||'')]);});logTerminalActivity(accepted?'接受好友申请':'拒绝好友申请',name(id));});
 const incomingGroups=computed(()=>(t.value.groupInvitations||[]).filter(i=>i.status==='pending'&&!!w.active&&terminalAnchorActive(w.active,i.anchor)));
 const pendingGroupWelcomes=computed(()=>(t.value.groupInvitations||[]).filter(i=>i.status==='accepted'&&i.welcome?.status!=='ready'&&!!w.active&&terminalAnchorActive(w.active,i.anchor)));
 async function welcomeGroup(id:string){
  const invitation=t.value.groupInvitations?.find(i=>i.id===id),c=t.value.conversations.find(c=>c.id===invitation?.groupId);
  if(!invitation||invitation.status!=='accepted'||invitation.welcome?.status==='ready'||!c||c.joined===false||!w.active||!terminalAnchorActive(w.active,invitation.anchor))return;
  const cid=c.id,prefix='welcome:'+id+':',existing=c.messages.filter(m=>m.source?.startsWith(prefix)),missing=Math.max(0,4-existing.length);
  if(!missing){await commit(next=>{next.groupInvitations!.find(i=>i.id===id)!.welcome={status:'ready'};});return;}
  try{
   const result=await request('group-welcome',c.members.filter(id=>id!=='player'),existing.length?'只补齐缺少的 '+missing+' 条欢迎或当前讨论消息，不重复已有消息。':'玩家刚接受邀请加入该群，请生成4至6条首次欢迎或当前讨论消息。',{welcomeMissing:missing,conversation:{id:cid,title:c.title,members:c.members,ownerId:c.ownerId,adminIds:c.adminIds||[],announcement:c.announcement,messages:existing.map(m=>({id:m.sender,text:m.text}))}});
   if(!Array.isArray(result.messages)||!result.messages.length||result.messages.length>6)throw Error('欢迎消息未完成，请重试补齐。');
   await commit(next=>{const i=next.groupInvitations!.find(i=>i.id===id),g=next.conversations.find(c=>c.id===cid);if(!i||i.status!=='accepted'||!g||g.joined===false)throw Error('群成员资格已改变，消息未应用。');const retained=g.messages.filter(m=>m.source?.startsWith(prefix)).length,limit=retained?Math.max(0,4-retained):6;for(const [index,m]of result.messages.slice(0,limit).entries()){if(!g.members.includes(m.id)||typeof m.text!=='string'||!m.text.trim())throw Error('欢迎消息成员或内容不正确');const source=prefix+(retained+index);if(!g.messages.some(m=>m.source===source)){g.messages.push({id:source,source,sender:m.id,text:m.text,at:new Date().toISOString(),anchor:operationAnchor,knownBy:audienceSnapshot(g.members)});g.unread++;}}const complete=g.messages.filter(m=>m.source?.startsWith(prefix)).length>=4;i.welcome=complete?{status:'ready'}:{status:'failed',error:'成员资格已保存，欢迎消息尚未满4条，可补齐缺少部分。'};recordTerminalChat(next,operationAnchor!,g,result.messages.map((m:any)=>name(m.id)),result.topic||'欢迎加入群聊',[],audienceSnapshot(g.members));});
   if(t.value.groupInvitations!.find(i=>i.id===id)!.welcome?.status!=='ready')throw Error('成员资格及有效消息已保存，欢迎消息尚未满4条，可补齐缺少部分。');
  }catch(e){await commit(next=>{const i=next.groupInvitations!.find(i=>i.id===id);if(i?.status==='accepted')i.welcome={status:'failed',error:e instanceof Error?e.message:'欢迎消息待补'};});throw e;}
 }
 const answerGroupInvitation=(id:string,accepted:boolean)=>run(async()=>{await commit(next=>{answerGroupInvitationEntry(w.active!,next,id,accepted);});logTerminalActivity(accepted?'接受群邀请':'拒绝群邀请',id);if(accepted){const cid=t.value.groupInvitations!.find(i=>i.id===id)!.groupId;openConversation(cid);await welcomeGroup(id);}});
 const retryGroupWelcome=(id:string)=>run(()=>welcomeGroup(id));
 const {avatarDraft,avatarStyle,adjustAvatar,flushAvatar}=useAvatarAdjustment(w,message=>error.value=message);

 const saveBio=()=>run(async()=>{await commit(t=>{t.bio=bioDraft.value.trim().slice(0,160);});});

 const openChat=(id:string)=>{const existing=t.value.conversations.find(c=>!c.group&&c.members[0]===id);if(existing){openConversation(existing.id);return Promise.resolve();}if(!friends.value.some(f=>f.id===id)){error.value='请先添加好友';return Promise.resolve();}previewChat.value={id:'preview:'+id,title:name(id),group:false,members:[id],messages:[],announcement:'',unread:0,joined:true};conversationId.value=previewChat.value.id;historyPage.value=0;go('chat');return Promise.resolve();};
 const makeGroup=()=>run(async()=>{const name=title.value.trim()||'新群聊';await commit(t=>{conversationId.value=createConversation(t,picked.value,title.value,true).id;});logTerminalActivity('创建群聊',name+' · 成员 '+picked.value.length+' 位');picked.value=[];title.value='';go('chat');});
 const inviteGroup=()=>run(async()=>{const invited=[...picked.value];await commit(t=>{requireFriends(t,picked.value);const c=t.conversations.find(c=>c.id===conversationId.value)!;if(!groupCanManage(c))throw Error('只有群主或管理员可以邀请成员。');const added=picked.value.filter(id=>!c.members.includes(id));c.members=[...new Set([...c.members,...picked.value])];recordTerminalChat(t,operationAnchor!,c,[name('player')],'邀请成员入群',added.map(id=>'加入成员：'+name(id)));if(c.members.length>50)throw Error('群成员最多50位。');});logTerminalActivity('邀请群成员',invited.map(name).join('、')||'无');picked.value=[];go('group-info');});
 async function configureGroup(id:string){const c=t.value.conversations.find(c=>c.id===id);if(!c||!c.group||groupManagementReady(c))return false;const memberSignature=JSON.stringify(c.members),result=await request('group-plan',actors.value.map(a=>a.id),'根据剧情设定群主和管理员，不默认玩家拥有权限；正文没有任命时从合法现有成员中按人设选择群主。',{conversation:{...c,messages:[...new Map([...c.messages.slice(0,5),...c.messages.slice(-15)].map(m=>[m.id,{...m,text:m.text.slice(0,1200)}])).values()]}});if(!result.ownerId)throw Error('AI 未能确认该群群主，群管理仍为待确认，可重试。');if(!Array.isArray(result.adminIds)||result.adminIds.length>groupAutoAdminLimit)throw Error('AI 返回的管理员超过2位，群管理未保存，可重试。');await commit(t=>{const group=t.conversations.find(c=>c.id===id);if(!group)throw Error('群聊已不存在，群管理未保存。');if(groupManagementReady(group))return;if(JSON.stringify(group.members)!==memberSignature)throw Error('群成员已改变，请重新确认群管理。');const legal=new Set(['player',...group.members]);if(!legal.has(result.ownerId)||new Set(result.adminIds).size!==result.adminIds.length||result.adminIds.some((id:string)=>!legal.has(id)||id===result.ownerId))throw Error('AI 返回了非法群主或管理员，群管理未保存，可重试。');group.ownerId=groupOwner(group)||result.ownerId;group.adminIds=result.adminIds.filter((admin:string)=>admin!==group.ownerId);group.managementReady=true;});const saved=t.value.conversations.find(c=>c.id===id)!;logTerminalActivity('群管理已保存',saved.title+' · 群主：'+name(groupOwner(saved))+' · 管理员：'+((saved.adminIds||[]).map(name).join('、')||'无'));return true;}
 const refreshGroup=()=>run(async()=>{const id=conversationId.value;await configureGroup(id);if(conversationId.value===id){title.value=conversation.value?.title||'';note.value=conversation.value?.announcement||'';}});
 const completeGroupManagement=()=>run(async()=>{const targets=visibleConversations.value.filter(c=>groupNeedsManagement(c)).map(c=>c.id);if(!targets.length){error.value='没有待补全管理的群聊。';return;}const failed:string[]=[];let done=0;for(const id of targets){try{if(await configureGroup(id))done++;}catch(e){failed.push((t.value.conversations.find(c=>c.id===id)?.title||id)+'：'+(e instanceof Error?e.message:'未完成'));}}if(failed.length)throw Error(`已补全 ${done} 个群，${failed.length} 个待重试：${failed.join('；')}`);error.value=`已补全 ${done} 个群的群主与管理员。`;});
 const readThrough=new Map<string,{sessionId:string;messageId:string}>();let readFlushing=false;
 function openConversation(id:string){const c=t.value.conversations.find(c=>c.id===id);if(!c||c.joined===false){error.value='尚未加入或已退出该会话。';return;}conversationId.value=id;historyPage.value=0;go('chat');const last=c.messages.filter(m=>!w.active||terminalMessageVisible(w.active,m)).at(-1);if(w.active)readThrough.set(id,{sessionId:w.active.id,messageId:last?.id||''});void flushReadMarks();}
 async function flushReadMarks(){if(readFlushing||w.busy||working.value||w.loading||!w.active)return;const sid=w.active.id,marks=[...readThrough].filter(([,m])=>m.sessionId===sid);if(!marks.length)return;readFlushing=true;try{await run(async()=>{await commit(next=>{for(const [id,mark]of marks){const c=next.conversations.find(c=>c.id===id);if(!c)continue;const index=c.messages.findIndex(m=>m.id===mark.messageId);if(index>=0)c.unread=Math.min(c.unread,c.messages.slice(index+1).filter(m=>!w.active||terminalMessageVisible(w.active,m)).length);else if(!c.messages.length)c.unread=0;}});for(const [id,mark]of marks)if(readThrough.get(id)===mark)readThrough.delete(id);});}finally{readFlushing=false;}}
 watch(()=>[w.busy,working.value,w.loading],()=>{void flushReadMarks();});
 const sendChat=(retry=false)=>run(async()=>{let c=conversation.value;if(!c)return;if(c.id.startsWith('preview:')){const actor=c.members[0];let created='';await commit(t=>{created=createConversation(t,[actor],name(actor),false).id;});conversationId.value=created;previewChat.value=undefined;c=conversation.value;if(!c)return;}const text=retry?messages.value.at(-1)?.text||'':draft.value.trim();if(!text||text.length>2000)throw Error('消息须为1～2000字。');if(c.group){if(c.joined===false)throw Error('你已退出该群。');}if(!c.members.length)throw Error('群内暂无可识别角色，请先同步群资料。');const cid=c.id;
  if(!retry){await commit(t=>{const c=t.conversations.find(c=>c.id===cid)!;const known=c.group?audienceSnapshot(c.members):['player',c.members[0]];c.messages.push({id:terminalId(),sender:'player',text,at:new Date().toISOString(),anchor:operationAnchor,knownBy:known});recordTerminalChat(t,operationAnchor!,c,[name('player')],'用户发送：'+text,[],known);});draft.value='';}
  // Request audience = everyone receiving this reply. History messages must be known to
 // all of them: a message recorded before a member joined is not delivered, and legacy
 // group messages without a snapshot are conservatively withheld. Private-chat history
 // is deterministic (the sole participant), so untagged legacy entries stay deliverable.
 const requestAudience=[...new Set(['player',...c.members.filter(id=>id!=='player')])];
 const sharedHistory=messages.value.filter(m=>factAudienceCovers(m.knownBy,requestAudience)||!m.knownBy&&!c.group).slice(-20).map(({anchor,...m})=>({...m,text:m.text.slice(0,1200)}));
 const r=await request('chat',[...new Set(c.members.filter(id=>id!=='player'))],text,{priorTopic:findChatSegment(t.value,operationAnchor!,cid,c.members,c.group)?.summary||'',conversation:{group:c.group,origin:c.origin,ownerId:groupOwner(c),adminIds:c.adminIds||[],joined:c.joined,managementReady:groupManagementReady(c),title:c.title,members:c.members,messages:sharedHistory}});
  await commit(t=>{const target=t.conversations.find(c=>c.id===cid)!;const known=target.group?audienceSnapshot(target.members):['player',target.members[0]];for(const action of r.actions||[])applyGroupAction(target,action);for(const m of r.messages)target.messages.push({id:terminalId(),sender:m.id,text:m.text,at:new Date().toISOString(),anchor:operationAnchor,knownBy:known});if(page.value!=='chat'||conversationId.value!==cid)target.unread+=r.messages.length;recordTerminalChat(t,operationAnchor!,target,[name('player'),...r.messages.map((m:any)=>name(m.id))],r.topic||r.messages.map((m:any)=>m.text).join('；'),(r.actions||[]).map((a:any)=>a.kind==='set-admin'?name(a.memberId)+(a.enabled?'被设为管理员':'被撤销管理员'):a.kind==='remove-member'?'移除成员：'+name(a.memberId):a.kind==='rename'?'群名改为'+a.text:'群公告更新'),known);historyPage.value=0;});logTerminalActivity(c.group?'群聊已保存':'私聊已保存',c.title+'\n'+r.messages.map((m:any)=>name(m.id)+'：'+m.text).join('\n'));});
 const updateNote=()=>run(async()=>{await commit(t=>{const f=t.friends.find(f=>f.id===friendId.value);if(f)f.note=note.value.slice(0,1000);});});
 const removeFriend=()=>run(async()=>{await commit(t=>{t.friends=t.friends.filter(f=>f.id!==friendId.value);});go('friends');});
 const editGroup=()=>run(async()=>{await commit(t=>{const c=t.conversations.find(c=>c.id===conversationId.value)!;applyGroupAction(c,{by:'player',kind:'rename',text:title.value});applyGroupAction(c,{by:'player',kind:'announcement',text:note.value});recordTerminalChat(t,operationAnchor!,c,[name('player')],'更新群资料',['群名：'+c.title,'群公告：'+c.announcement]);});logTerminalActivity('更新群资料',title.value+' · '+note.value.slice(0,500));go('chat');});
 const setAdmin=(id:string,enabled:boolean)=>run(async()=>{await commit(t=>{const c=t.conversations.find(c=>c.id===conversationId.value)!;applyGroupAction(c,{by:'player',kind:'set-admin',memberId:id,enabled});recordTerminalChat(t,operationAnchor!,c,[name('player')],'变更群管理员',[name(id)+(enabled?'被设为管理员':'被撤销管理员')]);});logTerminalActivity('变更群管理员',name(id)+(enabled?' 设为管理员':' 撤销管理员'));});
 const removeMember=(id:string)=>run(async()=>{await commit(t=>{const c=t.conversations.find(c=>c.id===conversationId.value)!;applyGroupAction(c,{by:'player',kind:'remove-member',memberId:id});recordTerminalChat(t,operationAnchor!,c,[name('player')],'移除群成员',['移除成员：'+name(id)]);});logTerminalActivity('移除群成员',name(id));});
 const leaveGroup=()=>run(async()=>{await commit(t=>{const c=t.conversations.find(c=>c.id===conversationId.value)!;if(groupOwner(c)==='player')throw Error('群主不能直接退群，请先保留该群。');c.joined=false;recordTerminalChat(t,operationAnchor!,c,[name('player')],'退出群聊',['玩家退出群聊']);});logTerminalActivity('退出群聊',conversation.value?.title||'');go('messages');});
 const schedule=()=>run(async()=>{await updateSchedule();});
 async function updateSchedule(){const r=await request('schedule',actors.value.map(a=>a.id).slice(0,50),'优先采用正文安排，无安排时按身份生成课程或授课安排；其他教职工无需要则留空。',{existingCourses:t.value.courses});await commit(t=>{t.courses=r.courses;t.scheduleDate=storyClock.value.label;t.scheduleKey=operationAnchor!.key;delete t.scheduleOrigin;});}
 const createRoom=()=>run(async()=>{let created='';await commit(t=>{created=createKingRoom(t,picked.value,title.value,style.value).id;});roomId.value=created;picked.value=[];go('room');await inviteRoom();});
 async function inviteRoom(selected?:string[]){const current=activeGame();const ids=current.members.filter(id=>id!=='player'&&current.invitations[id]!=='accepted'&&(!selected||selected.includes(id)));if(!ids.length)return;requireFriends(t.value,ids);const input=inviteNote.value.trim()||'邀请你参加国王游戏。';const r=await request('invite',ids,input,{style:current.style,roomName:current.name});await commit(t=>{requireFriends(t,ids);const room=t.rooms.find(r=>r.id===current.id)!;room.inviteReplies||={};room.inviteNotes||={};for(const d of r.decisions){room.invitations[d.id]=d.accepted?'accepted':'declined';room.inviteReplies[d.id]=d.reply;room.inviteNotes[d.id]=input;}});}
 const retryInvite=()=>run(()=>inviteRoom());
 const inviteTarget=ref(''),inviteNote=ref('');
 function beginInvite(id='*'){const current=room.value;if(!current||current.endedAt)return;inviteTarget.value=id;inviteNote.value=id==='*'?'':current.inviteNotes?.[id]||'';}
 const sendInvite=()=>run(async()=>{const target=inviteTarget.value;if(!target)return;await inviteRoom(target==='*'?undefined:[target]);inviteTarget.value='';});
 const addRoomFriends=()=>run(async()=>{activeGame();await commit(t=>{requireFriends(t,picked.value);const room=t.rooms.find(r=>r.id===roomId.value)!;if(room.rounds.at(-1)&&room.rounds.at(-1)!.phase!=='complete')throw Error('请在本轮结束后邀请新成员。');const ids=[...new Set([...room.members,...picked.value])];if(ids.length>8)throw Error('房间最多8人，请另建房间。');for(const id of picked.value)if(!room.members.includes(id)){room.members.push(id);room.invitations[id]='pending';}});picked.value=[];go('room');await inviteRoom();});
  // Archive-level tolerance map: generate once per character (player included), fill only
  // missing entries, never re-roll or overwrite.
 // Tolerances are a separate, retryable concern with their own lifecycle: the draw is
 // persisted first, then this optional request runs on its own controller and guard. It
 // never sets working/terminalBusy, so the king can issue the command immediately even
 // while the tolerance call is still hanging upstream.
 // 完整档案配置参与签名：同一档案里改模型、接口地址或采样参数，旧的耐受度结果也必须失效。
 // 用函数声明（而不是 const 箭头函数）：上面的配置 watch 可能在初始化期间就读它。
 function toleranceSignature(){const p=requestProfile('tolerance');return JSON.stringify([p||null,w.credentials[p?.id||'']||'']);}
 async function requestTolerance(missing:string[]){
  const session=w.active;if(!session)throw Error('请先打开存档。');
  const p=requestProfile('tolerance');if(!p)throw Error('请先配置终端 API。');
  if(!w.connectionReady(p)&&!await w.connectProfile(p))throw Error('请先在 API 设置确认所用接口。');
  const controller=new AbortController();toleranceController=controller;
  const callId=crypto.randomUUID();startGeneration(callId);
  try{
   return await new HttpGateway().terminal({task:'tolerance',sessionId:session.id,actorIds:missing,input:'请为每位参与者依据人设设定酒量耐受度。',persona:session.persona,context:{participantNames:missing.map(name),state:{characters:actors.value.filter(a=>missing.includes(a.id))}}},p,w.credentials[p.id]||'',controller.signal);
  }finally{finishGeneration(callId);if(toleranceController===controller)toleranceController=undefined;}
 }
 /** Controlled write path for tolerances: same archive and branch, room still known, and
  * only entries that are still missing — a value already known is never re-rolled. */
 async function commitTolerances(guard:{sid:string;roomId:string;anchor:TerminalAnchor;signature:string;epoch:number},entries:{id:string;value:number}[]){
  await exclusiveWrite(async()=>{
   // 写入队列里再核验一次：即使上游或替身忽略了 abort，旧配置或已停用的迟到结果也不能落库。
   if(guard.signature!==toleranceSignature())throw Error('终端 API 已改变，耐受度未保存。');
   if(guard.epoch!==w.terminalEpoch)throw Error('手机终端已停用，耐受度未保存。');
   const session=w.active;if(!session||session.id!==guard.sid)throw Error('存档已切换，耐受度写入已停止。');
   if(!terminalAnchorActive(session,guard.anchor))throw Error('剧情分支已切换，耐受度写入已停止。');
   if(!session.terminal?.rooms.some(r=>r.id===guard.roomId))throw Error('房间已不存在，耐受度写入已停止。');
   const next:PersonalTerminal=JSON.parse(JSON.stringify(session.terminal));
   next.tolerances||={};let changed=false;
   for(const entry of entries)if(!Number.isInteger(next.tolerances[entry.id])){next.tolerances[entry.id]=entry.value;changed=true;}
   if(!changed)return;
   const prior=session.terminal;session.terminal=next;syncTerminalMemoryNotes(session);
   try{await (w.saveTerminal?w.saveTerminal(session):w.save());if(w.active?.id!==guard.sid)throw Error('存档已切换，耐受度写入已停止。');if(String(w.storageStatus)==='failed')throw Error('耐受度保存失败');}
   catch(e){if(session.terminal===next){session.terminal=prior;syncTerminalMemoryNotes(session);}throw e;}
  });
 }
 function fillTolerances(id:string):Promise<void>{
  const room=t.value.rooms.find(r=>r.id===id);
  if(!room||room.endedAt)return Promise.resolve();
  if(toleranceRoom===id&&toleranceTask)return toleranceTask;
  const missing=missingTolerances(t.value,room);if(!missing.length)return Promise.resolve();
  const session=w.active;if(!session)return Promise.resolve();
  const guard={sid:session.id,roomId:id,anchor:terminalAnchor(session),signature:toleranceSignature(),epoch:w.terminalEpoch};
  toleranceRoom=id;
  const task=(async()=>{
   try{
    const r=await requestTolerance(missing) as {tolerances?:unknown};
    const raw:unknown[]=Array.isArray(r?.tolerances)?r.tolerances:[];
    const valid=raw.filter((d:any)=>d&&typeof d.id==='string'&&missing.includes(d.id)&&Number.isInteger(d.value)&&d.value>=1&&d.value<=10) as Array<{id:string;value:number}>;
    if(!valid.length)throw Error('耐受度结果不正确，未保存。');
    if(guard.signature!==toleranceSignature())throw Error('终端 API 已改变，耐受度未保存。');
    await commitTolerances(guard,valid);
    const skipped=missing.filter(x=>!valid.some(d=>d.id===x));
    if(skipped.length)logTerminalActivity('酒量耐受度部分缺失',skipped.map(name).join('、'));
   }catch(e){
    logTerminalActivity('酒量耐受度未获取（不影响本局）',e instanceof Error?e.message:'请求失败');
   }finally{toleranceRoom='';toleranceTask=undefined;}
  })();
  toleranceTask=task;
  return task;
 }
 const startRound=async()=>{let pending:Promise<void>=Promise.resolve();
  await run(async()=>{const id=activeGame().id;if(await recoverDrunkEnd(id))throw Error('游戏已结束，只能回看记录。');
  await commit(t=>{const current=t.rooms.find(r=>r.id===id)!;for(const r of current.rounds)if(r.anchor&&w.active&&!terminalAnchorActive(w.active,r.anchor))r.archived=true;const round=drawKingRound(t,current);round.anchor=operationAnchor;});const drawn=t.value.rooms.find(r=>r.id===id)!.rounds.at(-1)!;logTerminalActivity('国王游戏抽签',`第 ${drawn.number} 轮 · 国王 ${name(drawn.king)}`);operationRound=t.value.rooms.find(r=>r.id===id)!.rounds.at(-1)!.number;if(operationCancelled)return;targets.value=[];draft.value='';go('king');
  // 不 await：抽签已经落盘并解锁，出令可以立刻开始；耐受度只在后台补取。
  pending=fillTolerances(id);});
  return pending;};
 function gameContext(r:KingRound,room:KingRoom){return {round:r.number,king:r.king,targets:r.targets,revealedTargets:r.phase==='command'?[]:targetActors(r).map(id=>({id,number:r.numbers[id]})),command:r.command,replies:r.replies,interactions:(r.interactions||[]).filter(i=>!i.anchor||!!w.active&&terminalAnchorActive(w.active,i.anchor)).slice(-6).map(i=>({...i,text:i.text.slice(0,1000),replies:i.replies.map(r=>({...r,text:r.text.slice(0,600),penalty:r.penalty?.slice(0,300)}))})),maxNumber:Object.keys(r.numbers).length,style:room.style,recentRounds:room.rounds.filter(r=>!r.archived&&(!r.anchor||!!w.active&&terminalAnchorActive(w.active,r.anchor))).slice(-3).map(r=>({number:r.number,command:r.command,replies:r.replies.map(reply=>({...reply,text:reply.text.slice(0,600)}))}))};}
 const command=()=>run(async()=>{activeGame();const r=round.value,rm=room.value;if(!r||!rm)return;if(await recoverDrunkEnd(rm.id))throw Error('游戏已结束，只能回看记录。');requireFriends(t.value,Object.keys(r.numbers).filter(id=>id!=='player'));let text=draft.value,chosen=targets.value,betrayal=false;
  if(r.king==='player'){if(!text.trim()||!chosen.length)throw Error('请输入命令并选择目标编号。');betrayal=(await request('evaluate',[],text)).betrayal;}
  else{await commit(t=>{const locked=t.rooms.find(x=>x.id===rm.id)!.rounds.find(x=>x.number===r.number)!;lockKingTargets(locked);});const locked=t.value.rooms.find(x=>x.id===rm.id)!.rounds.find(x=>x.number===r.number)!;chosen=[...locked.targets];const participantNames=[...new Set([...Object.keys(locked.numbers),locked.king,'player'].map(name))];const result=await request('command',[r.king],'请针对锁定的匿名目标发布本轮命令。',{round:locked.number,style:rm.style,maxNumber:Object.keys(locked.numbers).length,targets:chosen,participantNames});if(JSON.stringify(result.targets)!==JSON.stringify(chosen))throw Error('模型更改了抽签目标，请重试。');text=renderKingCommand(result.template,chosen,participantNames);}
  await commit(t=>{const round=t.rooms.find(x=>x.id===rm.id)!.rounds.at(-1)!;round.anchor=operationAnchor;applyKingCommand(round,text,chosen,betrayal);});draft.value='';await react(rm.id);});
 async function react(id=roomId.value){activeGame(id);const rm=t.value.rooms.find(room=>room.id===id),r=rm?.rounds.at(-1);if(!r||!rm||r.phase!=='respond')return;if(await recoverDrunkEnd(id))throw Error('游戏已结束，只能回看记录。');if(r.anchor&&w.active&&!terminalAnchorActive(w.active,r.anchor))throw Error('该轮属于旧剧情分支，请新开一轮。');const ids=targetActors(r).filter(id=>id!=='player');requireFriends(t.value,rm.members.filter(id=>id!=='player'&&rm.invitations[id]==='accepted'));
  if(!ids.length){return;}
  const result=await request('react',ids,r.command,{...gameContext(r,rm),betrayal:r.betrayal});let ended=false;
 // Atomic: the refusing reply, the one cup and — when a tolerance is crossed — the
 // game end all land in one persisted commit; a refresh can never observe drunk>=tol
 // on a still-active room.
 await commit(t=>{const room2=t.rooms.find(x=>x.id===rm.id)!;const round=room2.rounds.at(-1)!;round.anchor=operationAnchor;round.betrayal=round.betrayal||result.betrayal;applyKingReplies(round,result.replies);syncKingDrunk(t,room2);ended=applyDrunkEnd(t,room2,kingOverLimit(room2,tolerances.value));});
 if(ended){endSaveFailed.value='';logTerminalActivity('国王游戏因醉酒结束',`${rm.name} · ${kingOverLimit(t.value.rooms.find(x=>x.id===rm.id)!,tolerances.value).map(x=>name(x)).join('、')} 达到耐受度`);go('history');await requestAfterparty(rm.id);return;}
 await maybeDrunkEnd(rm.id);}
 const retryReact=()=>run(()=>react());
async function interact(retry=false,kind:KingInteraction['kind']='chat'){activeGame();if(await recoverDrunkEnd(roomId.value))throw Error('游戏已结束，只能回看记录。');
 const r=round.value,rm=room.value;if(!r||!rm||r.phase==='command')throw Error('请先发布本轮命令。');if(r.anchor&&w.active&&!terminalAnchorActive(w.active,r.anchor))throw Error('剧情分支已改变。');
 const pending=r.interactions?.find(i=>i.status==='pending');if(pending&&!retry)throw Error('请先重试上一次互动。');let interaction=pending;
 if(!retry){const text=draft.value.trim();if(!text||text.length>2000)throw Error('请输入1～2000字的互动。');if((r.interactions?.length||0)>=200)throw Error('本轮互动已达200条，请结束本轮。');if(kind!=='chat'&&(!targetActors(r).includes('player')||r.replies.some(p=>p.id==='player')))throw Error('本轮没有等待你的命令回应。');
 const entry:KingInteraction={id:terminalId(),kind,text,replies:[],status:'pending',anchor:operationAnchor};await commit(t=>{const current=t.rooms.find(x=>x.id===rm.id)!.rounds.find(x=>x.number===r.number)!;current.anchor||=operationAnchor;current.interactions||=[];current.interactions.push(entry);if(kind!=='chat'){current.replies.push({id:'player',text,refused:kind==='refuse',penalty:kind==='refuse'?'玩家已自行描述承担的惩罚':''});finishKingRound(current);}syncKingDrunk(t,t.rooms.find(x=>x.id===rm.id)!);});draft.value='';interaction=entry;}
 if(kind!=='chat'){
  // The player's own cups settle with the reply above: judge the threshold at once.
  // A crossing ends and saves the game here — the ordinary game-interact request is
  // never sent, and the pending interaction is closed as stopped by the end commit.
  const rmNow=t.value.rooms.find(x=>x.id===rm.id)!;const over=kingOverLimit(rmNow,tolerances.value);
   if(over.length){let ended=false;await commit(t=>{ended=applyDrunkEnd(t,t.rooms.find(x=>x.id===rm.id)!,kingOverLimit(t.rooms.find(x=>x.id===rm.id)!,tolerances.value));});
   if(ended){endSaveFailed.value='';logTerminalActivity('国王游戏因醉酒结束',`${rm.name} · ${over.map(x=>name(x)).join('、')} 达到耐受度`);go('history');await requestAfterparty(rm.id);return;}}}
 if(!interaction)return;const ids=rm.members.filter(id=>id!=='player'&&rm.invitations[id]==='accepted');requireFriends(t.value,ids);const current=t.value.rooms.find(x=>x.id===rm.id)!.rounds.find(x=>x.number===r.number)!;
 const result=await request('game-interact',ids,interaction.text,{...gameContext(current,rm),interactionKind:interaction.kind,betrayal:current.betrayal});let ended=false;
 await commit(t=>{const room2=t.rooms.find(x=>x.id===rm.id)!;const current=room2.rounds.find(x=>x.number===r.number)!,entry=current.interactions?.find(i=>i.id===interaction!.id);if(!entry||entry.status!=='pending')return;entry.replies=result.replies;entry.status='ready';syncKingDrunk(t,room2);ended=applyDrunkEnd(t,room2,kingOverLimit(room2,tolerances.value));});
 if(ended){endSaveFailed.value='';logTerminalActivity('国王游戏因醉酒结束',`${rm.name} · ${kingOverLimit(t.value.rooms.find(x=>x.id===rm.id)!,tolerances.value).map(x=>name(x)).join('、')} 达到耐受度`);go('history');await requestAfterparty(rm.id);return;}
 await maybeDrunkEnd(rm.id);
 }
 const gameInteract=()=>run(()=>interact());const retryGameInteract=()=>run(()=>interact(true));const playerReply=(refused=false)=>run(()=>interact(false,refused?'refuse':'complete'));

 function askEnd(){if(room.value)endConfirm.value=room.value.id;}
 /** Fingerprint of everything except the afterparty field: a late/failed afterparty write
 * must only ever land on the very session+room+end state it was requested for. */
const roomFingerprint=(rm:KingRoom)=>JSON.stringify({...rm,afterparty:undefined});
/** Controlled write path for ended rooms: only the afterparty field (and the memory
 * summary written by the caller) may change after endedAt. The write is bound to the
 * original session, room, endedAt stamp and room fingerprint, so a failure that settles
 * after the user switched archives or branches can never land on a different room that
 * happens to share an id. This bypasses commit's ended-room guard on purpose but stays
 * session-guarded. */
async function commitAfterparty(id:string,guard:{sid:string;endedAt:string;fingerprint:string;anchor:TerminalAnchor},update:(next:PersonalTerminal,room:KingRoom)=>void){
 const session=w.active;if(!session||session.id!==guard.sid)throw Error('存档已切换，复盘写入已停止。');
 // Bound to the anchor captured when the afterparty request was made: an async same-session
 // branch switch (another variant now selected) invalidates the request, so neither the
 // success write nor the failure bookkeeping may land on the old branch.
 if(!terminalAnchorActive(session,guard.anchor))throw Error('剧情分支已切换，复盘写入已停止。');
 const current=session.terminal?.rooms.find(r=>r.id===id);
 if(!current||current.endedAt!==guard.endedAt||roomFingerprint(current)!==guard.fingerprint)throw Error('复盘上下文已改变，写入已停止。');
 const next:PersonalTerminal=JSON.parse(JSON.stringify(session.terminal));
 const rm=next.rooms.find(r=>r.id===id);if(!rm||!rm.endedAt)throw Error('房间不存在或尚未结束。');
 update(next,rm);
 const prior=session.terminal,notes=session.memories.filter(isTerminalMemoryNote).map(m=>JSON.parse(JSON.stringify(m)));session.terminal=next;syncTerminalMemoryNotes(session);try{await (w.saveTerminal?w.saveTerminal(session):w.save());if(String(w.storageStatus)==='failed')throw Error('终端保存失败');}catch(e){session.terminal=prior;session.memories=[...session.memories.filter(m=>!isTerminalMemoryNote(m)),...notes];throw e;}
 if(w.active?.id!==guard.sid)throw Error('存档已切换，复盘写入已停止。');
 if(String(w.storageStatus)==='failed')throw Error('终端保存失败，请先导出当前存档。');
 w.indexTerminalNotes();
}
/** Safe prose extraction from a failed model reply: takes the text field of any parseable
 * JSON segment, or plain prose; raw JSON is never stored as the body. */
function afterpartyDraftText(raw:unknown):string{
 if(typeof raw!=='string')return '';let best='';
 for(const piece of raw.split('\n\n[纠正稿]\n')){const text=piece.trim();if(!text)continue;let candidate='';
  if(text.startsWith('{')||text.startsWith('[')){try{const v=JSON.parse(text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(v&&typeof v==='object'&&typeof (v as any).text==='string')candidate=(v as any).text;}catch{candidate='';}}
  else candidate=text;
  if(candidate&&candidate.length>best.length)best=candidate;
 }return best.slice(0,afterpartyMaxChars);
}
async function markAfterpartyFailure(id:string,guard:{sid:string;endedAt:string;fingerprint:string;anchor:TerminalAnchor},message:string,draft:string){
 try{await commitAfterparty(id,guard,(_next,room)=>{if(room.afterparty&&room.afterparty.status!=='ready'){const keep=typeof room.afterparty.draft==='string'?room.afterparty.draft:'';const keepDraft=draft.length>keep.length?draft:keep;room.afterparty={...room.afterparty,status:'failed',error:message.slice(0,2000),...(keepDraft?{draft:keepDraft}:{})};}});}catch{/* failure bookkeeping must not mask the original error */}
}
async function requestAfterparty(id:string,onlyActor?:string){
 const session=w.active,rm=session?.terminal?.rooms.find(r=>r.id===id);if(!session||!rm?.endedAt||!rm.afterparty||rm.afterparty.status==='ready')return;
 operationRoom='';operationRound=0;
 const guard={sid:session.id,endedAt:rm.endedAt,fingerprint:roomFingerprint(rm),anchor:terminalAnchor(session)};
 if(!rm.afterparty.scenes){const triggers=rm.afterparty.triggers?.length?rm.afterparty.triggers:rm.endTriggers?.length?rm.endTriggers:kingOverLimit(rm,tolerances.value);if(!triggers.length){await commitAfterparty(id,guard,(_next,room)=>{room.afterparty!.status='failed';room.afterparty!.error='旧记录无法确认醉酒角色，原记录和草稿已保留，未生成多人复盘。';});throw Error('旧记录无法确认醉酒角色，原记录和草稿已保留。');}await commitAfterparty(id,guard,(_next,room)=>{room.afterparty!.scenes=afterpartyScenes(room,triggers);});}
 const scenes=t.value.rooms.find(r=>r.id===id)!.afterparty!.scenes!,failures:string[]=[];
 for(const scene of scenes){
  if(scene.status==='ready'||onlyActor&&scene.actorId!==onlyActor)continue;
  const actorId=scene.actorId,participants=[...scene.participants],oldDraft=scene.draft||'';
  try{
   const context={room:{name:rm.name,style:rm.style},targetActorId:participants.find(id=>id!=='player')||actorId,drunkActorId:actorId,playerDrunk:actorId==='player',participants:participants.map(mid=>({id:mid,name:name(mid),drunk:rm.drunk?.[mid]||0,tolerance:toleranceValue(mid)})),triggers:[name(actorId)],rounds:rm.rounds.filter(r=>!r.archived&&(!r.anchor||terminalAnchorActive(session,r.anchor))).slice(-6).map(r=>({number:r.number,king:name(r.king),command:r.command,replies:r.replies.map(reply=>({id:reply.id,name:name(reply.id),text:reply.text.slice(0,500),refused:reply.refused,penalty:reply.penalty?.slice(0,200)}))}))};
   const result=await request('afterparty',participants.filter(id=>id!=='player'),'只写玩家与本次指定醉酒角色独处的暧昧小剧场，不让其他角色进入或听见。',{afterparty:context,...(oldDraft?{priorDraft:oldDraft}:{})});
   const text=typeof result.text==='string'?result.text:'';if(visibleTextLength(text)<afterpartyMinChars){const e=Object.assign(Error('小剧场不足1200字，草稿已保留，可单独重试。'),{raw:JSON.stringify({text})});throw e;}
   const summary=(typeof result.summary==='string'?result.summary:text.replace(/\s/gu,'').slice(0,240)).slice(0,400);
   await commitAfterparty(id,guard,(next,room)=>{const entry=room.afterparty!.scenes!.find(s=>s.actorId===actorId)!;Object.assign(entry,{status:'ready',text,summary,error:undefined,draft:undefined});room.afterparty!.status=room.afterparty!.scenes!.every(s=>s.status==='ready')?'ready':room.afterparty!.scenes!.some(s=>s.status==='failed')?'failed':'pending';const anchor=room.rounds.filter(r=>!r.archived).at(-1)?.anchor||guard.anchor;recordTerminalChat(next,anchor,{id:'afterparty:'+id+':'+scenes.indexOf(scene),title:(room.name+' · '+name(actorId)).slice(0,60),group:false},participants,'醉后小剧场：'+summary,[],audienceSnapshot(participants));});
   logTerminalActivity('个人醉后小剧场已保存',name(actorId)+' · '+visibleTextLength(text)+' 字');
  }catch(e){const message=e instanceof Error?e.message:'生成失败',candidate=afterpartyDraftText((e as any)?.raw);failures.push(name(actorId)+'：'+message);try{await commitAfterparty(id,guard,(_next,room)=>{const entry=room.afterparty!.scenes!.find(s=>s.actorId===actorId)!;if(entry.status==='ready')return;entry.status='failed';entry.error=message.slice(0,2000);if(candidate.length>(entry.draft?.length||0))entry.draft=candidate;room.afterparty!.status='failed';});}catch{}if(operationCancelled)break;}
 }
 if(failures.length)throw Error(failures.join('；'));
}
async function requestLegacyAfterparty(id:string){
 const session=w.active;const rm=session?.terminal?.rooms.find(r=>r.id===id);
 if(!session||!rm||!rm.endedAt||!rm.afterparty||rm.afterparty.status==='ready')return;
 if(!profile.value)throw Error('请先配置终端 API。');
 operationRoom='';operationRound=0;// dedicated ended-room path: skip the active-game request guard
 // Snapshot taken when the game ended: only actually-accepted participants (player
 // included) receive the afterparty; declined or pending invitees are excluded and no
 // anonymous number mapping is revealed (the king command keeps its own protection).
 const participants=rm.afterparty.participants?.length?rm.afterparty.participants:kingParticipants(rm);
 const guard={sid:session.id,endedAt:rm.endedAt,fingerprint:roomFingerprint(rm),anchor:terminalAnchor(session)};
 const triggers=[...(rm.afterparty.triggers||[])];
 const oldDraft=typeof rm.afterparty.draft==='string'?rm.afterparty.draft:'';
 const visible=rm.rounds.filter(r=>!r.archived&&(!r.anchor||!!w.active&&terminalAnchorActive(w.active,r.anchor)));
 const context={room:{name:rm.name,style:rm.style},participants:participants.map(mid=>({id:mid,name:name(mid),drunk:rm.drunk?.[mid]||0,tolerance:toleranceValue(mid)})),triggers:triggers.map(name),rounds:visible.slice(-6).map(r=>({number:r.number,king:name(r.king),command:r.command,replies:r.replies.map(x=>({id:x.id,name:name(x.id),text:x.text.slice(0,600),refused:x.refused,penalty:(x.penalty||'').slice(0,300)})),interactions:(r.interactions||[]).slice(-4).map(i=>({kind:i.kind,text:i.text.slice(0,600),replies:i.replies.map(x=>({id:x.id,name:name(x.id),text:x.text.slice(0,400),refused:x.refused,penalty:(x.penalty||'').slice(0,200)}))}))}))};
 let failure:unknown,draftCandidate='';
 try{
  // Scoped context: the audience is this room's end-time participants, so recall only
  // surfaces knowledge shared with them; other characters' private chats and the raw
  // recent prose never enter an afterparty request.
  const r=await request('afterparty',participants.filter(x=>x!=='player'),'请生成本局国王游戏结束后的afterparty场景正文。',{afterparty:context,...(oldDraft?{priorDraft:oldDraft.slice(0,afterpartyMaxChars)}:{})});
  const text=typeof r.text==='string'?r.text:'';
  if(visibleTextLength(text)<afterpartyMinChars){failure=Error('复盘正文不足1200字，原文与错误已保留，可重试补写。');draftCandidate=text.length>oldDraft.length?text:oldDraft;}
  else{
   const summary=(typeof r.summary==='string'&&r.summary.trim()?r.summary.trim():text.replace(/\s+/gu,'').slice(0,240)).slice(0,400);
   await commitAfterparty(id,guard,(next,room)=>{
    room.afterparty={status:'ready',text,summary,triggers,at:new Date().toISOString(),participants};
    const anchor=room.rounds.filter(x=>!x.archived).at(-1)?.anchor||terminalAnchor(session);
    const b=terminalBucket(next,anchor);
    for(const g of b.games)if(g.id.startsWith(id+':')){g.afterparty=summary;g.knownBy=audienceSnapshot(participants);}
    recordTerminalChat(next,anchor,{id:'afterparty:'+id,title:room.name,group:false},participants,'国王游戏复盘：'+summary,[],audienceSnapshot(participants));
   });
   logTerminalActivity('国王游戏复盘已保存',`${context.room.name} · ${visibleTextLength(text)} 字`);
  }
 }catch(e){failure=e;draftCandidate=afterpartyDraftText((e as any)?.raw);}
 if(failure){await markAfterpartyFailure(id,guard,failure instanceof Error?failure.message:'生成失败',draftCandidate);throw failure;}
}
/** Daily divination: one locked draw per (Beijing day, actor). The draw is persisted
 * atomically before any interpretation request; the reading write is bound to the
 * original session, day, actor and cards fingerprint, so a late success after an
 * archive/branch switch can never land elsewhere, and retries never re-draw. */
// Reactive day source for the daily sign. A plain Date.now() inside a computed would cache
// yesterday's key, so the day is refreshed by one single timeout at the next existing day
// boundary (Asia/Shanghai), re-armed after it fires. Focus / visibility / opening the page /
// draw actions all recalibrate, covering sleep, background throttling and clock changes.
// There is no periodic date polling.
const dayNow=ref(divinationDay());
const divinationRefreshAt=ref(divinationDeadline());
let dayTimer:ReturnType<typeof setTimeout>|undefined;
function scheduleDayBoundary(){
 if(dayTimer!==undefined)clearTimeout(dayTimer);
 const deadline=divinationRefreshAt.value;
 // Clamp into the platform's setTimeout range; the focus handlers recalibrate long delays.
 const delay=Math.max(250,Math.min(deadline-Date.now(),2147483647));
 dayTimer=setTimeout(()=>{
  dayTimer=undefined;
  dayNow.value=divinationDay();
  divinationRefreshAt.value=divinationDeadline();
  scheduleDayBoundary();
 },delay);
}
const refreshDay=()=>{dayNow.value=divinationDay();divinationRefreshAt.value=divinationDeadline();scheduleDayBoundary();};
onMounted(()=>{refreshDay();if(typeof document!=='undefined'&&typeof window!=='undefined'){document.addEventListener('visibilitychange',refreshDay);window.addEventListener('focus',refreshDay);}});
onBeforeUnmount(()=>{if(dayTimer!==undefined)clearTimeout(dayTimer);dayTimer=undefined;if(typeof document!=='undefined'&&typeof window!=='undefined'){document.removeEventListener('visibilitychange',refreshDay);window.removeEventListener('focus',refreshDay);}});
const divinationToday=computed(()=>dayNow.value);
const myDivination=computed(()=>findDivination(t.value,dayNow.value,'player'));
const peekActorId=ref('');
const peekRecord=computed(()=>peekActorId.value?findDivination(t.value,dayNow.value,peekActorId.value):undefined);
const peekCandidates=computed(()=>actors.value.filter(a=>a.id!=='player'));
const divinationHistory=computed(()=>(t.value.divinations||[]).filter(d=>d.day!==dayNow.value).slice().reverse());
const divinationHistoryPage=ref(1);
const visibleDivinationHistory=computed(()=>divinationHistory.value.slice(0,divinationHistoryPage.value*20));
/** Records proven to be on disk: only these may reach the interpretation API, so an
 * in-memory leftover from a failed save can never bypass persist-first. Keyed by
 * session|day|actor|cards-fingerprint (not object identity): a reading commit clones
 * the terminal, and the clone must not lose its proven-persisted status. */
const persistedKeys=new Set<string>();
const persistedKey=(sid:string,record:{day:string;actorId:string;cards:TerminalDivination['cards']})=>`${sid}|${record.day}|${record.actorId}|${cardsFingerprint(record.cards)}`;
async function persistedDivination(day:string,actorId:string):Promise<TerminalDivination>{
 const session=w.active;if(!session)throw Error('请先打开存档。');
 const existing=findDivination(t.value,day,actorId);
 if(existing&&persistedKeys.has(persistedKey(session.id,existing)))return existing;
 await commit(next=>{ensureDivination(next,day,actorId);});
 const winning=findDivination(t.value,day,actorId);
 if(!winning)throw Error('占卜保存后未能读取，请刷新页面。');
 persistedKeys.add(persistedKey(session.id,winning));
 return winning;
}
/** Controlled write path for a divination record: only the reading field may change,
 * and only while the locked cards fingerprint still matches. A failed save rolls the
 * terminal back, so a fake "ready" reading never lingers in memory. */
async function commitDivination(guard:{sid:string;day:string;actorId:string;fingerprint:string;anchor:TerminalAnchor},update:(next:PersonalTerminal,record:TerminalDivination)=>void){
 const session=w.active;if(!session||session.id!==guard.sid)throw Error('存档已切换，占卜写入已停止。');
 if(!terminalAnchorActive(session,guard.anchor))throw Error('剧情分支已切换，占卜写入已停止。');
 const next:PersonalTerminal=JSON.parse(JSON.stringify(session.terminal||emptyTerminal()));
 const record=findDivination(next,guard.day,guard.actorId);
 if(!record||cardsFingerprint(record.cards)!==guard.fingerprint)throw Error('占卜记录已改变，写入已停止。');
 if(record.reading.status==='ready')return;
 const previous=session.terminal;
 update(next,record);
 session.terminal=next;syncTerminalMemoryNotes(session);
 try{
  await (w.saveTerminal?w.saveTerminal(session):w.save());
  if(w.active?.id!==guard.sid)throw Error('存档已切换，占卜写入已停止。');
  if(String(w.storageStatus)==='failed')throw Error('终端保存失败，请先导出当前存档。');
  w.indexTerminalNotes();
 }catch(e){session.terminal=previous;syncTerminalMemoryNotes(session);throw e;}
}
async function markDivinationFailure(guard:{sid:string;day:string;actorId:string;fingerprint:string;anchor:TerminalAnchor},message:string,draft:string){
 try{await commitDivination(guard,(_next,record)=>{if(record.reading.status!=='ready'){const keep=typeof record.reading.draft==='string'?record.reading.draft:'';const keepDraft=draft.length>keep.length?draft:keep;record.reading={...record.reading,status:'failed',error:message.slice(0,2000),...(keepDraft?{draft:keepDraft}:{})};}});}catch{/* failure bookkeeping must not mask the original error */}
}
async function requestDivinationReading(record:TerminalDivination){
 const session=w.active;if(!session)throw Error('请先打开存档。');
 if(!profile.value)throw Error('请先配置终端 API。');
 const kind=record.actorId==='player'?'player':'npc';
 const guard={sid:session.id,day:record.day,actorId:record.actorId,fingerprint:cardsFingerprint(record.cards),anchor:terminalAnchor(session)};
 const actorLabel=kind==='npc'?name(record.actorId):'玩家';
 const input=kind==='npc'?`请为角色「${actorLabel}」解读程序已锁定的今日塔罗牌，并给出该角色本人的反应。`:'请解读玩家（你自己）程序已锁定的今日塔罗牌。';
 const priorDraft=typeof record.reading.draft==='string'&&record.reading.draft.trim()?record.reading.draft:undefined;
 let failure:unknown,draftCandidate='',parsed:Record<string,unknown>|undefined;
 // readable partial content from a structurally invalid reply is still worth keeping
 const partialDraft=()=>{let best='';if(parsed&&typeof parsed==='object')for(const value of Object.values(parsed))if(typeof value==='string'){const s=value.trim();if(s.length>=4&&s.length<=divinationSectionMax&&s.length>best.length)best=s;}return best;};
 try{
  const r=await request('divination',[record.actorId],input,{divination:{day:record.day,actorId:record.actorId,kind,cards:record.cards,...(priorDraft?{priorDraft}:{})}}) as Record<string,unknown>;parsed=r;
  const section=(v:unknown,max:number=divinationSectionMax)=>typeof v==='string'&&v.trim().length>=4&&v.length<=max;
  if(!section(r.overall)||!section(r.love)||!section(r.career)||!section(r.caution))throw Error('解读结构不正确，原文已保留，可重试。');
  if(kind==='npc'&&!section(r.reaction,divinationReactionMax))throw Error('角色反应缺失，解读未保存，可重试。');
  await commitDivination(guard,(_next,rec)=>{
   rec.reading={status:'ready',overall:r.overall as string,love:r.love as string,career:r.career as string,caution:r.caution as string,...(kind==='npc'&&typeof r.reaction==='string'&&r.reaction.trim()?{reaction:r.reaction}:{}),at:new Date().toISOString()};
  });
  logTerminalActivity('每日占卜解读已保存',`${actorLabel} · ${record.day} · ${record.cards.map(c=>c.name+(c.reversed?'（逆位）':'')).join('、')}`);
 }catch(e){failure=e;draftCandidate=divinationDraftText((e as any)?.raw)||partialDraft();}
 if(failure){await markDivinationFailure(guard,failure instanceof Error?failure.message:'生成失败',draftCandidate);throw failure;}
}
/** Atomically persist the locked draw first; only a persisted draw is ever interpreted.
 * Today-entry actions refresh the day first: a click just after Beijing midnight must
 * not draw into yesterday while the 30s interval has not ticked yet. Backfill keeps
 * its explicit past day and never moves dayNow; the reading write-back uses the
 * record's original day, so a late response can never roll the visible day back. */
const drawDaily=()=>run(async()=>{
 refreshDay();
 const winning=await persistedDivination(divinationToday.value,'player');
 if(winning.reading.status==='ready')return;
 await requestDivinationReading(winning);
});
/** Lazy NPC peek: the record is created on the first peek of the day and then fixed.
 * It never consumes the player's own draw and is invisible to other characters. */
const peekDaily=(actorId:string)=>run(async()=>{
 refreshDay();
 if(!actors.value.some(a=>a.id===actorId)||actorId==='player')throw Error('只能偷看本档已知角色。');
 const winning=await persistedDivination(divinationToday.value,actorId);
 peekActorId.value=actorId;
 if(winning.reading.status==='ready')return;
 await requestDivinationReading(winning);
});
const retryDivination=(actorId='player')=>run(async()=>{
 refreshDay();
 const session=w.active,day=divinationToday.value,record=findDivination(t.value,day,actorId);
 if(!record||record.reading.status==='ready')throw Error('该记录不存在或解读已完成。');
 if(!session||!persistedKeys.has(persistedKey(session.id,record)))await persistedDivination(day,actorId);
 await requestDivinationReading(findDivination(t.value,day,actorId)||record);
});
/** Explicit backfill for a past day's unfinished reading: same original day, same
 * locked cards, never a re-draw; completed history stays read-only. */
const backfillDivination=(day:string,actorId:string)=>run(async()=>{
 const session=w.active,record=findDivination(t.value,day,actorId);
 if(!record||record.reading.status==='ready')throw Error('该记录不存在或解读已完成。');
 if(!session||!persistedKeys.has(persistedKey(session.id,record)))await persistedDivination(day,actorId);
 await requestDivinationReading(findDivination(t.value,day,actorId)||record);
});
async function saveGameEnd(id:string,reason:'manual'|'drunk'|'round-limit',triggers:string[]){
 const session=w.active,sid=session?.id;
 if(!session)throw Error('请先打开存档。');
 const next:PersonalTerminal=JSON.parse(JSON.stringify(session.terminal||emptyTerminal()));const rm=next.rooms.find(r=>r.id===id);if(!rm)throw Error('房间不存在。');
 rm.endedAt||=new Date().toISOString();rm.endReason||=reason;
 const participants=kingParticipants(rm);
 if(reason==='drunk'){rm.endReason||='drunk';rm.endTriggers||=[...triggers];rm.afterparty||={status:'pending',triggers:[...triggers],at:rm.endedAt,participants,scenes:afterpartyScenes(rm,triggers)};}
 for(const r of rm.rounds)for(const i of r.interactions||[])if(i.status==='pending')i.status='stopped';
 const visibleRounds=rm.rounds.filter(r=>!r.archived&&(!r.anchor||terminalAnchorActive(session,r.anchor)));
 if(visibleRounds.length){for(const b of next.memories||[])for(const g of b.games)if(g.id.startsWith(id+':'))g.endedAt=rm.endedAt;
 recordTerminalChat(next,terminalAnchor(session),{id:'ended:'+id,title:rm.name,group:false},[name('player')],reason==='drunk'?'有参与者醉酒达到耐受度，国王游戏提前结束；已有记录保留，未完成轮次停止。':'国王游戏已结束；已有记录保留，未完成轮次停止。',[],audienceSnapshot(participants));}
 session.terminal=next;syncTerminalMemoryNotes(session);await (w.saveTerminal?w.saveTerminal(session):w.save());if(w.active?.id!==sid)throw Error('存档已改变。');if(String(w.storageStatus)==='failed')throw Error('保存失败');
 return {rm,visibleRounds};
}
/** Fallback threshold end kept for paths that did not end inside their own commit. */
const retryAfterparty=(id=roomId.value,actorId?:string)=>run(async()=>{const rm=t.value.rooms.find(r=>r.id===id);if(!rm?.endedAt||!rm.afterparty||rm.afterparty.status==='ready')throw Error('该房间没有待补写的复盘。');await requestAfterparty(id,actorId);});
async function maybeDrunkEnd(id:string){
 const rm=t.value.rooms.find(r=>r.id===id);if(!rm||rm.endedAt)return;
 const over=kingOverLimit(rm,tolerances.value);if(!over.length&&!roundLimit(rm))return;
 const {rm:ended,visibleRounds}=await saveGameEnd(id,over.length?'drunk':'round-limit',over);
 endSaveFailed.value='';if(visibleRounds.length)logTerminalActivity('国王游戏因醉酒结束',`${ended.name} · ${over.map(x=>name(x)).join('、')} 达到耐受度`);
 go('history');
 await requestAfterparty(id);
}
/** Atomic drunk-end applied inside a regular commit: end fields, memory stamps, the
 * afterparty participant snapshot and consistent closure of pending interactions all
 * land in one persisted write. */
function applyDrunkEnd(next:PersonalTerminal,room:KingRoom,triggers:string[]){
 if(room.endedAt)return false;if(!triggers.length){if(!roundLimit(room))return false;room.endedAt=new Date().toISOString();room.endReason='round-limit';for(const b of next.memories||[])for(const g of b.games)if(g.id.startsWith(room.id+':'))g.endedAt=room.endedAt;return true;}
 room.endedAt=new Date().toISOString();room.endReason='drunk';room.endTriggers=[...triggers];
 room.afterparty={status:'pending',triggers:[...triggers],at:room.endedAt,participants:kingParticipants(room),scenes:afterpartyScenes(room,triggers)};
 for(const r of room.rounds)for(const i of r.interactions||[])if(i.status==='pending')i.status='stopped';
 for(const b of next.memories||[])for(const g of b.games)if(g.id.startsWith(room.id+':'))g.endedAt=room.endedAt;
 if(w.active)recordTerminalChat(next,operationAnchor||terminalAnchor(w.active),{id:'ended:'+room.id,title:room.name,group:false},[name('player')],'有参与者醉酒达到耐受度，国王游戏提前结束；已有记录保留，未完成轮次停止。',[],audienceSnapshot(kingParticipants(room)));
 return true;
}

async function endGame(){
  if(ending.value||!endConfirm.value)return;const id=endConfirm.value,sid=w.active?.id;
  if(working.value&&operationRoom!==id){error.value='其他任务正在处理中，请稍后结束游戏。';return;}
  ending.value=true;
  try{
   if(working.value){operationCancelled=true;controller?.abort();await operationDone;}
   const session=w.active;if(!session||session.id!==sid)throw Error('存档已改变。');
   const next:PersonalTerminal=JSON.parse(JSON.stringify(session.terminal));const rm=next.rooms.find(r=>r.id===id);if(!rm)throw Error('房间不存在。');
   rm.endedAt||=new Date().toISOString();
   const visibleRounds=rm.rounds.filter(r=>!r.archived&&(!r.anchor||terminalAnchorActive(session,r.anchor)));
   if(visibleRounds.length){for(const b of next.memories||[])for(const g of b.games)if(g.id.startsWith(id+':'))g.endedAt=rm.endedAt;
   recordTerminalChat(next,terminalAnchor(session),{id:'ended:'+id,title:rm.name,group:false},[name('player')],'国王游戏已结束；已有记录保留，未完成轮次停止。');}
   session.terminal=next;syncTerminalMemoryNotes(session);await (w.saveTerminal?w.saveTerminal(session):w.save());if(w.active?.id!==sid)throw Error('存档已改变。');if(String(w.storageStatus)==='failed')throw Error('保存失败');
   endSaveFailed.value='';endConfirm.value='';if(visibleRounds.length)logTerminalActivity('结束国王游戏',`${rm.name} · ${visibleRounds.length} 轮记录`);go('games');
  }catch(e){if(w.active?.id!==sid){endConfirm.value=endSaveFailed.value='';return;}endSaveFailed.value=id;error.value='结束状态未保存，请重试保存；当前数据仍可导出。'+(e instanceof Error?e.message:'');}
  finally{ending.value=false;}
 }
 const uploadAvatar=(file:File)=>run(async()=>{const avatar=await terminalAvatarImage(file);await commit(t=>{t.avatar=avatar;t.avatarView={scale:1,x:0,y:0};});});
const uploadGroupAvatar=(file:File)=>run(async()=>{const id=conversationId.value,c=t.value.conversations.find(c=>c.id===id);if(!c||!groupCanManage(c))throw Error('只有群主或管理员可以更换群头像。');const avatar=await terminalAvatarImage(file);await commit(t=>{const group=t.conversations.find(c=>c.id===id)!;if(!groupCanManage(group))throw Error('群管理权限已改变，头像未保存。');group.avatar=avatar;delete group.avatarPosition;});logTerminalActivity('更换群头像',c.title+' · 本地上传');});
const clearGroupAvatar=()=>run(async()=>{const id=conversationId.value;await commit(t=>{const group=t.conversations.find(c=>c.id===id)!;if(!groupCanManage(group))throw Error('群管理权限已改变，头像未保存。');delete group.avatar;delete group.avatarPosition;});logTerminalActivity('移除群头像',conversation.value?.title||'');});
const setGroupAvatarUrl=(value:string)=>run(async()=>{const id=conversationId.value,url=value.trim()?imageUrl(value):'';await commit(t=>{const group=t.conversations.find(c=>c.id===id)!;if(!groupCanManage(group))throw Error('群管理权限已改变，头像未保存。');if(url){group.avatar=url;delete group.avatarPosition;}else delete group.avatar;delete group.avatarPosition;});logTerminalActivity('设置群头像链接',url?'已保存安全链接':'已清空链接');});
const setGroupAvatarPosition=(position:{x:number;y:number})=>run(async()=>{const id=conversationId.value;if(!position||!Number.isFinite(position.x)||position.x<0||position.x>100||!Number.isFinite(position.y)||position.y<0||position.y>100)throw Error('群头像位置不正确。');await commit(t=>{const group=t.conversations.find(c=>c.id===id)!;if(!groupCanManage(group))throw Error('群管理权限已改变，头像位置未保存。');if(!group.avatar)throw Error('请先设置群头像。');group.avatarPosition={x:Math.round(position.x*100)/100,y:Math.round(position.y*100)/100};});logTerminalActivity('调整群头像位置',`水平 ${position.x}% · 垂直 ${position.y}%`);});
 const storyClock=computed(()=>terminalStoryClock(w.state,[...(w.active?.turns||[]).slice(-6).reverse().filter(t=>t.variants[t.selected]?.status==='complete').map(t=>t.variants[t.selected]?.text||''),w.active?.opening||''].join('\n')));
 const clock=storyClock;
 const storySources=computed(()=>{const sources:StoryGroupSource[]=[];for(const [index,turn] of (w.active?.turns||[]).entries()){const v=turn.variants[turn.selected];if(v?.status!=='complete')continue;for(const scene of v.outcome?.theaters||[])if(scene.kind==='group'&&(scene.messages?.length||scene.content?.trim()))sources.push({anchor:terminalAnchor(w.active!,index+1),key:turn.id+':'+v.id+':'+scene.slot,slot:scene.slot,title:scene.title||'剧情群聊',at:v.createdAt,messages:scene.messages?.length?scene.messages:[{speaker:scene.title||'剧情群聊',content:scene.content}]});}if(!sources.length)for(const scene of w.theaters)if(scene.kind==='group'&&(scene.messages?.length||scene.content?.trim()))sources.push({key:'opening:'+scene.slot+':'+scene.title,slot:scene.slot,title:scene.title||'剧情群聊',at:w.active?.createdAt||'',messages:scene.messages?.length?scene.messages:[{speaker:scene.title||'剧情群聊',content:scene.content}]});return sources;});
 watch([()=>JSON.stringify(storySources.value),working,()=>w.loading],()=>{if(working.value||w.loading||!w.active)return;try{const next=JSON.parse(JSON.stringify(t.value));if(syncStoryGroups(next,storySources.value,actors.value,w.active.persona.name)){for(const source of storySources.value){if(!source.anchor)continue;const c=next.conversations.find((c:any)=>c.storyKey===source.slot+':'+source.title.trim());if(c)recordTerminalChat(next,source.anchor,c,source.messages.map(m=>m.speaker),source.messages.map(m=>m.speaker+'：'+m.content).join('；').slice(0,4000),[],audienceSnapshot(c.members));}void run(()=>commit(t=>Object.assign(t,next)));}}catch(e){error.value=e instanceof Error?e.message:'剧情群同步失败，原记录已保留。';}},{immediate:true});
 const unread=computed(()=>visibleConversations.value.filter(c=>c.joined!==false).reduce((n,c)=>n+c.unread,0));
 const automaticSeen=new Set<string>();
 async function processAutomatic(retry=false){if(working.value||w.busy||w.loading||!w.active)return;const sid=w.active.id;if(!retry&&automaticSeen.has(sid))return;automaticSeen.add(sid);}
 const retryAutomatic=()=>{error.value='自动群聊、角色主动私聊和课表每轮只产生一次，由终端 API 单独请求；正文不使用同一次响应。未完成的阶段会在通讯页显示并可单独重试。';};
 watch(()=>[w.active?.id,w.busy,w.loading,working.value],()=>{void processAutomatic();},{immediate:true});
 return {incomingGroups,pendingGroupWelcomes,answerGroupInvitation,retryGroupWelcome,divinationToday,divinationRefreshAt,refreshDay,myDivination,peekActorId,peekRecord,peekCandidates,divinationHistory,visibleDivinationHistory,divinationHistoryPage,drawDaily,peekDaily,retryDivination,backfillDivination,ending,endConfirm,endSaveFailed,askEnd,endGame,tolerances,toleranceValue,retryAfterparty,openRoom,inviteTarget,inviteNote,beginInvite,sendInvite,addMode,lookupCandidates,gameInteract,retryGameInteract,activeFriends,boundCodes,ownCode,gameHistory,removeMember,avatarDraft,avatarStyle,adjustAvatar,flushAvatar,lookup,lookupCode,answerRequest,incoming,bioDraft,saveBio,historyPage,messages,visibleConversations,automatic,processAutomatic,retryAutomatic,storyClock,t,terminalProfile:profile,conversationFilter,plusOpen,canManage,isOwner,refreshGroup,completeGroupManagement,setAdmin,page,previous,go,search,draft,title,note,style,picked,targets,toggle,conversationId,friendId,roomId,courseId,actors,name,friends,conversation,room,round,course,courses,error,working,week,clock,unread,commit,run,friendApply,openChat,makeGroup,inviteGroup,openConversation,sendChat,updateNote,removeFriend,editGroup,leaveGroup,schedule,createRoom,retryInvite,addRoomFriends,startRound,command,retryReact,playerReply,uploadAvatar,uploadGroupAvatar,clearGroupAvatar,setGroupAvatarUrl,setGroupAvatarPosition};
}
