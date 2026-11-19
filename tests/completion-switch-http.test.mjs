import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';import {defaultTheaters} from '../src/domain/theaters.ts';

test('real HTTP providers: switching the same API slot changes endpoint, model and key; late old failure and cancellation cannot redirect the next call',async()=>{
 const calls=[],waiters=[];let releaseSlow,slowStarted;const started=new Promise(resolve=>slowStarted=resolve);
 const provider=createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);calls.push({path:req.url,key:req.headers.authorization,body});
  if(req.url==='/a'&&body.max_tokens!==512){slowStarted();await new Promise(resolve=>{releaseSlow=resolve;waiters.push(resolve);});res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'system message not supported synthetic-key-a'}}));return;}
  // B uses a visible text-completion field and a wrong SSE MIME on its JSON.
  const content='合成正文。<SR_STATE>{"event":"合成推进"}</SR_STATE><SR_DONE>';
  res.writeHead(200,{'Content-Type':req.url==='/b'?'text/event-stream':'application/json'});res.end(JSON.stringify({choices:[req.url==='/b'?{text:content}:{message:{content}}]}));
 });
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
 let app;
 try{
  const root=resolve(import.meta.dirname,'..'),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
  app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:(url,init)=>fetch('http://127.0.0.1:'+provider.address().port+(new URL(url).hostname==='provider-a.example'?'/a':'/b'),init)});
  const origin='http://127.0.0.1:'+await app.start(),cookie=(await fetch(origin+'/api/bootstrap')).headers.get('set-cookie').split(';')[0],post=(path,body,signal)=>fetch(origin+path,{method:'POST',signal,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const profileA={id:'main',providerId:'approved-provider',name:'主API',apiBaseUrl:'https://provider-a.example/v1',model:'model-a',maxTokens:4096,temperature:1,topP:1},profileB={...profileA,apiBaseUrl:'https://provider-b.example/v1',model:'model-b'};
  assert.equal((await post('/api/connection',{profileId:'main',apiBaseUrl:profileA.apiBaseUrl})).status,200);
  assert.equal((await post('/api/probe',{profile:profileA,key:'synthetic-key-a',kind:'text'})).status,200);
  const game=await(await post('/api/new-game',{persona:{name:'合成玩家',primaryGender:'男'}})).json(),request={persona:{name:'合成玩家',primaryGender:'男'},opening:game.opening,state:game.initial,input:'继续',history:[],memories:[],presets:[],stateEnabled:false,suggestionsEnabled:false,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),singleStateCall:true};
  const old=post('/api/generate',{...request,profile:profileA,key:'synthetic-key-a'});await started;
  assert.equal((await post('/api/connection',{profileId:'main',apiBaseUrl:profileB.apiBaseUrl})).status,200);
  const next=await post('/api/generate',{...request,profile:profileB,key:'synthetic-key-b'});assert.equal(next.status,200);assert.ok((await next.text()).includes('合成正文'));
  releaseSlow();const failed=await old,result=await failed.json();assert.equal(result.upstreamStatus,500);assert.equal(result.code,'UPSTREAM_SERVER_ERROR');assert.equal(result.reason,'UPSTREAM_MESSAGE_ROLES');assert.equal(result.requestShape.toolFields,0);assert.ok(result.requestShape.system>=1);assert.ok(result.upstreamMessage.includes('system message not supported'));assert.ok(!JSON.stringify(result).includes('synthetic-key-a'));
  assert.deepEqual(calls.map(c=>[c.path,c.body.model,c.key]),[['/a','model-a','Bearer synthetic-key-a'],['/a','model-a','Bearer synthetic-key-a'],['/b','model-b','Bearer synthetic-key-b']]);
  assert.equal((await post('/api/generate',{...request,profile:profileA,key:'synthetic-key-a'})).status,412);assert.equal(calls.length,3);
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>post('/api/generate',{...request,profile:profileB,key:'synthetic-key-b'},cancelled.signal),e=>e.name==='AbortError');
  const final=await post('/api/generate',{...request,profile:profileB,key:'synthetic-key-b'});assert.equal(final.status,200);await final.text();assert.equal(calls.length,4);assert.equal(calls.at(-1).body.model,'model-b');
  await post('/api/connection',{profileId:'main',apiBaseUrl:profileA.apiBaseUrl});
  const midflight=new AbortController(),pending=post('/api/generate',{...request,profile:profileA,key:'synthetic-key-a'},midflight.signal).then(()=>assert.fail('cancelled request resolved'),e=>assert.equal(e.name,'AbortError'));
  for(let i=0;i<100&&calls.length<5;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls.length,5);midflight.abort();await pending;
  await post('/api/connection',{profileId:'main',apiBaseUrl:profileB.apiBaseUrl});const afterCancel=await post('/api/generate',{...request,profile:profileB,key:'synthetic-key-b'});assert.equal(afterCancel.status,200);await afterCancel.text();releaseSlow();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(calls.length,6);assert.equal(calls.at(-1).key,'Bearer synthetic-key-b');
 }finally{for(const release of waiters)release();if(app){app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));}provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));}
});
