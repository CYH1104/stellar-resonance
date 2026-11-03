import {Agent,request as upstreamRequest} from 'node:http';

const hopHeaders=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function endToEnd(headers){
  const forbidden=new Set([...hopHeaders,...String(headers.connection||'').toLowerCase().split(',').map(value=>value.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([key])=>!forbidden.has(key.toLowerCase())));
}
const readPost=/^\/api\/(?:settings\/get|chats\/get|characters\/(?:get|all|chats)|worldinfo\/get|avatars\/get|secrets\/read|presets\/restore)$/;
const staticGet=/^\/(?:script\.js|lib\.js|scripts\/|lib\/|css\/|img\/|locales\/)/;
const retryable=new Set(['ECONNRESET','EPIPE','ETIMEDOUT']);

/** Keep browser/native connections reusable; never replay model or mutation requests. */
export function createNativeForwarder(upstream){
  const agent=new Agent({keepAlive:true,maxSockets:32,maxFreeSockets:8});
  function forward(request,response,path=request.url,transform){
    const pathname=new URL(path,upstream).pathname;
    const canRetry=request.method==='GET'&&staticGet.test(pathname)||request.method==='POST'&&readPost.test(pathname);
    const chunks=[];let bytes=0,replayable=canRetry,active,ended=request.readableEnded,attempt=0,waiting=false;
    if(canRetry){request.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536){replayable=false;chunks.length=0;}else if(replayable)chunks.push(chunk);});}
    request.once('end',()=>{ended=true;if(waiting){waiting=false;send(true);}});
    request.once('aborted',()=>active?.destroy());
    response.once('close',()=>{if(!response.writableEnded)active?.destroy();});
    function failed(error){
      if(response.destroyed||request.aborted)return;
      if(!response.headersSent&&attempt===1&&replayable&&retryable.has(error.code)){
        if(ended)send(true);else waiting=true;
        return;
      }
      if(response.headersSent){response.destroy();return;}
      // Log transport metadata only, without cookies, request bodies or query strings.
      console.warn('Native forwarding failed',{method:request.method,path:pathname,code:error.code||'UPSTREAM_STREAM_FAILED',attempt});
      response.writeHead(502,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
      response.end('原生后端暂时不可用，请稍后重试。');
    }
    function send(replay=false){
      if(response.destroyed||request.aborted)return;
      attempt++;
      const proxy=upstreamRequest(new URL(path,upstream),{method:request.method,agent,headers:{...endToEnd(request.headers),host:upstream.host,'x-academy-client-address':request.socket.remoteAddress||'unknown',...(transform?{'accept-encoding':'identity'}:{})}},incoming=>{
        incoming.once('error',error=>{if(active===proxy&&!response.writableEnded)failed(error);});
        if(transform){
          const parts=[];incoming.on('data',chunk=>parts.push(chunk));incoming.once('end',()=>{
            if(response.destroyed||active!==proxy)return;
            let body=Buffer.concat(parts);const headers=endToEnd(incoming.headers);
            try{if(incoming.statusCode===200){body=Buffer.from(transform(body.toString('utf8')));delete headers['content-encoding'];delete headers['content-length'];headers['cache-control']='no-store';}}
            catch{failed({code:'NATIVE_PAGE_TRANSFORM_FAILED'});return;}
            response.writeHead(incoming.statusCode||502,headers);response.end(body);
          });
        }else{response.writeHead(incoming.statusCode||502,endToEnd(incoming.headers));incoming.pipe(response);}
      });
      active=proxy;proxy.once('error',error=>{if(active===proxy)failed(error);});
      if(replay)proxy.end(Buffer.concat(chunks));else request.pipe(proxy);
    }
    send();
  }
  forward.close=()=>agent.destroy();
  return forward;
}
