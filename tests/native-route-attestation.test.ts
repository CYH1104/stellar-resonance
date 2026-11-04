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
