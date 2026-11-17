import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';
const root=resolve(import.meta.dirname,'..');
test('private card decision HTTP success and failure never return model raw or true-point speech',async()=>{
 const privateDir=await mkdtemp(resolve(tmpdir(),'eleven-http-'));let app,malformed=false;
 try{const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));const actor=card.characters[0];let calls=0;
 app=await createLocalServer({projectRoot:root,privateDir,port:0,channel:'test',card,fetchImpl:async()=>{calls++;return Response.json({choices:[{message:{content:malformed?'真实点数10点 RAW_PRIVATE':JSON.stringify({choice:'stand',text:'真实点数10点 RAW_PRIVATE'})}}]});}});
 const base='http://127.0.0.1:'+await app.start(),boot=await fetch(base+'/api/bootstrap'),cookie=boot.headers.get('set-cookie').split(';')[0];const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 const profile={id:'main',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:1000};assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
 const input={task:'party-eleven',sessionId:'s',actorIds:[actor.id],input:'选择',persona:{name:'玩家'},context:{audience:['player',actor.id],state:{characters:[]},party:{kind:'eleven',round:1,wave:1,participants:[{id:'player',name:'玩家'},{id:actor.id,name:actor.name}],banker:'player',hand:['S-A','H-9'],score:10,maxCards:5,stood:[]}},profile,key:'synthetic'};
 const ok=await post('/api/personal-terminal',input);assert.equal(ok.status,200);const text=await ok.text();assert.deepEqual(JSON.parse(text),{choice:'stand'});assert.ok(!text.includes('RAW_PRIVATE'));
 malformed=true;const bad=await post('/api/personal-terminal',input);assert.equal(bad.status,502);const error=await bad.text();assert.ok(!error.includes('RAW_PRIVATE'));assert.ok(!error.includes('真实点数'));assert.equal(calls,2);
 }finally{if(app){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));}await rm(privateDir,{recursive:true,force:true});}
});
