import {afterEach,expect,it,vi} from 'vitest';
import {computed,createSSRApp,h,reactive} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {terminalConversationViews} from '../src/app/terminalConversationView';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import {terminalAnchor,terminalVisibility,terminalMessageVisible,terminalOrigin} from '../src/domain/terminalLedger';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import type {ViewModel} from '../src/app/useWorkspace';
afterEach(()=>vi.unstubAllGlobals());
function fixture(){
 const s=newSession('终端显示',{name:'用户',appearance:'',personality:'',background:''},'开场');s.terminal=emptyTerminal();
 s.turns.push({id:'t1',input:'第一轮',selected:0,variants:[{id:'v1',text:'已确认正文',status:'complete',createdAt:'now'},{id:'other',text:'另一分支',status:'complete',createdAt:'now'}]});
 const anchor=terminalAnchor(s),origin=terminalOrigin(s,0);
 s.terminal.conversations=[{id:'group',group:true,title:'基石系综合保障组',members:['npc'],announcement:'',unread:56,messages:[{id:'g1',sender:'npc',text:'群聊真实最后消息',at:'10:45',anchor,origin}]},{id:'private',group:false,title:'叶怀瑾',members:['npc'],announcement:'',unread:4,messages:[{id:'p1',sender:'npc',text:'私聊真实最后消息',at:'10:46'}]}];
 return s;
}
it('projects list and chat from the same visible messages, including updates, replacement and branch changes',async()=>{
 vi.stubGlobal('window',new EventTarget());
 const s=fixture(),w=reactive({active:s,state:s.initial,preferences:defaults(),credentials:{},loading:true,busy:true,theaters:[],terminalBusy:false,storageStatus:'saved',save:vi.fn()}) as unknown as ViewModel;
 let u!:ReturnType<typeof usePersonalTerminal>;await renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}}));
 for(const id of ['group','private']){u.openConversation(id);const row=u.visibleConversations.value.find(c=>c.id===id)!;expect(row.messages).toBe(u.messages.value);expect(row.lastMessage).toBe(u.messages.value.at(-1));expect(row.lastMessage?.text).toContain('真实最后消息');}
 const persisted=JSON.stringify(w.active!.terminal);const view=u.visibleConversations.value;expect(view[0].unread).toBe(56);expect(JSON.stringify(w.active!.terminal)).toBe(persisted);
 w.active!.terminal!.conversations[1].messages.push({id:'p2',sender:'npc',text:'新到达消息',at:'10:47'});expect(u.visibleConversations.value[1].lastMessage?.text).toBe('新到达消息');expect(u.messages.value.at(-1)?.text).toBe('新到达消息');
 w.active!.turns[0].selected=1;expect(u.visibleConversations.value[0].lastMessage).toBeUndefined();expect(w.active!.terminal!.conversations[0].messages).toHaveLength(1);
 w.active!.turns[0].selected=0;expect(u.visibleConversations.value[0].lastMessage?.text).toBe('群聊真实最后消息');
 w.active={...parseBackup(backup({version:1,sessions:[w.active!],preferences:defaults()})).sessions[0]};expect(u.visibleConversations.value[1].lastMessage?.text).toBe('新到达消息');
 const cloud=parseCloudSave(createCloudSave({version:1,sessions:[w.active],preferences:defaults()},defaults())).snapshot;expect(cloud.sessions[0].terminal!.conversations[0].unread).toBe(56);expect(cloud.sessions[0].terminal!.conversations[1].messages.at(-1)?.text).toBe('新到达消息');
 expect(w.save).not.toHaveBeenCalled();
});
it('a streamed unfinished tail does not invalidate confirmed message previews or history sync anchors',()=>{
 const s=reactive(fixture());s.turns.push({id:'t2',input:'继续',selected:0,variants:[{id:'v2',text:'正在输出',status:'incomplete',createdAt:'now'}]});
 let views=0,anchors=0;const rows=computed(()=>{views++;return terminalConversationViews(s.terminal!.conversations,terminalVisibility(s));}),anchor=computed(()=>{anchors++;return terminalAnchor(s,1);});
 const first=rows.value,key=anchor.value.key;for(let i=0;i<50;i++){s.turns[1].variants[0].text+='字';expect(rows.value).toBe(first);expect(anchor.value.key).toBe(key);}
 expect(views).toBe(1);expect(anchors).toBe(1);
 s.turns[0].variants[0].text+='修改旧正文';expect(rows.value[0].lastMessage).toBeUndefined();expect(anchor.value.key).not.toBe(key);
});
it('batch visibility stays identical to legacy checks for archived messages, origins, rewinds and variants',()=>{
 const s=fixture(),messages=s.terminal!.conversations.flatMap(c=>c.messages);messages.push({...messages[0],id:'archived',archived:true});
 for(const change of [()=>{},()=>{s.turns[0].selected=1;},()=>{s.turns[0].selected=0;},()=>{s.turns[0].input='改写输入';},()=>{s.turns=[];}]){change();const visible=terminalVisibility(s);for(const m of messages)expect(visible.message(m)).toBe(terminalMessageVisible(s,m));}
});
it('invalidates a cached terminal-first preview when its unfinished producing input changes',()=>{
 const s=reactive(fixture());s.turns.push({id:'t2',input:'原输入',selected:0,variants:[{id:'v2',text:'输出中',status:'incomplete',createdAt:'now'}]});
 const message={id:'terminal-first',sender:'npc',text:'本轮先生成的消息',at:'now',anchor:terminalAnchor(s),origin:terminalOrigin(s,1)};
 s.terminal!.conversations[1].messages.push(message);
 const visibility=computed(()=>terminalVisibility(s)),rows=computed(()=>terminalConversationViews(s.terminal!.conversations,visibility.value));
 expect(rows.value[1].lastMessage?.id).toBe('terminal-first');s.turns[1].input='新输入';expect(rows.value[1].lastMessage?.id).toBe('p1');
 expect(s.terminal!.conversations[1].messages.at(-1)?.id).toBe('terminal-first');s.turns[1].input='原输入';expect(rows.value[1].lastMessage?.id).toBe('terminal-first');
});
