import {createServer,request as upstreamRequest} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativeEnginePage} from './enginePage.mjs';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url))),dist=resolve(root,'dist/academy-frontend');
const upstream=new URL(process.env.ACADEMY_NATIVE_ORIGIN||'http://127.0.0.1:18088');
if(upstream.hostname!=='127.0.0.1'||upstream.protocol!=='http:')throw Error('Native upstream must be independent loopback HTTP.');
const port=Number(process.env.ACADEMY_FRONTEND_PORT||8088),host=process.env.ACADEMY_FRONTEND_HOST||'127.0.0.1';
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.woff2':'font/woff2','.json':'application/json'};
const safe=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
function apiSession(request,response){let cookie=request.headers.cookie||'';const cookies=[];
  async function call(path,{method='GET',body,csrf}={}){const headers={cookie,...(body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})};const result=await fetch(new URL(path,upstream),{method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(30000)});for(const item of result.headers.getSetCookie()){cookies.push(item);const pair=item.split(';')[0],key=pair.split('=')[0];cookie=cookie.split(';').map(s=>s.trim()).filter(s=>!s.startsWith(key+'=')).concat(pair).filter(Boolean).join('; ');}if(cookies.length)response.setHeader('Set-Cookie',cookies);return result;}
  return {call,async post(path,body){const csrf=await (await call('/csrf-token')).json();return call(path,{method:'POST',body,csrf:csrf.token});}};
}
function forward(request,response,path=request.url,transform){const proxy=upstreamRequest(new URL(path,upstream),{method:request.method,agent:false,headers:{...request.headers,host:upstream.host,connection:'close',...(transform?{'accept-encoding':'identity'}:{})}},incoming=>{
  if(transform){const chunks=[];incoming.on('data',chunk=>chunks.push(chunk));incoming.on('end',()=>{let body=Buffer.concat(chunks);const headers={...incoming.headers};if(incoming.statusCode===200){body=Buffer.from(transform(body.toString('utf8')));delete headers['content-encoding'];delete headers['content-length'];headers['cache-control']='no-store';}response.writeHead(incoming.statusCode||502,headers);response.end(body);});}
  else{response.writeHead(incoming.statusCode||502,incoming.headers);incoming.pipe(response);}
});proxy.on('error',()=>{if(!response.headersSent)response.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});response.end('原生后端暂时不可用，请稍后重试。');});request.on('aborted',()=>proxy.destroy());request.pipe(proxy);}
createServer(async(request,response)=>{let stage='request';try{
  const url=new URL(request.url,'http://localhost'),path=decodeURIComponent(url.pathname);response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');
  if(request.method==='GET'&&(path==='/'||path==='/terminal')){
    stage='account';const session=apiSession(request,response),me=await session.call('/api/users/me');if(!me.ok){response.writeHead(302,{Location:'/login'});response.end();return;}
    stage='account-json';const user=await me.json();stage='settings';const result=await session.post('/api/settings/get',{});if(!result.ok)throw Object.assign(Error('Native settings unavailable'),{code:'NATIVE_SETTINGS_HTTP_'+result.status});stage='settings-json';const document=await result.json();stage='settings-document';const settings=JSON.parse(document.settings),state=settings.accountStorage||{};stage='page';
    const preload=`<script>window.__ACADEMY_ACCOUNT__=${safe({id:user.handle,email:user.name||user.handle})};window.__ACADEMY_ACCOUNT_STORAGE__=${safe(state)};window.__ACADEMY_NATIVE_CONTEXT__={accountStorage:{getItem:k=>Object.hasOwn(window.__ACADEMY_ACCOUNT_STORAGE__,k)?window.__ACADEMY_ACCOUNT_STORAGE__[k]:null,setItem:(k,v)=>{window.__ACADEMY_ACCOUNT_STORAGE__[k]=String(v)},removeItem:k=>{delete window.__ACADEMY_ACCOUNT_STORAGE__[k]},getState:()=>({...window.__ACADEMY_ACCOUNT_STORAGE__})}};</script>`;
    const html=(await readFile(resolve(dist,'academy.html'),'utf8')).replace(/<head\b[^>]*>/i,h=>h+preload).replace('</head>','<script src="/auth/native-account.js"></script></head>');response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(html);return;
  }
  if(request.method==='POST'&&['/api/backends/chat-completions/generate','/native-engine/api/backends/chat-completions/generate'].includes(path.replace(/\/+$/,''))){forward(request,response,'/api/plugins/academy-compat/completions/generate');return;}
  if(request.method==='GET'&&path==='/native-engine/'){forward(request,response,'/',nativeEnginePage);return;}
  if(path.startsWith('/native-engine/')){forward(request,response,request.url.slice('/native-engine'.length));return;}
  if(request.method==='GET'&&['/api/map-assets','/api/character-cards','/api/auth/me'].includes(path)){
    const session=apiSession(request,response),result=path==='/api/auth/me'?await session.call('/api/users/me'):await session.post('/api/plugins/academy-compat/'+(path==='/api/map-assets'?'map':'cards'),{});const value=await result.json();response.writeHead(result.status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(path==='/api/auth/me'?{user:{id:value.handle,email:value.name}}:value));return;
  }
  if(request.method==='POST'&&path==='/api/auth/logout'){forward(request,response,'/api/users/logout');return;}
  let relative=path.startsWith('/academy-assets/')?path.slice('/academy-assets/'.length):path.startsWith('/assets/')||path.startsWith('/auth/boot.')||path==='/auth/native-account.js'?path.slice(1):undefined;
  if(relative!==undefined&&['GET','HEAD'].includes(request.method)){const target=resolve(dist,relative);if(!target.startsWith(dist+sep))throw Error('Invalid path');const body=await readFile(target);response.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});response.end(request.method==='HEAD'?undefined:body);return;}
  forward(request,response);
}catch(error){console.warn('Academy frontend request failed',{stage,code:error?.cause?.code||error?.code||error?.name});response.writeHead(error?.code==='ENOENT'?404:502,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});response.end('学院页面暂未连接完成，请稍后重试。');}}).listen(port,host,()=>console.log(`Academy frontend ready on ${host}:${port}`));
