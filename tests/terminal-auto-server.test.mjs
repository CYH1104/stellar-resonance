// 独立终端任务（main-auto）的 HTTP 契约：自己的提示词、自己的请求体、自己的校验。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';

const root=resolve(import.meta.dirname,'..');
const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
const actorId=card.characters[0].id;
const profile={id:'terminal-auto',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:4000};
const mainContext={initialized:false,groups:[],newGroupIds:['g1','g2','g3','g4','g5'],friendIds:[],courses:[]};
const batch={protocolVersion:2,groups:[{id:'g1',title:'训练群',members:[actorId],ownerId:actorId,adminIds:[],announcement:'',messages:[{id:actorId,text:'明天训练。'},{id:actorId,text:'九点集合。'},{id:actorId,text:'别迟到。'},{id:actorId,text:'记得带水。'}],topic:'训练安排'}],privateMessages:[],friendRequests:[],courses:[]};

async function start(content){
  const calls=[];
  const app=await createLocalServer({projectRoot:root,port:0,card,channel:'test',fetchImpl:async(_url,options)=>{
    calls.push(JSON.parse(options.body));
    return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});
  }});
  const base=`http://127.0.0.1:${await app.start()}`;
  const boot=await fetch(base+'/api/bootstrap');
  const cookie=boot.headers.get('set-cookie').split(';')[0];
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  return {app,base,post,calls};
}
const close=async server=>{server.closeAllConnections();await new Promise(done=>server.close(done));};
const request=(overrides={})=>({task:'main-auto',mode:'story-first',actorIds:[actorId],input:'我走进教室。',persona:{name:'玩家'},profile,key:'synthetic-key',context:{state:{characters:[]},mainContext,story:'正文里玩家走进教室。',allowSocial:true},...overrides});

test('an independent terminal request carries its own prompt and returns a bare batch',async()=>{
  const {app,post,calls}=await start(JSON.stringify(batch));
  try{
    assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
    const response=await post('/api/personal-terminal',request());
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.groups.length,1);
    assert.equal(result.groups[0].messages.length,4);
    const sent=JSON.stringify(calls[0]);
    assert.ok(sent.includes('独立请求'),'the independent terminal prompt must be used');
    assert.ok(sent.includes('只输出下面的通讯 JSON'));
    assert.ok(sent.includes('正文里玩家走进教室。'),'prose-first requests receive the committed prose');
  }finally{await close(app.server);}
});

test('terminal-first refuses social actions that cannot be verified against prose',async()=>{
  const {app,post,calls}=await start(JSON.stringify(batch));
  try{
    assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
    const response=await post('/api/personal-terminal',request({mode:'terminal-first',context:{state:{characters:[]},mainContext,story:'',allowSocial:true}}));
    assert.equal(response.status,400);
    assert.equal(calls.length,0,'an invalid mode must be rejected before spending a request');
  }finally{await close(app.server);}
});

test('terminal-first accepts an independent request with empty prose and no social actions',async()=>{
  const {app,post,calls}=await start(JSON.stringify({...batch,friendRequests:[]}));
  try{
    assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
    const response=await post('/api/personal-terminal',request({mode:'terminal-first',context:{state:{characters:[]},mainContext,story:'',allowSocial:false}}));
    assert.equal(response.status,200);
    assert.ok(JSON.stringify(calls[0]).includes('本轮正文尚未生成'),'the prompt must say prose does not exist yet');
  }finally{await close(app.server);}
});

test('8807 phone requires its own configured connection before any model call',async()=>{
  const app=await createLocalServer({projectRoot:root,port:0,card,channel:'stable',fetchImpl:async()=>{throw Error('must not call upstream');}});
  try{
    const base=`http://127.0.0.1:${await app.start()}`;
    const boot=await fetch(base+'/api/bootstrap');
    const cookie=boot.headers.get('set-cookie').split(';')[0];
    const response=await fetch(base+'/api/personal-terminal',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(request())});
    assert.equal(response.status,412);
    assert.equal((await response.json()).code,'MODEL_NOT_CONFIGURED');
  }finally{await close(app.server);}
});
