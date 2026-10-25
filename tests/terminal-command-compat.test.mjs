import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';

test('old clients without participantNames still get a valid command plan; only new invalid lists are rejected',async()=>{
 const root=resolve(import.meta.dirname,'..'),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
 const bodies=[];
 const app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);bodies.push(body);
  const content=JSON.stringify({template:'请{{target1}}分享一件开心的事',targets:[1],betrayal:false});
  return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});
 }});
 try{
  const base=`http://127.0.0.1:${await app.start()}`,boot=await fetch(base+'/api/bootstrap'),cookie=boot.headers.get('set-cookie').split(';')[0];
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  const profile={id:'terminal-compat',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:32000};
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
  const baseData={task:'command',actorIds:[card.characters[0].id],input:'请针对锁定的匿名目标发布本轮命令。',persona:{name:'验收玩家'},profile,key:'synthetic-key'};
  const legacy={...baseData,context:{maxNumber:3,targets:[1]}};
  const oldResponse=await post('/api/personal-terminal',legacy);
  assert.equal(oldResponse.status,200);
  assert.equal((await oldResponse.json()).text,'请1号分享一件开心的事');
  assert.equal(JSON.stringify(bodies[0].messages).includes('participantNames'),false);
  const calls=bodies.length;

  const invalidEmpty={...baseData,context:{maxNumber:3,targets:[1],participantNames:[]}};
  assert.equal((await post('/api/personal-terminal',invalidEmpty)).status,400);
  const invalidMany={...baseData,context:{maxNumber:3,targets:[1],participantNames:['甲','乙','丙','丁','戊','己','庚','辛','壬']}};
  assert.equal((await post('/api/personal-terminal',invalidMany)).status,400);
  assert.equal(bodies.length,calls);

  const valid={...baseData,context:{maxNumber:3,targets:[1],participantNames:['参与者甲','验收玩家']}};
  assert.equal((await post('/api/personal-terminal',valid)).status,200);
  assert.equal(JSON.stringify(bodies.at(-1).messages).includes('参与者甲'),false);
 }finally{app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}
});
