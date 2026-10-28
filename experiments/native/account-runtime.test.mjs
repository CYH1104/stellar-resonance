import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createAccountRuntime} from './account-runtime.mjs';
const config={version:1,preset:{temperature:1,prompts:[],prompt_order:[]}};
test('legacy config is read-only for migration and isolated by account and dataVersion',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-accounts-'));
 const {writeFile,readFile,readdir}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const key=createHash('sha256').update(JSON.stringify(['a',0])).digest('hex'),path=join(directory,key+'.json');
 const legacy={version:1,preset:{...config.preset,temperature:0.2,extensions:{future:{keep:true}}}};await writeFile(path,JSON.stringify(legacy));
 const runtime=createAccountRuntime({directory,defaultPreset:config.preset,createWorker:()=>{throw Error('not requested');}});
 try{const a=await runtime.configure({id:'a'},{action:'read'});assert.deepEqual(a.preset,legacy.preset);assert.equal(a.defaultPreset.temperature,1);
  assert.equal((await runtime.configure({id:'b'},{action:'read'})).preset.temperature,1);assert.equal((await runtime.configure({id:'a',dataVersion:1},{action:'read'})).preset.temperature,1);
  await assert.rejects(runtime.configure(null,{action:'read'}));await assert.rejects(runtime.configure({id:'a'},{action:'read',accountId:'b'}));
  await assert.rejects(runtime.configure({id:'a'},{action:'save',changes:{temperature:0.8}}),{code:'NATIVE_CONFIG_LOCAL_AUTHORITY'});
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),legacy);assert.deepEqual(await readdir(directory),[key+'.json']);
 }finally{await runtime.close();await rm(directory,{recursive:true,force:true});}
});
test('native account transport preserves partial prose and never marks limit or EOF complete',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-account-stream-'));let mode='length',calls=0;
 const runtime=createAccountRuntime({directory,defaultPreset:{prompts:[],prompt_order:[]},createWorker:async()=>({compiler:{compile:async()=>({messages:[],scriptsDisabled:true})},client:{complete:async()=>{calls++;return new Response('data: '+JSON.stringify({choices:[{delta:{content:'保留正文'},finish_reason:null}]})+'\n\n'+(mode==='eof'?'':'data: '+JSON.stringify({choices:[{delta:{},finish_reason:mode}]})+'\n\n'),{headers:{'Content-Type':'text/event-stream'}});}},close:async()=>{}})});
 try{for(const reason of ['length','eof','stop']){mode=reason;const response=await runtime.fetchForAccount({id:'a'},{nativePreset:config})('https://native-verification.invalid/v1/chat/completions',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'continue'}]})});const reader=response.body.getReader();let value='',error;try{while(true){const next=await reader.read();if(next.done)break;value+=new TextDecoder().decode(next.value);}}catch(e){error=e;}assert.match(value,/保留正文/);assert.equal(value.includes('[DONE]'),reason==='stop');assert.equal(error?.code,reason==='length'?'MODEL_OUTPUT_LIMIT':reason==='eof'?'MODEL_STREAM_INTERRUPTED':undefined);}assert.equal(calls,3);}finally{await runtime.close();await rm(directory,{recursive:true,force:true});}
});

test('generation snapshots player configuration before awaiting a worker and never writes server settings',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-config-snapshot-'));let release,entered;const waiting=new Promise(r=>entered=r),captured=[];
 const runtime=createAccountRuntime({directory,defaultPreset:config.preset,createWorker:async()=>{entered();await new Promise(r=>release=r);return {compiler:{compile:async p=>{captured.push(p.preset);return {messages:[],scriptsDisabled:true};}},client:{complete:async body=>{captured.push(body);return new Response('data: '+JSON.stringify({choices:[{delta:{content:'ok'},finish_reason:'stop'}]})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});}},close:async()=>{}};}});
 try{await assert.rejects(runtime.fetchForAccount({id:'a'})('https://native-verification.invalid/v1/chat/completions',{method:'POST',body:'{}'}),{code:'NATIVE_PRESET_REQUIRED'});
  const saved=structuredClone(config);saved.preset.temperature=0.2;saved.preset.openai_max_tokens=2048;
  const pending=runtime.fetchForAccount({id:'a'},{nativePreset:saved})('https://native-verification.invalid/v1/chat/completions',{method:'POST',body:'{"messages":[]}'});
  await waiting;saved.preset.temperature=0.9;release();await (await pending).text();assert.equal(captured[0].temperature,0.2);assert.equal(captured[1].temperature,0.2);assert.equal(captured[1].max_tokens,2048);assert.deepEqual(await (await import('node:fs/promises')).readdir(directory),[]);
 }finally{await runtime.close();await rm(directory,{recursive:true,force:true});}
});
