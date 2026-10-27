import {vi} from 'vitest';
vi.mock('../src/domain/featureAvailability',()=>({randomEventsAvailable:true}));
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {effectScope,nextTick} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {reportHttpFailure} from '../src/gateway/requestFailure';
import {clearHttpNotices,dismissNotice,httpNoticeDuration,notices,publishNotice} from '../src/app/notices';
import type {LocalService} from '../src/domain/contracts';

const service:LocalService={runtime:'local-card',dataset:'test-world',name:'测试',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[],capabilities:{continue:true,keyRequired:true,embeddings:true}};
const SECRET='MainKey-7Q2X-PrivateValue99';
let scope:ReturnType<typeof effectScope>;

function clearNotices(){for(const notice of [...notices])dismissNotice(notice.id);}

beforeEach(()=>{
  vi.useFakeTimers();scope=effectScope();
  vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'readEditorDrafts').mockResolvedValue({});
  vi.spyOn(IndexedDbRepository.prototype,'writeEditorDraft').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'hasInterruptedRestore').mockResolvedValue(false);
  vi.spyOn(IndexedDbRepository.prototype,'readApiCredentials').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'write').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'writeConfiguration').mockResolvedValue();
  vi.spyOn(HttpGateway.prototype,'bootstrap').mockImplementation(async function(this:HttpGateway){this.capabilities=service.capabilities;return service;});
  clearNotices();clearHttpNotices();
});
afterEach(()=>{scope.stop();clearHttpNotices();clearNotices();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});

/** A real workspace: the HTTP gateway talks to a stubbed fetch and failures reach the top bar through the sink. */
async function workspaceWithSecretKey(){
  const w=scope.run(()=>useWorkspace())!;
  await vi.waitFor(()=>expect(w.loading.value).toBe(false));
  await nextTick();
  w.preferences.profiles=[{id:'main',name:'主 API',providerId:'approved-provider',apiBaseUrl:'https://model.example/v1',model:'m',temperature:0.7,maxTokens:32000}];
  w.preferences.mainProfile='main';
  w.credentials['main']=SECRET;
  await nextTick();
  clearNotices();
  return w;
}
const html502=()=>new Response('<html><body>502 Bad Gateway</body></html>',{status:502,headers:{'Content-Type':'text/html'}});

describe('one HTTP failure is one five second toast',()=>{
 it('does not extend or resurrect an old HTTP failure when its panel mounts later',async()=>{
  const w=await workspaceWithSecretKey();
  vi.spyOn(globalThis,'fetch').mockResolvedValue(html502());
  await w.loadPlace('place-1');
  vi.advanceTimersByTime(4000);publishNotice(w.problem.value,true);
  vi.advanceTimersByTime(1001);expect(notices).toHaveLength(0);
  publishNotice(w.problem.value,true);expect(notices).toHaveLength(0);
  await w.loadPlace('place-2');expect(notices).toHaveLength(1);
 });
 it('shows exactly one notice for a real gateway failure and the component channel does not add a second',async()=>{
  const w=await workspaceWithSecretKey();
  vi.spyOn(globalThis,'fetch').mockResolvedValue(html502());
  await w.loadPlace('place-1');
  expect(notices).toHaveLength(1);
  expect(notices[0]!.message).toContain('HTTP 502');
  expect(notices[0]!.message).toContain('本机后台');
  // The workspace keeps the canonical text in `problem`, which is exactly what DismissibleNotice publishes.
  expect(w.problem.value).toBe(notices[0]!.message);
  publishNotice(w.problem.value,true);
  expect(notices).toHaveLength(1);
  vi.advanceTimersByTime(httpNoticeDuration-1);
  expect(notices).toHaveLength(1);
  vi.advanceTimersByTime(2);
  expect(notices).toHaveLength(0);
 });
 it('keeps warning on a later request with the same error instead of muting it forever',async()=>{
  const w=await workspaceWithSecretKey();
  const spy=vi.spyOn(globalThis,'fetch').mockResolvedValue(html502());
  await w.loadPlace('place-1');
  vi.advanceTimersByTime(httpNoticeDuration+1);
  expect(notices).toHaveLength(0);
  spy.mockResolvedValue(html502());
  await w.loadPlace('place-2');
  expect(notices).toHaveLength(1);
  expect(notices[0]!.message).toContain('HTTP 502');
 });
 it('never shows a toast when the user cancels',async()=>{
  const w=await workspaceWithSecretKey();
  const controller=new AbortController();controller.abort();
  vi.spyOn(globalThis,'fetch').mockImplementation(()=>Promise.reject(Object.assign(new Error('aborted'),{name:'AbortError'})));
  await expect(w.fetchModels(w.preferences.profiles[0]!,controller.signal)).rejects.toThrow();
  expect(notices).toHaveLength(0);
 });
 it('redacts a raw code, message and task that carry credentials before logging or showing them',async()=>{
  const w=await workspaceWithSecretKey();
  const record=vi.spyOn(w.formatErrors,'record');
  reportHttpFailure({status:502,task:`接口配置 ${SECRET}`,code:SECRET,message:`调用 https://api.example/v1?token=${SECRET} 失败 Bearer ${SECRET}`});
  expect(record).toHaveBeenCalled();
  const [line,code]=record.mock.calls.at(-1)!;
  expect(String(line)).toContain('502');
  expect(String(line)).not.toContain(SECRET);
  expect(String(code)).not.toContain(SECRET);
  expect(notices).toHaveLength(1);
  expect(notices[0]!.message).not.toContain(SECRET);
  expect(notices[0]!.message).not.toContain('token=');
 });
});
