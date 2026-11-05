import {it,expect,vi} from 'vitest';
import {guardNativeWrites} from '../src/native/runtimeGuard';
it('checks the native server route before delivering any model output, without falling back after a mismatch',async()=>{
 let actual='https://wrong.example',cancelled=0;
 const request=vi.fn(async()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'X-Academy-Api-Origin':actual,'X-Academy-Model':encodeURIComponent('chosen-model')}}));
 const host={location:{href:'http://test.invalid/native-engine/',origin:'http://test.invalid'},fetch:request,Response} as unknown as Window&typeof globalThis;
 const release=guardNativeWrites(host,'user-a'),body=JSON.stringify({custom_url:'https://chosen.example/v1',model:'chosen-model'});
 try{
  await expect(host.fetch('/api/backends/chat-completions/generate',{method:'POST',body})).rejects.toThrow('所选配置不一致');expect(cancelled).toBe(1);expect(request).toHaveBeenCalledTimes(1);
  actual='https://chosen.example';const response=await host.fetch('/api/backends/chat-completions/generate',{method:'POST',body});expect(response.ok).toBe(true);await response.body?.cancel();
 }finally{release();}
});
it('distinguishes an attested upstream 503 from an academy 503 and never echoes provider response bodies',async()=>{
 for(const upstream of [true,false]){
  const request=vi.fn(async()=>new Response(JSON.stringify({error:upstream?{message:'synthetic-secret-not-for-display'}:'NATIVE_PRIVATE_COMPILER_PENDING'}),{status:503,headers:{'Content-Type':'application/json',...(upstream?{'X-Academy-Api-Origin':'https://chosen.example'}:{})}}));
  const host={location:{href:'http://test.invalid/native-engine/',origin:'http://test.invalid'},fetch:request,Response} as unknown as Window&typeof globalThis;
  const release=guardNativeWrites(host,'user-a');
  try{await expect(host.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify({custom_url:'https://chosen.example/v1',model:'chosen-model'})})).rejects.toMatchObject({status:503,source:upstream?'upstream':'academy',message:expect.stringContaining(upstream?'模型接口返回 503':'站内请求返回 503')});expect(request).toHaveBeenCalledOnce();}
  finally{release();}
 }
});
it('routes only native editor settings autosaves into the durable draft callback, while other native writes stay blocked',async()=>{
 const request=vi.fn(async()=>Response.json({unexpected:true})),writeDraft=vi.fn(async()=>{});
 const host={location:{href:'http://test.invalid/native-engine/',origin:'http://test.invalid'},fetch:request,Response,__academyDraftSettingsSave:writeDraft} as unknown as Window&typeof globalThis;
 const release=guardNativeWrites(host,'user-a');try{
  expect((await host.fetch('/api/settings/save',{method:'POST',body:'{"mustNotBePersisted":true}'})).status).toBe(200);expect(writeDraft).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
  expect((await host.fetch('/api/presets/save',{method:'POST',body:'{}'})).status).toBe(409);expect(request).not.toHaveBeenCalled();
  writeDraft.mockRejectedValue(Error('disk failed'));expect((await host.fetch('/api/settings/save',{method:'POST',body:'{}'})).status).toBe(409);
 }finally{release();}
});
