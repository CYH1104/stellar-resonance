(()=>{
  const account=window.__ACADEMY_ACCOUNT__;if(!account?.id)return;
  const original=window.fetch.bind(window),controller=new AbortController();let blocked=false,bar,channel;
  function showLocked(){if(bar&&!bar.querySelector('a')){bar.querySelector('[data-state]').textContent='账号已退出或切换，当前页面已停止读写；未提交的输入保留在此页。';bar.querySelector('[data-logout]').hidden=true;const link=document.createElement('a');link.href='/login';link.textContent='重新登录';bar.append(link);}}
  function lock(){if(blocked)return;blocked=true;controller.abort();showLocked();}
  window.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
    if(url.origin!==location.origin||!/^\/(?:native-engine\/)?api\//.test(url.pathname))return original(input,init);
    if(blocked)throw Error('账号已切换，请重新登录；当前输入保留。');
    const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(init?.headers).forEach((value,key)=>headers.set(key,value));headers.set('X-Academy-Account',account.id);
    const signal=AbortSignal.any([controller.signal,...(init?.signal?[init.signal]:input instanceof Request?[input.signal]:[])]);
    const response=await original(input,{...init,headers,signal});
    if(response.status===409){const value=await response.clone().json().catch(()=>null);if(value?.error==='NATIVE_ACCOUNT_CHANGED')lock();}
    return response;
  };
  try{channel=new BroadcastChannel('academy-native-account');channel.onmessage=()=>lock();}catch{}
  addEventListener('pageshow',event=>{if(event.persisted&&!blocked)void window.fetch('/api/users/me',{cache:'no-store'}).catch(()=>{});});
  function mount(){
    bar=document.createElement('div');bar.setAttribute('aria-label','当前账号');bar.style.cssText='position:fixed;right:8px;bottom:8px;z-index:2147483647;visibility:visible;display:flex;align-items:center;flex-wrap:wrap;gap:8px;max-width:calc(100vw - 16px);border:1px solid var(--line,#d4c8b7);border-radius:6px;background:var(--paper,#fffaf2);color:var(--muted,#73869a);font:12px/1.5 Georgia,serif;padding:5px 9px';
    const text=document.createElement('span');text.dataset.state='';text.textContent='账号：'+account.id;bar.append(text);
    const button=document.createElement('button');button.type='button';button.dataset.logout='';button.textContent='退出登录';button.style.cssText='border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:4px 6px';
    button.onclick=async()=>{button.disabled=true;try{const csrf=await(await original('/csrf-token',{credentials:'same-origin',cache:'no-store'})).json();const result=await original('/api/users/logout',{method:'POST',headers:{'X-CSRF-Token':csrf.token,'Content-Type':'application/json'},body:'{}',credentials:'same-origin'});if(!result.ok)throw Error();lock();channel?.postMessage({type:'changed'});location.replace('/login?noauto=1');}catch{button.disabled=false;button.textContent='退出失败，点击重试';}};bar.append(button);document.body.append(bar);if(blocked)showLocked();
    // Invite creation remains restricted to native administrators.
    void window.fetch('/api/users/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(user=>{if(!user?.admin||blocked)return;const invite=document.createElement('button');invite.type='button';invite.textContent='生成邀请码';invite.style.cssText=button.style.cssText;invite.onclick=async()=>{invite.disabled=true;try{const csrf=await(await original('/csrf-token',{cache:'no-store'})).json();const result=await window.fetch('/api/plugins/academy-compat/accounts/invites/create',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf.token},body:'{}'});if(!result.ok)throw Error();const value=await result.json();const field=document.createElement('input');field.readOnly=true;field.value=value.code;field.setAttribute('aria-label','新生成的一次性邀请码');field.style.cssText='font:inherit;min-width:210px';bar.querySelector('input')?.remove();bar.append(field);field.select();}catch{invite.textContent='生成失败，点击重试';}finally{invite.disabled=false;}};bar.append(invite);}).catch(()=>{});
  }
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
