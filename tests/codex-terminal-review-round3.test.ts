import {terminalAnchor,terminalBucket,recordTerminalChat} from '../src/domain/terminalLedger';
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


it('changing the triggering input creates a fresh terminal-first stage instead of reusing old facts',async()=>{
 const {w,session}=await enabled();await w.setTerminalOrder('terminal-first');
 const calls:any[]=[],prose:GenerateRequest[]=[];recordCalls([],calls,prose);
 await w.generate('原行动');await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
 await w.edit(0,'user','完全不同的新行动');await w.generate(undefined,0);
 expect(calls).toHaveLength(2);
 expect(calls[1].input).toBe('完全不同的新行动');
});

it('real prose request keeps a previous game result after a newer chat bucket exists',async()=>{
 const {w,session}=await workspace();session.initial.variables={时间地点:{日期:'星历578年09月01日',时间:'14:20',地点:'宿舍'}};
 const b=terminalBucket(session.terminal!,terminalAnchor(session));b.games.push({id:'game:1',kind:'landlord',name:'牌局',round:1,king:'甲',command:'农民胜，甲 -200分',penalties:'',complete:true,knownBy:['player','a']});
 session.turns.push({id:'later',input:'上课',selected:0,variants:[{id:'v',text:'随后回教室',createdAt:'now',status:'complete'}]});
 recordTerminalChat(session.terminal!,terminalAnchor(session),{id:'later-chat',title:'新群聊',group:true},['甲'],'上课',[],['player','a','b']);
 const prose:GenerateRequest[]=[];recordCalls([],[],prose);await w.generate('继续');
 expect(prose).toHaveLength(1);expect(prose[0].memories.join('\n')).toContain('农民胜');expect(prose[0].memories.join('\n')).toContain('14:20');expect(prose[0].memories.join('\n')).toContain('知情：player、a');
 await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
});
