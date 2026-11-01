/** Hidden native UI is a request engine. The academy repository owns durable writes. */
export function guardNativeWrites(host:Window&typeof globalThis){
  const original=host.fetch;
  const guarded:typeof fetch=(input,init)=>{
    const url=new URL(typeof input==='string'?input:'href'in input?input.href:input.url,host.location.href);
    const method=String(init?.method||(typeof input==='object'&&'method'in input?input.method:'GET')).toUpperCase();
    const path=url.pathname.replace(/^\/native-engine\//,'/');
    const family=/^\/api\/(?:settings|chats|characters|presets|worldinfo|avatars|secrets|files)(?:\/|$)/.test(path);
    const read=/\/(?:get|all|list|read|find|search|chats|verify|sanitize-filename)$/.test(path)||path==='/api/presets/restore';
    const write=family&&!read;
    if(method!=='GET'&&url.origin===host.location.origin&&write)return Promise.resolve(new host.Response(JSON.stringify({error:'NATIVE_RUNTIME_READONLY'}),{status:409,headers:{'Content-Type':'application/json'}}));
    return original.call(host,input,init);
  };
  host.fetch=guarded;return ()=>{if(host.fetch===guarded)host.fetch=original;};
}
