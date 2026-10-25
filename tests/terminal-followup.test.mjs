import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {terminalPlan,terminalFollowupPlan} from '../server/personal-terminal.mjs';
import {createLocalServer} from '../server/app.mjs';

const contacts=[
 {id:'contact-5432ab42-2ddf-465b-b04e-e4154bbdbd1e',name:'自定义甲',identity:'校外好友',relationship:'朋友',present:false,affinity:0},
 {id:'contact-12345678-1234-1234-1234-123456789abc',name:'自定义乙',identity:'哥哥',relationship:'家人',present:false,affinity:0}
];
const builtin={id:'builtin-friend',name:'内置好友'};
const card={characters:[builtin]};
const request={actorIds:contacts.map(c=>c.id),input:'模仿动物',persona:{name:'测试玩家'},context:{state:{characters:contacts},story:['unrelated-story-marker']}};

test('custom and mixed terminal rosters survive follow-up validation across terminal tasks',()=>{
 for(const task of ['invite','chat','react','game-interact','friend','command']){
  const ids=['friend','command'].includes(task)?[contacts[0].id]:[...request.actorIds,builtin.id];
  const data={...request,task,actorIds:ids,context:{...request.context,maxNumber:3,targets:[1]}};
  const original=JSON.stringify(data);
  terminalPlan(card,data);
  const plan=terminalFollowupPlan(card,data,'review',{command:data.input,result:{betrayal:false,replies:[]}});
  assert.deepEqual(plan.ids,ids);
  const actorData=JSON.parse(plan.messages[1].content).actors;
  assert.deepEqual(actorData.map(a=>a.id),ids);
  assert.equal(actorData[0].relationship,'朋友');
  assert.ok(!JSON.stringify(plan.messages).includes('unrelated-story-marker'));
  assert.equal(JSON.stringify(data),original);
 }
 assert.throws(()=>terminalFollowupPlan(card,{...request,actorIds:['missing-actor']},'review',{}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalFollowupPlan(card,{...request,context:{}},'review',{}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.deepEqual(terminalFollowupPlan(card,{...request,actorIds:[builtin.id],context:{}},'review',{}).ids,[builtin.id]);
});

test('HTTP reactions for multiple custom and built-in actors complete the real review path and preserve failed reviews',async()=>{
 const root=resolve(import.meta.dirname,'..');
 const source=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
 const ids=[...request.actorIds,source.characters[0].id];
 let calls=0,validReview=true;
 const app=await createLocalServer({projectRoot:root,port:0,card:source,fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body),isReview=body.messages[0].content.includes('复核国王游戏回复');
  calls++;
  assert.deepEqual(JSON.parse(body.messages[1].content).actors.map(a=>a.id),ids);
  const content=JSON.stringify(isReview?{valid:validReview}:{betrayal:false,replies:ids.map(id=>({id,text:'我模仿了一声动物叫。\n\n然后坐回原位。',refused:false,penalty:''}))});
  return Response.json({choices:[{message:{content}}]});
 }});
 try{
  const base=`http://127.0.0.1:${await app.start()}`;
  const boot=await fetch(base+'/api/bootstrap'),cookie=boot.headers.get('set-cookie').split(';')[0];
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  const profile={id:'followup-test',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:6000};
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
  const data={...request,task:'react',actorIds:ids,profile,key:'synthetic-key'};
  const response=await post('/api/personal-terminal',data),payload=await response.json();
  assert.equal(response.status,200,JSON.stringify(payload));
  assert.deepEqual(payload.replies.map(r=>r.id),ids);
  assert.equal(calls,2);
  assert.ok(payload.raw.includes('[复核]'));
  validReview=false;
  const rejected=await post('/api/personal-terminal',data),failure=await rejected.json();
  assert.equal(rejected.status,502);
  assert.equal(failure.code,'INVALID_TERMINAL_RESULT');
  assert.ok(failure.raw.includes('"valid":false'));
  assert.equal(calls,4);
 }finally{app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}
});
