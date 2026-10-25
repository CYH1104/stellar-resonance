import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';

const root=resolve(import.meta.dirname,'..');
let app,base,cookie,instance,mode='ok',failure,started,aborted;
const models={apiBaseUrl:'https://synthetic.example/v1',key:'synthetic-key'};
const post=(path,body,signal=AbortSignal.timeout(3000))=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body),signal});
before(async()=>{
 const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
 app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:async(_url,{signal})=>{
  if(mode==='cancel')return new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{aborted();reject(signal.reason);},{once:true});started();});
  if(mode==='error')return new Response(new ReadableStream({start(controller){controller.error(failure);}}));
  return Response.json({data:[{id:'synthetic-model'}]});
 }});
 base=`http://127.0.0.1:${await app.start()}`;
 cookie=(await fetch(base+'/api/bootstrap')).headers.get('set-cookie').split(';')[0];
 instance=(await(await fetch(base+'/api/health')).json()).instance;
});
after(async()=>{app?.server.closeAllConnections();if(app)await new Promise(done=>app.server.close(done));});
async function checkStillUsable(){
 assert.equal((await(await fetch(base+'/api/health')).json()).instance,instance,'server instance must survive');
 mode='ok';const response=await post('/api/models',models);assert.equal(response.status,200,'the same session cookie must remain valid');assert.deepEqual((await response.json()).models,['synthetic-model']);
}

for(const [name,value,status,code] of [
 ['DOM abort with numeric code',new DOMException('private abort detail','AbortError'),500,'SERVER_ERROR'],
 ['numeric application code',{code:20,status:502},502,'SERVER_ERROR'],
 ['null',null,500,'SERVER_ERROR'],
 ['undefined',undefined,500,'SERVER_ERROR'],
 ['string','private upstream detail',500,'SERVER_ERROR'],
 ['invalid status',{code:'PRIVATE_CODE',status:700},500,'SERVER_ERROR'],
 ['timeout',new DOMException('private timeout detail','TimeoutError'),504,'MODEL_TIMEOUT'],
])test(`request failure is contained: ${name}`,{timeout:8000},async()=>{
 mode='error';failure=value;
 const response=await post('/api/models',models);assert.equal(response.status,status);assert.deepEqual(await response.json(),{code});
 await checkStillUsable();
});

test('cloud failure details and upstream status remain compatible',{timeout:8000},async()=>{
 mode='error';failure={status:502,code:'CLOUD_REQUEST_REJECTED',cloudDetail:'File',cloudStep:'上传备份',upstreamStatus:404,reason:'UPSTREAM_REJECTED',raw:'raw response'};
 const response=await post('/api/models',models);assert.equal(response.status,502);assert.deepEqual(await response.json(),{code:failure.code,cloudDetail:'File',cloudStep:'上传备份',upstreamStatus:404,reason:'UPSTREAM_REJECTED',raw:'raw response'});
 await checkStillUsable();
});

test('disconnecting a pending request preserves the server and other sessions',{timeout:8000},async()=>{
 mode='cancel';const upstreamStarted=new Promise(resolve=>{started=resolve;}),upstreamAborted=new Promise(resolve=>{aborted=resolve;});
 const controller=new AbortController();const request=post('/api/models',models,controller.signal);
 const rejected=assert.rejects(request,{name:'AbortError'});
 await upstreamStarted;controller.abort();await rejected;await upstreamAborted;
 await new Promise(resolve=>setImmediate(resolve));
 await checkStillUsable();
});
