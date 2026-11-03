(()=>{
  const account=window.__ACADEMY_ACCOUNT__||JSON.parse(document.getElementById('academy-editor-account')?.textContent||'null');if(!account?.id)return;window.__ACADEMY_ACCOUNT__=account;
  if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}});
  const original=window.fetch.bind(window),controller=new AbortController();let blocked=false,bar,channel;
  function showLocked(){if(bar&&!bar.querySelector('[data-relogin]')){bar.querySelector('[data-state]').textContent='账号已退出或切换，当前页面已停止读写；未提交的输入保留在此页。';bar.querySelectorAll('button,[data-author]').forEach(item=>item.hidden=true);const link=document.createElement('a');link.dataset.relogin='';link.href='/login';link.textContent='重新登录';bar.append(link);}}
  function lock(){if(blocked)return;blocked=true;controller.abort();showLocked();}
  window.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
    if(url.origin!==location.origin||!/^\/(?:(?:native-engine\/)?api\/|editor\/(?:api\/|logout$))/.test(url.pathname))return original(input,init);
    if(blocked)throw Error('账号已切换，请重新登录；当前输入保留。');
    const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(init?.headers).forEach((value,key)=>headers.set(key,value));headers.set('X-Academy-Account',account.id);
    const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    if(url.pathname.startsWith('/editor/')&&method==='POST'&&!headers.has('X-CSRF-Token')){const token=headers.get('X-Editor-Token')||(await(await original('/csrf-token',{cache:'no-store'})).json()).token;headers.set('X-CSRF-Token',token);}
    const signal=AbortSignal.any([controller.signal,...(init?.signal?[init.signal]:input instanceof Request?[input.signal]:[])]);
    const response=await original(input,{...init,headers,signal});
    if(response.status===409){const value=await response.clone().json().catch(()=>null);if(value?.error==='NATIVE_ACCOUNT_CHANGED')lock();}
    if(url.pathname==='/editor/logout'&&response.ok){lock();channel?.postMessage({type:'changed'});}
    return response;
  };
  try{channel=new BroadcastChannel('academy-native-account');channel.onmessage=()=>lock();}catch{}
  addEventListener('pageshow',event=>{if(event.persisted&&!blocked)void window.fetch('/api/users/me',{cache:'no-store'}).catch(()=>{});});
  function mount(){
    bar=document.createElement('div');bar.setAttribute('aria-label','当前账号');bar.className='academy-account-tools';
    const text=document.createElement('span');text.dataset.state='';text.textContent='账号：'+account.id;bar.append(text);
    const button=document.createElement('button');button.type='button';button.dataset.logout='';button.textContent='退出登录';
    button.onclick=async()=>{button.disabled=true;try{const csrf=await(await original('/csrf-token',{credentials:'same-origin',cache:'no-store'})).json();const result=await original('/api/users/logout',{method:'POST',headers:{'X-CSRF-Token':csrf.token,'Content-Type':'application/json'},body:'{}',credentials:'same-origin'});if(!result.ok)throw Error();lock();channel?.postMessage({type:'changed'});location.replace('/login?noauto=1');}catch{button.disabled=false;button.textContent='退出失败，点击重试';}};bar.append(button);document.body.append(bar);if(blocked)showLocked();
    // Invite creation remains restricted to native administrators.
    void window.fetch('/api/users/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(user=>{if(!user?.admin||blocked)return;const author=document.createElement('a');author.dataset.author='';author.href='/editor/';author.textContent='作者后台';bar.append(author);const invite=document.createElement('button');invite.type='button';invite.textContent='生成邀请码';invite.onclick=async()=>{invite.disabled=true;try{const csrf=await(await original('/csrf-token',{cache:'no-store'})).json();const result=await window.fetch('/api/plugins/academy-compat/accounts/invites/create',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf.token},body:'{}'});if(!result.ok)throw Error();const value=await result.json();const field=document.createElement('input');field.readOnly=true;field.value=value.code;field.setAttribute('aria-label','新生成的一次性邀请码');bar.querySelector('input')?.remove();bar.append(field);field.select();}catch{invite.textContent='生成失败，点击重试';}finally{invite.disabled=false;}};bar.append(invite);}).catch(()=>{});
  }
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
