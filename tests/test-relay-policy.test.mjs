import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';
import {createRelayPolicy} from '../server/relay-policy.mjs';
import {editorAccessKey} from '../server/editor-gateway.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';

const root=resolve(import.meta.dirname,'..');
const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
const unrelated='https://unrelated-policy.example';
const relay='https://arbitrary-test-relay.example:9443/v1';
const key='synthetic-test-relay-key';
const profile={id:'test-relay',model:'synthetic-model',apiBaseUrl:relay,temperature:.7,maxTokens:1600};
const generation={sessionId:'relay-session',turnId:'relay-turn',persona:{name:'测试玩家'},opening:'开场',input:'我观察周围。',history:[],presets:[],memories:[],state:{player:{id:'player',name:'测试玩家',present:true},characters:[]},profile,key,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),suggestionsEnabled:false};
const close=async app=>{if(!app)return;app.server.closeAllConnections();await new Promise(done=>app.server.close(done));};
const cookieOf=response=>{const header=response.headers.get('set-cookie');assert.ok(header,'the real auth/bootstrap route sets a cookie');return header.split(';')[0];};

async function start(channel,privateDir){
 const policyFile=resolve(privateDir,'accounts/relay-policy.json');
 await mkdir(resolve(privateDir,'accounts'),{recursive:true});
 await writeFile(policyFile,JSON.stringify({version:1,origins:[unrelated]}));
 const calls=[];
 const app=await createLocalServer({projectRoot:root,port:0,card,channel,privateDir,authRequired:true,invitesRequired:false,fetchImpl:async(url,options={})=>{
  // Every non-local network request is intercepted here: no real key or upstream is used.
  const target=new URL(String(url));assert.equal(target.origin,new URL(relay).origin);assert.equal(options.redirect,'error');
  calls.push({url:target.href,method:options.method||'GET',body:options.body?JSON.parse(options.body):undefined});
  if(target.pathname==='/v1/models')return Response.json({data:[{id:profile.model}]});
  assert.equal(target.pathname,'/v1/chat/completions');
  return Response.json({choices:[{message:{content:'正文。<SR_STATE>{"presentCharacterIds":[],"characters":[],"event":"观察周围"}</SR_STATE><SR_DONE>'},finish_reason:'stop'}]});
 }});
 try{
  const base=`http://127.0.0.1:${await app.start()}`;
  assert.equal((await fetch(base+'/api/bootstrap')).status,401,'account auth remains required');
  const registered=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test-relay-policy@qq.com',password:'Synthetic-Relay-Password-1'})});
  assert.equal(registered.status,200);const accountCookie=cookieOf(registered);
  const bootstrap=await fetch(base+'/api/bootstrap',{headers:{Cookie:accountCookie}});assert.equal(bootstrap.status,200);
  assert.equal((await bootstrap.json()).capabilities.channel,channel);
  const sessionCookie=cookieOf(bootstrap),cookies=accountCookie+'; '+sessionCookie;
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookies},body:JSON.stringify(data)});
  return {app,base,post,calls,policyFile,privateDir,accountCookie,sessionCookie};
 }catch(error){await close(app);throw error;}
}

