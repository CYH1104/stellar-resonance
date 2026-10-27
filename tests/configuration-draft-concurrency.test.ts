import {vi} from 'vitest';
vi.mock('../src/domain/featureAvailability',()=>({randomEventsAvailable:true}));
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {effectScope,nextTick} from 'vue';
import {useWorkspace,type ViewModel} from '../src/app/useWorkspace';
import {useConfigurationDraft} from '../src/app/useConfigurationDraft';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {defaults} from '../src/domain/story';
import {attachHttpNotice,reportHttpFailure} from '../src/gateway/requestFailure';
import {httpFailureNotice} from '../src/app/httpFailureText';
import {dismissNotice,notices} from '../src/app/notices';
import type {LocalApiCredentials} from '../src/storage/apiCredentials';
import type {LocalService,Preferences,Profile} from '../src/domain/contracts';

const service:LocalService={runtime:'local-card',dataset:'test-world',name:'测试',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[],capabilities:{continue:true,keyRequired:true,embeddings:true}};
const MAIN='https://main.example/v1',AUX='https://aux.example/v1';
const MAIN_KEY='main-key-value',AUX_KEY='aux-key-value';
let scope:ReturnType<typeof effectScope>;
let configuration:Preferences|undefined;
let credentials:LocalApiCredentials|undefined;

beforeEach(()=>{
  vi.useFakeTimers();scope=effectScope();configuration=undefined;credentials=undefined;
  vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'readEditorDrafts').mockResolvedValue({});
  vi.spyOn(IndexedDbRepository.prototype,'writeEditorDraft').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'hasInterruptedRestore').mockResolvedValue(false);
  vi.spyOn(IndexedDbRepository.prototype,'readApiCredentials').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'write').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'writeConfiguration').mockImplementation(async(preferences,keys)=>{configuration=JSON.parse(JSON.stringify(preferences));credentials=JSON.parse(JSON.stringify(keys));});
  vi.spyOn(HttpGateway.prototype,'bootstrap').mockImplementation(async function(this:HttpGateway){this.capabilities=service.capabilities;return service;});
  vi.spyOn(HttpGateway.prototype,'configure').mockResolvedValue({origin:'https://main.example'});
});
afterEach(()=>{scope.stop();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();for(const notice of [...notices])dismissNotice(notice.id);});

/** Real workspace + real configuration draft; only the gateway and IndexedDB are replaced. */
async function workspaceWithDraft(){
  const w=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(w.loading.value).toBe(false));
  await nextTick();
  Object.assign(w.preferences,defaults());
  await nextTick();
  w.preferences.mainProfile='main';
  w.preferences.profiles=[{id:'main',name:'主 API',providerId:'approved-provider',apiBaseUrl:MAIN,model:'main-model',temperature:0.7,maxTokens:32000},{id:'aux',name:'副 API',providerId:'approved-provider',apiBaseUrl:AUX,model:'aux-model',temperature:0.7,maxTokens:32000}];
  w.preferences.auxiliaryProfiles=['aux'];w.preferences.auxiliaryProfile='aux';
  w.credentials['main']=MAIN_KEY;w.credentials['aux']=AUX_KEY;
  await w.commitConfiguration(JSON.parse(JSON.stringify(w.preferences)),{...w.credentials},true);
  const draft=scope.run(()=>useConfigurationDraft(w as unknown as ViewModel))!;
  await nextTick();
  return {w,draft};
}

