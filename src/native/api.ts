export class NativeHttpError extends Error {
  constructor(readonly status:number, readonly path:string, readonly code?:string) {
    super(status===401||status===403||status===302?'原生账号会话已失效，请重新登录；当前输入保留。':code==='integrity'?'原生聊天已被其他操作修改，已停止覆盖；请重新载入。':`原生接口请求失败（${status}），当前资料保留。`);
  }
}
export class NativeApi {
  constructor(private headers:()=>HeadersInit|Promise<HeadersInit>, private request:typeof fetch=fetch){}
  private async call(path:string, body:unknown, mode:'json'|'text'|'none', signal?:AbortSignal):Promise<any> {
    if(!/^\/api\/(?:settings|chats|characters|presets|worldinfo|avatars|files|secrets|users|backends)(?:\/|$)/.test(path)||path.includes('..'))throw Error('不支持的原生接口。');
    const headers=new Headers(await this.headers());headers.set('Content-Type','application/json');
    const response=await this.request(path,{method:'POST',credentials:'same-origin',redirect:'manual',headers,body:JSON.stringify(body),signal:signal||AbortSignal.timeout(30000)});
    if(!response.ok){let code:string|undefined;try{const data=await response.json();if(data?.error==='integrity')code='integrity';}catch{}throw new NativeHttpError(response.type==='opaqueredirect'?302:response.status,path,code);}
    if(mode==='none'||response.status===204)return;
    if(mode==='text')return response.text();
    if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('原生接口未返回预期资料，已停止操作。');
    return response.json();
  }
  post<T=any>(path:string,body:unknown,signal?:AbortSignal):Promise<T>{return this.call(path,body,'json',signal);}
  text(path:string,body:unknown,signal?:AbortSignal):Promise<string>{return this.call(path,body,'text',signal);}
  async empty(path:string,body:unknown,signal?:AbortSignal):Promise<void>{await this.call(path,body,'none',signal);}
  async form<T=any>(path:string,body:FormData):Promise<T>{
    if(path!=='/api/avatars/upload')throw Error('不支持的原生上传接口。');
    const headers=new Headers(await this.headers());headers.delete('Content-Type');
    const response=await this.request(path,{method:'POST',credentials:'same-origin',redirect:'manual',headers,body,signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new NativeHttpError(response.type==='opaqueredirect'?302:response.status,path);
    if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('原生上传未返回确认资料。');
    return response.json();
  }
  async blob(path:string):Promise<Blob>{
    const normalized='/'+path.replace(/^\//,'');
    if(!/^\/(?:user\/files\/[^/]+|User(?: |%20)Avatars\/[^/]+|img\/user-default\.png)$/.test(normalized)||normalized.includes('..')||/[?#\\]/.test(normalized)||/%(?:2f|5c|2e)/i.test(normalized))throw Error('原生资源地址不正确。');
    const response=await this.request(normalized,{credentials:'same-origin',redirect:'manual',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new NativeHttpError(response.type==='opaqueredirect'?302:response.status,normalized);
    return response.blob();
  }
}

export function sessionNativeApi(request:typeof fetch=fetch) {
  let token:Promise<string>|undefined;
  return new NativeApi(async()=>{
    token??=(async()=>{const r=await request('/csrf-token',{credentials:'same-origin',redirect:'manual'});if(!r.ok)throw new NativeHttpError(r.status,'/csrf-token');const value=await r.json();if(typeof value.token!=='string')throw Error('原生会话令牌未准备好。');return value.token;})();
    return {'X-CSRF-Token':await token};
  },request);
}

export async function uploadNativeBlob(api:NativeApi,blob:Blob,name:string):Promise<string>{
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
  for(let n=0;n<bytes.length;n+=32768)binary+=String.fromCharCode(...bytes.subarray(n,n+32768));
  const result=await api.post('/api/files/upload',{name,data:btoa(binary)});
  if(typeof result?.path!=='string'||!/^\/?user\/files\//.test(result.path))throw Error('原生资源未确认保存，原资料保留。');
  return result.path;
}
