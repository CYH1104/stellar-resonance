import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeRequestRelay} from './request-relay.mjs';
import {createAccountRuntime} from './account-runtime.mjs';
import {createNativeClient} from './native-client.mjs';
const config={version:1,preset:{temperature:0.2,prompts:[],prompt_order:[]}};
const sse='data: '+JSON.stringify({choices:[{delta:{content:'ok'},finish_reason:'stop'}]})+'\n\n';
const request=(key='first-key',model='model-a')=>({method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify({model,messages:[{role:'user',content:'hello'}]})});
test('account routing uses selected request URLs and keys but sends only opaque tickets to native workers',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-route-')),seen=[],native=[];const relay=createNativeRequestRelay({authorize:async()=>{},fetchImpl:async(url,init)=>{seen.push({url,key:init.headers.get('Authorization'),model:JSON.parse(init.body).model});return new Response(sse,{headers:{'Content-Type':'text/event-stream'}});}});await relay.start();
 const runtime=createAccountRuntime({directory,defaultPreset:config.preset,requestRelay:relay,createWorker:async()=>({compiler:{compile:async input=>({messages:input.messages,scriptsDisabled:true})},client:{complete:async(body,signal,binding)=>{native.push({body,binding});return fetch(relay.upstream+'/chat/completions',{method:'POST',signal,headers:{Authorization:'Bearer '+binding.relayTicket,'Content-Type':'application/json'},body:JSON.stringify(body)});}},close:async()=>{}})});
 try{await Promise.all([['a','https://a.synthetic.invalid/v1/chat/completions','first-key','model-a'],['b','https://b.synthetic.invalid/v3/chat/completions','second-key','model-b']].map(async([id,url,key,model])=>assert.match(await(await runtime.fetchForAccount({id},{nativePreset:config})(url,request(key,model))).text(),/\[DONE\]/)));
  assert.deepEqual(seen.sort((a,b)=>a.model.localeCompare(b.model)),[{url:'https://a.synthetic.invalid/v1/chat/completions',key:'Bearer first-key',model:'model-a'},{url:'https://b.synthetic.invalid/v3/chat/completions',key:'Bearer second-key',model:'model-b'}]);assert.ok(native.every(v=>/^native-relay-[a-f0-9]{64}$/.test(v.binding.relayTicket)));assert.doesNotMatch(JSON.stringify(native),/first-key|second-key/);assert.equal(relay.pending,0);
 }finally{await runtime.close();await relay.close();await rm(directory,{recursive:true,force:true});}
});
test('request snapshots survive worker startup and all rejected native paths release their bindings',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-route-errors-')),seen=[];let enter,release,mode='ok';const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);const relay=createNativeRequestRelay({authorize:async url=>{if(url.includes('blocked'))throw Object.assign(Error('blocked'),{code:'API_ORIGIN_NOT_ALLOWED',status:403});},fetchImpl:async(_url,init)=>{seen.push(init.headers.get('Authorization'));return new Response(sse,{headers:{'Content-Type':'text/event-stream'}});}});await relay.start();
 const runtime=createAccountRuntime({directory,defaultPreset:config.preset,requestRelay:relay,createWorker:async()=>{enter();await gate;return {compiler:{compile:async input=>{if(mode==='compile')throw Error('SYNTHETIC_COMPILE_FAILED');return {messages:input.messages,scriptsDisabled:true};}},client:{complete:async(body,signal,binding)=>{if(mode==='client')throw Error('SYNTHETIC_CLIENT_FAILED');if(mode==='http')return new Response('provider denied',{status:429});return fetch(relay.upstream+'/chat/completions',{method:'POST',signal,headers:{Authorization:'Bearer '+binding.relayTicket,'Content-Type':'application/json'},body:JSON.stringify(body)});}},close:async()=>{}};}});
 try{await assert.rejects(runtime.fetchForAccount({id:'a'},{nativePreset:config})('https://blocked.synthetic.invalid/v1/chat/completions',request()));assert.equal(relay.pending,0);
 const init=request(),pending=runtime.fetchForAccount({id:'a'},{nativePreset:config})('https://a.synthetic.invalid/v1/chat/completions',init);await entered;init.headers.Authorization='Bearer changed-key';release();await(await pending).text();assert.deepEqual(seen,['Bearer first-key']);
 for(const failure of ['compile','client']){mode=failure;await assert.rejects(runtime.fetchForAccount({id:'a'},{nativePreset:config})('https://a.synthetic.invalid/v1/chat/completions',request()));assert.equal(relay.pending,0);}
 mode='http';const response=await runtime.fetchForAccount({id:'a'},{nativePreset:config})('https://a.synthetic.invalid/v1/chat/completions',request());assert.equal(response.status,429);assert.equal(await response.text(),'provider denied');assert.equal(relay.pending,0);
 }finally{release();await runtime.close();await relay.close();await rm(directory,{recursive:true,force:true});}
});
test('native client forwards a relay ticket without accepting a real credential as a ticket',async()=>{
 const calls=[],ticket='native-relay-'+'a'.repeat(64);const client=createNativeClient({origin:'http://127.0.0.1:8830',upstream:'http://127.0.0.1:8832/v1',fetchImpl:async(url,options)=>{calls.push({url,options});return url.endsWith('/csrf-token')?new Response('{"token":"csrf"}',{headers:{'Set-Cookie':'session=local'}}):new Response(sse,{headers:{'Content-Type':'text/event-stream'}});}});
 await client.complete({model:'m',messages:[]},undefined,{relayTicket:ticket});const payload=JSON.parse(calls[1].options.body);assert.equal(JSON.parse(payload.custom_include_headers).Authorization,'Bearer '+ticket);assert.equal(payload.custom_url,'http://127.0.0.1:8832/v1');assert.equal(payload.include_reasoning,false);
 await assert.rejects(client.complete({},undefined,{relayTicket:'actual-user-key'}),/INVALID_NATIVE_RELAY_TICKET/);assert.equal(calls.length,2);
});

test('native task user/persona projection is snapshotted before worker initialization and clears on an unbound request',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-task-projection-'));let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r),seen=[];
 const runtime=createAccountRuntime({directory,defaultPreset:config.preset,createWorker:async()=>{enter();await gate;return {compiler:{compile:async input=>{seen.push(input.taskContext);return {messages:[],scriptsDisabled:true};}},client:{complete:async()=>new Response(sse,{headers:{'Content-Type':'text/event-stream'}})},close:async()=>{}};}});
 try{const projection={userName:'源玩家',persona:'源人设'},pending=runtime.fetchForAccount({id:'a'},{nativePreset:config,taskContext:projection})('https://native-verification.invalid/v1/chat/completions',request());await entered;projection.userName='错误存档';projection.persona='错误人设';release();await(await pending).text();await(await runtime.fetchForAccount({id:'a'},{nativePreset:config})('https://native-verification.invalid/v1/chat/completions',request())).text();assert.deepEqual(seen,[{userName:'源玩家',persona:'源人设'},{userName:'User',persona:''}]);
 }finally{release();await runtime.close();await rm(directory,{recursive:true,force:true});}
});
