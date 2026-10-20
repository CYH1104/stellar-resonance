import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {developerAllowed,developerTrace} from '../server/developer-mode.mjs';import {createLocalServer} from '../server/app.mjs';import {initialState} from '../src/domain/story.ts';import {defaultTheaters} from '../src/domain/theaters.ts';
import {stateProtocol} from '../server/state-protocol.mjs';
test('request trace proves state rules and slot manifest were sent without claiming missing state was received',()=>{
 const content=stateProtocol({state:initialState('玩家'),theaterSettings:defaultTheaters()}),trace=developerTrace([{role:'system',content}],{stage:'complete',outcome:{event:'正文',stateUpdate:{received:false}}});
 assert.deepEqual(trace.outputContract,{state:true,slots:[1,2],messageIndex:1});assert.equal(trace.checks.stateReceived,false);assert.ok(!JSON.stringify(trace).includes('affinity:{delta'));
});
test('developer metadata is available only to three exact account emails and excludes message content',()=>{
 for(const email of ['1683264627@qq.com','2889463835@qq.com','237474810@qq.com'])assert.equal(developerAllowed({email}),true);
 for(const account of [null,{}, {email:'other@qq.com'},{email:'237474810@qq.com.evil'}])assert.equal(developerAllowed(account),false);
 const trace=developerTrace([{role:'system',content:'PRIVATE_SENTINEL',key:'SECRET'}],{stage:'request',model:'test'});assert.equal(trace.messages[0].characters,16);assert.ok(!JSON.stringify(trace).includes('PRIVATE_SENTINEL'));assert.ok(!JSON.stringify(trace).includes('SECRET'));
});
test('HTTP permissions ignore client developer flag and never expose traces to ordinary accounts',async()=>{
 const root=resolve(import.meta.dirname,'..'),directory=await mkdtemp(resolve(tmpdir(),'academy-dev-')),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));let calls=0;
 const app=await createLocalServer({projectRoot:root,port:0,authRequired:true,invitesRequired:false,accountDirectory:directory,card,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'正文。<SR_STATE>{"event":"推进","presentCharacterIds":[],"characters":[],"suggestions":[]}</SR_STATE><SR_DONE>'}}]}),{headers:{'Content-Type':'application/json'}});}});
 try{const base='http://127.0.0.1:'+await app.start();
 for(const email of ['other@qq.com','237474810@qq.com']){let cookie='';const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});const registration=await post('/api/auth/register',{email,password:'synthetic-pass'});assert.equal(registration.status,200);cookie=registration.headers.get('set-cookie').split(';')[0];const boot=await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}});cookie+='; '+boot.headers.get('set-cookie').split(';')[0];assert.equal((await boot.json()).developerMode,email!=='other@qq.com');
 const profile={id:'main',apiBaseUrl:'https://synthetic.example/v1',model:'synthetic',temperature:.7,maxTokens:1600};await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl});const response=await post('/api/generate',{developerMode:true,promptEntries:[{id:'preset-test',name:'Preset test',enabled:true,content:'STYLE_SENTINEL {{user}}'}],profile,key:'synthetic-key',persona:{name:'玩家'},state:initialState('玩家'),input:'观察',history:[],memories:[],presets:[],theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),singleStateCall:true});assert.equal(response.status,200);const stream=await response.text();assert.equal(stream.includes('developer-trace'),email!=='other@qq.com');assert.equal(stream.includes('STYLE_SENTINEL'),email!=='other@qq.com');if(email!=='other@qq.com'){assert.ok(stream.includes('STYLE_SENTINEL 玩家'));assert.ok(stream.includes('\"reason\":\"included\"'));assert.ok(stream.includes('\"sampling\"'));assert.ok(stream.includes('\"checks\"'));assert.ok(stream.includes('"stage":"complete"'));assert.ok(stream.indexOf('"stage":"complete"')<stream.indexOf('"type":"done"'));}assert.ok(!stream.includes('synthetic-key'));}
 assert.equal(calls,2);
 }finally{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
