import {it,expect} from 'vitest';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal,createConversation} from '../src/domain/personalTerminal';
import {terminalMainContext,cleanTerminalBatch,applyTerminalBatch} from '../src/domain/terminalMain';
import {answerGroupInvitation} from '../src/domain/terminalSocial';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
function setup(){const s=newSession('社交',{name:'玩家',appearance:'',background:'',personality:''},'开场');s.initial.characters=[{id:'a',name:'角色甲',present:true},{id:'b',name:'角色乙',present:true}];s.terminal=emptyTerminal();s.terminal.groupsReady=true;return s;}
function turn(s:ReturnType<typeof setup>,id='t1'){s.turns.push({id,input:'请拉我进学院群',selected:0,variants:[{id:'v'+id,text:'已发来群邀请，请确认。',status:'complete',createdAt:'now',outcome:{event:'收到邀请'}}]});}
it('creates an independent pre-existing group record and pending invitation without joining or leaking chat',()=>{
 const s=setup();const ctx=terminalMainContext(s);turn(s);const actions=[{id:'create',kind:'create-group',groupId:ctx.newGroupIds[0],by:'a',title:'学院群',members:['a','b'],ownerId:'a',adminIds:[],announcement:'通知群'},{id:'invite',kind:'invite-group',groupId:ctx.newGroupIds[0],by:'a',reason:'欢迎加入学院交流群'}];
 const batch=cleanTerminalBatch({protocolVersion:2,groups:[],privateMessages:[],friendRequests:[],groupActions:actions},s.initial.characters,ctx,()=>{});s.turns[0].variants[0].outcome!.terminal=batch;expect(applyTerminalBatch(s,batch,0)).toBe(true);
 const c=s.terminal!.conversations[0],i=s.terminal!.groupInvitations![0];expect(c.joined).toBe(false);expect(c.messages).toEqual([]);expect(i.status).toBe('pending');expect(terminalMainContext(s).groups).toHaveLength(0);
 expect(applyTerminalBatch(s,batch,0)).toBe(false);expect(s.terminal!.groupInvitations).toHaveLength(1);
 answerGroupInvitation(s,s.terminal!,i.id,true);expect(c.joined).toBe(true);expect(c.ownerId).toBe('a');expect(c.adminIds).not.toContain('player');expect(i.welcome?.status).toBe('pending');
 const local=parseBackup(backup({version:1,preferences:defaults(),sessions:[s]}));expect(local.sessions[0].terminal!.groupInvitations).toEqual(s.terminal!.groupInvitations);
 const cloud=parseCloudSave(createCloudSave({version:1,preferences:defaults(),sessions:[s]},defaults(),{}));expect(cloud.snapshot.sessions[0].terminal!.groupInvitations).toEqual(s.terminal!.groupInvitations);
});
it('uses the same next-completed-round cooldown for group invitations and keeps pending invitations unique',()=>{
 const s=setup();turn(s);s.terminal!.conversations.push({id:'g',title:'已有群',members:['a','b'],ownerId:'a',adminIds:['b'],group:true,joined:false,announcement:'',messages:[],unread:0});
 const batch={protocolVersion:2 as const,groups:[],privateMessages:[],friendRequests:[],groupActions:[{id:'invite',kind:'invite-group' as const,groupId:'g',by:'a',reason:'一起交流'}]};
 applyTerminalBatch(s,batch,0);const i=s.terminal!.groupInvitations![0];answerGroupInvitation(s,s.terminal!,i.id,false);expect(terminalMainContext(s,0).groups).toHaveLength(0);
 s.terminal!.jobs=[];applyTerminalBatch(s,{...batch,groupActions:[{...batch.groupActions[0],id:'same-round',by:'b'}]},0);expect(s.terminal!.groupInvitations).toHaveLength(1);
 turn(s,'t2');applyTerminalBatch(s,{...batch,groupActions:[{...batch.groupActions[0],id:'next-round',by:'b'}]},1);expect(s.terminal!.groupInvitations).toHaveLength(2);expect(s.terminal!.groupInvitations![1].status).toBe('pending');
});
it('includes more than five joined groups and keeps a manually created player-owned group independent',()=>{
 const s=setup();s.terminal!.friends=[{id:'a',status:'accepted',reply:'好',note:''}];
 for(let n=0;n<7;n++)createConversation(s.terminal!,['a'],'同名群',true);
 const ctx=terminalMainContext(s);expect(ctx.groups).toHaveLength(7);expect(new Set(ctx.groups.map(g=>g.id)).size).toBe(7);expect(ctx.groups.every(g=>g.ownerId==='player')).toBe(true);
});
it('limits v2 private messages per legitimate conversation and resolves uniquely established friend identities',()=>{
 const s=setup();s.terminal!.friends=[{id:'a',status:'accepted',reply:'好',note:''}];const ctx=terminalMainContext(s),codes:string[]=[];
 const batch=cleanTerminalBatch({protocolVersion:2,groups:[],privateMessages:[...Array.from({length:4},()=>({id:'a',text:'合法重复发言',topic:'近况'})),{id:'b',text:'陌生私聊',topic:'近况'}],friendRequests:[{id:'角色乙',reason:'方便联系'}]},s.initial.characters,ctx,c=>codes.push(c));
 expect(batch.privateMessages).toHaveLength(3);expect(batch.friendRequests[0].id).toBe('b');expect(codes).toContain('STATE_TERMINAL_PRIVATE_SKIPPED');
});
