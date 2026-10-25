import {expect,it} from 'vitest';
import 'fake-indexeddb/auto';
import {IndexedDbRepository} from '../src/storage/repository';
import {newSession,visibleMemories,validateOutcome,stateAt,backup,parseBackup,defaults} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {terminalMainContext,cleanTerminalMainContext,cleanTerminalBatch,applyTerminalBatch} from '../src/domain/terminalMain';
import {terminalMessageVisible} from '../src/domain/terminalLedger';
function fixture(){const s=newSession('学院',{name:'玩家',identity:'学生',appearance:'',personality:'',background:''},'今天');s.initial.characters=[{id:'a',name:'陆离',present:false},{id:'b',name:'卫锋',present:false}];s.terminal=emptyTerminal();s.terminal.friends.push({id:'a',status:'accepted',reply:'同意',note:'',at:'now'});s.turns.push({id:'t1',input:'报到',selected:0,variants:[{id:'v1',text:'报到完成。',status:'complete',outcome:{event:'报到'},createdAt:'now'}]});return s;}
function payload(s:ReturnType<typeof fixture>){return {groups:terminalMainContext(s).newGroupIds.slice(0,2).map(id=>({id,title:'教学群'+id,members:['a','b'],ownerId:'b',adminIds:[],announcement:'',messages:Array.from({length:3},()=>({id:'a',text:'明天训练。'})),topic:'明天训练安排'})),privateMessages:[{id:'a',text:'明天见',topic:'确认集合'}],friendRequests:[],courses:[]};}
it('allows one legal management completion for an unconfirmed group while retaining stored members and rejecting impersonation',async()=>{
 const s=fixture(),batch=payload(s);applyTerminalBatch(s,batch,0);
 const historic=s.terminal!.conversations[0];historic.ownerId='';historic.managementReady=false;
 const context=terminalMainContext(s),warnings:string[]=[];
 const input={...batch,groups:batch.groups.map((g,i)=>i?{...g,members:['unknown'],messages:[{id:'unknown',text:'坏群'}]}:{...g,ownerId:'player',messages:[{id:'player',text:'冒充用户'},{id:'a',text:'合法消息'}]}),friendRequests:[{id:'unknown',reason:'无效'}],courses:[{title:'坏课表'}]};
 const result=cleanTerminalBatch(input,s.initial.characters,context,c=>warnings.push(c));
 // Stored members govern existing groups; only the missing owner may be completed.
 expect(result.groups[0].ownerId).toBe('player');expect(result.groups[0].messages).toEqual([{id:'a',text:'合法消息'}]);
 expect(result.groups[1].members).toEqual(['a','b']);expect(result.groups[1].messages).toEqual([]);
 expect(result.privateMessages).toEqual(batch.privateMessages);expect(result.friendRequests).toEqual([]);expect(result.courses).toBeUndefined();
 expect(warnings).toContain('STATE_TERMINAL_GROUP_MESSAGE_SKIPPED');expect(warnings).toContain('STATE_TERMINAL_COURSES_RETAINED');
 s.turns.push({id:'t2',input:'继续',selected:0,variants:[{id:'v2',status:'complete',text:'继续',createdAt:'now',outcome:{event:'继续',terminal:result}}]});
 expect(applyTerminalBatch(s,result,1)).toBe(true);expect(historic.ownerId).toBe('player');expect(historic.managementReady).toBe(true);
 expect(applyTerminalBatch(s,result,1)).toBe(false);
 const repo=new IndexedDbRepository('isolated-terminal-'+crypto.randomUUID());await repo.read();await repo.write({version:1,sessions:[s],preferences:defaults()});
 expect((await repo.read())?.sessions[0].terminal!.conversations.find(c=>!c.group)?.messages).toHaveLength(2);
});
it('keeps private messages with no groups, missing groups, or invalid group data without accepting unknown senders',()=>{
 const s=fixture(),b=payload(s);applyTerminalBatch(s,b,0);const ctx=terminalMainContext(s);
 for(const groups of [[],b.groups.slice(0,1),[null],undefined]){
  const codes:string[]=[];const result=cleanTerminalBatch({...b,groups,privateMessages:[...b.privateMessages,{id:'unknown',text:'拒绝',topic:'拒绝'},{id:'player',text:'拒绝',topic:'拒绝'}]},s.initial.characters,ctx,c=>codes.push(c));
  expect(result.privateMessages).toEqual(b.privateMessages);expect(codes).toContain('STATE_TERMINAL_PRIVATE_SKIPPED');
 }
});
it('accepts terminal speakers introduced by MVU in the current or an earlier round and survives backup',async()=>{
 const s=fixture(),v=s.turns[0].variants[0],batch=payload(s);
 const actor={id:'new-npc',name:'新同学',present:true,affinity:0};
 for(const g of batch.groups){g.members.push(actor.id);g.messages[0]={id:actor.id,text:'我来通知集合安排。'};}
 v.outcome={event:'新同学报到',mvu:[{op:'insert',path:'/characters/new-npc',value:actor}],terminal:batch};
 expect(()=>validateOutcome(v.outcome,s.initial)).not.toThrow();
 expect(applyTerminalBatch(s,batch,0)).toBe(true);
 expect(s.terminal!.conversations[0].messages[0].sender).toBe(actor.id);
 expect(visibleMemories(s)[0].text).toContain('新同学');
 const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[s]})).sessions[0];
 expect(stateAt(restored).characters.some(c=>c.id===actor.id)).toBe(true);
 restored.turns.push({id:'t2',input:'继续',selected:0,variants:[{id:'v2',text:'继续交流',status:'complete',createdAt:'now',outcome:{event:'交流',terminal:batch}}]});
 expect(applyTerminalBatch(restored,batch,1)).toBe(true);
 const repository=new IndexedDbRepository('terminal-save-'+crypto.randomUUID());await repository.read();
 await repository.write({version:1,preferences:defaults(),sessions:[restored]});
 expect((await repository.read())?.sessions[0].terminal!.jobs).toHaveLength(2);
});
it('permits generated terminal anchors but still rejects actual credentials and misplaced key fields',()=>{
 const s=fixture();applyTerminalBatch(s,payload(s),0);
 const text=backup({version:1,preferences:defaults(),sessions:[s]});expect(()=>parseBackup(text)).not.toThrow();
 for(const edit of [(v:any)=>{v.apiKey='synthetic-secret';},(v:any)=>{v.sessions[0].terminal.key='synthetic-secret';},(v:any)=>{v.sessions[0].terminal.jobs[0].anchor.api_key='synthetic-secret';},(v:any)=>{v.sessions[0].terminal.jobs[0].anchor.key='synthetic-secret';}]){
  const value=JSON.parse(text);edit(value);expect(()=>parseBackup(JSON.stringify(value))).toThrow('凭据');
 }
});
it('persists main companions once, feeds memory and hides old messages on branch change',()=>{const s=fixture(),batch=payload(s);s.turns[0].variants[0].outcome!.characters=[{id:'a',affinity:1}];expect(applyTerminalBatch(s,batch,0)).toBe(true);expect(applyTerminalBatch(s,batch,0)).toBe(false);expect(s.terminal!.conversations.filter(c=>c.group)).toHaveLength(2);expect(visibleMemories(s)[0].text).toContain('群聊1-');expect(visibleMemories(s).map(m=>m.text).join('')).not.toContain('私聊-陆离');const restored=JSON.parse(JSON.stringify(s));expect(applyTerminalBatch(restored,batch,0)).toBe(false);s.turns[0].variants.push({id:'v2',text:'另一个分支。',status:'complete',outcome:{event:'离开'},createdAt:'now'});s.turns[0].selected=1;expect(s.terminal!.conversations.flatMap(c=>c.messages).filter(m=>terminalMessageVisible(s,m))).toHaveLength(0);expect(visibleMemories(s)).toHaveLength(0);expect(terminalMainContext(s).groups).toHaveLength(0);});
it('requires every fixed group, member-only speakers, known private senders and immutable management',()=>{const s=fixture(),b=payload(s),actors=s.initial.characters;applyTerminalBatch(s,b,0);const c=terminalMainContext(s);expect(cleanTerminalBatch(b,actors,c).groups).toHaveLength(2);for(const bad of [{...b,groups:b.groups.slice(0,1)},{...b,groups:b.groups.map((g,i)=>i?g:{...g,ownerId:'player'})},{...b,groups:b.groups.map((g,i)=>i?g:{...g,messages:[...g.messages,{id:'player',text:'冒充用户'}]})}])expect(()=>cleanTerminalBatch(bad,actors,c)).toThrow();});
it('keeps custom contact identity in main-story terminal context and private messages',()=>{const s=fixture(),contact={id:'contact-friend',name:'旧友',identity:'校外朋友',present:false,affinity:0};s.terminal!.contacts=[contact];s.terminal!.friends.push({id:contact.id,status:'accepted',reply:'同意',note:'',at:'now'});const context=terminalMainContext(s);expect(context.contacts).toContainEqual({id:contact.id,name:'旧友',identity:'校外朋友'});const batch={...payload(s),privateMessages:[{id:contact.id,text:'好久不见',topic:'校外近况'}]};expect(applyTerminalBatch(s,batch,0)).toBe(true);const chat=s.terminal!.conversations.find(c=>!c.group&&c.members[0]===contact.id);expect(chat?.title).toBe('旧友');expect(chat?.messages[0].sender).toBe(contact.id);});
it('validates malformed contact context before building the known actor set',()=>{const base:any={initialized:false,groups:[],newGroupIds:Array.from({length:5},(_,i)=>'g'+i),friendIds:[],courses:[]};for(const contacts of [{length:1},[null],[{id:'contact-x',name:'x',identity:'ok'},{id:'contact-x',name:'y'}]]){let error:unknown;try{cleanTerminalMainContext({...base,contacts},[]);}catch(e){error=e;}expect(error).toBeInstanceOf(Error);expect((error as Error).constructor).not.toBe(TypeError);expect((error as Error).message).toContain('终端联系人上下文');}});
