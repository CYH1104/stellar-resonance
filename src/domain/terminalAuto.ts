import type {Session} from './contracts';
import type {TerminalMainBatch} from './terminalMain';
import {cleanTerminalBatch,terminalMainContext} from './terminalMain.ts';
import {terminalAnchor,terminalAnchorActive,terminalOrigin,terminalOriginActive,terminalMessageId,audienceSnapshot,recordTerminalChat,syncTerminalMemoryNotes,type TerminalAnchor,type TerminalJob,type TerminalOrigin} from './terminalLedger.ts';
import {emptyTerminal,groupAutoAdminLimit} from './personalTerminal.ts';
import {terminalGroupMessages,completedStoryRounds,terminalCooldownBlocked} from './terminalPolicy.ts';
import {applySocialActions} from './terminalSocial.ts';
import {stateAt} from './story.ts';
import {terminalTaskPrefix} from './terminalTaskContract.ts';

/** Independent terminal round.
 *
 * The phone no longer rides on the prose request: the body model returns prose and
 * state only, and this module schedules one terminal request per turn with its own
 * API profile, abort controller, log entry and write-back guard.
 *
 * Order matters:
 * - `story-first` uses the committed prose of this turn (boundary = index + 1).
 * - `terminal-first` uses only the confirmed history plus this turn's player input
 *   (boundary = index), so it can never reference prose that does not exist yet.
 *   The prose model then receives the committed messages as `terminalFacts`.
 * The anchor is always the boundary's terminal anchor, so messages written by the
 * pre-prose stage stay visible after the prose lands and disappear with a rewind.
 */
export type TerminalAutoMode='story-first'|'terminal-first';

export interface TerminalAutoGroup {id:string;title:string;members:string[];ownerId:string;adminIds:string[];announcement:string;managementReady?:boolean;slots:number[]}

export interface TerminalAutoPlan {
 jobId:string;
 anchor:TerminalAnchor;
 turnId:string;
 variantId:string;
 /** The action that produced this round, recorded on every artifact so a rewind can hide it
  * even though a terminal-first anchor points at the previous, still-confirmed turn. */
 origin:TerminalOrigin;
 mode:TerminalAutoMode;
 /** True for the post-prose social review: no group/private generation, only actions. */
 socialOnly:boolean;
 /** The committed prose claims a request that has no structured action yet. */
 socialRequired:boolean;
 initialize:boolean;
 newGroupIds:string[];
 groups:TerminalAutoGroup[];
 social:boolean;
 privateRecipientIds:string[];
 /** Frozen at plan time: newGroupIds must be the same on write-back or initialization fails. */
 context:import('./terminalMain').TerminalMainContext;
}

export interface TerminalAutoRequest {plan:TerminalAutoPlan;context:import('./terminalMain').TerminalMainContext}

const prefix=(jobId:string,gid:string)=>`auto:${jobId}:${gid}:`;

/** A friend request or group action only needs a mandatory action when the committed prose
 * claims it happened. Permission to propose one no longer depends on this regex: the
 * structural rules (real relationship, knowledge scope, phone-number source, cooldown) are
 * enforced on write-back, and the model is only asked for actions with an actual basis. */
export function terminalClaimNeedsReview(s:Session,index:number){
 const v=s.turns[index]?.variants[s.turns[index].selected];
 if(v?.status!=='complete')return false;
 const claimed=/(?:已经|已|刚刚|刚|这就|现在就).{0,12}(?:发送|发出|发了|发来|建好|建立).{0,12}(?:好友申请|群邀请|邀请|群聊|群)|(?:好友申请|群邀请).{0,8}(?:已经发送|已发|发过去|发给你)/u.test(v.text);
 if(!claimed)return false;
 const batch=v.outcome?.terminal;
 return !(batch?.friendRequests?.length||batch?.groupActions?.length);
}
export function terminalAutoJob(s:Session,jobId:string){return s.terminal?.jobs?.find(j=>j.id===jobId);}
/** Deterministic id of one stage of one turn, so a caller can find a committed stage without
 * rebuilding the plan (and without ever deriving the turn from the knowledge anchor). */
