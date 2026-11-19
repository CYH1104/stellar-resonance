import {afterEach,expect,it,vi} from 'vitest';
import {HttpGateway} from '../src/gateway/http';
import {modelRequestContext,modelRequestFailure} from '../src/gateway/requestFailure';
import {defaults,initialState} from '../src/domain/story';
import type {GenerateRequest} from '../src/domain/contracts';
import {MODEL_REQUEST_TIMEOUT_MS} from '../src/domain/requestTimeout';
afterEach(()=>vi.unstubAllGlobals());
const profile=()=>({...defaults().profiles[0],model:'actual-embedding-model',apiBaseUrl:'https://relay.example:8443/v1?key=synthetic-secret'});
it('identifies the actual auxiliary model and port without URL credentials or keys',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({code:'MODEL_TIMEOUT',detail:'synthetic-secret'}),{status:504}));
 const p=profile();let text='';try{await new HttpGateway().embed(['test'],p,'synthetic-secret',new AbortController().signal);}catch(e){text=(e as Error).message;}
 expect(text).toContain('模型：actual-embedding-model');expect(text).toContain('任务：向量模型');expect(text).toContain('接口：https://relay.example:8443');expect(text).not.toContain('端口：');expect(text).toContain('10 分钟');expect(text).not.toContain('synthetic-secret');
});
it('captures the failing model before edits and supplies the default HTTPS port',async()=>{
 const p={...profile(),apiBaseUrl:'https://user:synthetic-secret@relay.example/v1'};
 let release!:(response:Response)=>void;
 vi.stubGlobal('fetch',()=>new Promise<Response>(resolve=>{release=resolve;}));
 const result=new HttpGateway().probe(p,'synthetic-secret','text',new AbortController().signal).catch(e=>(e as Error).message);
 p.model='later-edited-model';p.apiBaseUrl='https://new.example';release(new Response('{}',{status:502}));const text=await result;
 expect(text).toContain('actual-embedding-model');expect(text).not.toContain('端口：');expect(text).toContain('relay.example');expect(text).not.toMatch(/later-edited|new.example|synthetic-secret|user:/);
});
it('includes source context for SSE failures and interruptions',async()=>{
 const request={sessionId:'s',turnId:'t',persona:{name:'玩家'},state:initialState('玩家'),profile:profile()} as GenerateRequest;
 for(const stream of ['data: {"type":"error","code":"MODEL_TIMEOUT"}\n\n','data: {"type":"delta","text":"保留正文"}\n\n']){
 vi.stubGlobal('fetch',async()=>new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
 const run=async()=>{for await(const _ of new HttpGateway().generate(request,'synthetic-secret',new AbortController().signal)){/* consume */}};
 await expect(run()).rejects.toThrow('模型：actual-embedding-model');
 }
});
it('keeps terminal provider raw output available for run logs after a safe failure',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({code:'INVALID_TERMINAL_RESULT',raw:'{"bad":true}'}),{status:502}));
 let failure:Error&{raw?:string}|undefined;
 try{await new HttpGateway().terminal({task:'chat',actorIds:['a'],input:'你好',persona:{name:'玩家'},context:{}} ,profile(),'synthetic-secret',new AbortController().signal);}catch(e){failure=e as Error&{raw?:string};}
 expect(failure?.message).toContain('角色回复格式未通过检查');expect(failure?.raw).toBe('{"bad":true}');expect(failure?.message).not.toContain('"bad"');
});
it('keeps manual cancellation distinct and refreshes the ten-minute deadline per request',()=>{
 expect(MODEL_REQUEST_TIMEOUT_MS).toBe(600000);
 const context=modelRequestContext({profile:profile()},'generate'),error=new DOMException('取消','AbortError');
 expect(modelRequestFailure(error,context,100)).toBe(error);
 expect((modelRequestFailure(new DOMException('timeout','TimeoutError'),context,600000) as Error).message).toContain('已等待：600.0 秒');
});