test('authenticated test channel bypasses an unrelated relay policy for connection, models, probe and generation while stable still rejects it',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'test-relay-http-'));
 let stable,tested;
 try{
  stable=await start('stable',resolve(directory,'stable'));
  tested=await start('test',resolve(directory,'test'));
  assert.notEqual(stable.accountCookie.split('=')[0],tested.accountCookie.split('=')[0]);
  assert.notEqual(stable.sessionCookie.split('=')[0],tested.sessionCookie.split('=')[0]);
  for(const [channel,fixture]of [['stable',stable],['test',tested]]){
   const denied=await fetch(fixture.base+'/editor/accounts.js');assert.equal(denied.status,401,'editor resources still require their own login');
   const editorKey=await editorAccessKey(root,fixture.privateDir);
   const login=await fetch(fixture.base+'/editor/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:editorKey})});assert.equal(login.status,200);
   const script=await fetch(fixture.base+'/editor/accounts.js',{headers:{Cookie:cookieOf(login)}});assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/^text\/javascript/);
   const source=await script.text();assert.ok(source.startsWith('const relayPolicyEnabled='+(channel==='stable')+';\n'),'channel-specific policy visibility is injected into the actual authenticated script');
  }
  const connection=await tested.post('/api/connection',{profileId:profile.id,apiBaseUrl:relay});
  assert.equal(connection.status,200);assert.deepEqual(await connection.json(),{profileId:profile.id,origin:new URL(relay).origin,registered:true});
  assert.equal(tested.calls.length,0,'registering a connection does not call the model');
  const models=await tested.post('/api/models',{apiBaseUrl:relay,key});assert.equal(models.status,200);assert.deepEqual(await models.json(),{models:[profile.model]});
  const probe=await tested.post('/api/probe',{kind:'text',profile,key});assert.equal(probe.status,200);const probeResult=await probe.json();assert.equal(probeResult.kind,'text');assert.ok(probeResult.visibleChars>0);
  const generated=await tested.post('/api/generate',generation);assert.equal(generated.status,200);const stream=await generated.text();assert.ok(stream.includes('正文。'));assert.ok(stream.includes('"type":"done"'),stream);
  assert.deepEqual(tested.calls.map(c=>new URL(c.url).pathname),['/v1/models','/v1/chat/completions','/v1/chat/completions']);
  assert.equal(tested.calls[1].body.max_tokens,512,'probe traverses the real model request path');
  for(const [path,body]of [['/api/connection',{profileId:profile.id,apiBaseUrl:relay}],['/api/models',{apiBaseUrl:relay,key}],['/api/probe',{kind:'text',profile,key}]]){
   const rejected=await stable.post(path,body);assert.equal(rejected.status,403,path);assert.equal((await rejected.json()).code,'API_ORIGIN_NOT_ALLOWED',path);
  }
  // Register stable against its permitted origin, then tighten policy to prove generation rechecks it.
  assert.equal((await stable.post('/api/connection',{profileId:profile.id,apiBaseUrl:unrelated+'/v1'})).status,200);
  await writeFile(stable.policyFile,JSON.stringify({version:1,origins:['https://another-unrelated.example']}));
  const rejectedGeneration=await stable.post('/api/generate',{...generation,profile:{...profile,apiBaseUrl:unrelated+'/v1'}});
  assert.equal(rejectedGeneration.status,403);assert.equal((await rejectedGeneration.json()).code,'API_ORIGIN_NOT_ALLOWED');
  assert.equal(stable.calls.length,0,'stable policy rejection occurs before any upstream fetch');
  assert.deepEqual(JSON.parse(await readFile(tested.policyFile,'utf8')),{version:1,origins:[unrelated]},'test bypass does not mutate its policy file');
 }finally{await close(stable?.app);await close(tested?.app);await rm(directory,{recursive:true,force:true});}
});

test('disabled relay policy bypasses malformed persisted policy without reading it but still rejects invalid URL values',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'test-relay-disabled-')),file=resolve(directory,'policy.json');
 try{
  await writeFile(file,'{not valid policy JSON');
  const disabled=createRelayPolicy(file,{required:true,enabled:false});assert.equal(disabled.enabled,false);
  await disabled.assert(relay+'/chat/completions');
  let calls=0;const guarded=disabled.guard(async(url,options)=>{calls++;assert.equal(url,relay+'/models');assert.equal(options.redirect,'error');return {ok:true};});
  assert.deepEqual(await guarded(relay+'/models',{}),{ok:true});assert.equal(calls,1);
  for(const invalid of ['file:///private','https://user:secret@relay.example/v1','https://relay.example/v1?key=secret','https://relay.example/#fragment','not a URL',null,{}])await assert.rejects(disabled.assert(invalid),{code:'INVALID_API_ORIGIN'});
  await assert.rejects(guarded('file:///private',{}),{code:'INVALID_API_ORIGIN'});assert.equal(calls,1,'invalid URLs never reach the underlying fetch');
  await assert.rejects(createRelayPolicy(file,{required:true,enabled:true}).assert(relay),{code:'API_POLICY_UNAVAILABLE'},'enabled policy still reads and fails closed on corrupt JSON');
  assert.equal(await readFile(file,'utf8'),'{not valid policy JSON');
 }finally{await rm(directory,{recursive:true,force:true});}
});
