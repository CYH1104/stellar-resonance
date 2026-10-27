import type {Session} from './contracts';
import type {TerminalMainBatch,TerminalMainContext,TerminalMainGroup} from './terminalMain.ts';
import {terminalMainContext,cleanTerminalBatch} from './terminalMain.ts';
import {terminalAnchor,terminalAnchorActive,terminalMessageId,audienceSnapshot,recordTerminalChat,syncTerminalMemoryNotes,type TerminalJob} from './terminalLedger.ts';
import {emptyTerminal,groupAutoAdminLimit} from './personalTerminal.ts';
import {terminalGroupMessages,completedStoryRounds,terminalCooldownBlocked} from './terminalPolicy.ts';
import {applySocialActions} from './terminalSocial.ts';
import {stateAt} from './story.ts';

export interface TerminalFollowupPlan {autoAttempted:boolean;initialize:boolean;newGroupIds:string[];groups:(TerminalMainGroup&{slots:number[]})[];social:boolean}
const prefix=(key:string,gid:string)=>'main:'+key+':'+gid+':';
function variantAt(s:Session,index:number){const turn=s.turns[index];return turn?.variants[turn.selected];}
export function terminalFollowupJob(s:Session,index:number){const anchor=terminalAnchor(s,index+1);return s.terminal?.jobs?.find(j=>j.id==='followup:'+anchor.key);}
function claimNeedsReview(s:Session,index:number){
 const v=variantAt(s,index);if(!v)return false;
 const claimed=/(?:已经|已|刚刚|刚|这就|现在就).{0,12}(?:发送|发出|发了|发来|建好|建立).{0,12}(?:好友申请|群邀请|邀请|群聊|群)|(?:好友申请|群邀请).{0,8}(?:已经发送|已发|发过去|发给你)/u.test(v.text);
 if(!claimed)return false;
 const batch=v.outcome?.terminal;
 return !(batch?.friendRequests?.length||batch?.groupActions?.length);
}
export function prepareTerminalFollowup(s:Session,index:number,original?:TerminalMainContext):TerminalJob|undefined{
 const variant=variantAt(s,index);if(variant?.status!=='complete')return;
 s.terminal||=emptyTerminal();const t=s.terminal,a=terminalAnchor(s,index+1);
 const prior=terminalFollowupJob(s,index),context=original||terminalMainContext(s,index);
 const candidates=[...(original?.groups||prior?.repair?.groups||context.groups),...terminalMainContext(s,index+1).groups.filter(g=>t.conversations.find(c=>c.id===g.id)?.anchor?.key===a.key)];
 const targets=candidates.filter((g,i)=>candidates.findIndex(x=>x.id===g.id)===i).filter(g=>{
  const current=t.conversations.find(c=>c.id===g.id);
  return !!current&&current.joined!==false&&(!current.anchor||terminalAnchorActive(s,current.anchor));
 });
 const groups=targets.flatMap(g=>{const c=t.conversations.find(c=>c.id===g.id)!,taken=new Set(c.messages.filter(m=>m.source?.startsWith(prefix(a.key,g.id))).map(m=>Number(m.source!.slice(prefix(a.key,g.id).length))).filter(Number.isInteger));const slots=Array.from({length:terminalGroupMessages.min},(_,i)=>i).filter(i=>!taken.has(i));return slots.length?[{...g,slots}]:[];});
 const initialize=!context.initialized&&t.conversations.filter(c=>c.group&&c.joined!==false&&c.origin==='default'&&(!c.anchor||terminalAnchorActive(s,c.anchor))).length<2;
 const social=claimNeedsReview(s,index)||!!variant.outcome?.terminal?.report?.issues.some(i=>i.category==='friendRequests'||i.category==='groupActions');
 if(!groups.length&&!initialize&&!social){if(prior)prior.status='ready';return;}
 const job=prior||{id:'followup:'+a.key,kind:'messages' as const,target:'main-followup',status:'failed' as const,anchor:a};
 job.repair={autoAttempted:prior?.repair?.autoAttempted||false,initialize,newGroupIds:prior?.repair?.newGroupIds||context.newGroupIds,groups,social};
 if(!prior)(t.jobs||=[]).push(job);return job;
}
export function followupContext(s:Session,index:number,job:TerminalJob):TerminalMainContext{
 if(!job.repair||!terminalAnchorActive(s,job.anchor)||variantAt(s,index)?.id!==job.anchor.variantId)throw Error('原正文分支已变化，终端补齐未执行');
 const c=terminalMainContext(s,index+1);
 return {...c,initialized:!job.repair.initialize,groups:job.repair.groups.map(({slots,...g})=>g),newGroupIds:job.repair.newGroupIds,privateRecipientIds:[]};
}
export function applyTerminalFollowup(s:Session,index:number,jobId:string,raw:TerminalMainBatch){
 const t=s.terminal!,job=t.jobs?.find(j=>j.id===jobId),variant=variantAt(s,index);
 if(!job?.repair||!terminalAnchorActive(s,job.anchor)||variant?.status!=='complete'||variant.id!==job.anchor.variantId)throw Error('原正文分支已变化，迟到终端结果未应用');
 const plan=job.repair,context=followupContext(s,index,job),state=stateAt(s,index+1),actors=[...state.characters,...t.contacts||[]],batch=cleanTerminalBatch(raw,actors,context,()=>{}),names=new Map(actors.map(a=>[a.id,a.name]));
 let added=0;
 for(const group of batch.groups){
  let c=t.conversations.find(c=>c.id===group.id);const target=plan.groups.find(g=>g.id===group.id);
  if(!c&&plan.initialize&&plan.newGroupIds.includes(group.id)){c={id:group.id,title:group.title,members:group.members,ownerId:group.ownerId,adminIds:group.adminIds.slice(0,groupAutoAdminLimit),announcement:group.announcement,messages:[],unread:0,group:true,origin:'default',joined:true,managementReady:true,anchor:job.anchor};t.conversations.push(c);}
  if(!c||c.joined===false||c.anchor&&!terminalAnchorActive(s,c.anchor)||!target&&!plan.initialize)continue;
  const slots=target?.slots||[0,1,2,3];
  for(const [offset,message]of group.messages.slice(0,slots.length).entries()){
   const source=prefix(job.anchor.key,c.id)+slots[offset];if(c.messages.some(m=>m.source===source))continue;
   if(!c.members.includes(message.id))continue;
   c.messages.push({id:terminalMessageId(source),source,sender:message.id,text:message.text,at:variant.createdAt,anchor:job.anchor,knownBy:audienceSnapshot(c.members)});c.unread++;added++;
  }
  recordTerminalChat(t,job.anchor,c,group.messages.map(m=>names.get(m.id)||m.id),group.topic,[],audienceSnapshot(c.members));
 }
 const actionResults=plan.social?applySocialActions(s,index,batch.groupActions||[]):[];
 if(plan.social)for(const f of batch.friendRequests){const old=t.friends.find(o=>o.id===f.id);if(old&&(!old.anchor||terminalAnchorActive(s,old.anchor))&&(old.status!=='declined'||terminalCooldownBlocked(old.declinedRound,completedStoryRounds(s,index+1))))continue;const entry={id:f.id,status:'pending' as const,direction:'incoming' as const,requestReason:f.reason,reply:f.reason,note:old?.note||'',source:f.source||'',at:variant.createdAt,anchor:job.anchor};if(old)Object.assign(old,entry);else t.friends.push(entry);}
 const outcome=variant.outcome!;outcome.terminal||={protocolVersion:2,groups:[],privateMessages:[],friendRequests:[]};
 outcome.terminal.report||={version:1,issues:[],applied:{groupMessages:0,privateMessages:0,duplicates:0,ignored:0}};
 if(plan.social){for(const f of batch.friendRequests)if(!outcome.terminal.friendRequests.some(o=>o.id===f.id)&&t.friends.some(o=>o.id===f.id&&o.status==='pending'))outcome.terminal.friendRequests.push(f);outcome.terminal.groupActions=[...(outcome.terminal.groupActions||[]),...(batch.groupActions||[]).filter(a=>actionResults.some(r=>r.id===a.id&&(r.status==='applied'||r.status==='existing')))];}
 const report=outcome.terminal.report;
 if(report){report.perGroup=t.conversations.filter(c=>c.group&&c.joined!==false).map(c=>({id:c.id,title:c.title,messages:c.messages.filter(m=>m.source?.startsWith(prefix(job.anchor.key,c.id))).length}));if(report.applied)report.applied.groupMessages+=added;report.actions=[...(report.actions||[]),...actionResults].slice(0,20);}
 const missing=plan.groups.filter(g=>{const c=t.conversations.find(c=>c.id===g.id);return c&&c.joined!==false&&c.messages.filter(m=>m.source?.startsWith(prefix(job.anchor.key,c.id))).length<terminalGroupMessages.min;});
 const initialized=!plan.initialize||t.conversations.filter(c=>c.group&&c.origin==='default'&&c.joined!==false&&c.messages.filter(m=>m.source?.startsWith(prefix(job.anchor.key,c.id))).length>=4).length>=2;
 const socialDone=!plan.social||batch.friendRequests.length>0||actionResults.length>0&&actionResults.every(a=>a.status==='applied'||a.status==='existing');
 job.status=!missing.length&&initialized&&socialDone?'ready':'failed';job.error=job.status==='failed'?['正文完成，终端部分未完成',...missing.map(g=>g.title+'消息不足4条'),...(!initialized?['默认群消息尚未补齐']:[]),...(!socialDone?['未生成对应申请或邀请动作；不代表角色拒绝']:[])].join('；'):undefined;
 if(job.status==='ready')report.issues=report.issues.filter(i=>!['groups','groupMessages'].includes(i.category));
 t.groupsReady=t.conversations.filter(c=>c.group&&c.joined!==false).length>=2;syncTerminalMemoryNotes(s);return {added,status:job.status,error:job.error};
}
export function validateFollowupPlan(value:unknown){
 const p=value as TerminalFollowupPlan;
 if(!p||Object.keys(p).some(k=>!['autoAttempted','initialize','newGroupIds','groups','social'].includes(k))||typeof p.autoAttempted!=='boolean'||typeof p.initialize!=='boolean'||typeof p.social!=='boolean'||!Array.isArray(p.newGroupIds)||p.newGroupIds.length>5||p.newGroupIds.some(id=>typeof id!=='string'||!id||id.length>128)||new Set(p.newGroupIds).size!==p.newGroupIds.length||!Array.isArray(p.groups)||p.groups.length>100||p.groups.some(g=>!g||Object.keys(g).some(k=>!['id','title','members','ownerId','adminIds','announcement','managementReady','slots'].includes(k))||typeof g.id!=='string'||!g.id||g.id.length>128||typeof g.title!=='string'||g.title.length>60||!Array.isArray(g.members)||g.members.length>50||g.members.some(id=>typeof id!=='string'||!id||id.length>128)||typeof g.ownerId!=='string'||typeof g.announcement!=='string'||g.announcement.length>1000||!Array.isArray(g.adminIds)||g.adminIds.length>3||g.adminIds.some(id=>!g.members.includes(id)&&id!=='player')||!Array.isArray(g.slots)||g.slots.some(n=>!Number.isInteger(n)||n<0||n>=6)||new Set(g.slots).size!==g.slots.length))throw Error('终端补齐计划格式不正确');
}
