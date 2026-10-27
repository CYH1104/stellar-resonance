// 返工验收：停用/迟到回包/换接口/换顺序后的旧任务、终端先正文失败重试、
// 社交动作（两种顺序）、保存失败回滚与新增任务字段的备份往返。
vi.mock('../src/memory/retrieval',()=>({retrieve:async(items:unknown[])=>items.slice(0,6)}));
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {effectScope} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {newSession,initialState,defaults,backup,parseBackup} from '../src/domain/story';
import {normalizeMemoryResult} from '../src/domain/memories';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {terminalJobTurnIndex} from '../src/domain/terminalLedger';
import {terminalMainContext,cleanTerminalMainContext} from '../src/domain/terminalMain';
import type {GenerateRequest,LocalService} from '../src/domain/contracts';

const baseService={runtime:'local-card' as const,dataset:'test-world',name:'测试',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[]};
let scope:ReturnType<typeof effectScope>;
function service():LocalService{return {...baseService,capabilities:{continue:true,keyRequired:true,embeddings:true,terminal:true,channel:'test'}};}
beforeEach(()=>{
  scope=effectScope();
  vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'readEditorDrafts').mockResolvedValue({});
  vi.spyOn(IndexedDbRepository.prototype,'writeEditorDraft').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'hasInterruptedRestore').mockResolvedValue(false);
  vi.spyOn(IndexedDbRepository.prototype,'readApiCredentials').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'writeApiCredentials').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'writeInputDraft').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'writeConfiguration').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'write').mockResolvedValue();
  vi.spyOn(HttpGateway.prototype,'bootstrap').mockImplementation(async function(this:HttpGateway){const value=service();this.capabilities=value.capabilities;return value;});
  vi.spyOn(HttpGateway.prototype,'configure').mockResolvedValue({origin:'https://synthetic.example'});
  vi.spyOn(HttpGateway.prototype,'newGame').mockResolvedValue({dataset:'test-world',opening:'迎新',initial:initialState('玩家')});
  vi.spyOn(HttpGateway.prototype,'embed').mockImplementation(async texts=>texts.map(()=>[1,0.5]));
  vi.spyOn(HttpGateway.prototype,'memory').mockImplementation(async input=>normalizeMemoryResult({participants:[input.after.player.name],time:'未明确',location:'未明确',userActions:[input.input],charActions:[],gains:[],losses:[],commitments:[],affinityChanges:[]},input));
});
afterEach(()=>{scope.stop();vi.restoreAllMocks();});
function fill(w:ReturnType<typeof useWorkspace>,id='main'){
  if(id==='main')fill(w,'embed');
  Object.assign(w.preferences.profiles.find(p=>p.id===id)!,{apiBaseUrl:`https://${id}.synthetic.example/v1`,model:`model-${id}`});
  w.credentials[id]=`synthetic-key-${id}`;
}
async function workspace(){
  const w=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(w.loading.value).toBe(false));
  fill(w);fill(w,'aux');await w.confirmAllApis();
  const session=newSession('返工存档',{name:'玩家',appearance:'',personality:'',background:''},'');
  session.sourceDataset='test-world';
  session.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];
  session.terminal=emptyTerminal();
  w.sessions.value.push(session);w.sessionId.value=session.id;
  return {w,session};
}
function batchFor(payload:any,extra:Record<string,unknown>={}){
  const ids:string[]=payload.context.mainContext.newGroupIds.slice(0,2);
  return {protocolVersion:2,groups:ids.map((id,i)=>({id,title:'群'+i,members:['a','b'],ownerId:'a',adminIds:[],announcement:'',messages:[{id:'a',text:`群${i}消息一`},{id:'b',text:`群${i}消息二`},{id:'a',text:`群${i}消息三`},{id:'b',text:`群${i}消息四`}],topic:'本轮话题'})),privateMessages:[],friendRequests:[],courses:[],...extra};
}
function recordCalls(terminalCalls:any[],proseCalls:GenerateRequest[],proseText='正文内容'){
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(request){
    proseCalls.push(request);
    yield {type:'delta',text:proseText};
    yield {type:'done',outcome:{event:'走进教室'}};
  });
  vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async function(input:any){
    terminalCalls.push(input);
    return batchFor(input);
  });
}
async function enabled(){
  const value=await workspace();
  value.w.preferences.terminalProfile='aux';
  await value.w.connectProfile(value.w.preferences.profiles.find(p=>p.id==='aux')!);
  expect(await value.w.setTerminalEnabled(true)).toBe(true);
  return value;
}

