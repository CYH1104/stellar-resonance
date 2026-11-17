import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';
const root=resolve(import.meta.dirname,'..');
test('terminal HTTP route supplies private worldbook and authoritative gender with the current persona without exposing source text',async()=>{
 const privateDir=await mkdtemp(resolve(tmpdir(),'terminal-character-http-'));let app;
 try{await mkdir(resolve(privateDir,'worldbooks'));await writeFile(resolve(privateDir,'worldbooks/yanxi.json'),JSON.stringify({name:'测试世界书',entries:{0:{key:['颜希'],content:'颜希\n\n男性 Omega；TARGET_PRIVATE_LORE',position:1}}}));
 const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));card.characters=[{id:'yanxi',name:'颜 希',primaryGender:'男',sex:'Omega',intro:'后勤负责人'}];const calls=[];
 app=await createLocalServer({projectRoot:root,privateDir,port:0,channel:'test',card,fetchImpl:async(_url,options)=>{calls.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:JSON.stringify({messages:[{id:'yanxi',text:'我在。'}],topic:'问候'})}}]});}});
 const base='http://127.0.0.1:'+await app.start(),boot=await fetch(base+'/api/bootstrap'),bootstrapText=await boot.text(),cookie=boot.headers.get('set-cookie').split(';')[0];assert.ok(!bootstrapText.includes('TARGET_PRIVATE_LORE'));
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const profile={id:'main',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:1000};assert.equal((await post('/api/connection',{profileId:'main',apiBaseUrl:profile.apiBaseUrl})).status,200);
 const r=await post('/api/personal-terminal',{task:'chat',actorIds:['yanxi'],input:'你好，颜希。',persona:{name:'玩家',primaryGender:'男',rawText:'CURRENT_PERSONA_SENTINEL'},context:{state:{characters:[{id:'yanxi',name:'颜希',primaryGender:'女',present:true}]},audience:['player','yanxi'],conversation:{group:false,members:['yanxi'],messages:[]}},profile,key:'synthetic'});
 assert.equal(r.status,200);const response=await r.text();assert.ok(!response.includes('TARGET_PRIVATE_LORE'));assert.equal(calls.length,1);const content=JSON.stringify(calls[0].messages);assert.ok(content.includes('TARGET_PRIVATE_LORE'));assert.ok(content.includes('CURRENT_PERSONA_SENTINEL'));const authoritative=calls[0].messages.find(m=>m.content.startsWith('Authoritative character gender facts'));assert.ok(authoritative.content.includes('"primaryGender":"男"'));assert.ok(!authoritative.content.includes('"primaryGender":"女"'));
 }finally{if(app){app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}await rm(privateDir,{recursive:true,force:true});}
});