function legacyStageId(s:Session,index:number,mode:TerminalAutoMode,socialOnly=false){
 const turn=s.turns[index];const variant=turn?.variants[turn.selected];
 if(!turn)return '';
 if(socialOnly)return `auto:${turn.id}:${variant?.id||'none'}:social`;
 if(mode==='story-first')return `auto:${turn.id}:${variant?.id||'none'}:story-first`;
 return `auto:${turn.id}:terminal-first:${terminalAnchor(s,index).key}`;
}
export function terminalAutoJobId(s:Session,index:number,mode:TerminalAutoMode,socialOnly=false){
 const base=legacyStageId(s,index,mode,socialOnly);if(!base)return '';
 return terminalTaskPrefix+base.slice('auto:'.length)+':'+(mode==='terminal-first'&&!socialOnly?terminalOrigin(s,index)!.input:terminalAnchor(s,index+1).key);
}
/** New IDs bind the action or completed source branch. Legacy stages are reused only when
 * their anchor and their stored message origins can still prove the same action. */
export function terminalAutoStageJob(s:Session,index:number,mode:TerminalAutoMode,socialOnly=false){
 const current=terminalAutoJob(s,terminalAutoJobId(s,index,mode,socialOnly));
 if(current&&terminalAnchorActive(s,current.anchor))return current;
 const legacy=terminalAutoJob(s,legacyStageId(s,index,mode,socialOnly));
 if(!legacy||!terminalAnchorActive(s,legacy.anchor))return;
 if(mode!=='terminal-first'||socialOnly)return legacy;
 const origin=terminalOrigin(s,index),sources=(s.terminal?.conversations||[]).flatMap(c=>c.messages).filter(m=>m.source?.startsWith('auto:'+legacy.id+':'));
 if(sources.length&&sources.every(m=>m.origin?.turnId===origin?.turnId&&m.origin?.input===origin?.input))return legacy;
 if(!sources.length&&legacy.status!=='ready')return legacy;
}
/** The prose raises a real contact or invitation that the pre-prose round could not see.
 * This only decides whether to run the post-prose social review; the model still verifies it. */
export function terminalSocialSignal(s:Session,index:number){
 const v=s.turns[index]?.variants[s.turns[index].selected];
 if(v?.status!=='complete')return false;
 if(terminalClaimNeedsReview(s,index))return true;
 return /(?:好友申请|群邀请|加(?:个|上)?好友|添加好友|交换.{0,6}(?:号码|联系方式|终端码)|(?:给我|留下|记下|存了|存下|发来|收到|通过|同意|接受|告知).{0,10}(?:终端码|号码|手机号|联系方式|好友申请)|(?:邀请|拉).{0,8}(?:进群|加入.{0,6}群|入群))/u.test(v.text);
}
/** Rebuild the committed facts of a finished stage. The stored copy is what the stage really
 * wrote, so a prose retry, a continuation or a page reload all receive the same data without
 * calling the model again; older jobs without a stored copy are rebuilt from their messages. */
export function terminalJobFacts(s:Session,job:TerminalJob):string{
 if(typeof job.facts==='string'&&job.facts)return job.facts;
 const t=s.terminal;if(!t)return '';
 const prefix=`auto:${job.id}:`;const rows:{order:number;line:string}[]=[];
 for(const c of t.conversations){
  for(const m of c.messages){
   if(typeof m.source!=='string'||!m.source.startsWith(prefix))continue;
   const tail=Number(m.source.slice(prefix.length).split(':').at(-1));
   const speaker=m.displayName||m.sender;
   rows.push({order:Number.isFinite(tail)?tail:0,line:c.group?`${c.title}·${speaker}：${m.text.slice(0,200)}`:`私聊·${c.title}（仅${c.title}与玩家知情）：${m.text.slice(0,200)}`});
  }
 }
 rows.sort((a,b)=>a.order-b.order);
 return rows.slice(0,40).map(r=>r.line).join('\n').slice(0,6000);
}
/** Facts of a round that has already committed its terminal stage. Continuations and state
 * repairs reuse this instead of sending the phone again: the stored copy is what the stage
 * really wrote, so it survives a reload and stays byte-identical to the first request. */
