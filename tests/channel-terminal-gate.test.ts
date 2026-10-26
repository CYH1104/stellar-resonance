// 前端通道门控：稳定版不发送手机上下文、不做终端补修、不生成手机专用数据。
// 这里用真实的 useWorkspace 与真实生成请求组装，只把网关调用替换成记录器。
vi.mock('../src/memory/retrieval',()=>({retrieve:async(items:unknown[])=>items.slice(0,6)}));
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {effectScope} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {newSession,initialState} from '../src/domain/story';
import {normalizeMemoryResult} from '../src/domain/memories';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {terminalAnchor,recordTerminalChat,syncTerminalMemoryNotes,isTerminalMemoryNote} from '../src/domain/terminalLedger';
import type {GenerateRequest,LocalService} from '../src/domain/contracts';

const baseService={runtime:'local-card' as const,dataset:'test-world',name:'测试',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[]};
let scope:ReturnType<typeof effectScope>;
let capabilities:{continue:boolean;keyRequired:boolean;embeddings:boolean;terminal?:boolean;channel?:string};
function service():LocalService{return {...baseService,capabilities};}
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
  fill(w);await w.confirmAllApis();
  const session=newSession('通道存档',{name:'玩家',appearance:'',personality:'',background:''},'');
  session.sourceDataset='test-world';
  w.sessions.value.push(session);
  w.sessionId.value=session.id;
  return w;
}

it('stable channel never sends phone context and never calls the phone API',async()=>{
  capabilities={continue:true,keyRequired:true,embeddings:true,terminal:false,channel:'stable'};
  const w=await workspace();
  expect(w.terminalEnabled.value).toBe(false);
  const requests:GenerateRequest[]=[];
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(request){
    requests.push(request);
    yield {type:'delta',text:'正文'};
    yield {type:'done',outcome:{event:'走进教室'}};
  });
  const terminal=vi.spyOn(HttpGateway.prototype,'terminal');
  await w.generate('我走进教室。');
  await vi.waitFor(()=>expect(requests).toHaveLength(1));
  expect(requests[0].terminalContext).toBeUndefined();
  expect(terminal).not.toHaveBeenCalled();
  // 手机专用数据（终端码）也不应该在稳定版新建的存档里出现。
  expect(w.active.value!.initial.variables?.终端码).toBeUndefined();
});

it('test channel keeps sending the phone context',async()=>{
  capabilities={continue:true,keyRequired:true,embeddings:true,terminal:true,channel:'test'};
  const w=await workspace();
  expect(w.terminalEnabled.value).toBe(true);
  const requests:GenerateRequest[]=[];
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(request){
    requests.push(request);
    yield {type:'delta',text:'正文'};
    yield {type:'done',outcome:{event:'走进教室'}};
  });
  await w.generate('我走进教室。');
  await vi.waitFor(()=>expect(requests).toHaveLength(1));
  expect(requests[0].terminalContext).toBeDefined();
  expect(w.active.value!.initial.variables?.终端码).toBeDefined();
});

it('a failed phone follow-up is not retried on the stable channel',async()=>{
  capabilities={continue:true,keyRequired:true,embeddings:true,terminal:false,channel:'stable'};
  const w=await workspace();
  const terminal=vi.spyOn(HttpGateway.prototype,'terminal');
  expect(await w.retryTerminalFollowup(0,true)).toBe(false);
  expect(terminal).not.toHaveBeenCalled();
});

it('a completed stable generation never sends legacy phone text to the embedding model',async()=>{
  const canary='PHONE_ONLY_CANARY_20261026';
  capabilities={continue:true,keyRequired:true,embeddings:true,terminal:false,channel:'stable'};
  const w=await workspace(),s=w.active.value!;
  // 旧存档：手机私聊记录与派生记忆都在，通道已经切到稳定版。
  s.terminal=emptyTerminal();
  recordTerminalChat(s.terminal,terminalAnchor(s),{id:'legacy-phone',title:'旧私聊',group:false},['玩家','甲'],canary,[],['player','a']);
  syncTerminalMemoryNotes(s);
  expect(s.memories.some(isTerminalMemoryNote)).toBe(true);
  w.preferences.vectorEnabled=true;
  await w.connectProfile(w.preferences.profiles.find(p=>p.id==='embed')!);
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){
    yield {type:'delta',text:'正文'};
    yield {type:'done',outcome:{event:'走进教室'}};
  });
  const embed=vi.mocked(HttpGateway.prototype.embed);
  embed.mockClear();
  await w.generate('我走进教室。');
  // 后台记忆整理照常进行（普通剧情记忆仍然建索引），但手机文本一次都不能出现在请求里。
  await vi.waitFor(()=>expect(embed).toHaveBeenCalled());
  await new Promise(done=>setTimeout(done,80));
  expect(embed.mock.calls.filter(([texts])=>texts.some(text=>text.includes(canary)))).toHaveLength(0);
  expect(s.memories.some(m=>isTerminalMemoryNote(m)&&m.text.includes(canary))).toBe(true);
});