describe('a configuration draft survives edits made while it is saving',()=>{
 it('does not clear dirty for edits made after the confirmation started',async()=>{
  const {w,draft}=await workspaceWithDraft();
  const p=draft.view.preferences.profiles[0]!;
  p.model='saved-model';
  let release:(value:{origin:string})=>void;
  vi.mocked(HttpGateway.prototype.configure).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=draft.view.connectProfile(p);
  // The user keeps typing while the confirmation is in flight.
  draft.view.preferences.profiles[0]!.model='typed-while-saving';
  release!({origin:'https://main.example'});
  expect(await pending).toBe(true);
  expect(w.preferences.profiles[0]!.model).toBe('saved-model');
  expect(draft.view.preferences.profiles[0]!.model).toBe('typed-while-saving');
  expect(draft.dirty.value).toBe(true);
 });
 it('keeps a concurrent change to another interface key and to a global setting',async()=>{
  const {w,draft}=await workspaceWithDraft();
  draft.view.preferences.profiles[0]!.model='draft-model';
  let release:(value:{origin:string})=>void;
  vi.mocked(HttpGateway.prototype.configure).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=draft.save();
  // Another operation touches a different interface's key and a global setting while the save is in flight.
  w.credentials['aux']='aux-key-changed-elsewhere';
  const toggled=!w.preferences.vectorEnabled;
  w.preferences.vectorEnabled=toggled;
  release!({origin:'https://main.example'});
  expect(await pending).toBe(true);
  expect(w.credentials['aux']).toBe('aux-key-changed-elsewhere');
  expect(w.preferences.vectorEnabled).toBe(toggled);
  expect(w.preferences.profiles[0]!.model).toBe('draft-model');
 });
 it('keeps every draft value and reports no success when the write fails',async()=>{
  const {w,draft}=await workspaceWithDraft();
  const before=JSON.parse(JSON.stringify(w.preferences));
  vi.mocked(IndexedDbRepository.prototype.writeConfiguration).mockRejectedValueOnce(Error('存储空间不足'));
  w.notice.value='未保存';
  draft.view.preferences.profiles[0]!.model='unsaved-model';
  draft.view.credentials['main']='unsaved-key';
  expect(await draft.save()).toBe(false);
  expect(draft.error.value).toBe('存储空间不足');
  expect(w.preferences).toEqual(before);
  expect(w.credentials['main']).toBe(MAIN_KEY);
  expect(draft.view.preferences.profiles[0]!.model).toBe('unsaved-model');
  expect(draft.view.credentials['main']).toBe('unsaved-key');
  expect(draft.dirty.value).toBe(true);
  expect(w.notice.value).not.toContain('已保存');
  expect(w.storageStatus.value).toBe('failed');
 });
 it('keeps what was saved after a reload and never leaves a key in the failure text',async()=>{
  const {w,draft}=await workspaceWithDraft();
  draft.view.preferences.profiles[0]!.model='reloaded-model';
  expect(await draft.save()).toBe(true);
  expect(configuration?.profiles[0]?.model).toBe('reloaded-model');
  vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue({version:1,sessions:[],preferences:JSON.parse(JSON.stringify(configuration))});
  vi.mocked(IndexedDbRepository.prototype.readApiCredentials).mockResolvedValue(JSON.parse(JSON.stringify(credentials)) as never);
  const other=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(other.loading.value).toBe(false));
  expect(other.preferences.profiles[0]!.model).toBe('reloaded-model');
  expect(other.credentials['main']).toBe(MAIN_KEY);
 });
 it('bounds an unreachable confirmation, keeps the draft and reports failure without leaking the key',async()=>{
  const {w,draft}=await workspaceWithDraft();
  const p=draft.view.preferences.profiles[0]!;
  p.model='timeout-model';
  vi.mocked(HttpGateway.prototype.configure).mockImplementation((_profile:any,signal?:AbortSignal)=>new Promise((_resolve,reject)=>{
    signal?.addEventListener('abort',()=>reject(Object.assign(new Error('已取消'),{name:'AbortError'})));
  }));
  const pending=draft.view.connectProfile(p);
  const assertion=expect(pending).resolves.toBe(false);
  await vi.advanceTimersByTimeAsync(15001);
  await assertion;
  expect(draft.error.value).toContain('确认超时');
  expect(draft.error.value).not.toContain(MAIN_KEY);
  expect(draft.view.preferences.profiles[0]!.model).toBe('timeout-model');
  expect(draft.dirty.value).toBe(true);
  expect(w.preferences.profiles[0]!.model).toBe('main-model');
 });
 it('does not resurrect an interface the draft removed, including after a reload',async()=>{
  const {w,draft}=await workspaceWithDraft();
  draft.view.removeProfile('aux');
  expect(await draft.save()).toBe(true);
  expect(w.preferences.profiles.map(p=>p.id)).toEqual(['main']);
  expect(configuration?.profiles.map(p=>p.id)).toEqual(['main']);
  expect(Object.keys(credentials?.keys||{})).toEqual(['main']);
  vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue({version:1,sessions:[],preferences:JSON.parse(JSON.stringify(configuration))});
  vi.mocked(IndexedDbRepository.prototype.readApiCredentials).mockResolvedValue(JSON.parse(JSON.stringify(credentials)) as never);
  const reloaded=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(reloaded.loading.value).toBe(false));
  expect(reloaded.preferences.profiles.map(p=>p.id)).toEqual(['main']);
  expect(reloaded.preferences.auxiliaryProfiles).toEqual([]);
 });
 it('refuses the save instead of restoring an interface changed after the draft removed it',async()=>{
  const {w,draft}=await workspaceWithDraft();
  draft.view.removeProfile('aux');
  w.preferences.profiles.find(p=>p.id==='aux')!.model='edited-elsewhere';
  expect(await draft.save()).toBe(false);
  expect(draft.error.value).toContain('设置已在其他操作中改变');
  expect(w.preferences.profiles.find(p=>p.id==='aux')!.model).toBe('edited-elsewhere');
  expect(draft.dirty.value).toBe(true);
 });
 it('refuses the save when the interface the draft edited was removed meanwhile',async()=>{
  const {w,draft}=await workspaceWithDraft();
  draft.view.preferences.profiles.find(p=>p.id==='aux')!.model='draft-edit';
  w.preferences.profiles=w.preferences.profiles.filter(p=>p.id!=='aux');
  expect(await draft.save()).toBe(false);
  expect(draft.error.value).toContain('设置已在其他操作中改变');
  expect(w.preferences.profiles.map(p=>p.id)).toEqual(['main']);
 });
 it('keeps typing done while the whole draft is saving and stays dirty for it',async()=>{
  const {w,draft}=await workspaceWithDraft();
  draft.view.preferences.profiles[0]!.model='saved-model';
  let release:(value:{origin:string})=>void;
  vi.mocked(HttpGateway.prototype.configure).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=draft.save();
  // The user keeps editing a different interface and the key while the write is in flight.
  draft.view.preferences.profiles[1]!.model='typed-aux-model';
  draft.view.credentials['main']='typed-while-saving';
  release!({origin:'https://main.example'});
  expect(await pending).toBe(true);
  expect(w.preferences.profiles[0]!.model).toBe('saved-model');
  expect(w.preferences.profiles[1]!.model).toBe('aux-model');
  expect(w.credentials['main']).toBe(MAIN_KEY);
  expect(draft.view.preferences.profiles[1]!.model).toBe('typed-aux-model');
  expect(draft.view.credentials['main']).toBe('typed-while-saving');
  expect(draft.dirty.value).toBe(true);
 });
 it('confirms the interface that asked for it and leaves an unreachable one untouched',async()=>{
  const {draft}=await workspaceWithDraft();
  expect(await draft.save()).toBe(true);
  const savedConfiguration=JSON.parse(JSON.stringify(configuration));
  vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue({version:1,sessions:[],preferences:savedConfiguration});
  // The keys come back without any confirmation record, so this page has to confirm them again when asked.
  vi.mocked(IndexedDbRepository.prototype.readApiCredentials).mockResolvedValue({version:1,remember:true,keys:{main:MAIN_KEY,aux:AUX_KEY},confirmed:{}});
  vi.mocked(HttpGateway.prototype.configure).mockImplementation(async(profile:Profile)=>{if(profile.id==='aux')throw Error('aux is unreachable');return {origin:'https://main.example'};});
  const w=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(w.loading.value).toBe(false));
  const shared=scope.run(()=>useConfigurationDraft(w as unknown as ViewModel))!;
  await nextTick();
  const main=w.preferences.profiles[0]!,aux=w.preferences.profiles[1]!;
  expect(w.connectionReady(main)).toBe(false);expect(w.connectionReady(aux)).toBe(false);
  expect(await shared.view.connectProfile({...main})).toBe(true);
  expect(w.connectionReady(main)).toBe(true);
  expect(w.connectionReady(aux)).toBe(false);
  expect(credentials?.confirmed?.main).toMatchObject({model:'main-model'});
  expect(credentials?.confirmed?.aux).toBeUndefined();
  vi.mocked(IndexedDbRepository.prototype.readApiCredentials).mockResolvedValue(JSON.parse(JSON.stringify(credentials)) as never);
  const reloaded=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(reloaded.loading.value).toBe(false));
  expect(reloaded.connectionReady(reloaded.preferences.profiles[0]!)).toBe(true);
  expect(reloaded.connectionReady(reloaded.preferences.profiles[1]!)).toBe(false);
  expect(reloaded.problem.value).not.toContain(MAIN_KEY);
 });
 it('turns an HTML 502 into one five second notice and one detailed run-log line',async()=>{
  const {w,draft}=await workspaceWithDraft();
  const failure={status:502,task:'接口配置',message:'接口请求失败（502），请重试。'};
  vi.mocked(HttpGateway.prototype.configure).mockRestore();
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('<html>502 Bad Gateway</html>',{status:502,headers:{'Content-Type':'text/html'}}));
  draft.view.preferences.profiles[0]!.model='save-through-real-gateway';
  const logged:string[]=[];
  const owner=w.formatErrors as unknown as {record:(...args:unknown[])=>Promise<unknown>};
  const real=owner.record.bind(owner);
  owner.record=(...args)=>{logged.push(args.map(String).join(' '));return real(...args);};
  expect(await draft.view.connectProfile(draft.view.preferences.profiles[0]!)).toBe(false);
  const canonical=httpFailureNotice(failure)!.message;
  expect(draft.error.value).toBe(canonical);
  expect(draft.error.value).not.toContain('主 API');
  expect(notices).toHaveLength(1);
  expect(notices[0]!.message).toBe(canonical);
  expect(logged.filter(line=>line.includes('HTTP 错误')&&line.includes('502'))).toHaveLength(1);
  expect(logged.some(line=>line.includes('接口配置'))).toBe(true);
  expect(logged.some(line=>line.includes('save-through-real-gateway')&&line.includes('main.example'))).toBe(true);
  vi.advanceTimersByTime(5001);
  expect(notices).toHaveLength(0);
 });
});
