import {reportHttpFailure,attachHttpNotice} from '../gateway/requestFailure';
export class NativeHttpError extends Error {
  constructor(readonly status:number, readonly path:string, readonly code?:string) {
    super(code==='NATIVE_PRIVATE_COMPILER_PENDING'?'私有原生编排正在接入，生成功能暂不可用；已有存档和设置保留。':status===401||status===403||status===302?'原生账号会话已失效，请重新登录；当前输入保留。':code==='integrity'||code==='NATIVE_DATA_CONFLICT'?'原生资料已被其他操作修改，已停止覆盖；请重新载入。':code==='MODEL_RESPONSE_INCOMPLETE'?'回复尚未完整结束，正文已保留，状态未更新；可继续续写或重试。':`原生接口请求失败（${status}），当前资料保留。${code?' 错误类型：'+code:''}`);
    attachHttpNotice(this,reportHttpFailure({status,code,task:'原生接口',message:this.message}));
  }
}
export class NativeApi {
  private request:typeof fetch;
  private chatStamps=new Map<string,string>();
  constructor(private headers:()=>HeadersInit|Promise<HeadersInit>,request:typeof fetch=fetch){
    // Browser fetch needs its Window receiver, unlike Node's implementation.
    this.request=(input,init)=>request.call(globalThis,input,init);
  }
  private async call(path:string, body:unknown, mode:'json'|'text'|'none', signal?:AbortSignal):Promise<any> {
    if(path==='/api/chats/save'){
      const document=body as any,id=JSON.stringify([document.avatar_url,document.file_name]);
      if(!this.chatStamps.has(id))await this.post('/api/chats/get',{avatar_url:document.avatar_url,file_name:document.file_name},signal);
      return this.post('/api/plugins/academy-compat/chats/save',{expected:this.chatStamps.get(id),document},signal);
    }
    const official=/^\/api\/(?:settings|chats|characters|presets|worldinfo|avatars|files|secrets|users|backends)(?:\/|$)/.test(path);
    const compatible=/^\/api\/plugins\/academy-compat\/(?:terminal\/(?:plan|finish|cancel)|tasks\/(?:plan|finish|cancel)|(?:settings|chats)\/save|shares\/(?:create|lookup)|catalog|cards|map|new-game|place|author-books|prepare|vectors)$/.test(path);
    if((!official&&!compatible)||path.includes('..'))throw Error('不支持的原生接口。');
    const headers=new Headers(await this.headers());headers.set('Content-Type','application/json');
    const response=await this.request(path,{method:'POST',credentials:'same-origin',redirect:'manual',headers,body:JSON.stringify(body),signal:signal||AbortSignal.timeout(30000)});
    if(!response.ok){let code:string|undefined;try{const data=await response.json();if(typeof data?.error==='string'&&/^[A-Za-z_]{1,100}$/.test(data.error))code=data.error;}catch{}throw new NativeHttpError(response.type==='opaqueredirect'?302:response.status,path,code);}
    if(mode==='none'||response.status===204)return;
    if(mode==='text')return response.text();
    if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('原生接口未返回预期资料，已停止操作。');
    const value=await response.json();if(path==='/api/chats/get'){const b=body as any;this.chatStamps.set(JSON.stringify([b.avatar_url,b.file_name]),JSON.stringify(value));}return value;
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
