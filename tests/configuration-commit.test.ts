import {vi} from 'vitest';
// Keep dormant random-event behavior covered independently of its production availability.
vi.mock('../src/domain/featureAvailability',()=>({randomEventsAvailable:true}));
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {effectScope,nextTick} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {defaults,initialState} from '../src/domain/story';
import type {LocalService,Preferences} from '../src/domain/contracts';

const service:LocalService={runtime:'local-card',dataset:'test-world',name:'测试',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[],capabilities:{continue:true,keyRequired:true,embeddings:true}};
let scope:ReturnType<typeof effectScope>;
let configuration:Preferences|undefined;

const MAIN='https://main.example/v1',DEAD='https://dead.example/v1';

beforeEach(()=>{
  vi.useFakeTimers();configuration=undefined;scope=effectScope();
  vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'readEditorDrafts').mockResolvedValue({});
  vi.spyOn(IndexedDbRepository.prototype,'writeEditorDraft').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'hasInterruptedRestore').mockResolvedValue(false);
  vi.spyOn(IndexedDbRepository.prototype,'readApiCredentials').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'write').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'writeConfiguration').mockImplementation(async preferences=>{configuration=JSON.parse(JSON.stringify(preferences));});
  vi.spyOn(HttpGateway.prototype,'bootstrap').mockImplementation(async function(this:HttpGateway){this.capabilities=service.capabilities;return service;});
  vi.spyOn(HttpGateway.prototype,'newGame').mockResolvedValue({dataset:service.dataset,opening:'迎新',initial:initialState('玩家')});
  vi.spyOn(HttpGateway.prototype,'configure').mockResolvedValue({origin:'https://synthetic.example'});
});
afterEach(()=>{scope.stop();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});

/** Main + one already-saved auxiliary API; only the auxiliary's address is unreachable. */
async function workspaceWithDeadAuxiliary(){
  const w=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(w.loading.value).toBe(false));
  await nextTick();
  const base=defaults(),auxiliary={id:'aux-dead',name:'旧副 API',providerId:'approved-provider',apiBaseUrl:DEAD,model:'dead-model',temperature:0.7,maxTokens:32000};
  Object.assign(w.preferences,base);
  // Let the mode watcher settle before seeding credentials: it clears them on every mode change.
  await nextTick();
  w.preferences.mainProfile='main';
  w.preferences.profiles=[{id:'main',name:'主 API',providerId:'approved-provider',apiBaseUrl:MAIN,model:'main-model',temperature:0.7,maxTokens:32000},auxiliary];
  w.preferences.auxiliaryProfiles=['aux-dead'];w.preferences.auxiliaryProfile='aux-dead';
  w.credentials['main']='main-key';w.credentials['aux-dead']='dead-key';
  // Seed both as previously saved and confirmed; the auxiliary then becomes unreachable.
  await w.commitConfiguration(JSON.parse(JSON.stringify(w.preferences)),{...w.credentials},true);
  vi.mocked(HttpGateway.prototype.configure).mockClear();
  vi.mocked(HttpGateway.prototype.configure).mockImplementation(async(profile:any)=>{
    if(profile.apiBaseUrl!==MAIN)throw new Error('无法连接模型服务，请检查地址及网络。');
    return {origin:'https://main.example'};
  });
  return w;
}

/** Main + one auxiliary API that is stored, has a key in this browser, but was **never confirmed** and is unreachable. */
async function workspaceWithUnconfirmedAuxiliary(){
  const w=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(w.loading.value).toBe(false));
  await nextTick();
  Object.assign(w.preferences,defaults());
  await nextTick();
  w.preferences.mainProfile='main';
  w.preferences.profiles=[{id:'main',name:'主 API',providerId:'approved-provider',apiBaseUrl:MAIN,model:'main-model',temperature:0.7,maxTokens:32000},{id:'aux-dead',name:'旧副 API',providerId:'approved-provider',apiBaseUrl:DEAD,model:'dead-model',temperature:0.7,maxTokens:32000}];
  w.preferences.auxiliaryProfiles=['aux-dead'];w.preferences.auxiliaryProfile='aux-dead';
  w.credentials['main']='main-key';
  // Saved while the auxiliary still had no key, so it is stored without ever being confirmed.
  await w.commitConfiguration(JSON.parse(JSON.stringify(w.preferences)),{...w.credentials},true);
  w.credentials['aux-dead']='dead-key';
  await nextTick();
  vi.mocked(HttpGateway.prototype.configure).mockClear();
  vi.mocked(HttpGateway.prototype.configure).mockImplementation(async(profile:any)=>{
    if(profile.apiBaseUrl!==MAIN)throw new Error('无法连接模型服务，请检查地址及网络。');
    return {origin:'https://main.example'};
  });
  return w;
}

