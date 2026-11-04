/** Hidden native UI is a request engine. The academy repository owns durable writes. */
export function guardNativeWrites(host:Window&typeof globalThis,account?:string){
  const original=host.fetch;
  const send:typeof fetch=(input,init)=>{
    const started=performance.now();
    const url=new URL(typeof input==='string'?input:'href'in input?input.href:input.url,host.location.href);
    const path=url.pathname.replace(/^\/native-engine\//,'/');
    let selected:{origin:string;model:string}|undefined;
    if(url.origin===host.location.origin&&/^\/api\/backends\/chat-completions\/(?:generate|status)$/.test(path)&&typeof init?.body==='string'){
      try{const body=JSON.parse(init.body);if(typeof body.custom_url==='string')selected={origin:new URL(body.custom_url).origin,model:path.endsWith('/generate')?String(body.model||''):''};}catch{}
    }
    return original.call(host,input,init).then(async response=>{
      if(selected&&!response.ok){
        const data=await response.clone().json().catch(()=>undefined),code=data?.error;
        if(['MODEL_KEY_REQUIRED','NATIVE_MODEL_CREDENTIAL_AMBIGUOUS','MODEL_NOT_CONFIGURED'].includes(code))throw Object.assign(Error(code),{code});
      }
      if(response.ok&&selected&&(response.headers.get('X-Academy-Api-Origin')!==selected.origin||response.headers.get('X-Academy-Model')!==encodeURIComponent(selected.model))){
        await response.body?.cancel();throw Object.assign(Error('实际模型接口与所选配置不一致，已停止展示回复；请重新保存 API。'),{code:'NATIVE_MODEL_ROUTE_MISMATCH'});
      }
      if(selected&&response.ok){try{host.parent?.dispatchEvent(new host.CustomEvent('academy:native-transport',{detail:{phase:'response',model:selected.model,apiOrigin:selected.origin,elapsedMs:Math.round(performance.now()-started)}}));}catch{}}
      return response;
    });
  };
  const guarded:typeof fetch=(input,init)=>{
    const url=new URL(typeof input==='string'?input:'href'in input?input.href:input.url,host.location.href);
    const method=String(init?.method||(typeof input==='object'&&'method'in input?input.method:'GET')).toUpperCase();
    const path=url.pathname.replace(/^\/native-engine\//,'/');
    const family=/^\/api\/(?:settings|chats|characters|presets|worldinfo|avatars|secrets|files)(?:\/|$)/.test(path);
    const read=/\/(?:get|all|list|read|find|search|chats|verify|sanitize-filename)$/.test(path)||path==='/api/presets/restore';
    const write=family&&!read;
    if(method!=='GET'&&url.origin===host.location.origin&&write)return Promise.resolve(new host.Response(JSON.stringify({error:'NATIVE_RUNTIME_READONLY'}),{status:409,headers:{'Content-Type':'application/json'}}));
    if(account&&url.origin===host.location.origin&&path.startsWith('/api/')){
      const headers=new Headers(typeof input==='object'&&'headers'in input?input.headers:undefined);new Headers(init?.headers).forEach((value,key)=>headers.set(key,value));headers.set('X-Academy-Account',account);
      return send(input,{...init,headers});
    }
    return send(input,init);
  };
  host.fetch=guarded;return ()=>{if(host.fetch===guarded)host.fetch=original;};
}
