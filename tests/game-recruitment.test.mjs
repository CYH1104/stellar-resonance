import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const ids=['a','b','c','d','e','f'];
const card={source:{sha256:'a'.repeat(64)},world:{entries:[{content:'WORLD_SECRET'}]},characters:ids.map(id=>({id,name:id.toUpperCase(),identity:'学生',description:'PRIVATE_'+id,hiddenPrompt:'HIDDEN_'+id}))};
function request(task='game-friends-host'){
 const actor=task==='game-friends-host'?'a':'b';
 return {task,actorIds:[actor],input:'请邀请熟悉的朋友一起玩',persona:{name:'测试玩家'},context:{state:{characters:ids.map(id=>({id,name:id,identity:'学生',...(id===actor?{relationship:'OWN_REL_'+id}:{})}))},recruitment:{kind:'landlord',mode:'spectating',hostId:'a'},memories:['OWN_MEMORY_'+actor]}};
}
const accepted=()=>({accepted:true,reply:'我问问朋友。',friendEstimate:2,candidates:[{id:'b',basis:'inference',reason:'可能认识'},{id:'c',basis:'profile',reason:'同伴'}],selectedIds:['b','c']});
test('each invitation request contains only its actor profile and scoped memories',()=>{
 for(const task of ['game-friends-host','game-friends-guest']){
  const d=request(task),p=terminalPlan(card,d),wire=JSON.parse(p.messages[1].content),actor=d.actorIds[0],text=JSON.stringify(wire);
  assert.ok(text.includes('PRIVATE_'+actor));assert.ok(text.includes('OWN_MEMORY_'+actor));assert.ok(!text.includes('WORLD_SECRET'));assert.ok(!text.includes('HIDDEN_'));
  for(const id of ids.filter(id=>id!==actor)){assert.ok(!text.includes('PRIVATE_'+id));assert.ok(!text.includes('OWN_REL_'+id));}
  assert.equal(wire.possiblePeople?.length,task.endsWith('host')?5:undefined);assert.equal(wire.host.name,'A');
 }
});
for(const [name,change] of [
 ['extra private context',d=>d.context.otherReplies=[]],['another relationship',d=>d.context.state.characters[2].relationship='PRIVATE'],['thought',d=>d.context.state.characters[0].innerThought='PRIVATE'],['duplicate actor',d=>d.actorIds.push('b')],['unknown actor',d=>d.actorIds=['missing']],['guest is host',d=>{d.task='game-friends-guest';}],['invalid game',d=>d.context.recruitment.kind='unknown']
])test('reject request: '+name,()=>{const d=request();change(d);assert.throws(()=>terminalPlan(card,d),/INVALID_TERMINAL_REQUEST/);});
for(const [name,change] of [
 ['extra field',r=>r.secret='x'],['duplicate candidate',r=>r.candidates.push(r.candidates[0])],['unknown candidate',r=>r.candidates[0].id='unknown'],['host as friend',r=>r.candidates[0].id='a'],['duplicate selection',r=>r.selectedIds=['b','b']],['unlisted selection',r=>r.selectedIds=['d']],['oversubscribed',r=>{r.friendEstimate=3;r.candidates.push({id:'d',basis:'memory',reason:'熟人'});r.selectedIds.push('d');}],['refusal with invite',r=>r.accepted=false],['false estimate',r=>r.friendEstimate=0],['invalid basis',r=>r.candidates[0].basis='fact']
])test('reject model result: '+name,()=>{const r=accepted();change(r);assert.throws(()=>parseTerminalResult(JSON.stringify(r),terminalPlan(card,request())),e=>e.reason==='GAME_FRIENDS_FORMAT_INVALID'&&e.retryable===false);});
test('guest must respond for itself and may refuse',()=>{const p=terminalPlan(card,request('game-friends-guest'));assert.throws(()=>parseTerminalResult('{"id":"c","accepted":true,"reply":"好"}',p));assert.equal(parseTerminalResult('{"id":"b","accepted":false,"reply":"今天不想玩"}',p).accepted,false);});
test('HTTP makes one call per decision and strips raw output on both success and malformed result',async()=>{
 let calls=0,broken=false;const fetchImpl=async(_url,options)=>{calls++;const wire=JSON.parse(JSON.parse(options.body).messages[1].content);assert.ok(!JSON.stringify(wire).includes('WORLD_SECRET'));const content=broken?'PRIVATE_CANARY broken':JSON.stringify(accepted());return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});};
 const app=await createLocalServer({projectRoot:resolve(import.meta.dirname,'..'),port:0,fetchImpl,card,channel:'test'}),port=await app.start(),base=`http://127.0.0.1:${port}`;
 try{const b=await fetch(base+'/api/bootstrap'),cookie=b.headers.get('set-cookie').split(';')[0];const d={...request(),profile:{id:'friends-test',apiBaseUrl:'https://synthetic.example/v1',model:'synthetic',temperature:0.7,maxTokens:2000},key:'synthetic-key'};const headers={Cookie:cookie,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/connection',{method:'POST',headers,body:JSON.stringify({profileId:d.profile.id,apiBaseUrl:d.profile.apiBaseUrl})})).status,200);
  const post=()=>fetch(base+'/api/personal-terminal',{method:'POST',headers,body:JSON.stringify(d)});
  const good=await post();assert.equal(good.status,200);const result=await good.json();assert.equal(result.accepted,true);assert.equal(result.raw,undefined);assert.equal(calls,1);
  broken=true;const bad=await post();assert.equal(bad.status,502);const text=await bad.text();assert.ok(!text.includes('PRIVATE_CANARY'));assert.ok(!text.includes('"raw"'));assert.equal(calls,2);
 }finally{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));}
});

test('existing-room selection excludes occupied seats and never substitutes a requested nonfriend',()=>{const d=request();d.context.recruitment.mode='joined';d.context.recruitment.room={memberIds:['player','c'],openSeats:1,wantedId:'b'};const p=terminalPlan(card,d),wire=JSON.parse(p.messages[1].content);assert.ok(p.messages[0].content.includes('真实存在的等候房间'));assert.ok(!wire.possiblePeople.some(a=>a.id==='c'));const result=accepted();result.selectedIds=['b'];assert.equal(parseTerminalResult(JSON.stringify(result),p).selectedIds[0],'b');result.selectedIds=['c'];assert.throws(()=>parseTerminalResult(JSON.stringify(result),p));});
for(const change of [r=>r.room.openSeats=3,r=>r.room.memberIds=['player','player'],r=>r.room.wantedId='a',r=>r.room.roles=['wolf'],r=>r.mode='spectating'])test('reject malformed or private room context '+String(change),()=>{const d=request();d.context.recruitment.mode='joined';d.context.recruitment.room={memberIds:['player'],openSeats:2};change(d.context.recruitment);assert.throws(()=>terminalPlan(card,d));});
test('direct player invitation is a guest-only decision and contains no host profile',()=>{const d=request('game-friends-guest');d.context.recruitment={kind:'landlord',mode:'joined',hostId:'player',room:{memberIds:['player'],openSeats:1}};const p=terminalPlan(card,d),wire=JSON.parse(p.messages[1].content);assert.equal(wire.host.name,'测试玩家');assert.equal(wire.possiblePeople,undefined);assert.equal(parseTerminalResult(JSON.stringify({id:'b',accepted:false,reply:'不想玩'}),p).accepted,false);d.task='game-friends-host';assert.throws(()=>terminalPlan(card,d));});
