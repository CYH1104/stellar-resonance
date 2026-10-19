(() => {
  // UUID generation also works when the game is reached through an HTTP IP address.
  if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const s=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);};
  const account=window.__ACADEMY_ACCOUNT__;if(!account)return;
  const prefix='account:'+account.id+':'+(account.dataVersion?'v'+account.dataVersion+':':'');
  window.academyStorage={getItem:k=>localStorage.getItem(prefix+k),setItem:(k,v)=>localStorage.setItem(prefix+k,v),removeItem:k=>localStorage.removeItem(prefix+k),key:i=>Object.keys(localStorage).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)??null,get length(){return Object.keys(localStorage).filter(k=>k.startsWith(prefix)).length;}};
  addEventListener('DOMContentLoaded',()=>{const bar=document.createElement('div');bar.className='account-tools';const label=document.createElement('span');label.textContent=account.email;const logout=document.createElement('button');logout.textContent='退出账号';logout.onclick=async()=>{if(!confirm('退出当前账号？请先停止正在生成的内容。'))return;logout.disabled=true;try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();location.replace('/login');}catch{logout.disabled=false;logout.textContent='退出失败，重试';}};bar.append(label,logout);document.body.append(bar);});
  addEventListener('DOMContentLoaded',()=>{
    const root=document.getElementById('__exp_splash__');if(!root)return;
    const tools=root.querySelector('.ah-tools');if(tools){const b=document.createElement('button');b.className='ah-tool';b.dataset.module='account-data';b.innerHTML='<i>10</i><span>账号与数据</span>';b.onclick=e=>{e.stopPropagation();location.assign('/account');};tools.append(b);}
    const grid=root.querySelector('.hub-grid');if(grid){const b=document.createElement('button');b.dataset.module='account-data';b.innerHTML='<small>ACCOUNT</small><span>ACCOUNT & DATA</span><b>账号与数据</b><p>重置游戏数据或删除当前账号</p>';b.onclick=e=>{e.stopPropagation();location.assign('/account');};grid.append(b);}
  });
  addEventListener('storage',event=>{if(event.key==='academy:account-maintenance:'+account.id&&location.pathname==='/terminal')location.replace('/account?maintenance=1');});
  async function verifyAccount(){if(document.hidden||location.pathname!=='/terminal')return;try{const r=await fetch('/api/auth/me',{cache:'no-store'});if(!r.ok)return;const current=(await r.json()).user;if(!current||current.id!==account.id||(current.dataVersion||0)!==(account.dataVersion||0))location.replace('/login');}catch{}}
  addEventListener('focus',verifyAccount);setInterval(verifyAccount,60000);
  const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await originalFetch(...args);const url=new URL(typeof args[0]==='string'?args[0]:args[0] instanceof Request?args[0].url:String(args[0]),location.href);if(url.origin===location.origin&&url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/auth/')&&response.status===401){try{if((await response.clone().json()).code==='ACCOUNT_REQUIRED')location.replace('/login');}catch{}}return response;};
})();
