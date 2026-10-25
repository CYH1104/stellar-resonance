import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';

test('terminal command retries one correctable format error, keeps locked targets, and preserves both drafts',async()=>{
 const root=resolve(import.meta.dirname,'..'),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
 let commandCalls=0,bodies=[],mode='retry';
 const app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body),prompt=body.messages[0].content;
  assert.ok(prompt.includes('目标已由程序随机抽取'));
  bodies.push(body);commandCalls++;
  const invalid='{"template":"请1号分享一件开心的事","targets":[1],"betrayal":false}',valid='{"template":"请{{target1}}分享一件开心的事","targets":[1],"betrayal":false}';
  const content=mode==='betrayal'?'{"template":"请{{target1}}泄露用户的秘密","targets":[1],"betrayal":false}':mode==='mismatch'?'{"template":"请{{target1}}分享一件开心的事","targets":[2],"betrayal":false}':mode==='invalid'||commandCalls%2===1?invalid:valid;
  return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});
 }});
 try{
  const base=`http://127.0.0.1:${await app.start()}`,boot=await fetch(base+'/api/bootstrap'),cookie=boot.headers.get('set-cookie').split(';')[0];
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  const profile={id:'terminal-correction',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:32000};
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
  const data={task:'command',actorIds:[card.characters[0].id],input:'请针对锁定的匿名目标发布本轮命令。',persona:{name:'验收玩家'},context:{maxNumber:3,targets:[1],participantNames:['参与者甲','验收玩家']},profile,key:'synthetic-key'};
  const response=await post('/api/personal-terminal',data);assert.equal(response.status,200);const payload=await response.json();
  assert.equal(payload.text,'请1号分享一件开心的事');assert.deepEqual(payload.targets,[1]);assert.equal(commandCalls,2);
  assert.ok(payload.raw.includes('请1号分享一件开心的事'));assert.ok(payload.raw.includes('[纠正稿]'));assert.ok(payload.raw.includes('请{{target1}}分享一件开心的事'));
  const retryMessages=bodies[1].messages;assert.ok(!JSON.stringify(retryMessages).includes('参与者甲'));assert.deepEqual(JSON.parse(bodies[0].messages.at(-1).content).context.targets,[1]);
  mode='invalid';const before=commandCalls;const failed=await post('/api/personal-terminal',data);assert.equal(failed.status,502);const failure=await failed.json();assert.equal(failure.code,'INVALID_TERMINAL_RESULT');assert.equal(failure.reason,'KING_TEMPLATE_FORMAT');assert.equal(commandCalls-before,2);assert.ok(failure.raw.includes('[纠正稿]'));
  mode='mismatch';const mismatch=await post('/api/personal-terminal',data);assert.equal(mismatch.status,502);assert.equal((await mismatch.json()).reason,'KING_TARGETS_MISMATCH');assert.equal(commandCalls-before,3);
  mode='betrayal';const betrayed=await post('/api/personal-terminal',data);assert.equal(betrayed.status,502);assert.equal((await betrayed.json()).reason,'KING_COMMAND_BETRAYAL');assert.equal(commandCalls-before,4);
 }finally{app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}
});

test('oversized terminal model output is marked as truncated and never exceeds the raw budget',async()=>{
 const root=resolve(import.meta.dirname,'..'),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));let calls=0;
 const app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:async()=>{calls++;const content='{"accepted":false,"reply":"'+'x'.repeat(49000)+'"}';return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});}});
 try{
  const base=`http://127.0.0.1:${await app.start()}`,boot=await fetch(base+'/api/bootstrap'),cookie=boot.headers.get('set-cookie').split(';')[0];
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  const profile={id:'terminal-raw-limit',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:32000};
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
  const data={task:'friend',actorIds:[card.characters[0].id],input:'添加好友',persona:{name:'验收玩家'},context:{},profile,key:'synthetic-key'};
  const response=await post('/api/personal-terminal',data);assert.equal(response.status,502);const payload=await response.json();assert.equal(payload.code,'INVALID_TERMINAL_RESULT');assert.equal(calls,1);assert.ok(payload.raw.length<=48000);assert.ok(payload.raw.includes('已截断'));assert.ok(payload.raw.includes('原长度'));
 }finally{app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}
});
