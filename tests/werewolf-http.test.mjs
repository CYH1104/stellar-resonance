import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';
import {wolfRequest} from '../src/domain/werewolf.ts';
test('HTTP route runs exactly one private wolf call and strips raw output on success and failure',async()=>{
 const root=resolve(import.meta.dirname,'..'),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
 let calls=0,broken=false;const fetchImpl=async(_url,options)=>{
  calls++;const body=JSON.parse(options.body),wire=JSON.parse(body.messages[1].content);
  assert.equal(wire.view.roles,undefined);assert.equal(wire.view.inspections,undefined);
  const content=broken?'PRIVATE_WOLF_CANARY broken JSON':JSON.stringify({opinions:wire.actorIds.map(id=>({id,target:wire.choices.at(-1),reason:'PRIVATE_WOLF_CANARY'})),target:wire.choices.at(-1)});
  return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});
 };
 const app=await createLocalServer({projectRoot:root,port:0,fetchImpl,card,channel:'test'}),port=await app.start(),base=`http://127.0.0.1:${port}`;
 try{
  const bootstrap=await fetch(base+'/api/bootstrap'),cookie=bootstrap.headers.get('set-cookie').split(';')[0];
  const g={version:1,id:'test',at:'2026-11-26T04:00:00Z',storyDate:'星历578',anchor:{key:'opening:ab',turnId:'',variantId:'',path:['ab']},seats:['player','a','b','c','d','e'].map(id=>({id,name:id})),roles:['villager','wolf','wolf','seer','witch','villager'],actions:[]},r=wolfRequest(g,'werewolf-council','a');
  const data={task:r.task,actorIds:r.actorIds,context:{werewolf:r,traits:r.actorIds.map(id=>({id,personality:'测试性格'}))},profile:{id:'wolf-test',apiBaseUrl:'https://synthetic.example/v1',model:'synthetic-model',temperature:0.7,maxTokens:2000},key:'synthetic-key'};
  const configured=await fetch(base+'/api/connection',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({profileId:data.profile.id,apiBaseUrl:data.profile.apiBaseUrl})});assert.equal(configured.status,200);
  const post=()=>fetch(base+'/api/personal-terminal',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)});
  const good=await post();assert.equal(good.status,200);const result=await good.json();assert.equal(result.raw,undefined);assert.equal(result.opinions.length,2);assert.equal(calls,1);
  broken=true;const bad=await post();assert.equal(bad.status,502);const text=await bad.text();assert.ok(!text.includes('PRIVATE_WOLF_CANARY'));assert.ok(!text.includes('"raw"'));assert.equal(calls,2);
 }finally{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));}
});
