addEventListener('DOMContentLoaded',()=>{
  const button=document.createElement('button');button.type='button';button.textContent='退出登录';button.style.cssText='position:fixed;right:12px;bottom:8px;z-index:2147480000;border:0;background:var(--paper,#fffaf2);color:var(--muted,#73869a);font:inherit;font-size:12px;padding:5px 9px;cursor:pointer';
  button.onclick=async()=>{button.disabled=true;try{const csrf=await(await fetch('/csrf-token',{credentials:'same-origin'})).json();const result=await fetch('/api/users/logout',{method:'POST',headers:{'X-CSRF-Token':csrf.token,'Content-Type':'application/json'},body:'{}',credentials:'same-origin'});if(!result.ok)throw Error();location.assign('/login');}catch{button.disabled=false;button.textContent='退出失败，点击重试';}};document.body.append(button);
});
