import {afterEach,expect,it,vi} from 'vitest';
import {createRenderer,reactive,nextTick} from 'vue';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import type {ViewModel} from '../src/app/useWorkspace';
import {emptyTerminal,syncStoryGroups} from '../src/domain/personalTerminal';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {terminalAnchor,terminalOrigin,terminalVisibility} from '../src/domain/terminalLedger';
import {terminalConversationViews} from '../src/app/terminalConversationView';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
const mounted:{unmount:()=>void}[]=[];
afterEach(()=>{for(const app of mounted.splice(0))app.unmount();vi.unstubAllGlobals();});
function mountTerminal(session:ReturnType<typeof fixture>,save:(s:ReturnType<typeof fixture>)=>Promise<void>,busy=false){
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',new EventTarget());
 const w=reactive({active:session,state:session.initial,preferences:defaults(),credentials:{},loading:false,busy,backupWorking:false,workingMemory:false,terminalBusy:false,terminalEpoch:0,terminalEnabled:true,theaters:[],storageStatus:'saved',indexTerminalNotes:vi.fn(),saveTerminal:save,save:async()=>{}}) as unknown as ViewModel;
 let terminal!:ReturnType<typeof usePersonalTerminal>;
 const renderer=createRenderer({patchProp(){},insert(){},remove(){},createElement:()=>({}),createText:()=>({}),createComment:()=>({}),setText(){},setElementText(){},parentNode:()=>null,nextSibling:()=>null});
 const app=renderer.createApp({setup(){terminal=usePersonalTerminal(w);return()=>null;}});app.mount({});mounted.push(app);return {w,terminal};
}

