import {it,expect,vi} from 'vitest';
import {nativeCsrfSession} from '../src/native/csrf';
const expired=()=>new Response('<pre>ForbiddenError: Invalid CSRF token. Please refresh the page and try again.</pre>',{status:403,headers:{'Content-Type':'text/html'}});
it('refreshes an expired native cookie/token and replays a middleware-rejected save exactly once',async()=>{
 let version=1,csrfReads=0,executed=0;const request=vi.fn(async(path:any,init:any)=>{if(path==='/csrf-token'){csrfReads++;return Response.json({token:'token-'+version});}if(new Headers(init.headers).get('X-CSRF-Token')!=='token-'+version)return expired();executed++;return Response.json({ok:true});});
 const session=nativeCsrfSession(request);await session.token();version=2;
 const response=await session.request('/api/plugins/academy-compat/settings/save',{method:'POST',body:'{}'});
 expect(response.ok).toBe(true);expect(executed).toBe(1);expect(csrfReads).toBe(2);expect(request).toHaveBeenCalledTimes(4);
});
it('never retries upstream 503, API-policy 403, or an attested upstream body that imitates the CSRF page',async()=>{
 for(const response of [new Response('busy',{status:503}),new Response('{"error":"API_ORIGIN_NOT_ALLOWED"}',{status:403,headers:{'Content-Type':'application/json'}}),new Response('<pre>ForbiddenError: Invalid CSRF token. Please refresh the page and try again.</pre>',{status:403,headers:{'Content-Type':'text/html','X-Academy-Api-Origin':'https://chosen.example'}})]){
  const request=vi.fn(async(path:any)=>path==='/csrf-token'?Response.json({token:'csrf'}):response);const session=nativeCsrfSession(request);expect(await session.request('/api/backends/chat-completions/generate',{method:'POST',body:'{}'})).toBe(response);expect(request).toHaveBeenCalledTimes(2);
 }
});
it('bounds repeated CSRF rejection and allows a failed token fetch to recover on an explicit retry',async()=>{
 let fail=true;const request=vi.fn(async(path:any)=>{if(path==='/csrf-token'){if(fail)throw Error('offline');return Response.json({token:'csrf'});}return expired();});const session=nativeCsrfSession(request);
 await expect(session.request('/api/settings/get',{method:'POST',body:'{}'})).rejects.toThrow('offline');fail=false;
 const response=await session.request('/api/settings/get',{method:'POST',body:'{}'});expect(response.status).toBe(403);expect(request.mock.calls.filter(([path])=>path==='/api/settings/get')).toHaveLength(2);
});
it('shares concurrent refreshes and keeps cancellation from reaching a native write',async()=>{
 let version=1,reads=0;const request=vi.fn(async(path:any,init:any)=>{if(path==='/csrf-token'){reads++;await new Promise(r=>setTimeout(r,10));return Response.json({token:'token-'+version});}return new Headers(init.headers).get('X-CSRF-Token')==='token-'+version?Response.json({ok:true}):expired();});const session=nativeCsrfSession(request);await session.token();version=2;
 await Promise.all([session.request('/api/settings/get',{method:'POST'}),session.request('/api/settings/get',{method:'POST'})]);expect(reads).toBe(2);
 const controller=new AbortController();controller.abort();const before=request.mock.calls.length;await expect(session.request('/api/settings/get',{method:'POST',signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(request.mock.calls.length).toBe(before);
});
const nativeOrigin=(globalThis as any).process?.env?.NATIVE_STORAGE_TEST_ORIGIN as string|undefined;
it.skipIf(!nativeOrigin)('recovers from a real discarded native session cookie without disabling CSRF or changing data',async()=>{
 const origin=nativeOrigin!;expect(new URL(origin).hostname).toBe('127.0.0.1');const cookies=new Map<string,string>();let reads=0,rejections=0;
 const request:typeof fetch=async(path,init)=>{const headers=new Headers(init?.headers);if(cookies.size)headers.set('Cookie',[...cookies].map(([k,v])=>k+'='+v).join('; '));const response=await fetch(origin+String(path),{...init,headers});for(const item of response.headers.getSetCookie()){const pair=item.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}if(path==='/csrf-token')reads++;else if(response.status===403)rejections++;return response;};
 const session=nativeCsrfSession(request);await session.token();cookies.clear();const response=await session.request('/api/settings/get',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});
 expect(response.status).toBe(200);expect(typeof(await response.json()).settings).toBe('string');expect(reads).toBe(2);expect(rejections).toBe(1);
});
