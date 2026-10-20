(() => {
  // UUID generation also works when the game is reached through an HTTP IP address.
  if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const s=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);};
  const account=window.__ACADEMY_ACCOUNT__;if(!account)return;
  const prefix='account:'+account.id+':'+(account.dataVersion?'v'+account.dataVersion+':':'');
  window.academyStorage={getItem:k=>localStorage.getItem(prefix+k),setItem:(k,v)=>localStorage.setItem(prefix+k,v),removeItem:k=>localStorage.removeItem(prefix+k),key:i=>Object.keys(localStorage).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)??null,get length(){return Object.keys(localStorage).filter(k=>k.startsWith(prefix)).length;}};
  const logoutKey='academy:account-logout:'+account.id,logoutButtons=new Set();let loggingOut=false;
  function logoutButton(button){button.type='button';button.dataset.accountLogout='true';button.setAttribute('aria-label','退出登录');button.addEventListener('click',event=>{event.stopPropagation();void logout();});logoutButtons.add(button);return button;}
  async function logout(){
    if(loggingOut)return;loggingOut=true;for(const button of logoutButtons)button.disabled=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});
      if(!response.ok)throw Error();
      try{localStorage.setItem(logoutKey,crypto.randomUUID());}catch{}
      location.replace('/login');
    }catch{loggingOut=false;for(const button of logoutButtons)button.disabled=false;const message=document.getElementById('account-logout-message');if(message)message.textContent='退出失败，请检查网络后重试。';}finally{clearTimeout(timer);}
  }
  addEventListener('DOMContentLoaded',()=>{const bar=document.createElement('div');bar.className='account-tools';const label=document.createElement('span');label.textContent=account.email;const button=logoutButton(document.createElement('button'));button.textContent='退出登录';const message=document.createElement('span');message.id='account-logout-message';message.setAttribute('role','alert');bar.append(label,button,message);document.body.append(bar);});
  addEventListener('DOMContentLoaded',()=>{
    const root=document.getElementById('__exp_splash__');if(!root)return;
    const tools=root.querySelector('.ah-tools');if(tools){const b=document.createElement('button');b.className='ah-tool';b.dataset.module='account-data';b.innerHTML='<i>10</i><span>账号与数据</span>';b.onclick=e=>{e.stopPropagation();location.assign('/account');};tools.append(b);const exit=logoutButton(document.createElement('button'));exit.className='ah-tool';exit.innerHTML='<i>↪</i><span>退出登录</span>';tools.append(exit);}
    const grid=root.querySelector('.hub-grid');if(grid){const b=document.createElement('button');b.dataset.module='account-data';b.innerHTML='<small>ACCOUNT</small><span>ACCOUNT & DATA</span><b>账号与数据</b><p>重置游戏数据或删除当前账号</p>';b.onclick=e=>{e.stopPropagation();location.assign('/account');};grid.append(b);const exit=logoutButton(document.createElement('button'));exit.innerHTML='<small>SIGN OUT</small><span>LOG OUT</span><b>退出登录</b><p>退出当前账号，下次访问需重新登录</p>';grid.append(exit);}
  });
  addEventListener('storage',event=>{if(event.key===logoutKey){location.replace('/login');return;}if(event.key==='academy:account-maintenance:'+account.id&&location.pathname==='/terminal')location.replace('/account?maintenance=1');});
  async function verifyAccount(restored=false){
    if(document.hidden&&!restored)return;
    try{const r=await fetch('/api/auth/me',{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error();const current=(await r.json()).user;if(!current||current.id!==account.id||(current.dataVersion||0)!==(account.dataVersion||0)){location.replace('/login');return;}if(restored)document.body.style.visibility='';}catch{if(restored)location.replace('/login');}
  }
  addEventListener('pagehide',event=>{if(event.persisted)document.body.style.visibility='hidden';});
  addEventListener('pageshow',event=>{if(event.persisted){document.body.style.visibility='hidden';void verifyAccount(true);}});
  addEventListener('focus',()=>void verifyAccount());addEventListener('visibilitychange',()=>{if(!document.hidden)void verifyAccount();});setInterval(()=>void verifyAccount(),60000);
  const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await originalFetch(...args);const url=new URL(typeof args[0]==='string'?args[0]:args[0] instanceof Request?args[0].url:String(args[0]),location.href);if(url.origin===location.origin&&url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/auth/')&&response.status===401){try{if((await response.clone().json()).code==='ACCOUNT_REQUIRED')location.replace('/login');}catch{}}return response;};
})();
