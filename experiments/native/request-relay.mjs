import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';

const fail=(code,status=400)=>Object.assign(Error(code),{code,status});
/** Request-local credentials stay here; the private native worker only sees a one-use ticket. */
export function createNativeRequestRelay({authorize,fetchImpl=fetch,maxPending=64,ticketLifetimeMs=120000,requestTimeoutMs=600000}={}){
 if(typeof authorize!=='function')throw Error('NATIVE_DESTINATION_POLICY_REQUIRED');
 if(!Number.isSafeInteger(maxPending)||maxPending<1||!Number.isFinite(ticketLifetimeMs)||ticketLifetimeMs<=0||!Number.isFinite(requestTimeoutMs)||requestTimeoutMs<=0)throw Error('INVALID_NATIVE_RELAY_LIMITS');
 const pending=new Map();let origin='',closed=false;
 const server=createServer(async(req,res)=>{
  let entry,reader;const disconnected=new AbortController();
  res.once('close',()=>{if(!res.writableFinished)disconnected.abort();});
  const error=err=>{const status=Number.isInteger(err.status)&&err.status>=400&&err.status<=599?err.status:502,code=typeof err.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(err.code)?err.code:'NATIVE_UPSTREAM_FAILED';if(!res.headersSent)res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify({code}));else res.destroy();};
  try{
   if(req.method!=='POST'||req.url!=='/v1/chat/completions')throw fail('NATIVE_RELAY_ROUTE_NOT_FOUND',404);
   const candidate=pending.get(req.headers.authorization);
   if(!candidate||candidate.claimed)throw fail('NATIVE_RELAY_TICKET_INVALID',401);
   entry=candidate;entry.claimed=true;clearTimeout(entry.timer);
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024)throw fail('NATIVE_RELAY_BODY_TOO_LARGE',413);chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('NATIVE_RELAY_BODY_INVALID');}
   if(!body||Array.isArray(body)||body.model!==entry.model||!Array.isArray(body.messages)||!body.messages.length)throw fail('NATIVE_RELAY_BINDING_MISMATCH');
   if(['include_reasoning','request_thoughts','show_thoughts','enable_thinking'].some(k=>body[k]===true)||body.reasoning?.enabled===true)throw fail('NATIVE_REASONING_OVERRIDE');
   const signal=AbortSignal.any([entry.controller.signal,disconnected.signal,AbortSignal.timeout(requestTimeoutMs)]);
   signal.throwIfAborted();await authorize(entry.url);signal.throwIfAborted();
   const upstream=await fetchImpl(entry.url,{method:'POST',redirect:'error',signal,headers:new Headers(entry.headers),body:JSON.stringify({...body,stream:true,include_reasoning:false})});
   res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('Content-Type')||'application/octet-stream','Cache-Control':'no-store'});
   reader=upstream.body?.getReader();
   if(reader)while(true){const next=await reader.read();if(next.done)break;signal.throwIfAborted();if(!res.write(next.value))await new Promise((ok,reject)=>{const done=()=>{res.off('close',gone);ok();},gone=()=>{res.off('drain',done);reject(fail('NATIVE_RELAY_DISCONNECTED',499));};res.once('drain',done);res.once('close',gone);});}
   res.end();
  }catch(err){error(err);}finally{await reader?.cancel().catch(()=>{});entry?.dispose();}
 });
 async function start(){if(closed)throw Error('NATIVE_RELAY_CLOSED');if(origin)return origin;await new Promise((ok,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);ok();});});origin='http://127.0.0.1:'+server.address().port;return origin;}
 async function bind({url,headers,model,accountId,signal}={}){
  if(closed||!origin)throw fail('NATIVE_RELAY_UNAVAILABLE',503);
  signal?.throwIfAborted();
  let destination;try{destination=new URL(String(url));}catch{throw fail('INVALID_MODEL_URL');}
  if(destination.username||destination.password||destination.hash||destination.search||!destination.pathname.endsWith('/chat/completions')||!(destination.protocol==='https:'||destination.protocol==='http:'&&destination.hostname==='127.0.0.1'))throw fail('INVALID_MODEL_URL');
  if(typeof model!=='string'||!model||typeof accountId!=='string'||!accountId)throw fail('NATIVE_RELAY_BINDING_INVALID');
  const captured=new Headers(headers),credential=captured.get('Authorization');
  if(!credential||!/^Bearer .+/.test(credential))throw fail('NATIVE_RELAY_CREDENTIALS_REQUIRED');
  const urlSnapshot=destination.href,headerSnapshot=new Headers({'Content-Type':'application/json',Authorization:credential});
  await authorize(urlSnapshot);signal?.throwIfAborted();
  if(closed||!origin)throw fail('NATIVE_RELAY_UNAVAILABLE',503);
  if(pending.size>=maxPending)throw fail('NATIVE_RELAY_BUSY',503);
  const ticket='native-relay-'+randomBytes(32).toString('hex'),authorization='Bearer '+ticket,controller=new AbortController();
  const abort=()=>dispose();let disposed=false;
  function dispose(){if(disposed)return;disposed=true;clearTimeout(entry.timer);pending.delete(authorization);signal?.removeEventListener('abort',abort);controller.abort();headerSnapshot.delete('Authorization');}
  const entry={url:urlSnapshot,headers:headerSnapshot,model,accountId,claimed:false,controller,dispose};
  entry.timer=setTimeout(dispose,ticketLifetimeMs);entry.timer.unref?.();pending.set(authorization,entry);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)dispose();
  return {ticket,dispose};
 }
 return {start,bind,get upstream(){if(!origin)throw Error('NATIVE_RELAY_NOT_STARTED');return origin+'/v1';},get pending(){return pending.size;},async close(){closed=true;for(const entry of [...pending.values()])entry.dispose();server.closeAllConnections();if(server.listening)await new Promise(ok=>server.close(ok));}};
}
