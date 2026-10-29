import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createNativeRequestRelay} from './request-relay.mjs';
const body=model=>JSON.stringify({model,messages:[{role:'user',content:'hello'}],stream:true,include_reasoning:false});
const request=(relay,ticket,model,extra={})=>fetch(relay.upstream+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+ticket,'Content-Type':'application/json'},body:body(model),...extra});
const bind=(relay,url='https://a.synthetic.invalid/v1/chat/completions',model='model-a',key='key-a',extra={})=>relay.bind({url,model,accountId:'account-a',headers:{Authorization:'Bearer '+key},...extra});
test('native relay requires a destination policy and valid limits',()=>{assert.throws(()=>createNativeRequestRelay(),/POLICY/);assert.throws(()=>createNativeRequestRelay({authorize:()=>{},maxPending:0}),/LIMITS/);});
test('concurrent tickets preserve distinct URL model and credentials and reject replays',async()=>{
 const seen=[],relay=createNativeRequestRelay({authorize:async url=>assert.match(url,/synthetic\.invalid/),fetchImpl:async(url,init)=>{seen.push({url,key:init.headers.get('Authorization'),body:JSON.parse(init.body),redirect:init.redirect});return new Response('ok');}});await relay.start();
 try{const a=await bind(relay),b=await bind(relay,'https://b.synthetic.invalid/v2/chat/completions','model-b','key-b',{accountId:'account-b'});const results=await Promise.all([request(relay,a.ticket,'model-a'),request(relay,b.ticket,'model-b')]);for(const r of results)assert.equal(await r.text(),'ok');assert.deepEqual(seen.map(r=>[r.url,r.key,r.body.model]).sort(),[['https://a.synthetic.invalid/v1/chat/completions','Bearer key-a','model-a'],['https://b.synthetic.invalid/v2/chat/completions','Bearer key-b','model-b']]);assert.ok(seen.every(r=>r.redirect==='error'&&r.body.include_reasoning===false));assert.equal((await request(relay,a.ticket,'model-a')).status,401);assert.equal(relay.pending,0);}finally{await relay.close();}
});
test('a replay during an active request cannot cancel the legitimate ticket owner',async()=>{
 let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const relay=createNativeRequestRelay({authorize:async()=>{},fetchImpl:async()=>{entered();await gate;return new Response('original');}});await relay.start();
 try{const a=await bind(relay),first=request(relay,a.ticket,'model-a');await waiting;assert.equal((await request(relay,a.ticket,'model-a')).status,401);assert.equal(relay.pending,1);release();assert.equal(await(await first).text(),'original');assert.equal(relay.pending,0);}finally{release();await relay.close();}
});
test('unapproved destinations missing credentials and mismatched models never reach a provider',async()=>{
 let calls=0;const relay=createNativeRequestRelay({authorize:async url=>{if(!url.startsWith('https://a.'))throw Object.assign(Error('blocked'),{code:'API_ORIGIN_NOT_ALLOWED',status:403});},fetchImpl:async()=>{calls++;return new Response('unexpected');}});await relay.start();
 try{await assert.rejects(bind(relay,'https://b.synthetic.invalid/v1/chat/completions'));await assert.rejects(bind(relay,undefined,undefined,'',{headers:{}}));const a=await bind(relay);assert.equal((await request(relay,a.ticket,'another-model')).status,400);assert.equal(calls,0);assert.equal(relay.pending,0);}finally{await relay.close();}
});
test('destination policy is checked again at claim and reasoning override is rejected',async()=>{
 let revoked=false,calls=0;const relay=createNativeRequestRelay({authorize:async()=>{if(revoked)throw Object.assign(Error('revoked'),{code:'API_ORIGIN_NOT_ALLOWED',status:403});},fetchImpl:async()=>{calls++;return new Response('unexpected');}});await relay.start();
 try{const a=await bind(relay);revoked=true;assert.equal((await request(relay,a.ticket,'model-a')).status,403);revoked=false;const b=await bind(relay);const r=await request(relay,b.ticket,'model-a',{body:JSON.stringify({model:'model-a',messages:[{role:'user',content:'hello'}],include_reasoning:true})});assert.equal(r.status,400);assert.equal((await r.json()).code,'NATIVE_REASONING_OVERRIDE');assert.equal(calls,0);assert.equal(relay.pending,0);}finally{await relay.close();}
});
test('headers are snapshotted before asynchronous authorization and pending capacity is bounded',async()=>{
 let authorizeRelease,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>authorizeRelease=r),seen=[];let first=true;const relay=createNativeRequestRelay({maxPending:1,authorize:async()=>{if(first){first=false;entered();await gate;}},fetchImpl:async(_url,init)=>{seen.push(init.headers.get('Authorization'));return new Response('ok');}});await relay.start();
 try{const headers={Authorization:'Bearer original'},pending=bind(relay,undefined,undefined,undefined,{headers});await waiting;headers.Authorization='Bearer changed';authorizeRelease();const a=await pending;await assert.rejects(bind(relay),{code:'NATIVE_RELAY_BUSY'});assert.equal(await(await request(relay,a.ticket,'model-a')).text(),'ok');assert.deepEqual(seen,['Bearer original']);assert.equal(relay.pending,0);}finally{authorizeRelease();await relay.close();}
});
test('unused tickets expire and parent cancellation removes both pending and active requests',async()=>{
 const expired=createNativeRequestRelay({authorize:async()=>{},ticketLifetimeMs:10});await expired.start();try{await bind(expired);await delay(40);assert.equal(expired.pending,0);}finally{await expired.close();}
 let entered;const waiting=new Promise(r=>entered=r);let providerSignal;const relay=createNativeRequestRelay({authorize:async()=>{},fetchImpl:async(_url,init)=>{providerSignal=init.signal;entered();await new Promise((_ok,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));}});await relay.start();const controller=new AbortController();
 try{const a=await bind(relay,undefined,undefined,undefined,{signal:controller.signal}),pending=request(relay,a.ticket,'model-a');await waiting;controller.abort();await(await pending).text();assert.equal(providerSignal.aborted,true);assert.equal(relay.pending,0);}finally{await relay.close();}
});
test('provider HTTP failures preserve status and content without retries',async()=>{
 let calls=0;const relay=createNativeRequestRelay({authorize:async()=>{},fetchImpl:async()=>{calls++;return new Response('{"error":"quota"}',{status:429,headers:{'Content-Type':'application/json'}});}});await relay.start();
 try{const a=await bind(relay),response=await request(relay,a.ticket,'model-a');assert.equal(response.status,429);assert.equal(await response.text(),'{"error":"quota"}');assert.equal(calls,1);assert.equal(relay.pending,0);}finally{await relay.close();}
});
test('real HTTP redirects cannot forward credentials to a second destination',async()=>{
 let redirected=0;const upstream=createServer((req,res)=>{if(req.url==='/escape'){redirected++;res.end('unsafe');}else res.writeHead(302,{Location:'/escape'}).end();});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+upstream.address().port+'/v1/chat/completions',relay=createNativeRequestRelay({authorize:async u=>assert.equal(u,url)});await relay.start();
 try{const a=await bind(relay,url),response=await request(relay,a.ticket,'model-a');assert.equal(response.status,502);assert.equal(redirected,0);assert.equal(relay.pending,0);}finally{await relay.close();await new Promise(r=>upstream.close(r));}
});
