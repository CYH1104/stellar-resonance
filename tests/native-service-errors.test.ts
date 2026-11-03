import {it,expect,vi} from 'vitest';
import {NativeApi,NativeHttpError} from '../src/native/api';
it('checks a native API configuration against the server policy and keeps policy denials distinct from logout',async()=>{
 const request=vi.fn(async()=>new Response(JSON.stringify({error:'API_ORIGIN_NOT_ALLOWED'}),{status:403,headers:{'Content-Type':'application/json'}}));
 const api=new NativeApi(()=>({}),request);
 await expect(api.post('/api/plugins/academy-compat/model-service',{apiBaseUrl:'https://not-approved.invalid'})).rejects.toThrow('服务白名单');
 expect(request).toHaveBeenCalledTimes(1);
 expect(new NativeHttpError(403,'/api/plugins/academy-compat/vectors','NATIVE_EMBEDDING_FAILED').message).not.toContain('登录');
 expect(new NativeHttpError(401,'/api/settings/get').message).toContain('登录');
});
