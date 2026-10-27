// 正文与手机通讯彻底分开：独立配置、独立请求、两种顺序、每阶段恰好一次、迟到写回保护。
// 这里用真实的 useWorkspace 与真实的请求组装，只把网关调用换成记录器。
vi.mock('../src/memory/retrieval',()=>({retrieve:async(items:unknown[])=>items.slice(0,6)}));
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {effectScope} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {newSession,initialState,defaults,backup,parseBackup} from '../src/domain/story';
import {normalizeMemoryResult} from '../src/domain/memories';
import {emptyTerminal} from '../src/domain/personalTerminal';
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
/** One save with three known actors, a confirmed main API and a separately confirmed
 * terminal API. The terminal stays off until a test turns it on. */
async function workspace(){
  const w=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(w.loading.value).toBe(false));
  fill(w);fill(w,'aux');await w.confirmAllApis();
  const session=newSession('拆分存档',{name:'玩家',appearance:'',personality:'',background:''},'');
  session.sourceDataset='test-world';
  session.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];
  session.terminal=emptyTerminal();
  w.sessions.value.push(session);w.sessionId.value=session.id;
  return {w,session};
}
function batchFor(payload:any){
  const ids:string[]=payload.context.mainContext.newGroupIds.slice(0,2);
  return {protocolVersion:2,groups:ids.map((id,i)=>({id,title:'群'+i,members:['a','b'],ownerId:'a',adminIds:[],announcement:'',messages:[{id:'a',text:`群${i}消息一`},{id:'b',text:`群${i}消息二`},{id:'a',text:`群${i}消息三`},{id:'b',text:`群${i}消息四`}],topic:'本轮话题'})),privateMessages:[],friendRequests:payload.context.allowSocial?[{id:'b',reason:'想加你好友',source:'群里看到你的号码'}]:[],courses:[]};
}
function recordCalls(order:string[],terminalCalls:any[],proseCalls:GenerateRequest[],proseText='正文内容',batch:any=batchFor){
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(request){
    order.push('prose');proseCalls.push(request);
    yield {type:'delta',text:proseText};
    yield {type:'done',outcome:{event:'走进教室'}};
  });
  vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async function(input:any,profile:any,key:string){
    order.push('terminal');terminalCalls.push({...input,profile,key});
    return batch(input);
  });
}
async function enabled(){
  const value=await workspace();
  value.w.preferences.terminalProfile='aux';
  await value.w.connectProfile(value.w.preferences.profiles.find(p=>p.id==='aux')!);
  expect(await value.w.setTerminalEnabled(true)).toBe(true);
  return value;
}

it('prose-first: prose never carries the terminal contract, one independent terminal request follows it',async()=>{
  const {w,session}=await enabled();
  expect(w.apiIssues.value).toEqual([]);
  const order:string[]=[],terminalCalls:any[]=[],proseCalls:GenerateRequest[]=[];
  recordCalls(order,terminalCalls,proseCalls,'正文内容。另外我已经发送好友申请。');
  await w.generate('我走进教室。');
  expect(order).toEqual(['prose','terminal']);
  expect(proseCalls).toHaveLength(1);
  expect(JSON.stringify(proseCalls[0])).not.toContain('terminalContext');
  expect(proseCalls[0].terminalFacts).toBeUndefined();
  expect(terminalCalls).toHaveLength(1);
  const payload=terminalCalls[0];
  expect(payload.task).toBe('main-auto');
  expect(payload.mode).toBe('story-first');
  expect(payload.context.story).toContain('正文内容');
  expect(payload.context.allowSocial).toBe(true);
  // 独立配置：请求体里是终端档案，不是正文档案。
  expect(payload.profile.id).toBe('aux');
  expect(payload.key).toBe('synthetic-key-aux');
  // 消息落库且只落一次
  const messages=session.terminal!.conversations.flatMap(c=>c.messages);
  expect(messages).toHaveLength(8);
  // 重试同一轮不会重复请求或重复落库
  expect(await w.retryTerminalFollowup(0)).toBe(true);
  expect(terminalCalls).toHaveLength(1);
  expect(session.terminal!.conversations.flatMap(c=>c.messages)).toHaveLength(8);
  // 正文声称已发送好友申请时，只有结构化动作才算发送
  expect(session.terminal!.friends.find(f=>f.id==='b')?.status).toBe('pending');
});

