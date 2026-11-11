import {expect,it,vi} from 'vitest';
import {requestCloudBackup} from '../src/gateway/cloudBackup';
import {defaults,newSession} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
const config={provider:'gitee',repository:'backups',token:'synthetic-private-token',action:'upload',file:'stellar-workspace-backup.json'};
const text=createCloudSave(newSession('完整备份',{name:'测试',appearance:'',personality:'',background:''},'剧情'),defaults());
const encode=(s:string)=>btoa(Array.from(new TextEncoder().encode(s),b=>String.fromCharCode(b)).join(''));
const decode=(s:string)=>new TextDecoder().decode(Uint8Array.from(atob(s),c=>c.charCodeAt(0)));
function platform({commit=false,oldText='',blockReadback=false}:{commit?:boolean;oldText?:string;blockReadback?:boolean}={}){
 let stored=oldText,writes=0;
 const fetcher=vi.fn(async(url:any,init:any)=>{
  expect(String(url)).toMatch(/^https:\/\/gitee\.com\//);expect(init.credentials).toBe('omit');expect(init.mode).toBe('cors');expect(String(url)).not.toContain(config.token);
  if(String(url).endsWith('/user'))return Response.json({login:'tester'});
  if(String(url).includes('/contents/')){
   if(init.method==='GET'){expect(init.cache).toBe('no-store');if(blockReadback&&writes)throw TypeError('Blocked readback');return stored?Response.json({type:'file',sha:'a'.repeat(40),size:stored.length,content:encode(stored)}):Response.json({},{status:404});}
   writes++;if(commit)stored=decode(new URLSearchParams(init.body).get('content')!);throw TypeError('Failed to fetch');
  }
  return Response.json({private:true,default_branch:'main'});
 });return {fetcher,writes:()=>writes};
}
it('confirms a committed upload by exact readback after its write response is blocked, without a second write or relay',async()=>{
 const p=platform({commit:true});const r=await requestCloudBackup({...config,text},new AbortController().signal,p.fetcher);expect(r.verifiedAfterNetworkError).toBe(true);expect(parseCloudSave(r.text)).toEqual(parseCloudSave(text));expect(p.writes()).toBe(1);
});
it('a different old backup cannot turn a failed new upload into success',async()=>{
 const old=createCloudSave(newSession('旧数据',{name:'旧玩家',appearance:'',personality:'',background:''},''),defaults()),p=platform({oldText:old});
 await expect(requestCloudBackup({...config,text},new AbortController().signal,p.fetcher)).rejects.toMatchObject({code:'CLOUD_CONNECTION_FAILED',cloudStep:'更新备份文件'});expect(p.writes()).toBe(1);
});
it('an unverifiable or absent upload remains failed and reports safe step/size diagnostics',async()=>{
 for(const blockReadback of [false,true]){const p=platform({commit:blockReadback,blockReadback});try{await requestCloudBackup({...config,text},new AbortController().signal,p.fetcher);throw Error('Should reject');}catch(e:any){expect(e.code).toBe('CLOUD_CONNECTION_FAILED');expect(e.cloudDetail).toContain('尚未确认');expect(e.cloudDetail).toContain('MB');expect(JSON.stringify(e)).not.toContain(config.token);}expect(p.writes()).toBe(1);}
});
it('aborting during upload prevents confirmation and never falls back to another transport',async()=>{
 const controller=new AbortController();const p=platform();const uploadFetch:typeof fetch=async(input,init)=>{if(init?.method==='POST'){controller.abort();throw controller.signal.reason;}return p.fetcher(input,init);};
 await expect(requestCloudBackup({...config,text},controller.signal,uploadFetch)).rejects.toMatchObject({name:'AbortError'});
});
it('a late download after cancellation cannot be used to restore local data',async()=>{
 const controller=new AbortController();let finish!:(r:Response)=>void;
 const fetcher:typeof fetch=async(url)=>{expect(String(url)).toMatch(/^https:\/\/gitee\.com\//);if(String(url).endsWith('/user'))return Response.json({login:'tester'});if(String(url).includes('/contents/'))return new Promise(r=>finish=r);return Response.json({private:true,default_branch:'main'});};
 const pending=requestCloudBackup({...config,action:'download'},controller.signal,fetcher);while(!finish)await new Promise(r=>setTimeout(r,0));controller.abort();finish(Response.json({type:'file',sha:'a'.repeat(40),content:encode(text)}));await expect(pending).rejects.toMatchObject({name:'AbortError'});
});
