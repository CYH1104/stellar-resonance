import {it,expect,vi,afterEach} from 'vitest';
import {createSSRApp,h,reactive} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {newSession,defaults} from '../src/domain/story';
import {emptyTerminal,validateTerminal} from '../src/domain/personalTerminal';
import {mergeCloudSession} from '../src/domain/cloudBackup';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import PersonalTerminal from '../src/components/PersonalTerminal.vue';
import type {ViewModel} from '../src/app/useWorkspace';
afterEach(()=>vi.unstubAllGlobals());
function fixture(){const s=newSession('群管理',{name:'玩家',appearance:'',personality:'',background:''},'');s.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];s.terminal=emptyTerminal();s.terminal.conversations=[{id:'g1',title:'待确认群',group:true,members:['a','b'],ownerId:'',adminIds:[],announcement:'',messages:[],unread:0,origin:'story',joined:true,managementReady:false},{id:'g2',title:'确认群',group:true,members:['a','b'],ownerId:'b',adminIds:[],announcement:'',messages:[],unread:0,origin:'story',joined:true,managementReady:true}];const preferences=defaults();preferences.terminalProfile=preferences.profiles[0].id;const w=reactive({active:s,state:s.initial,preferences,credentials:{},loading:false,busy:false,workingMemory:false,terminalBusy:false,theaters:[],storageStatus:'saved',save:vi.fn(async()=>{}),connectionReady:()=>true,connectProfile:async()=>true,scopedRecall:async()=>[],indexTerminalNotes:()=>{},formatErrors:{record:vi.fn(async()=>{}),entries:[]}}) as unknown as ViewModel;let u!:ReturnType<typeof usePersonalTerminal>;return renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}})).then(()=>({w,u}));}
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
it('validates legacy and ranged group avatar positions, saves only for managers, and clears position with the image',async()=>{const t=emptyTerminal(),group={id:'g',title:'群',group:true,members:['a'],ownerId:'a',adminIds:[],announcement:'',messages:[],unread:0,origin:'story' as const,joined:true,managementReady:true,avatar:'https://example.test/g.png'};t.conversations=[{...group}];expect(()=>validateTerminal(structuredClone(t))).not.toThrow();t.conversations[0].avatarPosition={x:12.5,y:88};expect(()=>validateTerminal(structuredClone(t))).not.toThrow();for(const position of [{x:-1,y:50},{x:50,y:101},{x:Number.NaN,y:50}]){t.conversations[0].avatarPosition=position as any;expect(()=>validateTerminal(structuredClone(t))).toThrow('群头像位置');}const {w,u}=await fixture();u.conversationId.value='g2';await u.setGroupAvatarPosition({x:20,y:80});expect(u.error.value).toContain('权限');const saved=()=>w.active!.terminal!.conversations[1];expect(saved().avatarPosition).toBeUndefined();saved().adminIds=['player'];saved().avatar='https://example.test/g.png';await u.setGroupAvatarPosition({x:20.456,y:79.5});expect(u.error.value).toBe('');expect(saved().avatarPosition).toEqual({x:20.46,y:79.5});await u.setGroupAvatarUrl('https://example.test/new.png');expect(saved().avatarPosition).toBeUndefined();saved().avatarPosition={x:30,y:70};await u.clearGroupAvatar();expect(saved().avatar).toBeUndefined();expect(saved().avatarPosition).toBeUndefined();});
it('restores a local group image position only when that local image is restored',()=>{const mk=(avatar:string,position?:{x:number;y:number})=>{const s=newSession('云',{name:'玩家',appearance:'',personality:'',background:''},'');s.terminal=emptyTerminal();s.terminal.conversations=[{id:'g',title:'群',group:true,members:['a'],ownerId:'a',adminIds:[],announcement:'',messages:[],unread:0,avatar,avatarPosition:position},{id:'h',title:'新图',group:true,members:['a'],ownerId:'a',adminIds:[],announcement:'',messages:[],unread:0,avatar:'https://cloud.test/new.png',avatarPosition:{x:10,y:10}}];return s;};const current=mk('data:image/png;base64,AAAA',{x:20,y:70});current.terminal!.conversations[1].avatarPosition={x:90,y:10};const incoming=mk('',undefined);incoming.terminal!.conversations[1].avatar='https://cloud.test/other.png';incoming.terminal!.conversations[1].avatarPosition={x:5,y:60};const merged=mergeCloudSession(current,incoming);expect(merged.terminal!.conversations[0].avatar).toContain('data:image/png');expect(merged.terminal!.conversations[0].avatarPosition).toEqual({x:20,y:70});expect(merged.terminal!.conversations[1].avatarPosition).toEqual({x:5,y:60});});
it('resets the saved focus when a new group image is uploaded',async()=>{const images=await import('../src/app/terminalAvatarImage');vi.spyOn(images,'terminalAvatarImage').mockResolvedValue('data:image/png;base64,BBBB');const {w,u}=await fixture();u.conversationId.value='g2';const current=()=>w.active!.terminal!.conversations[1];current().adminIds=['player'];current().avatar='https://example.test/old.png';current().avatarPosition={x:20,y:80};await u.uploadGroupAvatar(new File(['fake'],'test.png',{type:'image/png'}));expect(current().avatar).toContain('data:image/png');expect(current().avatarPosition).toBeUndefined();vi.restoreAllMocks();});
it('rechecks avatar permission after asynchronous image decoding',async()=>{
 const images=await import('../src/app/terminalAvatarImage');let resolve!:(url:string)=>void;
 vi.spyOn(images,'terminalAvatarImage').mockImplementation(()=>new Promise<string>(r=>{resolve=r;}));
 const {w,u}=await fixture();u.conversationId.value='g2';w.active!.terminal!.conversations[1].adminIds=['player'];
 const pending=u.uploadGroupAvatar(new File(['fake'],'test.png',{type:'image/png'}));
 await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));w.active!.terminal!.conversations[1].adminIds=[];
 resolve('data:image/png;base64,AAAA');await pending;expect(u.error.value).toContain('权限');expect(w.active!.terminal!.conversations[1].avatar).toBeUndefined();vi.restoreAllMocks();
});


