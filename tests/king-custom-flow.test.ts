import {it,expect,vi,afterEach} from 'vitest';
import {newSession,defaults} from '../src/domain/story';
import {emptyTerminal,targetActors} from '../src/domain/personalTerminal';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import PersonalTerminal from '../src/components/PersonalTerminal.vue';
import * as terminalModule from '../src/app/usePersonalTerminal';
import {createSSRApp,h,reactive} from 'vue';
import {renderToString} from 'vue/server-renderer';
import type {ViewModel} from '../src/app/useWorkspace';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
async function fixture(){
 const s=newSession('自定义国王',{name:'玩家',appearance:'',personality:'',background:''},'');
 s.initial.characters=[];
 s.terminal=emptyTerminal();
 s.terminal.contacts=[{id:'contact-king',name:'楚昭南',identity:'外校交换生',present:false},{id:'contact-target',name:'林晚',identity:'同班同学',present:false}];
 s.terminal.friends=['contact-king','contact-target'].map(id=>({id,status:'accepted',reply:'好',note:''}));
 s.terminal.rooms=[{id:'room',name:'自定义局',style:'日常',members:['player','contact-king','contact-target'],invitations:{'contact-king':'pending','contact-target':'pending'},rounds:[]}];
 const w=reactive({active:s,state:s.initial,preferences:defaults(),credentials:{},loading:false,busy:false,terminalBusy:false,theaters:[],storageStatus:'saved',save:async()=>{},connectionReady:()=>true,scopedRecall:async()=>[],indexTerminalNotes:()=>{}}) as unknown as ViewModel;
 let u!:ReturnType<typeof usePersonalTerminal>;
 await renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}}));
 u.roomId.value='room';
 return {w,u};
}
it('runs a custom-contact king game through invitation, draw, command, reactions, interaction, next round, resume and end',async()=>{
 const {w,u}=await fixture();const calls:any[]=[];
 vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array:any)=>{array.fill(0);return array;});
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{
  const data=JSON.parse((options as RequestInit).body as string);calls.push(data);
  if(data.task==='invite')return Response.json({decisions:data.actorIds.map((id:string)=>({id,accepted:true,reply:'我来。'}))});
  if(data.task==='command')return Response.json({template:data.context.targets.map((_:number,i:number)=>`请{{target${i+1}}}分享一件今天开心的事`).join('和'),targets:data.context.targets,betrayal:false});
  if(data.task==='react')return Response.json({betrayal:false,replies:data.context.revealedTargets.filter((t:any)=>t.id!=='player').map((t:any)=>({id:t.id,text:'我分享一件小事。',refused:false,penalty:''}))});
  if(data.task==='game-interact')return Response.json({replies:data.actorIds.map((id:string)=>({id,text:'我也来说一句。',refused:false,penalty:''}))});
  throw Error('unexpected task '+data.task);
 }));
 u.page.value='room';await u.retryInvite();expect(u.error.value).toBe('');expect(Object.values(u.room.value!.invitations)).toEqual(['accepted','accepted']);expect(calls[0].task).toBe('invite');expect(calls[0].actorIds.sort()).toEqual(['contact-king','contact-target']);
 await u.startRound();const current=()=>u.round.value!;expect(current().king).toBe('contact-king');expect(current().numbers['contact-target']).toBe(1);expect(targetActors(current())).toEqual(['contact-target']);expect(u.page.value).toBe('king');
 await u.command();expect(u.error.value).toBe('');expect(calls.map(c=>c.task)).toEqual(['invite','command','react']);expect(current().command).toContain('开心的事');expect(current().phase).toBe('complete');expect(current().replies.map(r=>r.id)).toEqual(['contact-target']);expect(calls[1].actorIds).toEqual(['contact-king']);expect(calls[1].context.participantNames.sort()).toEqual(['玩家','楚昭南','林晚'].sort());expect(JSON.stringify(calls[1].context)).not.toContain('contact-target');
 u.draft.value='我也说一句。';await u.gameInteract();expect(u.error.value).toBe('');expect(current().interactions?.[0].status).toBe('ready');expect(current().interactions?.[0].replies.map(r=>r.id).sort()).toEqual(['contact-king','contact-target']);
 const spy=vi.spyOn(terminalModule,'usePersonalTerminal').mockReturnValue(u);
 let html='';try{html=await renderToString(createSSRApp(PersonalTerminal,{w}));}finally{spy.mockRestore();}
 expect((html.match(/暂时离开/g)||[])).toHaveLength(1);expect(html).toContain('下一轮');
 await u.startRound();expect(u.error.value).toBe('');expect(u.room.value!.rounds).toHaveLength(2);expect(u.page.value).toBe('king');
 u.go('games');expect(u.page.value).toBe('games');u.roomId.value='room';u.go('room');expect(u.page.value).toBe('room');expect(u.room.value!.rounds).toHaveLength(2);expect(u.room.value!.endedAt).toBeUndefined();
 u.askEnd();await u.endGame();expect(u.error.value).toBe('');expect(u.room.value!.endedAt).toBeTruthy();expect(u.page.value).toBe('games');await u.startRound();expect(u.error.value).toContain('游戏已结束');
});