function fixture(){
 const s=newSession('归档修复',{name:'用户',appearance:'',personality:'',background:''},'开场');s.terminal=emptyTerminal();
 s.turns.push({id:'turn',input:'行动',selected:0,variants:[{id:'variant',status:'complete',createdAt:'now',text:'已确认正文'},{id:'other',status:'complete',createdAt:'now',text:'其他剧情'}]});
 const anchor=terminalAnchor(s),origin=terminalOrigin(s,0);
 s.terminal.conversations=[{id:'group',title:'基石系·物资调配与保障组',group:true,members:['npc'],announcement:'',unread:8,messages:Array.from({length:8},(_,i)=>({id:'auto-'+i,sender:'npc',text:'自动群消息'+i,at:'10:05',source:'auto:job:group:'+i,anchor,origin}))},{id:'private',title:'联系人',group:false,members:['npc'],announcement:'',unread:1,messages:[{id:'private-auto',sender:'npc',text:'自动私聊',at:'10:05',source:'auto:job:private:0',anchor,origin}]},{id:'welcome',title:'欢迎群',group:true,members:['npc'],announcement:'',unread:1,messages:[{id:'welcome',sender:'npc',text:'欢迎消息',at:'10:05',source:'welcome:invitation:0',anchor}]}];
 return s;
}
it('a story/theater sync cannot archive independent auto group, private or welcome messages',()=>{
 const s=fixture(),original=JSON.stringify(s.terminal);expect(syncStoryGroups(s.terminal!,[],[],'用户')).toBe(false);expect(JSON.stringify(s.terminal)).toBe(original);
 const views=terminalConversationViews(s.terminal!.conversations,terminalVisibility(s));expect(views.map(c=>c.messages.length)).toEqual([8,1,1]);expect(views[0].lastMessage?.text).toBe('自动群消息7');expect(views[0].unread).toBe(8);
});
it('repairs already misarchived independent messages idempotently, but keeps other branches hidden',()=>{
 const s=fixture();for(const c of s.terminal!.conversations)for(const m of c.messages)m.archived=true;
 const fields=JSON.stringify(s.terminal,(k,v)=>k==='archived'?undefined:v);expect(syncStoryGroups(s.terminal!,[],[],'用户')).toBe(true);expect(JSON.stringify(s.terminal,(k,v)=>k==='archived'?undefined:v)).toBe(fields);expect(syncStoryGroups(s.terminal!,[],[],'用户')).toBe(false);
 expect(terminalConversationViews(s.terminal!.conversations,terminalVisibility(s))[0].messages).toHaveLength(8);
 s.turns[0].selected=1;expect(terminalConversationViews(s.terminal!.conversations,terminalVisibility(s))[0].messages).toHaveLength(0);expect(s.terminal!.conversations[0].messages).toHaveLength(8);
 s.turns[0].selected=0;expect(terminalConversationViews(s.terminal!.conversations,terminalVisibility(s))[0].messages).toHaveLength(8);
 s.turns[0].input='修改行动';expect(terminalConversationViews(s.terminal!.conversations,terminalVisibility(s))[1].messages).toHaveLength(0);
});
it('only story-owned sources follow theater archives; unrelated plugin and main sources retain their flags',()=>{
 const s=fixture(),t=s.terminal!;t.conversations[0].messages.push({id:'foreign',sender:'npc',text:'外部来源',at:'',source:'external:message',archived:true},{id:'main',sender:'npc',text:'旧正文合并来源',at:'',source:'main:old:0',archived:true});
 const sources=[{key:'old-variant',slot:2,title:'小剧场群',at:'',messages:[{speaker:'npc',content:'小剧场消息'}]}];syncStoryGroups(t,sources,[],'用户');const story=t.conversations.find(c=>c.origin==='story')!;
 expect(story.messages[0].archived).not.toBe(true);syncStoryGroups(t,[],[],'用户');expect(story.messages[0].archived).toBe(true);expect(t.conversations[0].messages.find(m=>m.id==='foreign')?.archived).toBe(true);expect(t.conversations[0].messages.find(m=>m.id==='main')?.archived).toBe(true);
 syncStoryGroups(t,sources,[],'用户');expect(story.messages[0].archived).toBe(false);expect(story.messages).toHaveLength(1);expect(t.conversations[0].messages.filter(m=>m.source?.startsWith('auto:')).every(m=>!m.archived)).toBe(true);
});
it('old files keep every message and restore visibility after local/cloud round trips without clearing flags during parsing',()=>{
 const s=fixture();for(const c of s.terminal!.conversations)for(const m of c.messages)m.archived=true;
 const snapshot={version:1 as const,sessions:[s],preferences:defaults()};
 for(const restored of [parseBackup(backup(snapshot)).sessions[0],parseCloudSave(createCloudSave(snapshot,defaults())).snapshot.sessions[0]]){
  expect(restored.terminal!.conversations[0].messages.every(m=>m.archived)).toBe(true);expect(syncStoryGroups(restored.terminal!,[],[],'用户')).toBe(true);expect(restored.terminal!.conversations[0].messages.map(m=>m.text)).toEqual(s.terminal!.conversations[0].messages.map(m=>m.text));expect(terminalConversationViews(restored.terminal!.conversations,terminalVisibility(restored))[0].messages).toHaveLength(8);expect(restored.terminal!.conversations[0].unread).toBe(8);
 }
});
it('idle hydration repairs once and waits for active prose to finish before touching stored messages',async()=>{
 const s=fixture();s.terminal!.conversations[0].messages.forEach(m=>m.archived=true);const save=vi.fn(async()=>{}),{w,terminal}=mountTerminal(s,save,true);
 await nextTick();expect(save).not.toHaveBeenCalled();w.busy=false;await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1));await vi.waitFor(()=>expect(terminal.working.value).toBe(false));
 expect(terminal.visibleConversations.value[0].messages).toHaveLength(8);expect(terminal.visibleConversations.value[0].lastMessage?.text).toBe('自动群消息7');await nextTick();expect(save).toHaveBeenCalledTimes(1);
});
it('repair save failures roll back and do not spin; a genuine later terminal change permits a retry',async()=>{
 const s=fixture();s.terminal!.conversations[0].messages.forEach(m=>m.archived=true);let fail=true;const save=vi.fn(async()=>{if(fail)throw Error('模拟磁盘写入失败');}),{w,terminal}=mountTerminal(s,save);
 await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1));await vi.waitFor(()=>expect(terminal.working.value).toBe(false));expect(terminal.error.value).toContain('模拟磁盘写入失败');expect(w.active!.terminal!.conversations[0].messages.every(m=>m.archived)).toBe(true);
 for(let i=0;i<5;i++)await nextTick();expect(save).toHaveBeenCalledTimes(1);
 fail=false;w.active!.terminal=JSON.parse(JSON.stringify(w.active!.terminal));w.loading=true;await nextTick();w.loading=false;await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(2));await vi.waitFor(()=>expect(terminal.working.value).toBe(false));expect(terminal.visibleConversations.value[0].messages).toHaveLength(8);
});
it('queued theater repair preserves concurrent terminal edits and messages instead of publishing a stale snapshot',async()=>{
 const s=fixture();s.terminal!.conversations[0].messages.forEach(m=>m.archived=true);const save=vi.fn(async()=>{}),{w,terminal}=mountTerminal(s,save);
 w.active!.terminal!.bio='在修复排队时修改的简介';w.active!.terminal!.conversations[0].messages.push({id:'new-arrival',sender:'npc',text:'刚到达的新消息',at:'10:06'});
 await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1));await vi.waitFor(()=>expect(terminal.working.value).toBe(false));expect(w.active!.terminal!.bio).toBe('在修复排队时修改的简介');expect(terminal.visibleConversations.value[0].messages).toHaveLength(9);expect(terminal.visibleConversations.value[0].lastMessage?.id).toBe('new-arrival');
});
