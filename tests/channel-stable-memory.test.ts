// 稳定通道的手机数据门控：旧存档里的手机私聊可以保留，但它的文本不能成为向量模型的输入。
// 这里用真实的 useWorkspace 与真实的索引入口，只替换网关调用，观察实际发出的 embedding 请求。
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
import type {LocalService} from '../src/domain/contracts';

const CANARY='PHONE_ONLY_CANARY_20261026';
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
/** 旧存档：手机私聊记录与派生记忆都在，只是通道可能已经换成稳定版。 */
async function seededArchive(){
  const w=await workspace(),s=w.active.value!;
  s.terminal=emptyTerminal();
  recordTerminalChat(s.terminal,terminalAnchor(s),{id:'legacy-phone',title:'旧私聊',group:false},['玩家','甲'],CANARY,[],['player','a']);
  syncTerminalMemoryNotes(s);
  expect(s.memories.some(isTerminalMemoryNote)).toBe(true);
  w.preferences.vectorEnabled=true;
  await w.connectProfile(w.preferences.profiles.find(p=>p.id==='embed')!);
  return w;
}
const canaryRequests=()=>vi.mocked(HttpGateway.prototype.embed).mock.calls.filter(([texts])=>texts.some(text=>text.includes(CANARY)));

it('stable keeps legacy phone records but never sends their text to the embedding model',async()=>{
  capabilities={continue:true,keyRequired:true,embeddings:true,terminal:false,channel:'stable'};
  const w=await seededArchive(),s=w.active.value!;
  expect(w.terminalEnabled.value).toBe(false);
  const before=s.memories.filter(isTerminalMemoryNote).map(m=>({id:m.id,text:m.text}));
  vi.mocked(HttpGateway.prototype.embed).mockClear();
  w.indexTerminalNotes();
  await new Promise(done=>setTimeout(done,80));
  expect(canaryRequests()).toHaveLength(0);
  // 旧记录原样保留，没有被删除也没有被清空
  expect(s.memories.filter(isTerminalMemoryNote).map(m=>({id:m.id,text:m.text}))).toEqual(before);
  expect(JSON.stringify(s.terminal)).toContain(CANARY);
  // 手机专用召回入口同样关闭
  await expect(w.scopedRecall(s,'旧私聊',['player','a'])).resolves.toEqual([]);
});

it('the test channel still indexes the same legacy phone note, proving the gate is channel-specific',async()=>{
  capabilities={continue:true,keyRequired:true,embeddings:true,terminal:true,channel:'test'};
  const w=await seededArchive();
  expect(w.terminalCapability.value).toBe(true);
  vi.mocked(HttpGateway.prototype.embed).mockClear();
  w.indexTerminalNotes();
  await vi.waitFor(()=>expect(canaryRequests().length).toBeGreaterThan(0));
  await expect(w.scopedRecall(w.active.value!,'旧私聊',['player','a'])).resolves.toBeDefined();
});
