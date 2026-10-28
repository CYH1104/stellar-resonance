import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {completionChunks} from '../../server/ai.mjs';
import {patchRawPreset,protectedRuntimePreset,validatePublicGeneration} from './preset-policy.mjs';

const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>私有编排验证</title><h1>服务端私有编排验证</h1><p>合成资料／本地模型；不接收真实凭据。脚本无法从此页取得私有角色卡、世界书或完整提示词。</p><textarea id="input">询问训练安排。</textarea><button id="send">发送</button><pre id="reply"></pre><script>
let csrf;async function ready(){csrf=(await fetch('/api/session').then(r=>r.json())).csrf;}ready();document.querySelector('#send').onclick=async()=>{if(!csrf)await ready();const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({input:document.querySelector('#input').value})});document.querySelector('#reply').textContent=await r.text();};
</script></html>`;

export async function createProtectedGateway({compiler,client,preset,port=8851,onPrivateCompile=()=>{}}){
 let raw=structuredClone(preset);const sessions=new Map();let origin;
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const server=createServer(async(req,res)=>{
  const abort=new AbortController();res.on('close',()=>abort.abort());
  try{
   if(req.headers.host!==new URL(origin).host||req.socket.remoteAddress!=='127.0.0.1')return send(res,403,{code:'LOCAL_ONLY'});
   const path=new URL(req.url,origin).pathname;
   if(path==='/'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(page);return;}
   if(path==='/api/session'&&req.method==='GET'){
    if(req.headers.origin&&req.headers.origin!==origin)return send(res,403,{code:'ORIGIN_REJECTED'});
    for(const [key,value]of sessions)if(value.expires<Date.now())sessions.delete(key);
    if(sessions.size>=128)return send(res,429,{code:'SESSION_LIMIT'});
    const id=randomBytes(24).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(id,{csrf,expires:Date.now()+3600000});res.setHeader('Set-Cookie',`native_protected=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);send(res,200,{csrf});return;
   }
   if(!['/api/public-card','/api/preset','/api/generate'].includes(path))return send(res,404,{code:'NOT_FOUND'});
   const id=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('native_protected='))?.slice(17),session=sessions.get(id);
   if(!session||session.expires<Date.now())return send(res,401,{code:'SESSION_REQUIRED'});
   if(path==='/api/public-card'&&req.method==='GET'){send(res,200,{name:'学院世界',introduction:'仅公开资料'});return;}
   if(path==='/api/preset'&&req.method==='GET'){send(res,200,{preset:protectedRuntimePreset(raw)});return;}
   if(req.method!=='POST')return send(res,405,{code:'METHOD_NOT_ALLOWED'});
   const token=req.headers['x-csrf-token'];
   if(req.headers.origin!==origin||typeof token!=='string'||token.length!==session.csrf.length||!timingSafeEqual(Buffer.from(token),Buffer.from(session.csrf)))return send(res,403,{code:'CSRF_REJECTED'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{code:'JSON_REQUIRED'});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)return send(res,413,{code:'BODY_TOO_LARGE'});chunks.push(chunk);}
   let value;try{value=JSON.parse(Buffer.concat(chunks));}catch{return send(res,400,{code:'INVALID_JSON'});}
   if(path==='/api/preset'){
    if(!value||Object.keys(value).some(k=>k!=='changes')||!value.changes||Object.keys(value.changes).some(k=>!['temperature','openai_max_tokens','prompts'].includes(k)))return send(res,400,{code:'INVALID_PATCH'});
    if(value.changes.temperature!==undefined&&(!Number.isFinite(value.changes.temperature)||value.changes.temperature<0||value.changes.temperature>2))return send(res,400,{code:'INVALID_PATCH'});
    if(value.changes.openai_max_tokens!==undefined&&(!Number.isInteger(value.changes.openai_max_tokens)||value.changes.openai_max_tokens<1||value.changes.openai_max_tokens>32000))return send(res,400,{code:'INVALID_PATCH'});
    raw=patchRawPreset(raw,value.changes);send(res,200,{preset:protectedRuntimePreset(raw)});return;
   }
   let input;try{input=validatePublicGeneration(value);}catch{return send(res,400,{code:'INVALID_REQUEST'});}
   const effective=protectedRuntimePreset(raw);
   const compiled=await compiler.compile({...input,preset:effective,signal:abort.signal});await onPrivateCompile(compiled);
   const upstream=await client.complete({messages:compiled.messages,model:'protected-fixture',temperature:effective.temperature??0.7,max_tokens:effective.openai_max_tokens??1024,include_reasoning:false},abort.signal);
   if(!upstream.ok)return send(res,502,{code:'UPSTREAM_FAILED'});
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store'});
   let finishReason='';
   for await(const text of completionChunks(upstream,{signal:abort.signal,onProgress:stats=>{finishReason=stats.finishReason;}})){if(text)res.write('data: '+JSON.stringify({type:'delta',text})+'\n\n');}
   res.end('data: '+JSON.stringify(finishReason==='stop'?{type:'done',finishReason}:{type:'error',code:'GENERATION_INCOMPLETE',complete:false,finishReason:finishReason||'unexpected_eof'})+'\n\n');
  }catch(error){if(res.destroyed)return;if(res.headersSent){res.end('data: {"type":"error","code":"GENERATION_FAILED"}\n\n');}else send(res,error.message?.startsWith('INVALID')||error.message?.includes('PRESET')?400:500,{code:'REQUEST_FAILED'});}
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});origin=`http://127.0.0.1:${server.address().port}`;
 return {origin,server,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
