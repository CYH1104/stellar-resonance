import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terminalPlans} from '../native/academy-plugin/terminal.mjs';
import {init} from '../native/academy-plugin/index.mjs';
const input=()=>({task:'friend',actorIds:['npc-a'],input:'添加好友',persona:{name:'玩家'},context:{state:{characters:[{id:'npc-a',name:'路人甲',identity:'路人'}]}}});
test('native task compatibility prepares and validates a custom NPC request without accessing a model',()=>{
  const plans=terminalPlans(),created=plans.plan('a',input());
  assert.match(JSON.stringify(created.messages),/路人甲/);
  assert.deepEqual(plans.finish('a',created.token,JSON.stringify({accepted:true,reply:'可以。'})),{ok:true,result:{accepted:true,reply:'可以。'}});
  assert.equal(plans.size,0);
});
test('plans are bound to the original native account and consumed once',()=>{
  const plans=terminalPlans(),created=plans.plan('a',input());
  assert.throws(()=>plans.finish('b',created.token,'{}'),e=>e.status===404);plans.cancel('b',created.token);assert.equal(plans.size,1);
  plans.finish('a',created.token,JSON.stringify({accepted:false,reply:'暂时不加。'}));
  assert.throws(()=>plans.finish('a',created.token,'{}'),e=>e.status===404);
});
test('only one correction can reuse the same locked plan',()=>{
  const plans=terminalPlans(),created=plans.plan('a',input());
  assert.deepEqual(plans.finish('a',created.token,'not json'),{ok:false,error:{code:'INVALID_TERMINAL_RESULT',reason:'MODEL_JSON_INVALID',retryable:true}});
  const second=plans.finish('a',created.token,'not json');assert.equal(second.error.retryable,false);assert.equal(plans.size,0);
  assert.throws(()=>plans.finish('a',created.token,'{}'),e=>e.status===404);
});
test('expired/cancelled plans do not change the stored save and raw keys are not accepted',()=>{
  let now=0;const plans=terminalPlans({clock:()=>now}),created=plans.plan('a',input());now=750001;
  assert.throws(()=>plans.finish('a',created.token,'{}'),e=>e.status===404);assert.equal(plans.size,0);
  assert.throws(()=>plans.plan('a',{...input(),key:'synthetic'}),e=>e.status===400);
  const again=plans.plan('a',input());plans.cancel('a',again.token);assert.equal(plans.size,0);
});
test('the plugin requires native login and returns safe errors without raw context',async()=>{
  const routes=new Map();await init({post:(path,handler)=>routes.set(path,handler)},{installAccounts:async()=>{}});
  const response=()=>({statusCode:200,status(n){this.statusCode=n;return this;},send(value){this.value=value;return this;}});
  const noUser=response();await routes.get('/terminal/plan')({body:{input:input()}},noUser);assert.equal(noUser.statusCode,401);
  const invalid=response();await routes.get('/terminal/finish')({user:{profile:{handle:'a'}},body:{token:'missing',text:'DO_NOT_ECHO'}},invalid);
  assert.equal(invalid.statusCode,404);assert.equal(JSON.stringify(invalid.value).includes('DO_NOT_ECHO'),false);
});
test('anonymous king commands keep scoped NPC identity while excluding player secrets and hidden number maps',()=>{
  const plans=terminalPlans(),created=plans.plan('a',{task:'command',actorIds:['npc-a'],input:'PRIVATE_CANARY',persona:{name:'玩家甲',background:'PRIVATE_CANARY'},context:{round:1,maxNumber:3,targets:[2],style:'日常',participantNames:['路人甲','玩家甲'],numbers:{player:1,'npc-b':2},memories:['PRIVATE_CANARY'],state:{characters:[{id:'npc-a',name:'路人甲',identity:'国王'},{id:'npc-b',name:'路人乙',identity:'参与者'}],variables:{hidden:'PRIVATE_CANARY'}}}});
  const sent=JSON.stringify(created.messages);for(const hidden of ['PRIVATE_CANARY','玩家甲','路人乙','"numbers"'])assert.equal(sent.includes(hidden),false,hidden);
  assert.equal(sent.includes('路人甲'),true);assert.equal(plans.finish('a',created.token,JSON.stringify({template:'请{{target1}}分享一件开心的事',targets:[2],betrayal:false})).result.text,'请2号分享一件开心的事');
});
test('king reactions retain the original locked participants and create an account-bound review',()=>{
  const plans=terminalPlans(),created=plans.plan('a',{task:'react',actorIds:['npc-a'],input:'请模仿动物',persona:{name:'玩家'},context:{round:1,maxNumber:3,targets:[2],command:'请模仿动物',state:{characters:[{id:'npc-a',name:'路人甲',identity:'参与者'}]}}});
  const result=plans.finish('a',created.token,JSON.stringify({betrayal:false,replies:[{id:'npc-a',text:'他模仿了一声猫叫。',refused:false,penalty:''}]}));
  assert.equal(result.ok,true);assert.ok(result.review.token);assert.throws(()=>plans.finish('other',result.review.token,'{"valid":true}'),e=>e.status===404);
  assert.deepEqual(plans.finish('a',result.review.token,'{"valid":true}'),{ok:true,result:{valid:true}});assert.equal(plans.size,0);
});
