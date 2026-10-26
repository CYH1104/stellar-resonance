import {it,expect,vi,afterEach} from 'vitest';
import {createSSRApp,h,reactive,nextTick} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {terminalAnchor} from '../src/domain/terminalLedger';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import * as terminalModule from '../src/app/usePersonalTerminal';
import {useAvatarAdjustment} from '../src/app/useAvatarAdjustment';
import {contactCharacterId} from '../src/app/contactCharacter';
import PersonalTerminal from '../src/components/PersonalTerminal.vue';
import type {ViewModel} from '../src/app/useWorkspace';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function session(){
 const s=newSession('刷新恢复',{name:'测试玩家',appearance:'',personality:'',background:''},'开场');s.initial.characters=[];
 s.terminal=emptyTerminal();s.terminal.contacts=[{id:'contact-a',name:'好友甲',identity:'哥哥',present:false},{id:'npc-b',name:'路人乙',present:true}];
 s.terminal.friends=s.terminal.contacts.map(a=>({id:a.id,status:'accepted',reply:'好',note:''}));
 s.terminal.rooms=[{id:'room-a',name:'旧房间',style:'日常',members:['player','contact-a','npc-b'],invitations:{'contact-a':'accepted','npc-b':'accepted'},rounds:[]}];return s;
}
async function fixture(s=session()){
 const w=reactive({active:s,state:s.initial,preferences:defaults(),credentials:{},localService:{majorCharacters:[]},loading:false,busy:false,terminalBusy:false,theaters:[],storageStatus:'saved',save:vi.fn(async()=>{}),connectionReady:()=>true,scopedRecall:async()=>[],indexTerminalNotes:()=>{}}) as unknown as ViewModel;
 let u!:ReturnType<typeof usePersonalTerminal>;
 await renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}}));return {w,u};
}
it('opens existing private and group history while prose is generating without writing over its state',async()=>{
 const s=session();s.terminal!.conversations=[{id:'dm',title:'好友甲',members:['contact-a'],group:false,announcement:'',unread:1,messages:[{id:'m1',sender:'contact-a',text:'先前的私聊',at:'now'}]},{id:'group',title:'旧群',members:['contact-a','npc-b'],group:true,ownerId:'npc-b',joined:true,announcement:'',unread:2,messages:[]}];
 const {w,u}=await fixture(s);w.busy=true;const before=JSON.stringify(w.active!.terminal);vi.stubGlobal('fetch',vi.fn());
 u.openConversation('group');expect(u.page.value).toBe('chat');expect(u.conversationId.value).toBe('group');
 await u.openChat('contact-a');expect(u.page.value).toBe('chat');expect(u.messages.value[0].text).toBe('先前的私聊');
 expect(JSON.stringify(w.active!.terminal)).toBe(before);expect(w.save).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(w.busy).toBe(true);
});
it('reopens saved unfinished and completed game rounds without a request, redraw or lost interaction entry',async()=>{
 for(const phase of ['command','respond','complete'] as const){
  const s=session(),r=s.terminal!.rooms[0];r.rounds.push({number:1,king:'contact-a',numbers:{player:1,'npc-b':2},command:phase==='command'?'':'分享趣事',targets:phase==='command'?[]:[2],replies:phase==='complete'?[{id:'npc-b',text:'一件趣事',refused:false,penalty:''}]:[],phase,anchor:terminalAnchor(s)});
  const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[s]})).sessions[0];
  const {w,u}=await fixture(restored),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  u.openRoom('room-a');expect(u.page.value).toBe('room');expect(u.round.value?.phase).toBe(phase);
  const spy=vi.spyOn(terminalModule,'usePersonalTerminal').mockReturnValue(u);
  const html=await renderToString(createSSRApp(PersonalTerminal,{w}));spy.mockRestore();
  expect(html).toContain(phase==='complete'?'回到本轮互动':'继续当前轮');
  u.go('king');expect(u.round.value?.number).toBe(1);expect(u.room.value?.rounds).toHaveLength(1);expect(fetch).not.toHaveBeenCalled();
  u.openRoom('missing');expect(u.error.value).toContain('未找到');
 }
 const s=session();s.terminal!.rooms[0].endedAt=new Date().toISOString();const {u}=await fixture(s);u.openRoom('room-a');expect(u.page.value).toBe('history');
});
it('keeps invitation reasons, retries only the chosen NPC, and round-trips new optional fields',async()=>{
 const {w,u}=await fixture();w.active!.terminal!.rooms[0].invitations['npc-b']='declined';u.openRoom('room-a');
 const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const data=JSON.parse(options.body);calls.push(data);return Response.json({decisions:[{id:'npc-b',accepted:true,reply:'刚才在忙，现在来。'}]});}));
 u.beginInvite('npc-b');u.inviteNote.value='忙完了吗？一起来玩。';await u.sendInvite();
 expect(u.error.value).toBe('');expect(calls[0].actorIds).toEqual(['npc-b']);expect(calls[0].input).toBe('忙完了吗？一起来玩。');
 const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[w.active!]})).sessions[0].terminal!.rooms[0];
 expect(restored.inviteReplies?.['npc-b']).toBe('刚才在忙，现在来。');expect(restored.inviteNotes?.['npc-b']).toBe('忙完了吗？一起来玩。');expect(restored.invitations['contact-a']).toBe('accepted');expect(u.inviteTarget.value).toBe('');
 w.active!.terminal!.rooms[0].invitations['npc-b']='declined';u.beginInvite('npc-b');u.inviteNote.value='';await u.sendInvite();expect(calls[1].input).toBe('邀请你参加国王游戏。');
});
it('matches contact image IDs only uniquely, without altering the contact identity',()=>{
 const rows=[{id:'major-a',name:' 式 '},{id:'major-b',name:'其他'}];
 expect(contactCharacterId(rows,'contact-one','式')).toBe('major-a');expect(contactCharacterId(rows,'major-b','其他')).toBe('major-b');
 expect(contactCharacterId([...rows,{id:'duplicate',name:'式'}],'contact-one','式')).toBeUndefined();expect(contactCharacterId(rows,'contact-one','路人')).toBeUndefined();
});
it('previews avatar pan immediately and saves the newest adjustment after an in-flight save',async()=>{
 const {w}=await fixture();let finish!:()=>void,calls=0;
 w.save=vi.fn(()=>++calls===1?new Promise<void>(resolve=>finish=resolve):Promise.resolve());
 let a!:ReturnType<typeof useAvatarAdjustment>;const errors:string[]=[];
 await renderToString(createSSRApp({setup(){a=useAvatarAdjustment(w,e=>errors.push(e));return()=>h('div');}}));
 a.adjustAvatar('scale',2);a.adjustAvatar('x',20);expect(a.avatarStyle.value.transformOrigin).toBe('70% 50%');
 const first=a.flushAvatar();a.adjustAvatar('x',-20);a.adjustAvatar('y',15);const waiting=a.flushAvatar();finish();await waiting;await first;await nextTick();
 expect(w.active!.terminal!.avatarView).toEqual({scale:2,x:-20,y:15});expect(calls).toBe(2);expect(errors).toEqual([]);
 w.save=vi.fn(async()=>{throw Error('disk');});a.adjustAvatar('x',5);await a.flushAvatar();expect(a.avatarDraft.value.x).toBe(-20);expect(errors[0]).toContain('未保存');
});
