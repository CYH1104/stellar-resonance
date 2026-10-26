import type {Session} from './contracts';
import type {PersonalTerminal} from './personalTerminal.ts';
import {groupOwner,groupAdminLimit,groupAutoAdminLimit} from './personalTerminal.ts';
import {terminalAnchor,terminalAnchorActive,recordTerminalChat,type TerminalAnchor} from './terminalLedger.ts';
import {completedStoryRounds,terminalCooldownBlocked} from './terminalPolicy.ts';

export interface TerminalGroupInvitation {id:string;groupId:string;by:string;reason:string;status:'pending'|'accepted'|'declined';anchor:TerminalAnchor;at:string;declinedRound?:number;welcome?:{status:'pending'|'ready'|'failed';error?:string}}
export interface TerminalSocialAction {id:string;kind:'create-group'|'invite-group';groupId:string;by:string;reason?:string;title?:string;members?:string[];ownerId?:string;adminIds?:string[];announcement?:string}
const text=(s:unknown,max:number):s is string=>typeof s==='string'&&!!s.trim()&&s.length<=max;
export function cleanSocialActions(raw:unknown,known:Set<string>,reserved?:string[]):TerminalSocialAction[]{
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>20)throw Error('群动作格式不正确');
 const ids=new Set<string>();
 return raw.map(a=>{
  if(!a||typeof a!=='object'||!text(a.id,128)||ids.has(a.id)||!['create-group','invite-group'].includes(a.kind)||!text(a.groupId,128)||!known.has(a.by))throw Error('群动作身份不正确');
  ids.add(a.id);
  if(a.kind==='invite-group'){if(!text(a.reason,1000))throw Error('群邀请缺少理由');return {id:a.id,kind:a.kind,groupId:a.groupId,by:a.by,reason:a.reason};}
  if(reserved&&!reserved.includes(a.groupId)||!text(a.title,60)||!Array.isArray(a.members)||!a.members.length||a.members.length>50||new Set(a.members).size!==a.members.length||a.members.some((id:string)=>!known.has(id))||!a.members.includes(a.ownerId)||!a.members.includes(a.by)||!Array.isArray(a.adminIds)||a.adminIds.length>groupAutoAdminLimit||new Set(a.adminIds).size!==a.adminIds.length||a.adminIds.some((id:string)=>!a.members.includes(id)||id===a.ownerId)||typeof a.announcement!=='string'||a.announcement.length>1000)throw Error('新群资料或身份不正确');
  return {id:a.id,kind:a.kind,groupId:a.groupId,by:a.by,title:a.title,members:[...a.members],ownerId:a.ownerId,adminIds:[...a.adminIds],announcement:a.announcement};
 });
}
export function applySocialActions(s:Session,index:number,actions:TerminalSocialAction[]){
 const terminal=s.terminal!,anchor=terminalAnchor(s,index+1),variant=s.turns[index].variants[s.turns[index].selected];
 const results:{id:string;kind:TerminalSocialAction['kind'];status:'applied'|'existing'|'blocked'|'failed';reason?:string}[]=[];
 for(const action of actions){
  const id='main:'+anchor.key+':action:'+action.id;
  try{
   terminal.jobs||=[];
   if(terminal.jobs.some(j=>j.id===id&&j.status==='ready')){results.push({id:action.id,kind:action.kind,status:'existing'});continue;}
   let c=terminal.conversations.find(c=>c.id===action.groupId);
   if(action.kind==='create-group'){
    if(c)throw Error('群身份已存在，不能覆盖已有群资料');
    if(terminal.conversations.length>=100)throw Error('会话数量已达上限');
    c={id:action.groupId,title:action.title!,members:[...action.members!],ownerId:action.ownerId,adminIds:[...action.adminIds!],announcement:action.announcement!,group:true,joined:false,managementReady:true,origin:'story',storyKey:id,messages:[],unread:0,anchor};
    terminal.conversations.push(c);
   }else{
    if(!c?.group||c.anchor&&!terminalAnchorActive(s,c.anchor,index+1))throw Error('群记录不在当前有效分支');
    if(groupOwner(c)!==action.by&&!c.adminIds?.includes(action.by))throw Error('邀请者没有群邀请权限');
    if(c.joined!==false){results.push({id:action.id,kind:action.kind,status:'existing',reason:'你已经是群成员'});continue;}
    terminal.groupInvitations||=[];
    const old=[...terminal.groupInvitations].reverse().find(i=>i.groupId===c!.id&&terminalAnchorActive(s,i.anchor,index+1));
    if(old?.status==='pending'){results.push({id:action.id,kind:action.kind,status:'existing',reason:'已有待处理群邀请'});continue;}
    if(old?.status==='declined'&&terminalCooldownBlocked(old.declinedRound,completedStoryRounds(s,index+1))){results.push({id:action.id,kind:action.kind,status:'blocked',reason:'拒绝后尚未完成下一正文轮次'});continue;}
    terminal.groupInvitations.push({id,groupId:c.id,by:action.by,reason:action.reason!,status:'pending',anchor,at:variant.createdAt});
   }
   terminal.jobs.push({id,kind:'groups',target:c.id,status:'ready',anchor});results.push({id:action.id,kind:action.kind,status:'applied'});
  }catch(e){results.push({id:action.id,kind:action.kind,status:'failed',reason:e instanceof Error?e.message:'群动作未完成'});}
 }
 return results;
}
export function answerGroupInvitation(s:Session,t:PersonalTerminal,id:string,accepted:boolean){
 const invitation=t.groupInvitations?.find(i=>i.id===id);
 if(!invitation||invitation.status!=='pending'||!terminalAnchorActive(s,invitation.anchor))throw Error('该邀请已处理或不在当前分支');
 const group=t.conversations.find(c=>c.id===invitation.groupId);
 if(!group?.group||group.anchor&&!terminalAnchorActive(s,group.anchor)||groupOwner(group)!==invitation.by&&!group.adminIds?.includes(invitation.by))throw Error('群邀请已失效，请重新确认');
 invitation.status=accepted?'accepted':'declined';
 if(accepted){group.joined=true;if(groupOwner(group)==='player')throw Error('角色邀请入群不能将你设为群主');group.adminIds=(group.adminIds||[]).filter(id=>id!=='player');invitation.welcome={status:'pending'};}
 else invitation.declinedRound=completedStoryRounds(s);
 const anchor=terminalAnchor(s);recordTerminalChat(t,anchor,{id:'group-invite:'+id,title:group.title,group:false},['player'],accepted?'接受群邀请':'拒绝群邀请',[],['player',invitation.by]);
 return invitation;
}
export function validateGroupInvitations(t:PersonalTerminal){
 if(t.groupInvitations===undefined)return;
 if(!Array.isArray(t.groupInvitations)||t.groupInvitations.length>300||new Set(t.groupInvitations.map(i=>i.id)).size!==t.groupInvitations.length)throw Error('群邀请存档格式不正确');
 for(const i of t.groupInvitations){
  if(!i||Object.keys(i).some(k=>!['id','groupId','by','reason','status','anchor','at','declinedRound','welcome'].includes(k))||i.welcome&&Object.keys(i.welcome).some(k=>!['status','error'].includes(k))||!text(i.id,1000)||!text(i.groupId,128)||!text(i.by,128)||!text(i.reason,1000)||!['pending','accepted','declined'].includes(i.status)||!text(i.at,100)||!i.anchor||!text(i.anchor.key,500)||typeof i.anchor.turnId!=='string'||typeof i.anchor.variantId!=='string'||!Array.isArray(i.anchor.path)||i.anchor.path.some(p=>!text(p,500))||i.declinedRound!==undefined&&(!Number.isSafeInteger(i.declinedRound)||i.declinedRound<0)||i.welcome&&(!['pending','ready','failed'].includes(i.welcome.status)||i.welcome.error!==undefined&&(typeof i.welcome.error!=='string'||i.welcome.error.length>2000)))throw Error('群邀请存档格式不正确');
  if(!t.conversations.some(c=>c.id===i.groupId&&c.group))throw Error('群邀请来源不存在');
 }
 for(const group of t.conversations)if(group.adminIds&&group.adminIds.length>groupAdminLimit)throw Error('群管理员超过上限');
}