it('disabling mid-stage discards the reply and leaves no ghost retry job',async()=>{
 const {w,session}=await enabled();let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const calls:any[]=[],prose:GenerateRequest[]=[];recordCalls(calls,prose);
 vi.mocked(HttpGateway.prototype.terminal).mockImplementation(async function(input:any){calls.push(input);await gate;return batchFor(input);});
 const running=w.generate('行动');await vi.waitFor(()=>expect(calls.length).toBeGreaterThan(0));
 expect(await w.setTerminalEnabled(false)).toBe(true);
 release();await running;
 expect(w.terminalEnabled.value).toBe(false);
 expect(session.terminal!.conversations).toHaveLength(0);
 // 停用后不保留一个点了也没用的重试任务
 expect(session.terminal!.jobs||[]).toHaveLength(0);
});

it('a late reply is discarded when the terminal key changed in flight',async()=>{
 const {w,session}=await enabled();let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const calls:any[]=[],prose:GenerateRequest[]=[];recordCalls(calls,prose);
 vi.mocked(HttpGateway.prototype.terminal).mockImplementation(async function(input:any){calls.push(input);await gate;return batchFor(input);});
 const running=w.generate('行动');await vi.waitFor(()=>expect(calls.length).toBeGreaterThan(0));
 // 同一档案内换 Key 也算换接口：完整签名而不是只看档案 id
 w.credentials.aux='synthetic-key-aux-rotated';release();await running;
 expect(session.terminal!.conversations).toHaveLength(0);
});

it('retrying a failed stage after switching the order keeps its own stage',async()=>{
 const {w,session}=await enabled();
 const calls:any[]=[],prose:GenerateRequest[]=[];recordCalls(calls,prose);
 vi.mocked(HttpGateway.prototype.terminal).mockRejectedValueOnce(new Error('synthetic failure'));
 await w.generate('行动');
 const job=session.terminal!.jobs!.find(j=>j.target==='auto')!;
 expect(job.mode).toBe('story-first');expect(job.status).toBe('failed');
 await w.setTerminalOrder('terminal-first');
 expect(await w.retryTerminalJob(job.id)).toBe(true);
 // 重试的是原任务的阶段（正文后），不是切换后的新顺序
 expect(calls).toHaveLength(1);
 expect(calls[0].mode).toBe('story-first');
 expect(calls[0].context.story).toContain('正文内容');
 expect(session.terminal!.conversations.flatMap(c=>c.messages)).toHaveLength(8);
});

it('a terminal-first prose failure keeps the committed facts for the retry',async()=>{
 const {w}=await enabled();await w.setTerminalOrder('terminal-first');
 const calls:any[]=[],prose:GenerateRequest[]=[];
 let proseFails=true;
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(request){
   prose.push(request);
   if(proseFails)throw new Error('prose down');
   yield {type:'delta',text:'正文内容'};
   yield {type:'done',outcome:{event:'走进教室'}};
 });
 vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async function(input:any){calls.push(input);return batchFor(input);});
 await w.generate('行动');
 expect(prose).toHaveLength(1);expect(prose[0].terminalFacts).toContain('群0消息一');
 proseFails=false;
 await w.generate(undefined,0);
 expect(calls).toHaveLength(1);
 expect(prose).toHaveLength(2);
 expect(prose[1].terminalFacts).toBe(prose[0].terminalFacts);
});

