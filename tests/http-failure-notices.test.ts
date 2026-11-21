import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {HttpGateway} from '../src/gateway/http';
import {setHttpFailureSink,type HttpFailure} from '../src/gateway/requestFailure';
import {httpFailureNotice,httpFailureLog} from '../src/app/httpFailureText';
import {dismissNotice,httpNoticeDuration,notices,showNotice} from '../src/app/notices';
import type {Profile} from '../src/domain/contracts';

const profile:Profile={id:'p1',name:'主 API',providerId:'approved-provider',apiBaseUrl:'https://model.example/v1',model:'m',temperature:0.7,maxTokens:1000};
let seen:HttpFailure[]=[];

beforeEach(()=>{seen=[];setHttpFailureSink(f=>{seen.push(f);return undefined;});for(const notice of [...notices])dismissNotice(notice.id);});
afterEach(()=>{vi.restoreAllMocks();setHttpFailureSink(()=>undefined);vi.useRealTimers();});

function jsonResponse(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});}

describe('gateway reports HTTP status without guessing',()=>{
 it('reports a failing bootstrap too, before any session or API settings are available',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('<html>Bad gateway</html>',{status:502}));
  await expect(new HttpGateway().bootstrap()).rejects.toThrow();
  expect(seen).toHaveLength(1);expect(seen[0]).toMatchObject({status:502,task:'连接后台'});
 });
 it('reports a non-JSON gateway error page as the local HTTP status',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('<html>502 Bad Gateway</html>',{status:502,headers:{'Content-Type':'text/html'}}));
  await expect(new HttpGateway().models(profile.apiBaseUrl!, 'k', new AbortController().signal)).rejects.toThrow();
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({status:502,task:'获取模型'});
  expect(seen[0]!.upstreamStatus).toBeUndefined();
  expect(httpFailureNotice(seen[0]!)?.message).toContain('HTTP 502');
  expect(httpFailureNotice(seen[0]!)?.message).toContain('本机后台');
 });
 it('keeps a JSON 400 body code and never promotes it to an upstream status',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(jsonResponse(400,{code:'INVALID_MODEL_PROFILE'}));
  await expect(new HttpGateway().models(profile.apiBaseUrl!, 'k', new AbortController().signal)).rejects.toThrow();
  expect(seen[0]).toMatchObject({status:400,code:'INVALID_MODEL_PROFILE',task:'获取模型'});
  expect(seen[0]!.upstreamStatus).toBeUndefined();
 });
 it('separates a local 200 stream from the upstream status carried inside it',async()=>{
  const body='data: '+JSON.stringify({type:'error',code:'UPSTREAM_FAILED',upstreamStatus:502})+'\n\n';
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(body,{status:200,headers:{'Content-Type':'text/event-stream'}}));
  const gateway=new HttpGateway();
  const run=async()=>{for await(const _ of gateway.generate({} as never,'k',new AbortController().signal)){/* drain */}};
  await expect(run()).rejects.toThrow();
  expect(seen[0]).toMatchObject({status:200,upstreamStatus:502,code:'UPSTREAM_FAILED',task:'剧情生成'});
  expect(httpFailureNotice(seen[0]!)?.message).toContain('上游模型服务');
 });
 it('does not report a user cancellation as an HTTP error',async()=>{
  const controller=new AbortController();
  vi.spyOn(globalThis,'fetch').mockImplementation(()=>Promise.reject(Object.assign(new Error('aborted'),{name:'AbortError'})));
  controller.abort();
  await expect(new HttpGateway().models(profile.apiBaseUrl!,'k',controller.signal)).rejects.toThrow();
  expect(seen).toHaveLength(0);
 });
 it('ignores a status-shaped string that is not a real HTTP status',()=>{
  expect(httpFailureNotice({task:'剧情生成',message:'x',status:200})).toBeUndefined();
  expect(httpFailureNotice({task:'剧情生成',message:'x',status:502,upstreamStatus:200})?.message).toContain('HTTP 502 · 剧情生成 · 本机后台');
  expect(httpFailureNotice({task:'剧情生成',message:'x',upstreamStatus:0 as number})).toBeUndefined();
  expect(httpFailureNotice({task:'剧情生成',message:'x',status:NaN})).toBeUndefined();
 });
 it('keeps the run-log line free of credentials',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(jsonResponse(429,{code:'UPSTREAM_RATE_LIMIT'}));
  await expect(new HttpGateway().models(profile.apiBaseUrl!,'sk-secret',new AbortController().signal)).rejects.toThrow();
  const line=httpFailureLog(seen[0]!);
  expect(line).toContain('429');
  expect(line).not.toContain('sk-secret');
 });
});

describe('top notices',()=>{
 it('dismisses an HTTP error after five seconds and keeps a newer error alive',()=>{
  vi.useFakeTimers();
  expect(httpNoticeDuration).toBe(5000);
  showNotice('HTTP 502 · 剧情生成 · 网关错误',true,httpNoticeDuration,'http:502');
  vi.advanceTimersByTime(4000);
  showNotice('HTTP 400 · 剧情生成 · 请求参数被拒绝',true,httpNoticeDuration,'http:400');
  vi.advanceTimersByTime(1001);
  expect(notices.map(n=>n.key)).toEqual(['http:400']);
 });
 it('re-arms instead of stacking when three channels report the same failure',()=>{
  vi.useFakeTimers();
  showNotice('HTTP 502 · 剧情生成 · 网关错误',true,httpNoticeDuration,'http:502');
  vi.advanceTimersByTime(4000);
  showNotice('HTTP 502 · 剧情生成 · 网关错误',true,httpNoticeDuration,'http:502');
  showNotice('HTTP 502 · 剧情生成 · 网关错误',true,httpNoticeDuration,'http:502');
  expect(notices).toHaveLength(1);
  vi.advanceTimersByTime(4001);
  expect(notices).toHaveLength(1);
  vi.advanceTimersByTime(1000);
  expect(notices).toHaveLength(0);
 });
});
