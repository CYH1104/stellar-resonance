import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer,request as httpRequest} from 'node:http';
import {createNativeForwarder} from '../native/academy-frontend/forward.mjs';
async function fixture(handler,transform){
  const native=createServer(handler);await new Promise(resolve=>native.listen(0,'127.0.0.1',resolve));
  const forward=createNativeForwarder(new URL('http://127.0.0.1:'+native.address().port));
  const front=createServer((req,res)=>forward(req,res,req.url,transform));await new Promise(resolve=>front.listen(0,'127.0.0.1',resolve));
  return {origin:'http://127.0.0.1:'+front.address().port,async close(){forward.close();front.closeAllConnections();native.closeAllConnections();await Promise.all([new Promise(resolve=>front.close(resolve)),new Promise(resolve=>native.close(resolve))]);}};
}
test('native asset connections are reused without forwarding hop headers or sharing account cookies',async()=>{
  const received=[];
  const f=await fixture((req,res)=>{received.push(req.headers);res.setHeader('Connection','close, X-Private-Hop');res.setHeader('X-Private-Hop','must not be forwarded');res.end(req.headers.cookie||'');});
  // First demonstrate stripping upstream close/hop fields. A closing backend can
  // still serve a persistent browser connection without propagating that policy.
  try{for(const cookie of ['account=one','account=two']){const r=await new Promise((resolve,reject)=>{const request=httpRequest(f.origin+'/scripts/test.js',{headers:{Cookie:cookie,Connection:'keep-alive, X-Hop','X-Hop':'must not be forwarded'}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({body,headers:response.headers}));});request.on('error',reject);request.end();});assert.equal(r.body,cookie);assert.equal(r.headers['x-private-hop'],undefined);assert.equal(r.headers.connection,'keep-alive');}assert.ok(received.every(headers=>headers['x-hop']===undefined));}
  finally{await f.close();}
  const reused=new Set(),g=await fixture((req,res)=>{reused.add(req.socket);res.end('native code');});
  try{for(let n=0;n<5;n++)assert.equal(await(await fetch(g.origin+'/scripts/test.js')).text(),'native code');assert.equal(reused.size,1);}finally{await g.close();}
});
for(const [method,path]of [['GET','/scripts/test.js'],['POST','/api/settings/get']])test(`retries one interrupted ${method} read without changing its body`,async()=>{
  const received=[];const f=await fixture(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push(body);if(received.length===1){req.socket.destroy();return;}res.end('ready');});
  try{const body=method==='POST'?'{}':undefined;const r=await fetch(f.origin+path,{method,body,headers:body?{'Content-Type':'application/json'}:{}});assert.equal(r.status,200);assert.equal(await r.text(),'ready');assert.deepEqual(received,[body||'',body||'']);}finally{await f.close();}
});
for(const path of ['/api/chats/save','/api/plugins/academy-compat/completions/generate'])test('never replays a write or model request: '+path,async()=>{
  let calls=0;const f=await fixture(async(req)=>{for await(const _ of req){}calls++;req.socket.destroy();});
  try{const r=await fetch(f.origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"synthetic":"do not replay"}'});assert.equal(r.status,502);await r.text();assert.equal(calls,1);}finally{await f.close();}
});
test('keeps transformed HTML headers consistent and preserves normal upstream errors',async()=>{
  const f=await fixture((req,res)=>{res.setHeader('Content-Length','3');res.end('old');},()=>'<html>new document</html>');
  try{const r=await fetch(f.origin+'/');assert.equal(await r.text(),'<html>new document</html>');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('content-length'),null);}finally{await f.close();}
  let calls=0;const g=await fixture((_req,res)=>{calls++;res.writeHead(403,{'Content-Type':'text/plain'});res.end('login required');});
  try{const r=await fetch(g.origin+'/scripts/private.js');assert.equal(r.status,403);assert.equal(await r.text(),'login required');assert.equal(calls,1);}finally{await g.close();}
});

test('read retries stop after one retry and large read bodies still forward without replay',async()=>{
  let calls=0;const f=await fixture(async(req)=>{for await(const _ of req){}calls++;req.socket.destroy();});
  try{const r=await fetch(f.origin+'/scripts/broken.js');assert.equal(r.status,502);await r.text();assert.equal(calls,2);}finally{await f.close();}
  const bodies=[];const g=await fixture(async(req)=>{let body='';for await(const chunk of req)body+=chunk;bodies.push(body);req.socket.destroy();});
  try{const body='x'.repeat(70000),r=await fetch(g.origin+'/api/settings/get',{method:'POST',body});assert.equal(r.status,502);await r.text();assert.deepEqual(bodies,[body]);}finally{await g.close();}
});

test('disconnecting the browser closes its in-flight native response',async()=>{
  let closed,started;const stopped=new Promise(resolve=>closed=resolve),ready=new Promise(resolve=>started=resolve);
  const f=await fixture((_req,res)=>{res.write('first');res.once('close',closed);started();});
  const controller=new AbortController();
  try{const r=await fetch(f.origin+'/api/plugins/academy-compat/completions/generate',{method:'POST',body:'{}',signal:controller.signal});await ready;controller.abort();await r.body.cancel().catch(()=>{});await Promise.race([stopped,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Native response did not close')),2000);timer.unref();})]);}finally{await f.close();}
});