function continuationContextId(s:Session,index:number){const turn=s.turns[index];return turn?`context:${turn.id}:${turn.variants[turn.selected]?.id}:${terminalOrigin(s,index)!.input}:${terminalAnchor(s,index).key}`:'';}
export function terminalFactsJob(s:Session,index:number,sourceVariantId?:string):TerminalJob|undefined{
 const turn=s.turns[index];if(!turn)return;
 const source=sourceVariantId===undefined?turn.selected:turn.variants.findIndex(v=>v.id===sourceVariantId);if(source<0)return;
 const view=source===turn.selected?s:{...s,turns:s.turns.map((t,i)=>i===index?{...t,selected:source}:t)};
 const context=terminalAutoJob(view,continuationContextId(view,index));
 if(context?.status==='ready'&&terminalAnchorActive(view,context.anchor))return context;
 // The selected variant's post-prose stage is more specific than an older shared pre-prose cache.
 for(const mode of ['story-first','terminal-first'] as const){const job=terminalAutoStageJob(view,index,mode);if(job?.status==='ready')return job;}
 // Older merged stages have no mode. Require the selected source variant and active boundary.
 return view.terminal?.jobs?.find(j=>j.kind==='messages'&&j.mode===undefined&&j.status==='ready'&&j.anchor.turnId===turn.id&&j.anchor.variantId===turn.variants[source]?.id&&terminalAnchorActive(view,j.anchor));
}
export function terminalCommittedFacts(s:Session,index:number,sourceVariantId?:string):string{
 const job=terminalFactsJob(s,index,sourceVariantId);return job?terminalJobFacts(s,job):'';
}
/** A completed reply is copied before continuation. Keep an explicit context-only projection
 * using existing job fields, so interruption/reload does not lose its source or send the phone again.
 * It records no new model call, messages or game result and is not an automatic-stage retry. */
export function carryTerminalFacts(s:Session,index:number,sourceVariantId:string){
 const turn=s.turns[index],source=terminalFactsJob(s,index,sourceVariantId);if(!turn||!source||!s.terminal)return;
 const id=continuationContextId(s,index);if(terminalAutoJob(s,id))return;
 (s.terminal.jobs||=[]).push({id,kind:'messages',target:'continuation-context',anchor:terminalAnchor(s,index),turnId:turn.id,variantId:turn.variants[turn.selected].id,status:'ready',facts:terminalJobFacts(s,source)||undefined});
}

/** Build the plan for one turn. Returns undefined when this turn needs no terminal work
 * (already done, or nothing to talk about), so the caller makes zero requests. */
export function planTerminalAuto(s:Session,index:number,mode:TerminalAutoMode,options:{socialOnly?:boolean}={}):TerminalAutoRequest|undefined{
 const turn=s.turns[index];if(!turn)return undefined;
 const socialOnly=options.socialOnly===true;
 // The social review runs after this turn's prose, so it anchors the same boundary as the
 // prose-first stage; the pre-prose stage anchors the start of the turn instead.
 const boundary=socialOnly||mode==='story-first'?index+1:index;
 const anchor=terminalAnchor(s,boundary);
 const variant=turn.variants[turn.selected];
 const prior=terminalAutoStageJob(s,index,mode,socialOnly),jobId=prior?.id||terminalAutoJobId(s,index,mode,socialOnly);
 // A finished round is never regenerated; a failed one may be retried explicitly or by
 // the next generation of the same turn, so an interrupted stage is not a dead end.
 if(prior?.status==='ready')return undefined;
 const t=s.terminal||(s.terminal=emptyTerminal());
 const full=terminalMainContext(s,boundary,turn.input);
 // The social review may only propose actions: it gets no group or private-message targets,
 // and an initialized context rejects invented groups.
 const context=socialOnly?{...full,groups:[],privateRecipientIds:[],initialized:true,socialOnly:true}:full;
 const targets=context.groups.filter(g=>{const c=t.conversations.find(c=>c.id===g.id);return !!c&&c.joined!==false&&(!c.anchor||terminalAnchorActive(s,c.anchor,boundary));});
 const groups:TerminalAutoGroup[]=targets.flatMap(g=>{
  const c=t.conversations.find(c=>c.id===g.id)!;
  // Only this round's own sources count, plus a legacy merged-round source that used the
  // same anchor, so upgrading never writes a second copy of an already stored round.
  const prefixes=[prefix(jobId,g.id),`main:${anchor.key}:${g.id}:`];
  const taken=new Set(c.messages.flatMap(m=>{if(typeof m.source!=='string')return [];const hit=prefixes.find(p=>m.source!.startsWith(p));if(!hit)return [];const n=Number(m.source.slice(hit.length));return Number.isInteger(n)?[n]:[];}));
  const slots=Array.from({length:terminalGroupMessages.max},(_,i)=>i).filter(i=>!taken.has(i)).slice(0,terminalGroupMessages.min);
  return slots.length?[{...g,slots}]:[];
 });
 const initialize=!socialOnly&&!context.initialized&&t.conversations.filter(c=>c.group&&c.joined!==false&&c.origin==='default'&&(!c.anchor||terminalAnchorActive(s,c.anchor,boundary))&&(!c.producedBy||terminalOriginActive(s,c.producedBy))).length<2;
 // Proactive friend requests and group invitations are allowed in both orders. With committed
 // prose the model verifies them against it; the pre-prose order has none yet, so the
 // post-prose review stage verifies them instead of disabling the feature for the whole order.
 // An empty social answer is only a failure when this stage could have produced one and the
 // committed prose already claimed it. The pre-prose order cannot emit actions at all.
 const social=socialOnly||mode==='story-first';
 const socialRequired=social&&terminalClaimNeedsReview(s,index);
 if(!socialOnly&&!groups.length&&!initialize&&!socialRequired)return undefined;
 const plan:TerminalAutoPlan={jobId,anchor,turnId:turn.id,variantId:variant?.id||'',origin:terminalOrigin(s,index)!,mode:socialOnly?'story-first':mode,socialOnly,socialRequired,initialize,newGroupIds:context.newGroupIds,groups,social,privateRecipientIds:[...(context.privateRecipientIds||[])],context};
 if(!terminalAutoJob(s,jobId))(t.jobs||=[]).push({id:jobId,kind:'messages',target:'auto',anchor,status:'failed',turnId:turn.id,variantId:variant?.id||'',mode:socialOnly?'social-review':mode} as TerminalJob);
 return {plan,context};
}

