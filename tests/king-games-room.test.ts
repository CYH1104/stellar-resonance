import {expect,it,vi,afterEach} from 'vitest';
import {createSSRApp,h,reactive} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {terminalAnchor} from '../src/domain/terminalLedger';
import {emptyTerminal,syncKingDrunk,kingOverLimit,type PersonalTerminal as TerminalShape} from '../src/domain/personalTerminal';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import PersonalTerminal from '../src/components/PersonalTerminal.vue';
import * as terminalModule from '../src/app/usePersonalTerminal';
import type {ViewModel} from '../src/app/useWorkspace';

afterEach(()=>vi.unstubAllGlobals());
const longText='散场后的走廊还留着一点果酒的味道，夜风把笑声吹散在楼梯间。'.repeat(60);
function makeTerminal():TerminalShape{return {...emptyTerminal(),friends:['a','b'].map(id=>({id,status:'accepted' as const,reply:'好',note:''})),rooms:[{id:'room',name:'游戏室房间',style:'日常',members:['player','a','b'],invitations:{a:'accepted',b:'accepted'},rounds:[],drunkFrom:0}]};}
async function fixture(terminal=makeTerminal()){
 const s=newSession('游戏',{name:'玩家',appearance:'',personality:'',background:''},'');
 s.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];
 s.terminal=terminal;
 const preferences=defaults();preferences.mode='server';preferences.terminalProfile=preferences.profiles[0].id;
 const w=reactive({active:s,state:s.initial,preferences,credentials:{},loading:false,busy:false,terminalBusy:false,theaters:[],storageStatus:'saved',save:async()=>{},connectionReady:()=>true,scopedRecall:async()=>[],indexTerminalNotes:()=>{}}) as unknown as ViewModel;
 let u!:ReturnType<typeof usePersonalTerminal>;
 await renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}}));
 u.roomId.value='room';u.page.value='room';
 return {w,u,s};
}
const onlyScene=(room:TerminalShape['rooms'][number])=>room.afterparty?.scenes?.[0]||room.afterparty;
const respondRound={number:1,king:'b',numbers:{player:1,a:2},command:'分享趣事',targets:[2],replies:[],phase:'respond' as const};
it('gives drunkenness priority on round fifteen and retains the individual scene in backups',async()=>{
 const terminal=makeTerminal();terminal.tolerances={player:10,a:1,b:10};for(let n=1;n<=15;n++)terminal.rooms[0].rounds.push({number:n,king:'player',numbers:{a:1,b:2},command:'分享趣事',targets:[1],replies:n===15?[]:[{id:'a',text:'完成',refused:false,penalty:''}],phase:n===15?'respond':'complete'});
 const {w,u}=await fixture(terminal);const tasks:string[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const body=JSON.parse(options.body);tasks.push(body.task);return Response.json(body.task==='react'?{betrayal:false,replies:[{id:'a',text:'不愿意',refused:true,penalty:'喝一杯'}]}:{text:longText,summary:'单独相处的摘要'});}));
 await u.retryReact();expect(u.room.value!.endReason).toBe('drunk');expect(u.room.value!.drunk!.a).toBe(1);expect(tasks).toEqual(['react','afterparty']);
 const restored=parseBackup(backup({version:1,preferences:w.preferences,sessions:[w.active!]})).sessions[0].terminal!.rooms[0];expect(restored.rounds).toHaveLength(15);expect(restored.afterparty!.scenes![0].participants).toEqual(['player','a']);expect(restored.afterparty!.scenes![0].text).toBe(longText);
});
it('ends a legacy sixteen-round active room on entry without changing its historical results',async()=>{
 const terminal=makeTerminal();terminal.tolerances={player:10,a:10,b:10};for(let n=1;n<=16;n++)terminal.rooms[0].rounds.push({number:n,king:'player',numbers:{a:1,b:2},command:'旧指令',targets:[1],replies:[{id:'a',text:'旧结果',refused:false,penalty:''}],phase:'complete'});
 const {u}=await fixture(terminal),fetch=vi.fn();vi.stubGlobal('fetch',fetch);await u.openRoom('room');expect(u.room.value!.endReason).toBe('round-limit');expect(u.room.value!.rounds).toHaveLength(16);expect(u.room.value!.rounds[0].replies[0].text).toBe('旧结果');expect(fetch).not.toHaveBeenCalled();
});
it('saves membership and valid welcome messages before retrying only the missing messages',async()=>{
 const {w,u}=await fixture(),anchor=terminalAnchor(w.active!);w.active!.terminal!.conversations=[{id:'existing-group',title:'原本存在的群',members:['a','b'],ownerId:'a',adminIds:['b'],group:true,joined:false,announcement:'',messages:[],unread:0}];w.active!.terminal!.groupInvitations=[{id:'invite',groupId:'existing-group',by:'a',reason:'欢迎加入',status:'pending',anchor,at:'now'}];const requests:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return Response.json({messages:Array.from({length:requests.length===1?3:1},(_,i)=>({id:'a',text:'欢迎消息'+requests.length+'-'+i})),topic:'欢迎'});}));
 await u.answerGroupInvitation('invite',true);expect(u.t.value.conversations[0].joined).toBe(true);expect(u.t.value.conversations[0].messages).toHaveLength(3);expect(u.t.value.groupInvitations![0].welcome!.status).toBe('failed');
 await u.retryGroupWelcome('invite');expect(requests[1].context.welcomeMissing).toBe(1);expect(requests[1].context.conversation.messages).toHaveLength(3);expect(u.t.value.conversations[0].messages).toHaveLength(4);expect(u.t.value.groupInvitations![0].welcome!.status).toBe('ready');await u.retryGroupWelcome('invite');expect(requests).toHaveLength(2);
});

