import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProtectedGateway} from './protected-gateway.mjs';

test('gateway snapshots settings across compilation and distinguishes stop, limit, filter and EOF without retries',async()=>{
 let release,entered;const waiting=new Promise(r=>entered=r);let first=true,calls=0,mode='stop';const captured=[];
 const gateway=await createProtectedGateway({port:0,preset:{temperature:1,openai_max_tokens:100,prompts:[]},compiler:{async compile({preset}){captured.push(preset);if(first){first=false;entered();await new Promise(r=>release=r);}return {messages:[{role:'user',content:'test'}]};}},client:{async complete(body){calls++;captured.push(body);const end=mode==='eof'?'':`data: ${JSON.stringify({choices:[{delta:{},finish_reason:mode}]})}\n\ndata: [DONE]\n\n`;return new Response(`data: ${JSON.stringify({choices:[{delta:{content:'保留的部分正文'},finish_reason:null}]})}\n\n`+end,{headers:{'Content-Type':'text/event-stream'}});}}});
 try{
  const session=await fetch(gateway.origin+'/api/session'),cookie=session.headers.getSetCookie()[0].split(';')[0],{csrf}=await session.json();
  const post=(path,value)=>fetch(gateway.origin+path,{method:'POST',headers:{Cookie:cookie,Origin:gateway.origin,'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(value)});
  await post('/api/preset',{changes:{temperature:0.2,openai_max_tokens:2048}});
  const pending=post('/api/generate',{input:'test'});await waiting;
  await post('/api/preset',{changes:{temperature:0.9,openai_max_tokens:4096}});release();
  assert.match(await (await pending).text(),/"type":"done"/);
  assert.equal(captured[0].temperature,0.2);assert.equal(captured[1].temperature,0.2);assert.equal(captured[1].max_tokens,2048);
  for(const reason of ['length','content_filter','eof','stop']){mode=reason;const text=await (await post('/api/generate',{input:'test'})).text();assert.match(text,/保留的部分正文/);assert.equal(text.includes('"type":"done"'),reason==='stop');if(reason!=='stop'){assert.match(text,/GENERATION_INCOMPLETE/);assert.match(text,new RegExp(reason==='eof'?'unexpected_eof':reason));}}
  assert.equal(calls,5);assert.equal(captured[3].temperature,0.9);assert.equal(captured[3].max_tokens,4096);
 }finally{await gateway.close();}
});