it('prose-first allows a proactive friend request without a claim regex',async()=>{
 const {w,session}=await enabled();
 const calls:any[]=[],prose:GenerateRequest[]=[];
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(request){prose.push(request);yield {type:'delta',text:'教室里甲把终端码写给了我。'};yield {type:'done',outcome:{event:'交换号码'}};});
 vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async function(input:any){calls.push(input);return batchFor(input,{friendRequests:[{id:'b',reason:'想加你好友',source:'你写在黑板上的号码'}]});});
 await w.generate('行动');
 expect(calls).toHaveLength(1);
 expect(calls[0].context.allowSocial).toBe(true);
 expect(session.terminal!.friends.find(f=>f.id==='b')?.status).toBe('pending');
});

it('terminal-first verifies social actions after the prose without regenerating chats',async()=>{
 const {w,session}=await enabled();await w.setTerminalOrder('terminal-first');
 const calls:any[]=[],prose:GenerateRequest[]=[];
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(request){prose.push(request);yield {type:'delta',text:'甲同意了我的好友申请，并把终端码发给了我。'};yield {type:'done',outcome:{event:'加上好友'}};});
 vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async function(input:any){
   calls.push(input);
   if(input.context.mainContext.socialOnly)return {protocolVersion:2,groups:[],privateMessages:[],friendRequests:[{id:'b',reason:'我也加你',source:'刚才互换了号码'}],courses:[]};
   return batchFor(input);
 });
 await w.generate('行动');
 expect(calls).toHaveLength(2);
 expect(calls[0].context.mainContext.socialOnly).toBeUndefined();
 expect(calls[1].context.mainContext.socialOnly).toBe(true);
 // 社交核验阶段不重生成群聊或私聊
 expect(calls[1].context.mainContext.groups).toHaveLength(0);
 expect(calls[1].context.story).toContain('甲同意了我的好友申请');
 expect(session.terminal!.conversations.flatMap(c=>c.messages)).toHaveLength(8);
 expect(session.terminal!.friends.find(f=>f.id==='b')?.status).toBe('pending');
 const socialJob=session.terminal!.jobs!.find(j=>j.mode==='social-review')!;
 expect(socialJob.status).toBe('ready');
 // 重复重试不会重复请求或重复落库
 expect(await w.retryTerminalJob(socialJob.id)).toBe(true);
 expect(calls).toHaveLength(2);
});

it('a failed save rolls the applied stage back so the retry still persists',async()=>{
 const {w,session}=await enabled();
 const calls:any[]=[],prose:GenerateRequest[]=[];recordCalls(calls,prose);
 vi.mocked(HttpGateway.prototype.terminal).mockRejectedValueOnce(new Error('synthetic failure'));
 await w.generate('行动');
 const job=session.terminal!.jobs!.find(j=>j.target==='auto')!;
 expect(job.status).toBe('failed');
 // 阶段请求之后的落盘失败一次：内存里的通讯和 ready 状态都必须回滚
 let writes=0,broken=false;
 vi.mocked(IndexedDbRepository.prototype.write).mockImplementation(async function(){
   writes++;
   if(!broken&&writes===2){broken=true;throw new Error('合成写入失败');}
 });
 expect(await w.retryTerminalJob(job.id)).toBe(false);
 expect(session.terminal!.conversations.flatMap(c=>c.messages)).toHaveLength(0);
 expect(session.terminal!.jobs!.find(j=>j.id===job.id)?.status).not.toBe('ready');
 vi.mocked(IndexedDbRepository.prototype.write).mockResolvedValue();
 expect(await w.retryTerminalJob(job.id)).toBe(true);
 expect(session.terminal!.conversations.flatMap(c=>c.messages)).toHaveLength(8);
});