it('games list shows all seven games with six locked and keeps rooms reachable',async()=>{
 const {w,u}=await fixture();
 u.t.value.rooms[0].rounds.push({...respondRound,phase:'complete' as const,replies:[{id:'a',text:'好',refused:false,penalty:''}]});
 const ended={...u.t.value.rooms[0],id:'old',name:'旧房间',endedAt:new Date().toISOString()};
 u.t.value.rooms.push(ended);
 const spy=vi.spyOn(terminalModule,'usePersonalTerminal').mockReturnValue(u);
 try{
  u.go('games');const html=await renderToString(createSSRApp(PersonalTerminal,{w}));
  for(const name of ['国王游戏','真心话大冒险','狼人杀','日麻','斗地主','十一点半'])expect(html).toContain(name);
  expect((html.match(/暂未开放/g)||[])).toHaveLength(5);
  expect(html).toContain('每日占卜');
  expect(html).toContain('创建房间');expect(html).toContain('回看记录');expect(html).toContain('游戏室房间');
 }finally{spy.mockRestore();}
});
it('ends normally after the fifteenth settled round and never requests a drunk scene or draws round sixteen',async()=>{
 const {u}=await fixture();u.t.value.tolerances={player:10,a:10,b:10};
 for(let number=1;number<=15;number++)u.room.value!.rounds.push({number,king:'player',numbers:{a:1,b:2},command:'分享趣事',targets:[1],replies:number===15?[]:[{id:'a',text:'完成',refused:false,penalty:''}],phase:number===15?'respond':'complete'});
 const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body.task);return Response.json({betrayal:false,replies:[{id:'a',text:'我完成了',refused:false,penalty:''}]});}));
 await u.retryReact();expect(u.error.value).toBe('');expect(u.room.value!.endReason).toBe('round-limit');expect(u.room.value!.afterparty).toBeUndefined();expect(calls).toEqual(['react']);
 await u.startRound();expect(u.room.value!.rounds).toHaveLength(15);expect(calls).toEqual(['react']);
});
it('keeps completed individual scenes and retries only the failed actor without another settlement',async()=>{
 const {u}=await fixture();u.t.value.tolerances={player:10,a:5,b:5};u.room.value!.endedAt=new Date().toISOString();u.room.value!.endReason='drunk';u.room.value!.endTriggers=['a','b'];u.room.value!.drunk={a:5,b:5};u.room.value!.afterparty={status:'pending',triggers:['a','b'],participants:['player','a','b']};
 let good=false;const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json({text:body.actorIds[0]==='a'&&!good?'未完成草稿':longText,summary:'独处摘要'});}));
 await u.retryAfterparty('room');expect(u.room.value!.afterparty!.scenes!.map(s=>s.status)).toEqual(['failed','ready']);expect(calls.map(c=>c.actorIds)).toEqual([['a'],['b']]);expect(calls.map(c=>c.context.audience)).toEqual([['player','a'],['player','b']]);
 const before=JSON.stringify(u.room.value!.drunk);good=true;await u.retryAfterparty('room','a');expect(calls.map(c=>c.actorIds)).toEqual([['a'],['b'],['a']]);expect(u.room.value!.afterparty!.status).toBe('ready');expect(JSON.stringify(u.room.value!.drunk)).toBe(before);
});
it('generates tolerances once per participant, persists them before the draw and only fills missing entries',async()=>{
 const {w,u}=await fixture();const calls:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:string,options:any)=>{const data=JSON.parse(options.body);calls.push(data);
  if(data.task==='tolerance')return Response.json({tolerances:data.actorIds.map((id:string)=>({id,value:id==='player'?1:id==='a'?10:5}))});
  if(data.task==='evaluate')return Response.json({betrayal:false});// random draw may make the player king
  if(data.task==='command')return Response.json({template:data.context.targets.map((_:number,i:number)=>`请{{target${i+1}}}分享趣事`).join('和'),targets:data.context.targets,betrayal:false});
  if(data.task==='react')return Response.json({betrayal:false,replies:data.context.revealedTargets.filter((t:any)=>t.id!=='player').map((t:any)=>({id:t.id,text:'好呀。',refused:false,penalty:''}))});
  if(data.task==='game-interact')return Response.json({replies:data.actorIds.map((id:string)=>({id,text:'好呀。',refused:false,penalty:''}))});
  throw Error('unexpected task '+data.task);}));
 await u.startRound();expect(u.error.value).toBe('');
 expect(u.t.value.tolerances).toEqual({player:1,a:10,b:5});
 expect(u.room.value!.rounds).toHaveLength(1);
 expect(calls.filter(c=>c.task==='tolerance')).toHaveLength(1);
 // second round after completing the first: no re-roll, no tolerance request
 if(u.round.value!.king==='player'){u.draft.value='分享趣事';u.targets.value=[1];}
 await u.command();expect(u.error.value).toBe('');
 if(u.round.value!.phase==='respond'&&!u.round.value!.replies.some(r=>r.id==='player')&&u.round.value!.targets.some(n=>Object.entries(u.round.value!.numbers).some(([id,num])=>num===n&&id==='player'))){u.draft.value='好呀。';await u.playerReply(false);}
 if(u.round.value!.phase==='respond'){await u.retryReact();}
 expect(u.round.value!.phase).toBe('complete');
 await u.startRound();expect(u.error.value).toBe('');
 expect(u.room.value!.rounds).toHaveLength(2);
 expect(calls.filter(c=>c.task==='tolerance')).toHaveLength(1);
 expect(u.t.value.tolerances).toEqual({player:1,a:10,b:5});
});
it('draws the round even when the tolerance answer is malformed, and fills it later without blocking',async()=>{
 const {u}=await fixture();let bad=true;const calls:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:string,options:any)=>{const data=JSON.parse(options.body);calls.push(data);
  if(data.task==='tolerance')return Response.json({tolerances:data.actorIds.map((id:string)=>({id,value:bad?11:5}))});
  if(data.task==='evaluate')return Response.json({betrayal:false});
  if(data.task==='command')return Response.json({template:data.context.targets.map((_:number,i:number)=>`请{{target${i+1}}}分享趣事`).join('和'),targets:data.context.targets,betrayal:false});
  if(data.task==='react')return Response.json({betrayal:false,replies:data.context.revealedTargets.filter((t:any)=>t.id!=='player').map((t:any)=>({id:t.id,text:'好呀。',refused:false,penalty:''}))});
  if(data.task==='game-interact')return Response.json({replies:data.actorIds.map((id:string)=>({id,text:'好呀。',refused:false,penalty:''}))});
  throw Error('unexpected task '+data.task);}));
 // The tolerance call is malformed, but the draw must still happen: the game is not
 // blocked by a model that answers the tolerance prompt in the wrong shape.
 await u.startRound();expect(u.error.value).toBe('');
 expect(u.room.value!.rounds).toHaveLength(1);
 expect(u.t.value.tolerances).toBeUndefined();
 expect(calls.filter(c=>c.task==='tolerance')).toHaveLength(1);
 // Finish the round, then the next draw retries the tolerance fill on its own.
 if(u.round.value!.king==='player'){u.draft.value='分享趣事';u.targets.value=[1];}
 await u.command();expect(u.error.value).toBe('');
 if(u.round.value!.phase==='respond'&&!u.round.value!.replies.some(r=>r.id==='player')&&u.round.value!.targets.some(n=>Object.entries(u.round.value!.numbers).some(([id,num])=>num===n&&id==='player'))){u.draft.value='好呀。';await u.playerReply(false);}
 if(u.round.value!.phase==='respond'){await u.retryReact();}
 expect(u.round.value!.phase).toBe('complete');
 bad=false;await u.startRound();expect(u.error.value).toBe('');
 expect(u.t.value.tolerances).toEqual({player:5,a:5,b:5});
 expect(u.room.value!.rounds).toHaveLength(2);
});
it('counts fixed one-cup penalties once per stable event for NPC refusals and player refusals, never for completion',async()=>{
 const {u}=await fixture();
 u.t.value.tolerances={player:10,a:10,b:10};
 u.room.value!.rounds.push({...respondRound,king:'a',numbers:{player:1,b:2},targets:[1]});
 // NPC refusal via react is covered by the auto-end tests; here the player refuse path
 vi.stubGlobal('fetch',vi.fn(async(_url:string,options:any)=>{const data=JSON.parse(options.body);
  if(data.task==='game-interact')return Response.json({replies:data.actorIds.map((id:string)=>({id,text:'好呀。',refused:false,penalty:''}))});
  throw Error('unexpected task '+data.task);}));
 u.draft.value='我拒绝，喝一杯。';await u.playerReply(true);expect(u.error.value).toBe('');
 expect(u.room.value!.drunk?.player).toBe(1);
 expect(u.room.value!.penaltyEvents).toHaveLength(1);
 // player completing a command adds nothing
 u.t.value.rooms[0].rounds.push({number:2,king:'b',numbers:{player:1,a:2},command:'分享趣事',targets:[1],replies:[],phase:'respond'});
 u.draft.value='我完成了。';await u.playerReply(false);expect(u.error.value).toBe('');
 expect(u.room.value!.drunk?.player).toBe(1);expect(u.room.value!.penaltyEvents).toHaveLength(1);
 // idempotent: re-running the program accounting never double-counts
 const before=JSON.stringify(u.room.value!.drunk);syncKingDrunk(u.t.value,u.t.value.rooms[0]);
 expect(JSON.stringify(u.room.value!.drunk)).toBe(before);expect(u.room.value!.penaltyEvents).toHaveLength(1);
});
it('ends the whole game when drunk reaches an odd tolerance and writes the afterparty once, without double counting on retry',async()=>{
 const {w,u}=await fixture();
 u.t.value.tolerances={player:10,a:5,b:10};
 u.room.value!.drunk={a:4};
 u.room.value!.rounds.push(respondRound);
 const calls:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:string,options:any)=>{const data=JSON.parse(options.body);calls.push(data);
  if(data.task==='react')return Response.json({betrayal:false,replies:[{id:'a',text:'这条不接，罚酒我喝。',refused:true,penalty:'他喝下罚酒。'}]});
  if(data.task==='afterparty')return Response.json({text:longText,summary:'散场复盘摘要'});
  throw Error('unexpected task '+data.task);}));
 await u.retryReact();expect(u.error.value).toBe('');
 expect(u.room.value!.endedAt).toBeTruthy();
 expect(u.room.value!.endReason).toBe('drunk');
 expect(u.room.value!.endTriggers).toEqual(['a']);
 expect(u.room.value!.afterparty?.status).toBe('ready');
 expect(onlyScene(u.room.value!)!.text!.replace(/\s+/gu,'').length).toBeGreaterThanOrEqual(1200);
 expect(u.room.value!.drunk?.a).toBe(5);
 expect(calls.filter(c=>c.task==='afterparty')).toHaveLength(1);
 expect(u.page.value).toBe('history');
 // memory keeps the full text in the room and the summary on game entries with participant knownBy
 const games=(w.active!.terminal!.memories||[]).flatMap(b=>b.games).filter(g=>g.id.startsWith('room:'));
 expect(games.length).toBeGreaterThan(0);expect(games.every(g=>!g.afterparty)).toBe(true);
 expect(games.every(g=>(g.knownBy||[]).includes('a')&&(g.knownBy||[]).includes('player'))).toBe(true);
 expect(JSON.stringify(w.active!.terminal!.memories)).toContain('醉后小剧场：散场复盘摘要');
 // further rounds and penalties are impossible after the end
 await expect(u.commit(t=>{t.rooms[0].rounds[0].replies.push({id:'b',text:'x',refused:false,penalty:''});})).rejects.toThrow('游戏已结束');
 expect(u.room.value!.penaltyEvents).toHaveLength(1);
});
it('writes separate private scenes for multiple same-round triggers',async()=>{
 const {u}=await fixture();
 u.t.value.tolerances={player:10,a:5,b:10};
 u.room.value!.drunk={a:4,b:9};
 u.room.value!.rounds.push({number:1,king:'player',numbers:{a:1,b:2},command:'一起分享',targets:[1,2],replies:[],phase:'respond'});
 vi.stubGlobal('fetch',vi.fn(async(_url:string,options:any)=>{const data=JSON.parse(options.body);
  if(data.task==='react')return Response.json({betrayal:false,replies:data.actorIds.map((id:string)=>({id,text:'不接，罚酒我喝。',refused:true,penalty:'喝下罚酒。'}))});
  if(data.task==='afterparty')return Response.json({text:longText});
  throw Error('unexpected task '+data.task);}));
 await u.retryReact();expect(u.error.value).toBe('');
 expect(u.room.value!.endTriggers).toEqual(['a','b']);
 expect(u.room.value!.afterparty?.status).toBe('ready');
 expect(u.room.value!.drunk).toEqual({a:5,b:10});
});
it('keeps the original text and error on failure and retry only rewrites the afterparty without re-counting cups',async()=>{
 const {u}=await fixture();
 u.t.value.tolerances={player:10,a:5,b:10};
 u.room.value!.endedAt=new Date().toISOString();
 u.room.value!.endReason='drunk';u.room.value!.endTriggers=['a'];
 u.room.value!.afterparty={status:'pending',triggers:['a'],at:new Date().toISOString()};
 u.room.value!.drunk={a:5};u.room.value!.penaltyEvents=['1:a'];
 u.room.value!.rounds.push({...respondRound,phase:'complete' as const,replies:[{id:'a',text:'不接，罚酒我喝。',refused:true,penalty:'喝下罚酒。'}]});
 let good=false;const calls:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:string,options:any)=>{const data=JSON.parse(options.body);calls.push(data);
  if(data.task==='afterparty')return good?Response.json({text:longText,summary:'补写完成'}):Response.json({text:'太短。'});
  throw Error('unexpected task '+data.task);}));
 u.roomId.value='room';u.go('history');
 await u.retryAfterparty('room');expect(u.error.value).toContain('1200');
 expect(u.room.value!.afterparty?.status).toBe('failed');
 expect(onlyScene(u.room.value!)?.error).toContain('1200');
 expect(u.room.value!.drunk).toEqual({a:5});expect(u.room.value!.penaltyEvents).toEqual(['1:a']);
 expect(u.room.value!.rounds).toHaveLength(1);
 // a cancelled request also preserves state and records the failure
 good=true;
 await u.retryAfterparty('room');expect(u.error.value).toBe('');
 expect(u.room.value!.afterparty?.status).toBe('ready');
 expect(onlyScene(u.room.value!)?.text!.replace(/\s+/gu,'').length).toBeGreaterThanOrEqual(1200);
 expect(calls.filter(c=>c.task==='afterparty')).toHaveLength(2);
});
it('manual end without drunk never requests an afterparty; zero-round manual ends stay silent',async()=>{
 const {u}=await fixture();const calls:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:string,options:any)=>{calls.push(JSON.parse(options.body));throw Error('no request expected');}));
 u.room.value!.rounds.push({...respondRound,phase:'complete' as const,replies:[{id:'a',text:'好',refused:false,penalty:''}]});
 u.askEnd();await u.endGame();expect(u.error.value).toBe('');
 expect(u.room.value!.endedAt).toBeTruthy();
 expect(u.room.value!.afterparty).toBeUndefined();expect(u.room.value!.endReason).toBeUndefined();
 expect(calls).toHaveLength(0);
});
it('keeps the drawn round playable while the tolerance request is still hanging upstream',async()=>{
 const {w,u}=await fixture();const calls:any[]=[];let release!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn((_url:string,options:any)=>{
  const data=JSON.parse(options.body);calls.push(data);
  // 上游迟迟不返回：耐受度不能因此锁住出令、互动或任何存档写入。
  if(data.task==='tolerance')return new Promise<Response>(done=>{release=()=>done(Response.json({tolerances:[{id:'player',value:4},{id:'a',value:6},{id:'b',value:7}]}));});
  if(data.task==='evaluate')return Promise.resolve(Response.json({betrayal:false}));
  if(data.task==='command')return Promise.resolve(Response.json({template:data.context.targets.map((_:number,i:number)=>`请{{target${i+1}}}讲个笑话`).join('和'),targets:data.context.targets,betrayal:false}));
  if(data.task==='react')return Promise.resolve(Response.json({betrayal:false,replies:data.actorIds.map((id:string)=>({id,text:'好呀。',refused:false,penalty:''}))}));
  if(data.task==='game-interact')return Promise.resolve(Response.json({replies:data.actorIds.map((id:string)=>({id,text:'好呀。',refused:false,penalty:''}))}));
  return Promise.resolve(Response.json({}));
 }));
 const drawing=u.startRound();
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 // 抽签已落盘并切换页面，但耐受度仍在等待：此时不能再持有全局操作锁。
 expect(u.room.value!.rounds).toHaveLength(1);expect(u.page.value).toBe('king');
 expect(u.working.value).toBe(false);expect(w.terminalBusy).toBe(false);
 expect(u.t.value.tolerances).toBeUndefined();
 // 界面上"发布命令/请国王出令"必须立即可点，而不是等耐受度返回才解除禁用。
 const spy=vi.spyOn(terminalModule,'usePersonalTerminal').mockReturnValue(u as any);
 try{
  const html=await renderToString(createSSRApp(PersonalTerminal,{w}));
  expect(html).toMatch(/class="pt-gold">(?:发布命令|请国王出令)/);
 }finally{spy.mockRestore();}
 // 出令不排队：请求真的发出去了，而不是被静默跳过。
 const before=calls.length;
 if(u.round.value!.king==='player'){u.draft.value='讲个笑话';u.targets.value=[1];}
 await u.command();
 expect(u.error.value).toBe('');
 expect(calls.length).toBeGreaterThan(before);
 expect(calls.slice(before).some(c=>c.task==='command'||c.task==='evaluate')).toBe(true);
 // 迟到的耐受度仍然落到同一房间，且不影响已经推进的轮次。
 release(Response.json({tolerances:[{id:'player',value:4},{id:'a',value:6},{id:'b',value:7}]}));
 await vi.waitFor(()=>expect(u.t.value.tolerances).toEqual({player:4,a:6,b:7}));
 expect(u.room.value!.rounds).toHaveLength(1);
 await drawing;
});
it('a mid-request archive switch drops late tolerance replies without losing the drawn round',async()=>{ const {w,u}=await fixture();let resolve!:(r:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
 const pending=u.startRound();
 await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
 w.credentials[w.preferences.terminalProfile!]='changed';
 resolve(Response.json({tolerances:[{id:'player',value:3},{id:'a',value:3},{id:'b',value:3}]}));
 await pending;
 // The draw is local and already persisted; only the late model answer is dropped.
 expect(u.error.value).toBe('');
 expect(u.t.value.tolerances).toBeUndefined();expect(u.room.value!.rounds).toHaveLength(1);
});
it('roundtrips the new game fields through backup v1-compat validation and rejects corrupt afterparty data',async()=>{
 const {w}=await fixture();
 w.active!.terminal!.tolerances={player:1,a:5,b:10};
 w.active!.terminal!.rooms[0].drunk={a:5};
 w.active!.terminal!.rooms[0].penaltyEvents=['1:a'];
 w.active!.terminal!.rooms[0].endReason='drunk';w.active!.terminal!.rooms[0].endTriggers=['a'];
 w.active!.terminal!.rooms[0].endedAt=new Date().toISOString();
 w.active!.terminal!.rooms[0].afterparty={status:'ready',text:longText,summary:'摘要',triggers:['a'],at:new Date().toISOString()};
 const data=backup({version:1,preferences:w.preferences,sessions:[w.active!]});
 const restored=parseBackup(data).sessions[0].terminal!;
 expect(restored.tolerances).toEqual({player:1,a:5,b:10});
 expect(restored.rooms[0].afterparty?.status).toBe('ready');
 expect(restored.rooms[0].drunk).toEqual({a:5});
 // old archives without the fields stay valid
 const legacy=makeTerminal();const l=parseBackup(backup({version:1,preferences:w.preferences,sessions:[{...w.active!,terminal:legacy}]})).sessions[0].terminal!;
 expect(l.tolerances).toBeUndefined();
 // corrupt: ready afterparty below the visible minimum must stop the import
 const bad=structuredClone(JSON.parse(JSON.stringify(w.active!.terminal!))) as TerminalShape;
 bad.rooms[0].afterparty={status:'ready',text:'太短',triggers:['a']};
 expect(()=>parseBackup(backup({version:1,preferences:w.preferences,sessions:[{...w.active!,terminal:bad}]}))).toThrow();
 // tolerance out of range must stop the import
 const bad2=structuredClone(JSON.parse(JSON.stringify(w.active!.terminal!))) as TerminalShape;
 bad2.tolerances={player:0};
 expect(()=>parseBackup(backup({version:1,preferences:w.preferences,sessions:[{...w.active!,terminal:bad2}]}))).toThrow();
});
it('domain threshold helper counts odd and even crossings only after the fixed two cups settle',()=>{
 const room:TerminalShape['rooms'][number]={...makeTerminal().rooms[0],drunk:{a:6,b:5},rounds:[]};
 expect(kingOverLimit(room,{a:5,b:10})).toEqual(['a']);// 4→6 crossing counts after settling; 5<10 stays under
});

it('renders accessible drunk progress bars for participants only and disables locked game buttons',async()=>{
 const {w,u}=await fixture();
 u.t.value.tolerances={player:2,a:5,b:9};
 u.t.value.rooms[0].drunk={player:1,a:2};
 u.t.value.rooms[0].invitations={a:'accepted',b:'declined'};
 u.t.value.rooms[0].rounds.push({...respondRound,phase:'complete' as const,replies:[{id:'a',text:'好',refused:false,penalty:''}]});
 const spy=vi.spyOn(terminalModule,'usePersonalTerminal').mockReturnValue(u);
 try{
  u.go('room');const roomHtml=await renderToString(createSSRApp(PersonalTerminal,{w}));
  expect(roomHtml).toContain('<progress');
  expect((roomHtml.match(/<progress/g)||[]).length).toBe(2);// player and a only; declined b shows 未参加
  expect(roomHtml).toContain('未参加');
  u.go('games');const gamesHtml=await renderToString(createSSRApp(PersonalTerminal,{w}));
  expect(gamesHtml).not.toContain('aria-disabled');
  const locked=(gamesHtml.match(/<button[^>]*disabled[^>]*>/g)||[]).length;
  expect(locked).toBeGreaterThanOrEqual(5);// 每日占卜 unlocked in this round: five locked remain
  for(const g of ['真心话大冒险','十一点半'])expect(gamesHtml).toContain(g);
 }finally{spy.mockRestore();}
});
it('ends immediately when a player refusal crosses the tolerance: no game-interact request, pending interaction stopped, participants snapshotted',async()=>{
 const {u}=await fixture();
 u.t.value.tolerances={player:4,a:10,b:10};
 u.t.value.rooms[0].drunk={player:3};
 u.t.value.rooms[0].rounds.push({number:1,king:'a',numbers:{player:1,b:2},command:'分享趣事',targets:[1],replies:[],phase:'respond' as const});
 const calls:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_x:string,o:any)=>{const data=JSON.parse(o.body);calls.push(data);
  if(data.task==='afterparty')return Response.json({text:longText,summary:'s'});
  throw Error('unexpected task '+data.task);}));
 u.draft.value='我拒绝，喝一杯。';await u.playerReply(true);expect(u.error.value).toBe('');
 expect(u.room.value!.endedAt).toBeTruthy();
 expect(u.room.value!.endTriggers).toEqual(['player']);
 expect(calls.some(c=>c.task==='game-interact')).toBe(false);
 expect(u.room.value!.rounds[0].interactions![0].status).toBe('stopped');
 expect(u.room.value!.afterparty?.status).toBe('ready');
 expect(u.room.value!.afterparty?.participants).toEqual(['player','a','b']);
});
it('scoped accounting never back-fills legacy saves, ended rooms, archived branches or other rooms',()=>{
 const t0=makeTerminal();
 const legacy=t0.rooms[0];delete legacy.drunkFrom;// pre-feature active room: 10 refused rounds, no drunk data
 for(let i=1;i<=10;i++)legacy.rounds.push({number:i,king:'a',numbers:{player:1,b:2},command:'x',targets:[2],replies:[{id:'b',text:'不',refused:true,penalty:'喝两杯'}],phase:'complete' as const});
 syncKingDrunk(t0,legacy);
 expect(legacy.drunk).toBeUndefined();// adoption marker set to 10: old refusals stay uncounted
 expect(legacy.drunkFrom).toBe(10);
 legacy.rounds.push({number:11,king:'a',numbers:{player:1,b:2},command:'x',targets:[2],replies:[{id:'b',text:'不',refused:true,penalty:'喝两杯'}],phase:'complete' as const});
 syncKingDrunk(t0,legacy);syncKingDrunk(t0,legacy);// retry never double-counts
 expect(legacy.drunk).toEqual({b:1});expect(legacy.penaltyEvents).toEqual(['11:b']);
 // ended rooms are never modified
 legacy.endedAt=new Date().toISOString();legacy.drunkFrom=0;delete legacy.penaltyEvents;delete legacy.drunk;
 syncKingDrunk(t0,legacy);expect(legacy.drunk).toBeUndefined();expect(legacy.penaltyEvents).toBeUndefined();
 // archived branch rounds don't count; another room is untouched (isolation)
 const other=makeTerminal().rooms[0];other.id='other';
 other.rounds.push({number:1,king:'a',numbers:{player:1,b:2},command:'x',targets:[2],replies:[{id:'b',text:'不',refused:true,penalty:'喝两杯'}],phase:'complete' as const,archived:true});
 const snapshot=JSON.stringify(other);const combined={...t0,rooms:[legacy,other]};
 syncKingDrunk(combined,other);
 expect(JSON.stringify(other)).toBe(snapshot);
 expect(other.drunk).toBeUndefined();
});
it('afterparty requests carry only end-time participants and never leak other private chats or raw prose',async()=>{
 const {w,u}=await fixture();
 u.t.value.tolerances={player:10,a:5,b:10};
 u.t.value.rooms[0].invitations={a:'accepted',b:'declined'};
 u.t.value.rooms[0].endedAt=new Date().toISOString();
 u.t.value.rooms[0].endReason='drunk';u.t.value.rooms[0].endTriggers=['a'];
 u.t.value.rooms[0].afterparty={status:'pending',triggers:['a'],at:new Date().toISOString(),participants:['player','a']};
 u.t.value.rooms[0].rounds.push({...respondRound,phase:'complete' as const,replies:[{id:'a',text:'好',refused:false,penalty:''}]});
 u.t.value.conversations.push({id:'pc',title:'私聊-丙',members:['c'],group:false,announcement:'',unread:0,messages:[{id:'m1',sender:'c',text:'私密金丝雀：只有我和玩家的约定。',at:'now',knownBy:['player','c']}]});
 w.active!.turns.push({id:'t1',input:'剧情金丝雀：正文里的秘密。',selected:0,variants:[{id:'v1',text:'剧情金丝雀正文。',status:'complete',createdAt:'now'}]});
 w.active!.terminal!.memories=[{anchor:terminalAnchor(w.active!),chats:[],games:[{id:'room:1',name:'游戏室房间',round:1,king:'b',command:'分享趣事',penalties:'无',complete:true}]}];
 let body:any;
 vi.stubGlobal('fetch',vi.fn(async(_x:string,o:any)=>{body=JSON.parse(o.body);
  if(body.task==='afterparty')return Response.json({text:longText,summary:'摘要'});
  throw Error('unexpected task '+body.task);}));
 u.roomId.value='room';u.go('history');
 await u.retryAfterparty('room');expect(u.error.value).toBe('');
 expect(body.task).toBe('afterparty');
 expect(body.actorIds).toEqual(['a']);
 expect(body.context.audience).toEqual(['player','a']);
 expect(JSON.stringify(body)).not.toContain('私密金丝雀');
 expect(JSON.stringify(body)).not.toContain('剧情金丝雀');
 expect(body.context.afterparty.participants.map((x:any)=>x.id)).toEqual(['player','a']);
 expect(u.room.value!.afterparty?.participants).toEqual(['player','a']);
 const games=(w.active!.terminal!.memories||[]).flatMap(x=>x.games).filter(g=>g.id.startsWith('room:'));
 expect(games.length).toBeGreaterThan(0);
 expect(games.every(g=>!g.afterparty)).toBe(true);const privateScene=(w.active!.terminal!.memories||[]).flatMap(b=>b.chats).find(c=>c.id.startsWith('afterparty:'));expect(privateScene?.knownBy).toEqual(['player','a']);expect(JSON.stringify(privateScene)).toContain('摘要');
});
it('keeps a short body as draft, sends it with the retry, and a cancelled retry preserves it',async()=>{
 const {u}=await fixture();
 u.t.value.tolerances={player:10,a:5,b:10};
 u.t.value.rooms[0].endedAt=new Date().toISOString();
 u.t.value.rooms[0].endReason='drunk';u.t.value.rooms[0].endTriggers=['a'];
 u.t.value.rooms[0].afterparty={status:'pending',triggers:['a'],at:new Date().toISOString(),participants:['player','a','b']};
 u.t.value.rooms[0].rounds.push({...respondRound,phase:'complete' as const,replies:[{id:'a',text:'好',refused:false,penalty:''}]});
 let good=false;const bodies:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_x:string,o:any)=>{const data=JSON.parse(o.body);bodies.push(data);
  if(data.task!=='afterparty')throw Error('unexpected task '+data.task);
  if(!good)return new Response(JSON.stringify({code:'INVALID_TERMINAL_RESULT',reason:'AFTERPARTY_LENGTH',raw:JSON.stringify({text:'短文草稿金丝雀。'})}),{status:502});
  return Response.json({text:longText,summary:'补写完成'});}));
 u.roomId.value='room';u.go('history');
 await u.retryAfterparty('room');expect(u.error.value).toContain('AFTERPARTY_LENGTH');
 expect(u.room.value!.afterparty?.status).toBe('failed');
 // raw JSON is never stored as the body: the safe text field becomes the draft
 expect(onlyScene(u.room.value!)?.draft).toBe('短文草稿金丝雀。');
 // a cancelled retry keeps status and draft untouched
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('请求已停止。');}));
 await u.retryAfterparty('room');expect(u.error.value).toContain('无法连接');
 expect(onlyScene(u.room.value!)?.draft).toBe('短文草稿金丝雀。');
 expect(u.room.value!.afterparty?.status).toBe('failed');
 // the successful retry reuses the draft and satisfies the length validation
 vi.stubGlobal('fetch',vi.fn(async(_x:string,o:any)=>{const data=JSON.parse(o.body);bodies.push(data);
  if(data.task!=='afterparty')throw Error('unexpected task '+data.task);
  return Response.json({text:longText,summary:'补写完成'});}));
 good=true;
 await u.retryAfterparty('room');expect(u.error.value).toBe('');
 expect(bodies.filter(b=>b.task==='afterparty').at(-1)?.context.priorDraft).toBe('短文草稿金丝雀。');
 expect(u.room.value!.afterparty?.status).toBe('ready');
 expect(onlyScene(u.room.value!)?.text!.replace(/\s+/gu,'').length).toBeGreaterThanOrEqual(1200);
});
it('a late afterparty settlement never lands on another archive whose room shares the id',async()=>{
 const {w,u}=await fixture();
 u.t.value.tolerances={player:10,a:5,b:10};
 u.t.value.rooms[0].endedAt=new Date().toISOString();
 u.t.value.rooms[0].endReason='drunk';u.t.value.rooms[0].endTriggers=['a'];
 u.t.value.rooms[0].afterparty={status:'pending',triggers:['a'],at:new Date().toISOString(),participants:['player','a','b']};
 u.t.value.rooms[0].rounds.push({...respondRound,phase:'complete' as const,replies:[{id:'a',text:'好',refused:false,penalty:''}]});
 let resolve!:(r:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
 const pending=u.retryAfterparty('room');
 await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
 const other=newSession('别的档',{name:'玩家',appearance:'',personality:'',background:''},'');
 other.id='other-session';other.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];
 other.terminal=JSON.parse(JSON.stringify(w.active!.terminal));
 w.active=other;
 resolve(Response.json({text:longText,summary:'x'}));
 await pending;
 expect(u.error.value).not.toBe('');// the reply was refused, nothing written
 expect(other.terminal!.rooms[0].afterparty?.status).toBe('pending');
 expect(other.terminal!.rooms[0].afterparty?.text).toBeUndefined();
});
it('an async same-session branch switch stops both late afterparty success and failure bookkeeping on the old branch',async()=>{
 const {w,u}=await fixture();
 u.t.value.tolerances={player:10,a:5,b:10};
 u.t.value.rooms[0].endedAt=new Date().toISOString();
 u.t.value.rooms[0].endReason='drunk';u.t.value.rooms[0].endTriggers=['a'];
 u.t.value.rooms[0].afterparty={status:'pending',triggers:['a'],at:new Date().toISOString(),participants:['player','a','b']};
 u.t.value.rooms[0].rounds.push({...respondRound,phase:'complete' as const,replies:[{id:'a',text:'好',refused:false,penalty:''}]});
 // the request anchor is turn t1/v1; switching the same session to a second complete variant invalidates it
 w.active!.turns.push({id:'t1',input:'开场剧情。',selected:0,variants:[{id:'v1',text:'剧情分支一。',status:'complete',createdAt:'now'}]});
 let defer:Promise<Response>;
 const useDeferred=()=>{let put!:(r:Response)=>void;defer=new Promise<Response>(r=>{put=r;});vi.stubGlobal('fetch',vi.fn(()=>defer));return put;};
 const put1=useDeferred();
 const pending=u.retryAfterparty('room');
 await vi.waitFor(()=>expect(defer).toBeInstanceOf(Promise));
 w.active!.turns[0].variants.push({id:'v2',text:'剧情分支二。',status:'complete',createdAt:'now'});
 w.active!.turns[0].selected=1;
 // late success: request() drops the reply as "存档或API已改变"; without the anchor binding
 // markAfterpartyFailure would then book the failure onto the switched-away branch
 put1(Response.json({text:longText,summary:'x'}));
 await pending;
 expect(u.error.value).not.toBe('');
 expect(u.t.value.rooms[0].afterparty?.status).toBe('pending');
 expect(onlyScene(u.t.value.rooms[0])?.text).toBeUndefined();
 expect(onlyScene(u.t.value.rooms[0])?.error).toBeUndefined();
 // late failure: switch back to the original branch first, then a failure there books normally
 w.active!.turns[0].selected=0;
 const put2=useDeferred();
 const failing=u.retryAfterparty('room');
 await vi.waitFor(()=>expect(fetch).toBeCalled());
 put2(new Response(JSON.stringify({code:'INVALID_TERMINAL_RESULT',reason:'AFTERPARTY_LENGTH',raw:JSON.stringify({text:'短文。'})}),{status:502}));
 await expect(failing).resolves.toBeUndefined();
 expect(u.error.value).toContain('AFTERPARTY_LENGTH');
 expect(u.t.value.rooms[0].afterparty?.status).toBe('failed');// on-branch failure still books normally
 expect(onlyScene(u.t.value.rooms[0])?.draft).toBe('短文。');
 // late failure after branch switch: the 502 is dropped by the request guard, and the
 // failure bookkeeping must not land on the old branch either
 const put3=useDeferred();
 const late=u.retryAfterparty('room');
 await vi.waitFor(()=>expect(fetch).toBeCalled());
 w.active!.turns[0].selected=1;// switched away while in flight
 put3(new Response(JSON.stringify({text:longText,summary:'x'}),{status:200}));
 await late;
 expect(u.error.value).not.toBe('');
 expect(u.t.value.rooms[0].afterparty?.status).toBe('failed');
 expect(onlyScene(u.t.value.rooms[0])?.text).toBeUndefined();
 expect(onlyScene(u.t.value.rooms[0])?.draft).toBe('短文。');// prior failure record untouched
});

// 同一个档案里改模型或接口地址，也必须让挂起中的旧耐受度结果失效；不能只比对档案 ID 和密钥。
it('changing the model or endpoint under the same profile drops late tolerance replies',async()=>{
 const {w,u}=await fixture();let release!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{
  // 替身故意忽略 abort：迟到的响应一定会回来，写入必须由守卫拦住。
  release=()=>done(Response.json({tolerances:[{id:'player',value:2},{id:'a',value:3},{id:'b',value:4}]}));
 })));
 const pending=u.startRound();
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 const profile=w.preferences.profiles.find(p=>p.id===w.preferences.terminalProfile)!;
 profile.model='changed-model-during-request';
 profile.apiBaseUrl='https://changed.synthetic.example/v1';
 await Promise.resolve();
 release(Response.json({tolerances:[{id:'player',value:2},{id:'a',value:3},{id:'b',value:4}]}));
 await pending;
 expect(u.t.value.tolerances).toBeUndefined();
});
