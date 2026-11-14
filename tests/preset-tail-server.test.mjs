import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildMessages} from '../server/ai.mjs';
import {continuedMessages} from '../server/story-stream.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {blankPresetTail} from '../src/domain/presets.ts';
import {createLocalServer} from '../server/app.mjs';
const root=resolve(import.meta.dirname,'..'),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
const request=()=>({persona:{name:'玩家'},requestId:'tail-request',sessionId:'tail-session',turnId:'tail-turn',input:'我走进教室。',history:[],opening:'',presets:[],memories:[],state:{player:{id:'player',name:'玩家',present:true},characters:[]},profile:{id:'tail-main',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:1,maxTokens:4096},key:'synthetic-key',theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),suggestionsEnabled:false});
for(const role of ['system','user','assistant'])test(role+' tail remains the actual final message after state/worldbook insertion and continuation',()=>{
 const tail={...blankPresetTail('legacy','预设'),enabled:true,role,content:'自填末尾 {{user}}',position:'in-chat',depth:100},ordinary={id:'ordinary',name:'普通后置',enabled:true,role:'system',position:'after',content:'普通后置规则'};
 const r={...request(),promptEntries:[tail,ordinary],worldInfo:[{uid:1,content:'深度世界书',position:4,depth:0,role:'system',order:1}]};
 const built=buildMessages(card,r);assert.equal(built.messages.at(-1).role,role);assert.equal(built.messages.at(-1).content,'自填末尾 玩家');
 assert.equal(continuedMessages(built.messages,'已有正文','玩家').at(-1).role,role);assert.equal(continuedMessages(built.messages,'已有正文','玩家').at(-1).content,'自填末尾 玩家');
 const wire=JSON.parse(JSON.stringify(built.messages));assert.deepEqual(Object.keys(wire.at(-1)).sort(),['content','role']);assert.ok(built.messages.some(m=>m.content.includes('[Output contract')));
});
test('disabled or empty tail leaves the original request unchanged, duplicate fixed tails are refused',()=>{
 const r=request(),base=buildMessages(card,{...r,promptEntries:[]}).messages;const tail=blankPresetTail('legacy','预设');
 assert.deepEqual(buildMessages(card,{...r,promptEntries:[tail]}).messages,base);
 assert.deepEqual(buildMessages(card,{...r,promptEntries:[{...tail,enabled:true}]}).messages,base);
 assert.throws(()=>buildMessages(card,{...r,promptEntries:[tail,{...tail,id:'another'}]}),/INVALID_PRESET/);
});
test('real HTTP generation sends the chosen final role to the configured text API without extra fields',async()=>{
 const calls=[],app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:'正文。<SR_DONE>'}}]});}});
 try{const base='http://127.0.0.1:'+await app.start(),boot=await fetch(base+'/api/bootstrap'),cookie=boot.headers.get('set-cookie').split(';')[0],post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)}),r=request();assert.equal((await post('/api/connection',{profileId:r.profile.id,apiBaseUrl:r.profile.apiBaseUrl})).status,200);
 for(const role of ['system','user','assistant']){const response=await post('/api/generate',{...r,stateEnabled:false,promptEntries:[{...blankPresetTail('legacy','预设'),enabled:true,role,content:'我的尾部文字'}]});assert.equal(response.status,200);await response.text();const sent=calls.at(-1);assert.deepEqual(sent.messages.at(-1),{role,content:'我的尾部文字'});assert.equal(sent.tools,undefined);}
 }finally{app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}
});