describe('an interface that was never confirmed must not block a save',()=>{
 it('saves the edited main API while the unconfirmed auxiliary is never contacted and never marked ready',async()=>{
  const w=await workspaceWithUnconfirmedAuxiliary();
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.profiles[0].model='main-model-v2';
  await expect(w.commitConfiguration(next,{...w.credentials},true)).resolves.toBeUndefined();
  expect(configuration?.profiles[0].model).toBe('main-model-v2');
  const called=vi.mocked(HttpGateway.prototype.configure).mock.calls.map(call=>(call[0] as {id:string}).id);
  expect(called).toEqual(['main']);
  expect(w.connectionReady(w.preferences.profiles[0])).toBe(true);
  expect(w.connectionReady(w.preferences.profiles[1])).toBe(false);
 });
 it('adds a new API without re-confirming the unconfirmed auxiliary',async()=>{
  const w=await workspaceWithUnconfirmedAuxiliary();
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.profiles.push({id:'aux-new',name:'新副 API',providerId:'approved-provider',apiBaseUrl:'https://new.example/v1',model:'new-model',temperature:0.7,maxTokens:32000});
  next.auxiliaryProfiles=['aux-dead','aux-new'];
  vi.mocked(HttpGateway.prototype.configure).mockResolvedValue({origin:'https://new.example'});
  await expect(w.commitConfiguration(next,{...w.credentials,'aux-new':'new-key'},true)).resolves.toBeUndefined();
  const called=vi.mocked(HttpGateway.prototype.configure).mock.calls.map(call=>(call[0] as {id:string}).id);
  expect(called).toEqual(['aux-new']);
  expect(configuration?.profiles).toHaveLength(3);
 });
 it('confirms nothing at all when only unrelated settings change',async()=>{
  const w=await workspaceWithUnconfirmedAuxiliary();
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.vectorEnabled=false;
  await expect(w.commitConfiguration(next,{...w.credentials},true)).resolves.toBeUndefined();
  expect(vi.mocked(HttpGateway.prototype.configure).mock.calls).toHaveLength(0);
  expect(w.connectionReady(w.preferences.profiles[1])).toBe(false);
 });
});

describe('configuration commits survive unrelated auxiliary APIs',()=>{
 it('saves the edited main API even though an untouched auxiliary API cannot be reached',async()=>{
  const w=await workspaceWithDeadAuxiliary();
  vi.mocked(HttpGateway.prototype.configure).mockResolvedValue({origin:'https://new.example'});
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.profiles[0].model='main-model-v2';
  await expect(w.commitConfiguration(next,{...w.credentials},true)).resolves.toBeUndefined();
  expect(configuration?.profiles[0].model).toBe('main-model-v2');
  expect(configuration?.profiles).toHaveLength(2);
  expect(w.connectionReady(w.preferences.profiles[0])).toBe(true);
  expect(w.problem.value).toBe('');
 });
 it('confirms only the interfaces whose connection inputs changed',async()=>{
  const w=await workspaceWithDeadAuxiliary();
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.profiles[0].model='main-model-v2';
  await w.commitConfiguration(next,{...w.credentials},true);
  const called=vi.mocked(HttpGateway.prototype.configure).mock.calls.map(call=>(call[0] as {id:string}).id);
  expect(called).toEqual(['main']);
  expect(called).not.toContain('aux-dead');
 });
 it('still refuses to report success when the edited interface itself fails to confirm',async()=>{
  const w=await workspaceWithDeadAuxiliary();
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.profiles[0].apiBaseUrl='https://broken.example/v1';
  configuration=undefined;
  await expect(w.commitConfiguration(next,{...w.credentials},true)).rejects.toThrow('主 API');
  expect(configuration).toBeUndefined();
 });
 it('names the offending interface and never writes an API key into the failure text',async()=>{
  const w=await workspaceWithDeadAuxiliary();
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.profiles[0].apiBaseUrl='https://broken.example/v1';
  let failure='';
  await w.commitConfiguration(next,{...w.credentials},true).catch(e=>{failure=e instanceof Error?e.message:String(e);});
  expect(failure).toContain('主 API');
  expect(failure).not.toContain('main-key');
  expect(failure).not.toContain('dead-key');
 });
 it('adds a new auxiliary API without re-confirming the untouched main API',async()=>{
  const w=await workspaceWithDeadAuxiliary();
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.profiles.push({id:'aux-new',name:'新副 API',providerId:'approved-provider',apiBaseUrl:'https://new.example/v1',model:'new-model',temperature:0.7,maxTokens:32000});
  next.auxiliaryProfiles=['aux-dead','aux-new'];
  vi.mocked(HttpGateway.prototype.configure).mockResolvedValue({origin:'https://new.example'});
  await w.commitConfiguration(next,{...w.credentials,'aux-new':'new-key'},true);
  const called=vi.mocked(HttpGateway.prototype.configure).mock.calls.map(call=>(call[0] as {id:string}).id);
  expect(called).toEqual(['aux-new']);
  expect(configuration?.profiles).toHaveLength(3);
 });
 it('fails the save when an interface changes while its confirmation is still in flight',async()=>{
  const w=await workspaceWithDeadAuxiliary();
  let release:(v:{origin:string})=>void;
  vi.mocked(HttpGateway.prototype.configure).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.profiles[0].model='in-flight';
  const pending=w.commitConfiguration(next,{...w.credentials},true);
  const late={...JSON.parse(JSON.stringify(next))};late.profiles[0].model='changed-late';
  Object.assign(w.preferences,late);
  release!({origin:'https://main.example'});
  await expect(pending).rejects.toThrow('已被其他操作修改');
 });
 it('bounds the confirmation so an unreachable address cannot hang the save',async()=>{
  const w=await workspaceWithDeadAuxiliary();
  vi.mocked(HttpGateway.prototype.configure).mockImplementation((_profile:any,signal?:AbortSignal)=>new Promise((_resolve,reject)=>{
    // Faithful stand-in for fetch: an aborted request rejects instead of hanging forever.
    signal?.addEventListener('abort',()=>reject(Object.assign(new Error('已取消'),{name:'AbortError'})));
  }));
  const next=JSON.parse(JSON.stringify(w.preferences));
  next.profiles[0].model='timeout-case';
  const pending=w.commitConfiguration(next,{...w.credentials},true);
  const assertion=expect(pending).rejects.toThrow('确认超时');
  await vi.advanceTimersByTimeAsync(15001);
  await assertion;
 });
});
