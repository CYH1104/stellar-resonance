import {expect,it,vi} from 'vitest';
import {requestCloudBackup} from '../src/gateway/cloudBackup';
import {defaults,newSession} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
const config={provider:'gitee',repository:'backups',token:'synthetic-private-token',action:'upload',file:'stellar-workspace-backup.json'};
const text=createCloudSave(newSession('完整备份',{name:'测试',appearance:'',personality:'',background:''},'剧情'),defaults());
it('direct failure stays direct and records the failing step instead of silently forwarding credentials to the server',async()=>{
 const fetcher=vi.fn(async(url:any,init:any)=>{if(String(url).endsWith('/user'))return Response.json({login:'tester'});if(String(url).includes('/contents/')){if(init.method==='GET')return Response.json({type:'file',sha:'a'.repeat(40)});throw TypeError('Failed to fetch');}return Response.json({private:true,default_branch:'main'});});
 await expect(requestCloudBackup({...config,text},'direct',new AbortController().signal,fetcher)).rejects.toMatchObject({code:'CLOUD_CONNECTION_FAILED',cloudStep:'更新备份文件'});expect(fetcher.mock.calls.every(([url])=>String(url).startsWith('https://gitee.com/'))).toBe(true);
});
it('explicit relay uses only the same-origin authenticated endpoint and preserves the complete payload',async()=>{
 const fetcher=vi.fn(async(url,init)=>{expect(url).toBe('/api/cloud-backup');expect(init).toMatchObject({mode:'same-origin',credentials:'same-origin',redirect:'error'});expect(JSON.parse(String(init!.body))).toEqual({...config,text});return Response.json({file:config.file});});
 expect(await requestCloudBackup({...config,text},'server',new AbortController().signal,fetcher)).toEqual({file:config.file});expect(fetcher).toHaveBeenCalledTimes(1);expect(parseCloudSave(JSON.parse(String(fetcher.mock.calls[0][1]!.body)).text).snapshot.sessions[0].opening).toBe('剧情');
});
it('relay failure is bounded and redacted and never retried as another write',async()=>{
 const fetcher=vi.fn(async()=>Response.json({code:'CLOUD_PERMISSION_DENIED',upstreamStatus:403,cloudDetail:'Denied '+config.token,cloudStep:'更新文件'},{status:403}));
 try{await requestCloudBackup(config,'server',new AbortController().signal,fetcher);throw Error('Should reject');}catch(e:any){expect(e.code).toBe('CLOUD_PERMISSION_DENIED');expect(e.upstreamStatus).toBe(403);expect(e.cloudDetail).not.toContain(config.token);expect(e.cloudStep).toBe('更新文件');}expect(fetcher).toHaveBeenCalledTimes(1);
});
it('expired sessions and relay request limits have distinct messages; cancellation never retries or returns success',async()=>{
 for(const [status,code]of [[401,'CLOUD_RELAY_SESSION_REQUIRED'],[413,'CLOUD_RELAY_TOO_LARGE']] as const)await expect(requestCloudBackup(config,'server',new AbortController().signal,async()=>Response.json({code:'REQUEST_FAILED'},{status}))).rejects.toMatchObject({code});
 const controller=new AbortController(),fetcher=vi.fn(async()=>{controller.abort();throw controller.signal.reason;});await expect(requestCloudBackup(config,'server',controller.signal,fetcher)).rejects.toMatchObject({name:'AbortError'});expect(fetcher).toHaveBeenCalledTimes(1);
});
it('late relay replies after cancellation cannot restore a downloaded backup',async()=>{
 const controller=new AbortController();let finish!:(r:Response)=>void;const pending=requestCloudBackup({...config,action:'download'},'server',controller.signal,async()=>new Promise(r=>finish=r));controller.abort();finish(Response.json({text}));await expect(pending).rejects.toMatchObject({name:'AbortError'});
});