it('terminal-first: the terminal is generated from confirmed history and input, then prose receives the committed facts',async()=>{
  const {w,session}=await enabled();
  await w.setTerminalOrder('terminal-first');
  expect(w.terminalOrder.value).toBe('terminal-first');
  const order:string[]=[],terminalCalls:any[]=[],proseCalls:GenerateRequest[]=[];
  recordCalls(order,terminalCalls,proseCalls);
  await w.generate('我走进教室。');
  expect(order).toEqual(['terminal','prose']);
  const payload=terminalCalls[0];
  expect(payload.mode).toBe('terminal-first');
  // 正文尚未生成：只能用已确认历史与本轮输入
  expect(payload.context.story).toBe('');
  expect(payload.input).toBe('我走进教室。');
  // 社交动作只允许在已确认正文之后产生
  expect(payload.context.allowSocial).toBe(false);
  const prose=proseCalls[0];
  expect(JSON.stringify(prose)).not.toContain('terminalContext');
  expect(prose.terminalFacts).toContain('群0消息一');
  // 落库的是本轮真实存在的通讯，不是虚构的正文
  expect(session.terminal!.conversations.flatMap(c=>c.messages).length).toBe(8);
});

it('disabling the phone stops every terminal request while prose keeps working',async()=>{
  const {w,session}=await enabled();
  const order:string[]=[],terminalCalls:any[]=[],proseCalls:GenerateRequest[]=[];
  recordCalls(order,terminalCalls,proseCalls);
  expect(await w.setTerminalEnabled(false)).toBe(true);
  expect(w.terminalEnabled.value).toBe(false);
  await w.generate('手机停用后的行动。');
  expect(proseCalls).toHaveLength(1);
  expect(terminalCalls).toHaveLength(0);
  expect(session.terminal!.conversations).toHaveLength(0);
});

it('the new terminal settings round-trip through the full backup while old files stay compatible',()=>{
  const p=defaults();p.terminalEnabled=true;p.terminalOrder='terminal-first';p.terminalProfile='aux';
  const restored=parseBackup(backup({version:1,sessions:[],preferences:p})).preferences;
  expect(restored.terminalEnabled).toBe(true);
  expect(restored.terminalOrder).toBe('terminal-first');
  expect(restored.terminalProfile).toBe('aux');
  // 旧档没有这两个字段也没有终端接口：不自动开启，顺序取默认
  const legacy=defaults();
  delete (legacy as {terminalEnabled?:boolean}).terminalEnabled;
  delete (legacy as {terminalOrder?:string}).terminalOrder;
  delete (legacy as {terminalProfile?:string}).terminalProfile;
  const old=parseBackup(backup({version:1,sessions:[],preferences:legacy})).preferences;
  expect(old.terminalEnabled).toBe(false);
  expect(old.terminalOrder).toBe('story-first');
  expect(old.terminalProfile).toBeUndefined();
});

it('terminal messages and jobs survive a backup round-trip',()=>{
  const p=defaults();const s=newSession('备份',{name:'玩家',appearance:'',personality:'',background:''},'');
  s.terminal=emptyTerminal();
  s.terminal.conversations=[{id:'g',title:'群',members:['a'],group:true,ownerId:'a',announcement:'',unread:0,messages:[{id:'m',sender:'a',text:'历史消息',at:'2026-01-01T00:00:00.000Z'}],joined:true}];
  s.terminal.jobs=[{id:'auto:t:terminal-first:opening:abcdef',kind:'messages',target:'auto',anchor:{key:'opening:abcdef',turnId:'',variantId:'',path:['abcdef']},status:'failed',error:'终端部分未完成'}];
  const restored=parseBackup(backup({version:1,sessions:[s],preferences:p})).sessions[0];
  expect(restored.terminal?.conversations[0].messages[0].text).toBe('历史消息');
  expect(restored.terminal?.jobs?.[0]).toMatchObject({target:'auto',status:'failed'});
});

it('a late terminal response is discarded when the save changed while it was in flight',async()=>{
  const {w,session}=await enabled();
  const other=newSession('另一份存档',{name:'玩家',appearance:'',personality:'',background:''},'');
  other.sourceDataset='test-world';w.sessions.value.push(other);
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const order:string[]=[],terminalCalls:any[]=[],proseCalls:GenerateRequest[]=[];
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(request){order.push('prose');proseCalls.push(request);yield {type:'delta',text:'正文'};yield {type:'done',outcome:{event:'事件'}};});
  vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async function(input:any,profile:any,key:string){order.push('terminal');terminalCalls.push({...input,profile,key});await gate;return batchFor(input);});
  const running=w.generate('迟到测试');
  await vi.waitFor(()=>expect(terminalCalls).toHaveLength(1));
  w.sessionId.value=other.id;
  release();
  await running;
  expect(session.terminal!.conversations).toHaveLength(0);
  expect(session.terminal!.jobs?.every(j=>j.status!=='ready')).toBe(true);
});
