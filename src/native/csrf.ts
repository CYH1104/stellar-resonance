/** Refresh only an explicitly rejected native CSRF request; never replay provider failures. */
export function nativeCsrfSession(request:typeof fetch,updated?:(token:string)=>void){
 let token:Promise<string>|undefined,refreshing:Promise<string>|undefined;
 const send:typeof fetch=(input,init)=>request.call(globalThis,input,init);
 const current=()=>token??=(async()=>{try{const response=await send('/csrf-token',{credentials:'same-origin',redirect:'manual',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('原生会话令牌读取失败（'+response.status+'），请重新登录。');const value=await response.json();if(typeof value.token!=='string')throw Error('原生会话令牌未准备好。');updated?.(value.token);return value.token;}catch(error){token=undefined;throw error;}})();
 async function refresh(){return refreshing??=(async()=>{token=undefined;try{return await current();}finally{refreshing=undefined;}})();}
 const guarded:typeof fetch=async(input,init)=>{
  const path=typeof input==='string'?input:'href'in input?input.href:input.url;
  const base=(globalThis as any).location?.href||'http://native.invalid/',url=new URL(path,base);
  const native=url.origin===new URL(base).origin&&/^\/(?:native-engine\/)?api\//.test(url.pathname),method=String(init?.method||(typeof input==='object'&&'method'in input?input.method:'GET')).toUpperCase();
  if(!native||['GET','HEAD','OPTIONS'].includes(method))return send(input,init);
  const headers=new Headers(typeof input==='object'&&'headers'in input?input.headers:undefined);new Headers(init?.headers).forEach((v,k)=>headers.set(k,v));
  const used=await current();headers.set('X-CSRF-Token',used);init?.signal?.throwIfAborted();
  const once=()=>send(typeof input==='object'&&'clone'in input?input.clone():input,{...init,headers});
  const response=await once();
  if(response.status!==403||response.headers.has('X-Academy-Api-Origin')||!response.headers.get('Content-Type')?.includes('text/html'))return response;
  const text=(await response.clone().text()).replace(/\u001b\[[0-9;]*m/g,'');if(!text.includes('ForbiddenError: Invalid CSRF token. Please refresh the page and try again.'))return response;
  // Middleware rejected this request before the handler. A single replay is safe.
  if(await current()===used)await refresh();headers.set('X-CSRF-Token',await current());init?.signal?.throwIfAborted();return once();
 };
 return {request:guarded,token:current,refresh};
}

/** The private native tokenizer uses jQuery as well as fetch. */
export function installNativeCsrf(host:Window&typeof globalThis){
 const original=host.fetch;
 // Capture the original receiver, rather than recursively calling the wrapper.
 let value='',installed=false;
 const bound=nativeCsrfSession((input,init)=>original.call(host,input,init),token=>value=token);host.fetch=bound.request;
 return {async refresh(){await bound.refresh();if(!installed){const jq=(host as any).jQuery||(host as any).$;if(jq?.ajaxPrefilter){jq.ajaxPrefilter((_options:any,_original:any,xhr:any)=>{if(value)xhr.setRequestHeader('X-CSRF-Token',value);});installed=true;}}return value;},dispose(){if(host.fetch===bound.request)host.fetch=original;value='';}};
}
