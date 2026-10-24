import {it,expect,vi,afterEach} from 'vitest';
import {createSSRApp,h,reactive} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {newSession,defaults} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import type {ViewModel} from '../src/app/useWorkspace';
afterEach(()=>vi.unstubAllGlobals());
function fixture(){const s=newSession('群管理',{name:'玩家',appearance:'',personality:'',background:''},'');s.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];s.terminal=emptyTerminal();s.terminal.conversations=[{id:'g1',title:'待确认群',group:true,members:['a','b'],ownerId:'',adminIds:[],announcement:'',messages:[],unread:0,origin:'story',joined:true,managementReady:false},{id:'g2',title:'确认群',group:true,members:['a','b'],ownerId:'b',adminIds:[],announcement:'',messages:[],unread:0,origin:'story',joined:true,managementReady:true}];const preferences=defaults();preferences.terminalProfile=preferences.profiles[0].id;const w=reactive({active:s,state:s.initial,preferences,credentials:{},loading:false,busy:false,workingMemory:false,terminalBusy:false,theaters:[],storageStatus:'saved',save:vi.fn(async()=>{}),connectionReady:()=>true,connectProfile:async()=>true,formatErrors:{record:vi.fn(async()=>{}),entries:[]}}) as unknown as ViewModel;let u!:ReturnType<typeof usePersonalTerminal>;return renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}})).then(()=>({w,u}));}
it('completes only unconfirmed groups with a legal owner and at most two AI administrators',async()=>{const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(path,options)=>{const data=JSON.parse(options.body);calls.push(data);return Response.json({ownerId:'a',adminIds:['b'],members:['a','b'],announcement:'新公告'});}));const {w,u}=await fixture();await u.completeGroupManagement();expect(u.error.value).toContain('已补全 1 个群');expect(calls.filter(c=>c.task==='group-plan')).toHaveLength(1);const g1=w.active!.terminal!.conversations[0],g2=w.active!.terminal!.conversations[1];expect(g1.ownerId).toBe('a');expect(g1.adminIds).toEqual(['b']);expect(g1.managementReady).toBe(true);expect(g2.ownerId).toBe('b');expect(g2.managementReady).toBe(true);});
it('preserves members and announcement and never overwrites confirmation that arrives during the AI request',async()=>{
 let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));const {w,u}=await fixture();const pending=u.completeGroupManagement();await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));const group=w.active!.terminal!.conversations[0];group.announcement='原公告';group.ownerId='b';group.adminIds=['player'];group.managementReady=true;resolve(Response.json({ownerId:'a',adminIds:['b'],members:['b'],announcement:'AI公告'}));await pending;const saved=w.active!.terminal!.conversations[0];expect(saved.ownerId).toBe('b');expect(saved.adminIds).toEqual(['player']);expect(saved.members).toEqual(['a','b']);expect(saved.announcement).toBe('原公告');
});
it('keeps a failed completion visible and retryable',async()=>{let n=0;vi.stubGlobal('fetch',vi.fn(async()=>{n++;return Response.json(n===1?{ownerId:'',adminIds:[],members:['a','b'],announcement:''}:{ownerId:'b',adminIds:[],members:['a','b'],announcement:''});}));const {w,u}=await fixture();await u.completeGroupManagement();expect(u.error.value).toContain('待重试');expect(w.active!.terminal!.conversations[0].ownerId).toBe('');expect(w.active!.terminal!.conversations[0].managementReady).toBe(false);await u.completeGroupManagement();expect(u.error.value).toContain('已补全 1 个群');expect(w.active!.terminal!.conversations[0].ownerId).toBe('b');expect(w.active!.terminal!.conversations[0].managementReady).toBe(true);});
it('rejects AI proposals with more than two administrators instead of silently granting them',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ownerId:'a',adminIds:['b','a','player'],members:['a','b'],announcement:''})));const {w,u}=await fixture();await u.completeGroupManagement();expect(u.error.value).toContain('超过2位');expect(w.active!.terminal!.conversations[0].managementReady).toBe(false);expect(w.active!.terminal!.conversations[0].adminIds).toEqual([]);});


it('preserves a known owner while completing unconfirmed administration',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ownerId:'b',adminIds:[],members:['a','b'],announcement:''})));
 const {w,u}=await fixture();w.active!.terminal!.conversations[0].ownerId='a';
 await u.completeGroupManagement();expect(w.active!.terminal!.conversations[0].ownerId).toBe('a');
 expect(w.active!.terminal!.conversations[0].managementReady).toBe(true);
});
it('logs each actual API call separately and associates it with the selected source variant',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ownerId:'a',adminIds:[],members:['a','b'],announcement:''})));
 const {w,u}=await fixture();const second=w.active!.terminal!.conversations[1];second.ownerId='';second.managementReady=false;
 await u.completeGroupManagement();const calls=vi.mocked(w.formatErrors.record).mock.calls.filter(c=>String(c[0]).includes('ownerId'));
 expect(calls).toHaveLength(2);expect(calls[0][5]?.callId).not.toBe(calls[1][5]?.callId);
});
it('rejects avatar URL edits by ordinary members and persists them for administrators',async()=>{
 const {w,u}=await fixture();u.conversationId.value='g2';
 await u.setGroupAvatarUrl('https://example.test/g.png');expect(u.error.value).toContain('权限');
 const group=w.active!.terminal!.conversations[1];expect(group.avatar).toBeUndefined();group.adminIds=['player'];
 await u.setGroupAvatarUrl('https://example.test/g.png');expect(u.error.value).toBe('');expect(w.active!.terminal!.conversations[1].avatar).toContain('/g.png');
 await u.clearGroupAvatar();expect(w.active!.terminal!.conversations[1].avatar).toBeUndefined();
});
it('rechecks avatar permission after asynchronous image decoding',async()=>{
 const images=await import('../src/app/terminalAvatarImage');let resolve!:(url:string)=>void;
 vi.spyOn(images,'terminalAvatarImage').mockImplementation(()=>new Promise<string>(r=>{resolve=r;}));
 const {w,u}=await fixture();u.conversationId.value='g2';w.active!.terminal!.conversations[1].adminIds=['player'];
 const pending=u.uploadGroupAvatar(new File(['fake'],'test.png',{type:'image/png'}));
 await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));w.active!.terminal!.conversations[1].adminIds=[];
 resolve('data:image/png;base64,AAAA');await pending;expect(u.error.value).toContain('权限');expect(w.active!.terminal!.conversations[1].avatar).toBeUndefined();vi.restoreAllMocks();
});
