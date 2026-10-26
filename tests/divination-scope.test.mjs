// Route-level guard for the divination knowing scope (每日占卜偷看 NPC).
// The real /api/personal-terminal route runs the real terminalPlan, so an invalid
// scope must be refused *before* any upstream call. The fetch implementation is the
// only stub: it records the exact request body the route would have sent upstream.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';

const cards=[{id:'major-0',reversed:false},{id:'cups-3',reversed:true},{id:'wands-14',reversed:false}];
const good={overall:'今天的基调解读是把节奏放慢半拍，先观察再落子，别急着替别人做决定。',love:'逆位的圣杯三提示热闹里的小失落，坦白比迁就更有用，也说清自己的边界。',career:'权杖国王正位给了推进项目的执行力，主动开口就会有回应，别把功劳让出去。',caution:'午后容易被别人的情绪带走，留一点独处时间整理自己的判断再回应。'};
const reaction='哼，逆位圣杯？我才不会为这种小事在意——不过，谢谢你替我抽。';

test('npc divination reaches the upstream only when the knowing scope is the target itself',async()=>{
 const root=resolve(import.meta.dirname,'..');
 const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
 const npc=card.characters[0];
 assert.ok(npc?.id&&npc.name);
 const calls=[];
 const app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);
  calls.push(body);
  // The upstream only ever sees an accepted request; it answers with a valid npc reading.
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...good,reaction})}}]}),{headers:{'Content-Type':'application/json'}});
 }});
 try{
  const base=`http://127.0.0.1:${await app.start()}`;
  const boot=await fetch(base+'/api/bootstrap');
  const cookie=boot.headers.get('set-cookie').split(';')[0];
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  const profile={id:'divination-scope',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:32000};
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
  const roster=card.characters.map(c=>({id:c.id,name:c.name}));
  const payload=(actorId,kind,audience,extra={})=>({task:'divination',actorIds:[actorId],input:'请解读今日塔罗牌。',persona:{name:'验收玩家',background:'玩家私密背景不应进入 NPC 占卜'},context:{audience,divination:{day:'2026-10-26',actorId,kind,cards},state:{characters:[...roster,...(extra.characters||[])]},...(extra.memories?{memories:extra.memories}:{})},profile,key:'synthetic-key'});

  // 1. The real payload the terminal builds for "偷看角色运势": audience is the target NPC only.
  const npcResponse=await post('/api/personal-terminal',payload(npc.id,'npc',[npc.id]));
  assert.equal(npcResponse.status,200);
  assert.equal((await npcResponse.json()).reaction,reaction);
  assert.equal(calls.length,1,'a valid scoped request must reach the upstream exactly once');
  const sent=JSON.parse(calls[0].messages.at(-1).content);
  assert.deepEqual(sent.context.audience,[npc.id]);
  assert.ok(!sent.context.audience.includes('player'),'the player must not be added to an NPC reading scope');
  assert.deepEqual(JSON.parse(calls[0].messages[1].content).actors.map(a=>a.id),[npc.id],'only the target persona enters the request');
  assert.ok(!JSON.stringify(calls[0].messages).includes('玩家私密背景'),'player persona stays out of an NPC reading');

  // 2. The player's own reading is scoped to the player and needs no reaction.
  const ownResponse=await post('/api/personal-terminal',payload('player','player',['player']));
  assert.equal(ownResponse.status,200);
  assert.equal(calls.length,2);
  assert.deepEqual(JSON.parse(calls[1].messages.at(-1).content).context.audience,['player']);

  // 3. A dynamic (story-added) character is a valid subject too.
  const dynamic={id:'dyn-0001',name:'转学生'};
  const dynResponse=await post('/api/personal-terminal',payload(dynamic.id,'npc',[dynamic.id],{characters:[dynamic]}));
  assert.equal(dynResponse.status,200);
  assert.equal(calls.length,3);
  assert.deepEqual(JSON.parse(calls[2].messages.at(-1).content).context.audience,[dynamic.id]);

  // 4. Every scope mismatch is refused by local validation with its own code and never
  //    reaches the upstream — including the old "pad the NPC request with player" workaround.
  const before=calls.length;
  const rejected=[['player',npc.id],['player'],[npc.id,card.characters[1].id]];
  for(const audience of rejected){
   const response=await post('/api/personal-terminal',payload(npc.id,'npc',audience));
   assert.equal(response.status,400);
   assert.equal((await response.json()).code,'INVALID_DIVINATION_SCOPE');
  }
  const playerWidened=await post('/api/personal-terminal',payload('player','player',['player',npc.id]));
  assert.equal(playerWidened.status,400);
  assert.equal((await playerWidened.json()).code,'INVALID_DIVINATION_SCOPE');
  assert.equal(calls.length,before,'rejected scopes must not trigger any upstream call');

  // 5. Other terminal tasks keep the original rule: the player stays required in scope.
  const friendPayload={task:'friend',actorIds:[npc.id],input:'申请好友',persona:{name:'验收玩家'},context:{audience:[npc.id],state:{characters:roster}},profile,key:'synthetic-key'};
  const friendResponse=await post('/api/personal-terminal',friendPayload);
  assert.equal(friendResponse.status,400);
  assert.equal((await friendResponse.json()).code,'INVALID_TERMINAL_REQUEST');
  assert.equal(calls.length,before);
 }finally{app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}
});
