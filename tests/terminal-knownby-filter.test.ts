import {expect,it,vi,afterEach} from 'vitest';
import {createSSRApp,h,reactive} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {newSession,defaults} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import type {ViewModel} from '../src/app/useWorkspace';

afterEach(()=>vi.unstubAllGlobals());
it('real group entry: after D joined, the whole chat request carries only history known to the current audience and queries the current input',async()=>{
 const active=newSession('群边界验收',{name:'玩家',appearance:'',personality:'',background:''},'开场');
 active.initial.characters=[{id:'a',name:'阿一',present:true},{id:'b',name:'阿二',present:true},{id:'c',name:'阿三',present:true},{id:'d',name:'阿四',present:true}];
 active.turns.push({id:'t1',input:'开场',selected:0,variants:[{id:'v1',text:'正文场景内容。',status:'complete',outcome:{event:'开场'},createdAt:'now'}]});
 const X='星图已藏进钟楼暗格',Y='周末改去体育馆训练',Z='加练到晚上九点',LEGACY='入群前的老群消息';
 active.terminal=emptyTerminal();
 active.terminal.friends=['a','b','c','d'].map(id=>({id,status:'accepted' as const,reply:'好',note:'',at:new Date().toISOString()}));
 active.terminal.conversations=[
  {id:'g1',title:'训练群',group:true,members:['b','c','d'],ownerId:'b',adminIds:[],announcement:'',unread:0,origin:'manual' as const,joined:true,managementReady:true,messages:[
   {id:'m1',sender:'b',text:X,at:'2026-01-01T00:00:00Z',knownBy:['player','b','c']},
   {id:'m2',sender:'c',text:Y,at:'2026-01-01T00:01:00Z',knownBy:['player','b','c']},
   {id:'m3',sender:'b',text:Z,at:'2026-01-01T00:02:00Z',knownBy:['player','b','c','d']},
   {id:'m4',sender:'b',text:LEGACY,at:'2026-01-01T00:03:00Z'},
  ]},
  {id:'p1',title:'阿一',group:false,members:['a'],announcement:'',unread:0,origin:'manual' as const,joined:true,messages:[{id:'pm1',sender:'a',text:'只有我们俩知道的老话',at:'2026-01-01T00:00:00Z'}]},
 ];
 const preferences=defaults();preferences.mode='server';preferences.terminalProfile=preferences.profiles[0].id;
 const calls:any[]=[];const scopedRecall=vi.fn(async(_s:unknown,_q:string,_a:string[])=>[]);
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{const data=JSON.parse(options.body);calls.push({path,...data});return Response.json({messages:[{id:data.actorIds?.[0]||'b',text:'好的。'}],topic:'话题'});}));
 const w=reactive({active,state:active.initial,preferences,credentials:{},loading:false,busy:false,workingMemory:false,terminalBusy:false,storageStatus:'saved',input:'',theaters:[],save:async()=>{},connectionReady:()=>true,connectProfile:async()=>true,scopedRecall,indexTerminalNotes:()=>{}}) as unknown as ViewModel;
 let u!:ReturnType<typeof usePersonalTerminal>;
 await renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}}));
 await vi.waitFor(()=>expect(u.working.value).toBe(false));
 u.conversationId.value='g1';u.draft.value='今晚谁去占场地？';await u.sendChat();
 const chatCall=calls.find(c=>c.task==='chat');
 expect(chatCall).toBeTruthy();
 expect(chatCall.context.audience).toEqual(['player','b','c','d']);
 const body=JSON.stringify(chatCall);
 // pre-join messages and the untagged legacy group message never reach any field
 expect(body).not.toContain(X);
 expect(body).not.toContain(Y);
 expect(body).not.toContain(LEGACY);
 expect(body).not.toContain('正文场景内容。');
 // the post-join message and the current input stay in
 expect(body).toContain(Z);
 expect(body).toContain('今晚谁去占场地');
 // priorTopic follows the current membership segment only: no pre-join or legacy summary
 expect(chatCall.context.priorTopic).toBe('用户发送：今晚谁去占场地？');
 // private chat: legacy history is deterministic and stays deliverable; query is the current input
 u.conversationId.value='p1';u.draft.value='还记得那句老话吗';await u.sendChat();
 const pCall=calls.filter(c=>c.task==='chat').at(-1)!;
 expect(pCall.context.audience).toEqual(['player','a']);
 expect(JSON.stringify(pCall)).toContain('只有我们俩知道的老话');
 expect(scopedRecall.mock.calls.at(-1)![1]).toBe('还记得那句老话吗');
 expect(scopedRecall.mock.calls.every(([,q]:any[])=>!String(q).includes('正文场景内容'))).toBe(true);
});