it('removes a left group from the actual home notification and updates to remaining conversations without erasing history',async()=>{
 const {w,u}=await fixture();
 const left=w.active!.terminal!.conversations[1];left.unread=3;left.messages=[{id:'old',sender:'a',text:'退出群独有的旧消息',at:'2026-11-23T09:00:00Z'}];
 w.active!.terminal!.conversations.push({id:'private',group:false,title:'甲',members:['a'],announcement:'',unread:1,messages:[{id:'keep',sender:'a',text:'保留私聊消息',at:'2026-11-23T08:00:00Z'}]});
 const home=()=>renderToString(createSSRApp({render:()=>h(PersonalTerminal,{w})}));
 expect(await home()).toContain('退出群独有的旧消息');
 u.conversationId.value=left.id;await u.leaveGroup();
 expect(u.error.value).toBe('');
 expect(u.unread.value).toBe(1);
 expect(w.active!.terminal!.conversations.find(c=>c.id===left.id)?.messages).toHaveLength(1);
 const after=await home();expect(after).not.toContain('退出群独有的旧消息');expect(after).toContain('保留私聊消息');
 w.active!.terminal!.conversations.find(c=>c.id==='private')!.unread=0;
 expect(await home()).toContain('暂时没有新消息');
});

it('home previews the newest visible unread message rather than the first stored conversation',async()=>{
 const {w}=await fixture();
 for(const [i,g]of w.active!.terminal!.conversations.entries()){g.unread=1;g.messages=[{id:'new'+i,sender:'a',text:i?'刚到的新群消息':'列表前面的旧消息',at:'2026-11-23T0'+(8+i)+':00:00Z'}];}
 const html=await renderToString(createSSRApp({render:()=>h(PersonalTerminal,{w})}));
 expect(html).toContain('刚到的新群消息');expect(html).not.toContain('列表前面的旧消息');
});

it('old saved left groups stay out of home notifications even with residual unread counts',async()=>{
 const {w}=await fixture(),group=w.active!.terminal!.conversations[1];group.joined=false;group.unread=9;group.messages=[{id:'old',sender:'a',text:'旧存档退群消息',at:'2026-11-23T10:00:00Z'}];
 const html=await renderToString(createSSRApp({render:()=>h(PersonalTerminal,{w})}));expect(html).not.toContain('旧存档退群消息');expect(html).toContain('暂时没有新消息');expect(group.messages).toHaveLength(1);
});
it('failed leave preserves membership and home preview along with the retained message',async()=>{
 const {w,u}=await fixture(),group=w.active!.terminal!.conversations[1];group.unread=1;group.messages=[{id:'old',sender:'a',text:'尚未退出的群消息',at:'2026-11-23T10:00:00Z'}];
 vi.mocked(w.save).mockRejectedValueOnce(Error('保存失败'));u.conversationId.value=group.id;await u.leaveGroup();
 expect(u.error.value).toContain('保存失败');expect(w.active!.terminal!.conversations[1].joined).toBe(true);
 expect(await renderToString(createSSRApp({render:()=>h(PersonalTerminal,{w})}))).toContain('尚未退出的群消息');
});
