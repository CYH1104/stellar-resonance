// 终端请求的实际模型上下文：已确认正文历史、按知情范围标注的记忆、各群本群历史，
// 以及正文后的社交动作核验阶段（只出动作，不重生成群聊）。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';

const root=resolve(import.meta.dirname,'..');
const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
const actorId=card.characters[0].id;
const secondId=card.characters[1]?.id||actorId;
const profile={id:'terminal-context',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:4000};
const emptyBatch={protocolVersion:2,groups:[],privateMessages:[],friendRequests:[],courses:[]};

async function start(content){
 const calls=[];
 const app=await createLocalServer({projectRoot:root,port:0,card,channel:'test',fetchImpl:async(_url,options)=>{
  calls.push(JSON.parse(options.body));
  return new Response(JSON.stringify({choices:[{message:{content:typeof content==='function'?content(calls.length):content}}]}),{headers:{'Content-Type':'application/json'}});
 }});
 const base=`http://127.0.0.1:${await app.start()}`;
 const boot=await fetch(base+'/api/bootstrap');
 const cookie=boot.headers.get('set-cookie').split(';')[0];
 const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
 return {app,base,post,calls};
}
const close=async server=>{server.closeAllConnections();await new Promise(done=>server.close(done));};

function mainContext(overrides={}){
 return {initialized:true,groups:[
  {id:'g1',title:'训练群',members:[actorId],ownerId:actorId,adminIds:[],announcement:'',history:[{speaker:'甲',text:'GROUP_ONE_INTERNAL'}]},
  {id:'g2',title:'教学群',members:[secondId],ownerId:secondId,adminIds:[],announcement:'',history:[{speaker:'乙',text:'GROUP_TWO_INTERNAL'}]}
 ],newGroupIds:['n1','n2','n3','n4','n5'],friendIds:[actorId],courses:[],
  history:[{role:'user',content:'PRIOR_ACTION'},{role:'assistant',content:'CONFIRMED_HISTORY_CANARY_9000'}],
  memories:[{text:'MEMORY_CANARY_SECRET',knownBy:['player',actorId]}],
  ...overrides};
}
const request=(overrides={})=>({task:'main-auto',mode:'terminal-first',actorIds:[actorId],input:'继续',persona:{name:'玩家'},profile,key:'synthetic-key',context:{state:{characters:[]},mainContext:mainContext(),story:'',allowSocial:false},...overrides});

test('terminal-first sends confirmed history, scoped memories and per-group history to the model',async()=>{
 const {app,post,calls}=await start(JSON.stringify(emptyBatch));
 try{
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
  const response=await post('/api/personal-terminal',request());
  assert.equal(response.status,200);
  const sent=JSON.stringify(calls[0].messages);
  assert.ok(sent.includes('CONFIRMED_HISTORY_CANARY_9000'),'confirmed prose history must reach the model messages');
  assert.ok(sent.includes('PRIOR_ACTION'));
  assert.ok(sent.includes('MEMORY_CANARY_SECRET'),'scoped memory facts must reach the model messages');
  assert.ok(sent.includes('GROUP_ONE_INTERNAL')&&sent.includes('GROUP_TWO_INTERNAL'));
  assert.ok(sent.includes('已确认剧情历史'),'the prompt must name the confirmed history block');
  // 各群历史互不串群：训练群的历史不出现在教学群对象里
  const withContext=calls[0].messages.find(m=>String(m.content).includes('终端上下文（数据）：'));
  const json=JSON.parse(String(withContext.content).slice(String(withContext.content).indexOf('终端上下文（数据）：')+'终端上下文（数据）：'.length));
  const g1=json.groups.find(g=>g.id==='g1'),g2=json.groups.find(g=>g.id==='g2');
  assert.deepEqual(g1.history,[{speaker:'甲',text:'GROUP_ONE_INTERNAL'}]);
  assert.deepEqual(g2.history,[{speaker:'乙',text:'GROUP_TWO_INTERNAL'}]);
  assert.ok(!JSON.stringify(g1).includes('GROUP_TWO_INTERNAL'));
 }finally{await close(app.server);}
});

test('the social review only proposes actions and drops generated chats',async()=>{
 const withGroups={protocolVersion:2,groups:[{id:'g1',title:'训练群',members:[actorId],ownerId:actorId,adminIds:[],announcement:'',messages:[{id:actorId,text:'不该生成的群消息'},{id:actorId,text:'不该生成的群消息2'},{id:actorId,text:'不该生成的群消息3'},{id:actorId,text:'不该生成的群消息4'}],topic:'重生成'}],privateMessages:[{id:actorId,text:'不该生成的私聊',topic:'重生成'}],friendRequests:[{id:actorId,reason:'刚才交换了号码',source:'你写在黑板上的号码'}],courses:[]};
 const {app,post,calls}=await start(JSON.stringify(withGroups));
 try{
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
  const response=await post('/api/personal-terminal',request({mode:'story-first',context:{state:{characters:[]},mainContext:mainContext({socialOnly:true}),story:'甲同意了我的好友申请。',allowSocial:true}}));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.groups.length,0,'the social review must not accept regenerated group messages');
  assert.equal(result.privateMessages.length,0);
  assert.equal(result.friendRequests.length,1);
  assert.ok(JSON.stringify(calls[0].messages).includes('本次只核查社交动作'));
 }finally{await close(app.server);}
});

test('the social review requires committed prose and rejects the pre-prose order',async()=>{
 const {app,post,calls}=await start(JSON.stringify(emptyBatch));
 try{
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
  const rejected=await post('/api/personal-terminal',request({mode:'terminal-first',context:{state:{characters:[]},mainContext:mainContext({socialOnly:true}),story:'',allowSocial:false}}));
  assert.equal(rejected.status,400);
  const empty=await post('/api/personal-terminal',request({mode:'story-first',context:{state:{characters:[]},mainContext:mainContext({socialOnly:true}),story:'',allowSocial:true}}));
  assert.equal(empty.status,400);
  assert.equal(calls.length,0,'an invalid review must be rejected before spending a request');
 }finally{await close(app.server);}
});