export function terminalAutoContext(s:Session,plan:TerminalAutoPlan,base:import('./terminalMain').TerminalMainContext){
 return {...base,initialized:!plan.initialize,groups:plan.groups.map(({slots,...g})=>g),privateRecipientIds:plan.privateRecipientIds};
}

/** Apply a terminal batch generated for this plan. Every write is keyed by the job id,
 * so retries and late duplicates never add a second copy of the same message. */
export function applyTerminalAuto(s:Session,plan:TerminalAutoPlan,raw:TerminalMainBatch){
 if(!terminalAnchorActive(s,plan.anchor))throw Error('原剧情分支已变化，迟到终端结果未应用');
 if(!terminalOriginActive(s,plan.origin))throw Error('本轮行动已变化，迟到终端结果未应用');
 const t=s.terminal,job=t?.jobs?.find(j=>j.id===plan.jobId);
 if(!t||!job)throw Error('终端任务已不存在，迟到终端结果未应用');
 const turnIndex=s.turns.findIndex(turn=>turn.id===plan.turnId);
 if(turnIndex<0)throw Error('本轮剧情已不存在，迟到终端结果未应用');
 const boundary=plan.mode==='story-first'?turnIndex+1:turnIndex;
 const state=stateAt(s,Math.max(0,boundary));
 const actors=[...state.characters,...(t.contacts||[])];
 const context=terminalAutoContext(s,plan,plan.context);
 const batch=cleanTerminalBatch(raw,actors,context,()=>{});
 const names=new Map(actors.map(a=>[a.id,a.name]));
 const origin=plan.origin;
 let added=0;const facts:string[]=[];
 for(const group of batch.groups){
  let c=t.conversations.find(c=>c.id===group.id);const target=plan.groups.find(g=>g.id===group.id);
  if(!c&&plan.initialize&&plan.newGroupIds.includes(group.id)){c={id:group.id,title:group.title,members:group.members,ownerId:group.ownerId,adminIds:group.adminIds.slice(0,groupAutoAdminLimit),announcement:group.announcement,messages:[],unread:0,group:true,origin:'default',joined:true,managementReady:!!group.ownerId,anchor:plan.anchor,producedBy:origin};t.conversations.push(c);}
  if(!c||c.joined===false||c.anchor&&!terminalAnchorActive(s,c.anchor)||!target&&!plan.initialize)continue;
  const slots=target?.slots||[0,1,2,3];
  for(const [offset,message]of group.messages.slice(0,slots.length).entries()){
   const source=prefix(plan.jobId,c.id)+slots[offset];
   if(c.messages.some(m=>m.source===source)||!c.members.includes(message.id))continue;
   const displayName=names.get(message.id)||message.id;
   // displayName is persisted so the committed facts stay readable after a reload, without
   // having to re-derive the roster that happened to exist when the stage ran.
   c.messages.push({id:terminalMessageId(source),source,sender:message.id,displayName,text:message.text,at:new Date().toISOString(),anchor:plan.anchor,origin,knownBy:audienceSnapshot(c.members)});c.unread++;added++;
   if(facts.length<40)facts.push(`${c.title}·${displayName}：${message.text.slice(0,200)}`);
  }
  recordTerminalChat(t,plan.anchor,c,group.messages.map(m=>names.get(m.id)||m.id),group.topic,[],audienceSnapshot(c.members),origin);
 }
 for(const [i,message]of batch.privateMessages.entries()){
  let c=t.conversations.find(c=>!c.group&&c.members[0]===message.id);
  if(!c){c={id:crypto.randomUUID(),title:names.get(message.id)||message.id,members:[message.id],group:false,announcement:'',messages:[],unread:0,origin:'manual',joined:true,producedBy:origin};t.conversations.push(c);}
  const source=`auto:${plan.jobId}:private:${i}`;
  if(c.messages.some(m=>m.source===source))continue;
  const displayName=names.get(message.id)||message.id;
  c.messages.push({id:terminalMessageId(source),sender:message.id,displayName,text:message.text,at:new Date().toISOString(),source,anchor:plan.anchor,origin,knownBy:['player',message.id]});c.unread++;added++;
  // Only this participant and the player know it: the label keeps the prose from broadcasting it.
  if(facts.length<40)facts.push(`私聊·${displayName}（仅${displayName}与玩家知情）：${message.text.slice(0,200)}`);
  recordTerminalChat(t,plan.anchor,c,[displayName],message.topic,[],['player',message.id],origin);
 }
 let actionResults:ReturnType<typeof applySocialActions>=[];
 if(plan.social){
  actionResults=applySocialActions(s,boundary-1,batch.groupActions||[]);
  for(const f of batch.friendRequests){const old=t.friends.find(o=>o.id===f.id);if(old&&(!old.anchor||terminalAnchorActive(s,old.anchor))&&(old.status!=='declined'||terminalCooldownBlocked(old.declinedRound,completedStoryRounds(s,boundary))))continue;const entry={id:f.id,status:'pending' as const,direction:'incoming' as const,requestReason:f.reason,reply:f.reason,note:old?.note||'',source:f.source||'',at:new Date().toISOString(),anchor:plan.anchor};if(old)Object.assign(old,entry);else t.friends.push(entry);facts.push(`好友申请·${names.get(f.id)||f.id}：${f.reason.slice(0,160)}`);}
 }
 if(batch.courses){t.courses=batch.courses;t.scheduleKey=plan.anchor.key;t.scheduleOrigin=origin;t.scheduleDate='剧情第'+(boundary)+'轮';}
 // Count this round's own sources plus a legacy merged-round source on the same anchor.
 const written=(c:{id:string;messages:{source?:string}[]},gid:string)=>{
  const prefixes=[prefix(plan.jobId,gid),`main:${plan.anchor.key}:${gid}:`];
  return c.messages.filter(m=>typeof m.source==='string'&&prefixes.some(p=>m.source!.startsWith(p))).length;
 };
 const missing=plan.groups.filter(g=>{const c=t.conversations.find(c=>c.id===g.id);return c&&c.joined!==false&&written(c,c.id)<terminalGroupMessages.min;});
 const initialized=!plan.initialize||t.conversations.filter(c=>c.group&&c.origin==='default'&&c.joined!==false&&written(c,c.id)>=terminalGroupMessages.min).length>=2;
 // An empty social answer is only a failure when the committed prose already claimed it.
 const socialDone=!plan.socialRequired||batch.friendRequests.length>0||actionResults.length>0&&actionResults.every(a=>a.status==='applied'||a.status==='existing');
 job.status=!missing.length&&initialized&&socialDone?'ready':'failed';
 job.error=job.status==='failed'?['终端部分未完成',...missing.map(g=>g.title+'消息不足'+terminalGroupMessages.min+'条'),...(!initialized?['默认群消息尚未补齐']:[]),...(!socialDone?['未生成对应申请或邀请动作；不代表角色拒绝']:[])].join('；'):undefined;
 t.groupsReady=t.conversations.filter(c=>c.group&&c.joined!==false).length>=2;
 syncTerminalMemoryNotes(s);
 const committed=facts.join('\n').slice(0,6000);
 // Persist the committed facts on the job so a prose retry or a reload replays exactly this
 // round instead of asking the model again or inventing a second copy of the messages.
 job.facts=committed||undefined;
 return {status:job.status,added,error:job.error,facts:committed};
}
