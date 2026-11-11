import fallbackCss from '../styles/workspace-fallback.css?inline';
const criticalLinks=()=>[...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')].filter(link=>{const url=new URL(link.href,location.href);return url.origin===location.origin&&/^\/assets\/index-[\w-]+\.css$/.test(url.pathname);});
function ready(link:HTMLLinkElement){try{return link.isConnected&&!link.disabled&&!link.sheet?.disabled&&!!link.sheet?.cssRules.length;}catch{return false;}}
function fallbackReady(){const style=document.getElementById('academy-workspace-style-fallback') as HTMLStyleElement|null;return !!style&&!style.disabled&&!style.sheet?.disabled&&!!style.sheet?.cssRules.length;}
function installFallback(){let style=document.getElementById('academy-workspace-style-fallback') as HTMLStyleElement|null;if(!style){style=document.createElement('style');style.id='academy-workspace-style-fallback';style.textContent=fallbackCss;}if(style!==document.body.lastElementChild)document.body.append(style);style.disabled=false;if(style.sheet)style.sheet.disabled=false;return fallbackReady();}
export async function ensureWorkspaceStyles(retry=false,originals:HTMLLinkElement[]=[]){
 const sources=criticalLinks();for(const original of originals)if(!sources.some(link=>new URL(link.href).pathname===new URL(original.href).pathname))sources.push(original);
 if(fallbackReady()||(!sources.length||sources.some(link=>!ready(link)))&&installFallback())return;
 if(import.meta.env.PROD&&!sources.length)throw Error('界面样式入口缺失');
 const links=sources.map(old=>{if(old.isConnected&&(!retry||ready(old)))return old;const link=old.cloneNode() as HTMLLinkElement,url=new URL(old.href);url.searchParams.set('style_retry',String(Date.now()));link.href=url.href;link.disabled=false;if(old.isConnected)old.replaceWith(link);else document.head.append(link);return link;});
 await Promise.all(links.map(link=>new Promise<void>((resolve,reject)=>{
  if(ready(link)){resolve();return;}
  const finish=(error=false)=>{clearTimeout(timer);link.removeEventListener('load',loaded);link.removeEventListener('error',failed);error?reject(Error('界面样式未能加载')):resolve();};
  const loaded=()=>finish(!ready(link)),failed=()=>finish(true),timer=setTimeout(failed,8000);
  link.addEventListener('load',loaded,{once:true});link.addEventListener('error',failed,{once:true});
  if(ready(link))finish();
 })));
}

/** Repair a lost core sheet during page changes. No polling, page reload, or data writes. */
export function installWorkspaceStyleRecovery(){
 const originals=criticalLinks().map(link=>link.cloneNode() as HTMLLinkElement);if(!originals.length)return ()=>{};
 let busy=false,attempted=false,timer:ReturnType<typeof setTimeout>|undefined,status:HTMLElement|undefined,disposed=false;
 const healthy=()=>fallbackReady()||originals.every(original=>criticalLinks().some(link=>new URL(link.href).pathname===new URL(original.href).pathname&&ready(link)));
 const repair=async(force=false)=>{if(disposed||busy||!force&&(attempted||healthy()))return;busy=true;attempted=true;
  status||=document.createElement('section');status.id='academy-style-runtime-status';status.setAttribute('role','status');status.style.cssText='position:fixed;z-index:2147483646;top:12px;left:50%;transform:translateX(-50%);padding:12px 18px;background:#fffaf3;color:#33465e;border:1px solid #cfc5b5;font:14px/1.8 system-ui';status.textContent='正在恢复界面样式…';document.body.append(status);
  try{await ensureWorkspaceStyles(true,originals);status.remove();attempted=false;}
  catch{status.textContent='界面样式加载失败，档案数据保留。';const button=document.createElement('button');button.type='button';button.textContent='重试加载样式';button.onclick=()=>void repair(true);status.append(button);}
  finally{busy=false;}
 };
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void repair(),0);};
 const changed=()=>{attempted=false;if(document.querySelector('.user-persona-archive'))installFallback();schedule();};
 const openPersona=(event:Event)=>{if((event as CustomEvent).detail?.entry==='personas')installFallback();};
 const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node instanceof HTMLElement&&node.matches('.user-persona-archive'))))installFallback();if(records.some(record=>record.target instanceof HTMLLinkElement||[...record.addedNodes,...record.removedNodes].some(node=>node instanceof HTMLLinkElement)))schedule();});
 observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href','disabled','rel','media']});window.addEventListener('academy:page-transition',changed);window.addEventListener('academy:navigate',openPersona);
 return ()=>{disposed=true;observer.disconnect();clearTimeout(timer);window.removeEventListener('academy:page-transition',changed);window.removeEventListener('academy:navigate',openPersona);status?.remove();};
}
