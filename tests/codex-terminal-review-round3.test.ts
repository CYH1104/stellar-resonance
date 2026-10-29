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


// 原已知缺陷现按同一断言转回普通测试，不再作为 expected fail。
// 发布范围和实际验证见 docs/handoffs/2026-10-27-terminal-release.md。
it('changing the triggering input regenerates terminal-first facts for the new action',async()=>{
 const {w,session}=await enabled();await w.setTerminalOrder('terminal-first');
 const calls:any[]=[],prose:GenerateRequest[]=[];recordCalls([],calls,prose);
 await w.generate('原行动');await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
 await w.edit(0,'user','完全不同的新行动');await w.generate(undefined,0);
 expect(calls).toHaveLength(2);
 expect(calls[1].input).toBe('完全不同的新行动');
 expect(prose[1].terminalFacts).toContain('群');expect(session.terminal!.jobs!.filter(j=>j.target==='auto'&&j.status==='ready')).toHaveLength(2);
});

it('continuing the selected second prose variant uses its own committed terminal facts',async()=>{
 const {w}=await enabled();const prose:GenerateRequest[]=[];let round=0;
 recordCalls([],[],prose,'正文内容',(payload:any)=>{const value=batchFor(payload),tag='BATCH_'+(++round);for(const g of value.groups)for(const m of g.messages)m.text=tag+' '+m.text;return value;});
 await w.generate('行动');await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
 await w.generate(undefined,0);await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
 await w.generate(undefined,0,true);
 expect(prose[2].terminalFacts).toContain('BATCH_2');
 expect(prose[2].terminalFacts).not.toContain('BATCH_1');
 expect(round).toBe(2);
 await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));await w.generate(undefined,0,true);
 expect(prose[3].terminalFacts).toContain('BATCH_2');expect(round).toBe(2);
});

it.each(['key','profile','model','address'])('replacing terminal %s immediately aborts the old request before its response arrives',async field=>{
 const {w}=await enabled();recordCalls([],[],[]);let release!:()=>void,signal:AbortSignal|undefined;
 vi.mocked(HttpGateway.prototype.terminal).mockImplementation(async(input,_p,_key,current)=>{signal=current;await new Promise<void>(done=>{release=done;});return batchFor(input);});
 const running=w.generate('行动');await vi.waitFor(()=>expect(signal).toBeDefined());
 try{if(field==='key')w.credentials.aux='replacement-synthetic-key';else if(field==='profile')w.preferences.terminalProfile='main';else if(field==='model')w.preferences.profiles.find(p=>p.id==='aux')!.model='replacement-model';else w.preferences.profiles.find(p=>p.id==='aux')!.apiBaseUrl='https://replacement.synthetic.example/v1';expect(signal!.aborted).toBe(true);}finally{release();await running;}
 expect(w.active.value!.terminal!.conversations.flatMap(c=>c.messages)).toHaveLength(0);
});

it('a terminal retry save failure preserves an independently added memory and its persisted copy',async()=>{
 const {w,session}=await enabled();recordCalls([],[],[]);vi.mocked(HttpGateway.prototype.terminal).mockRejectedValueOnce(Error('synthetic terminal failure'));
 await w.generate('行动');await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
 const job=session.terminal!.jobs!.find(j=>j.status==='failed')!;expect(job).toBeTruthy();
 let rejectWrite!:(e:Error)=>void,waiting=false,failed=false;const saved:any[]=[];
 vi.mocked(IndexedDbRepository.prototype.write).mockImplementation(async value=>{if(!failed&&value.sessions.some(s=>s.terminal?.jobs?.some(j=>j.id===job.id&&j.status==='ready'))){failed=true;waiting=true;await new Promise<void>((_done,reject)=>{rejectWrite=reject;});}saved.push(JSON.parse(JSON.stringify(value)));});
 const retry=w.retryTerminalJob(job.id);await vi.waitFor(()=>expect(waiting,JSON.stringify({problem:w.problem.value,jobs:session.terminal?.jobs})).toBe(true));
 const independent=w.saveMemory('INDEPENDENT_USER_MEMORY');await vi.waitFor(()=>expect(session.memories.some(m=>m.text==='INDEPENDENT_USER_MEMORY')).toBe(true));
 rejectWrite(Error('synthetic disk failure'));await Promise.all([retry,independent]);
 expect(session.memories.some(m=>m.text==='INDEPENDENT_USER_MEMORY')).toBe(true);
 expect(saved.at(-1).sessions.find((s:any)=>s.id===session.id).memories.some((m:any)=>m.text==='INDEPENDENT_USER_MEMORY')).toBe(true);
 expect(session.terminal!.conversations.flatMap(c=>c.messages)).toHaveLength(0);
});