it('terminal context carries confirmed history, scoped memory facts and each group own messages',()=>{
 const s=newSession('上下文',{name:'玩家',appearance:'',personality:'',background:''},'');
 s.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];
 s.terminal=emptyTerminal();
 s.terminal.conversations=[
  {id:'g1',title:'甲群',members:['a'],group:true,ownerId:'a',announcement:'',unread:0,joined:true,managementReady:true,messages:[{id:'m1',sender:'a',displayName:'甲',text:'甲群内部消息',at:'2026-01-01T00:00:00.000Z',knownBy:['player','a']}]},
  {id:'g2',title:'乙群',members:['b'],group:true,ownerId:'b',announcement:'',unread:0,joined:true,managementReady:true,messages:[{id:'m2',sender:'b',displayName:'乙',text:'乙群内部消息',at:'2026-01-01T00:00:00.000Z',knownBy:['player','b']}]}
 ];
 s.turns.push({id:'t1',input:'先前行动',selected:0,variants:[{id:'v1',text:'CONFIRMED_HISTORY_CANARY',status:'complete',createdAt:'now',outcome:{event:'先前事件'}}]});
 s.memories.push({id:'mem1',kind:'event',status:'ready',text:'记忆',createdAt:'now',sourceTurn:'t1',sourceVariant:'v1',record:{version:1,participants:['甲'],time:'',location:'',userActions:['x'],charActions:[],gains:[],losses:[],commitments:[],affinityChanges:[],stateChanges:[],facts:[{text:'甲怕黑',knownBy:['player','a']}]} as never});
 const context=terminalMainContext(s);
 expect(context.history?.map(m=>m.content).join('|')).toContain('CONFIRMED_HISTORY_CANARY');
 expect(context.memories).toEqual([{text:'甲怕黑',knownBy:['player','a']}]);
 const g1=context.groups.find(g=>g.id==='g1')!,g2=context.groups.find(g=>g.id==='g2')!;
 expect(g1.history?.map(h=>h.text)).toEqual(['甲群内部消息']);
 expect(JSON.stringify(g2)).not.toContain('甲群内部消息');
 // 服务端用同一套校验读取这份上下文
 expect(cleanTerminalMainContext(context,s.initial.characters).history?.length).toBe(2);
 // 未标注知情者的记忆事实不会被广播
 const unknown=terminalMainContext({...s,memories:[{...s.memories[0],id:'mem2',record:{...(s.memories[0].record as any),facts:[{text:'谁都不知道'}]}}]} as never);
 expect(unknown.memories).toBeUndefined();
});

it('the stage binding fields round-trip through a backup and reject unknown stages',()=>{
 const p=defaults();const s=newSession('备份',{name:'玩家',appearance:'',personality:'',background:''},'');
 s.terminal=emptyTerminal();
 s.terminal.jobs=[{id:'auto:t:terminal-first:opening:abc',kind:'messages',target:'auto',anchor:{key:'opening:abc',turnId:'',variantId:'',path:['abc']},status:'ready',turnId:'t',variantId:'v',mode:'terminal-first',facts:'群0·甲：消息'}];
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:p})).sessions[0];
 expect(restored.terminal?.jobs?.[0]).toMatchObject({turnId:'t',variantId:'v',mode:'terminal-first',facts:'群0·甲：消息'});
 // A job that names a turn that no longer exists is orphaned: it must never fall back to the
 // anchor and retry another round. Only legacy jobs without a binding keep the anchor fallback.
 expect(terminalJobTurnIndex(restored,restored.terminal!.jobs![0])).toBe(-1);
 const legacy={...restored.terminal!.jobs![0]};delete legacy.turnId;delete legacy.variantId;delete legacy.mode;
 expect(terminalJobTurnIndex(restored,legacy)).toBe(0);
 const broken=JSON.parse(backup({version:1,sessions:[s],preferences:p}));
 broken.sessions[0].terminal.jobs[0].mode='unknown-stage';
 expect(()=>parseBackup(JSON.stringify(broken))).toThrow('终端任务绑定不正确');
});
