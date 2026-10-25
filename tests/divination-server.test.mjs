import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const card={characters:[{id:'a',name:'陆离'},{id:'b',name:'卫锋'}]};
const cards=[{id:'major-0',name:'愚者',suit:'major',number:0,reversed:false},{id:'cups-3',name:'圣杯3',suit:'cups',number:3,reversed:true},{id:'wands-14',name:'权杖国王',suit:'wands',number:14,reversed:false}];
const base={task:'divination',actorIds:['player'],input:'请解读玩家今日的塔罗牌。',persona:{name:'玩家'},context:{divination:{day:'2026-10-26',actorId:'player',kind:'player',cards}}};
const good={overall:'今天的星象把你的步调放得比平时慢半拍，适合把节奏交还给观察。',love:'圣杯三逆位提醒一段热闹里的小失落，坦白比迁就更有效。',career:'权杖国王正位给了你推进项目的执行力，主动开口就有回应。',caution:'别在午后替别人做决定，保留自己的判断。'};
test('divination plan requires one id, a valid locked draw and allows the player pseudo-actor',()=>{
 const p=terminalPlan(card,base);
 assert.deepEqual(p.lockedDivination,{day:'2026-10-26',actorId:'player',kind:'player',cards:cards.map(c=>({id:c.id,reversed:c.reversed}))});
 assert.ok(p.ids.includes('player'));
 assert.throws(()=>terminalPlan(card,{...base,actorIds:['a','b']}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,actorIds:['unknown']}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...base.context.divination,day:'2026/10/26'}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...base.context.divination,kind:'gm'}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...base.context.divination,cards:cards.slice(0,2)}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...base.context.divination,cards:[cards[0],cards[1],{...cards[2],id:'cups-99'}]}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...base.context.divination,cards:[cards[0],cards[1],cards[1]]}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...base.context.divination,cards:[cards[0],cards[1],{...cards[2],reversed:'yes'}]}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...base.context.divination,actorId:'a'}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
});
test('divination result needs four readable sections; npc adds a persona reaction',()=>{
 const p=terminalPlan(card,base);
 assert.deepEqual(parseTerminalResult(JSON.stringify(good),p),good);
 // sections too short / whitespace padded / oversized are retryable failures
 for(const field of Object.keys(good)){
  const bad={...good,[field]:field==='caution'?'太短。':'好。'};
  assert.throws(()=>parseTerminalResult(JSON.stringify(bad),p),e=>e.reason==='DIVINATION_FORMAT'&&e.retryable===true);
  const padded={...good,[field]:'　'.repeat(200)};
  assert.throws(()=>parseTerminalResult(JSON.stringify(padded),p),e=>e.reason==='DIVINATION_FORMAT');
  const oversized={...good,[field]:'长'.repeat(1501)};
  assert.throws(()=>parseTerminalResult(JSON.stringify(oversized),p),e=>e.reason==='DIVINATION_FORMAT');
 }
 // the model cannot sneak a persona reaction into the player's own reading
 assert.deepEqual(parseTerminalResult(JSON.stringify({...good,reaction:'我不信这套。'}),p),good);
 // npc request must return the reaction and it must be persona-flavoured prose, not empty
 const npcPlan=terminalPlan(card,{...base,actorIds:['a'],context:{divination:{day:'2026-10-26',actorId:'a',kind:'npc',cards}}});
 assert.deepEqual(parseTerminalResult(JSON.stringify({...good,reaction:'哼，逆位的圣杯？我才不会为这种小事在意。'}),npcPlan).reaction,'哼，逆位的圣杯？我才不会为这种小事在意。');
 assert.throws(()=>parseTerminalResult(JSON.stringify(good),npcPlan),e=>e.reason==='DIVINATION_FORMAT');
 assert.throws(()=>parseTerminalResult(JSON.stringify({...good,reaction:'嗯。'}),npcPlan),e=>e.reason==='DIVINATION_FORMAT');
 assert.throws(()=>parseTerminalResult(JSON.stringify({...good,reaction:'长'.repeat(801)}),npcPlan),e=>e.reason==='DIVINATION_FORMAT');
});
test('divination prompt carries the locked cards and only the target persona, never the roster',()=>{
 const p=terminalPlan(card,{...base,actorIds:['a'],context:{divination:{day:'2026-10-26',actorId:'a',kind:'npc',cards}}});
 const actorPayload=JSON.parse(p.messages[1].content);
 assert.deepEqual(actorPayload.actors.map(a=>a.id),['a']);// only the target actor's persona enters the request
 const userPayload=JSON.parse(p.messages.at(-1).content);
 assert.equal(userPayload.context.divination.cards.length,3);
 assert.ok(!JSON.stringify(p.messages).includes('卫锋'),'other roster names are not injected');
 assert.ok(p.messages[0].content.includes('不能抽牌、换牌'));
});
test('server rebuilds card name/suit/number from the stable id and rejects forged payloads',()=>{
 // a forged raw name/suit/number must never reach the model: canonical cards only
 const forged=[{id:'major-0',name:'死神',suit:'swords',number:99,reversed:false},{id:'cups-3',name:'伪造牌名注入提示',suit:'wands',number:1,reversed:true},{id:'wands-14',name:'权杖国王',suit:'wands',number:14,reversed:false}];
 const p=terminalPlan(card,{...base,context:{divination:{day:'2026-10-26',actorId:'player',kind:'player',cards:forged}}});
 const sent=JSON.parse(p.messages.at(-1).content).context.divination.cards;
 assert.deepEqual(sent.map(c=>c.name),['愚者','圣杯3','权杖国王']);// rebuilt from ids
 assert.deepEqual(sent.map(c=>c.suit),['major','cups','wands']);
 assert.ok(!JSON.stringify(p.messages).includes('伪造牌名注入提示'));
 // only id+reversed are locked; the model cannot rewrite the draw
 assert.deepEqual(p.lockedDivination.cards,forged.map(c=>({id:c.id,reversed:c.reversed})));
});
test('divination validates calendar dates, kind/actor consistency and priorDraft, and keeps the cat persona',()=>{
 const d={...base.context.divination};
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...d,day:'2026-02-30'}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');// fake calendar date
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...d,day:'2026-13-01'}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...d,kind:'npc'}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');// kind must match actorId
 const npc={...d,actorId:'a',kind:'player'};
 assert.throws(()=>terminalPlan(card,{...base,actorIds:['a'],context:{divination:npc}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,{...base,context:{divination:{...d,priorDraft:'x'.repeat(1501)}}}),e=>e.code==='INVALID_TERMINAL_REQUEST');
 const ok=terminalPlan(card,{...base,context:{divination:{...d,priorDraft:'此前未通过的解读草稿。'}}});
 assert.equal(JSON.parse(ok.messages.at(-1).content).context.divination.priorDraft,'此前未通过的解读草稿。');
 // Rätselhaft black-cat persona is present and npc readings are not the user's fortune
 assert.ok(ok.messages[0].content.includes('Rätselhaft')&&ok.messages[0].content.includes('黑猫'));
});
test('npc divination never receives the requester private persona as user profile',()=>{
 const persona={name:'私密玩家',background:'玩家绝不外传的私人背景设定',personality:'内向',appearance:'普通'};
 const npcPlan=terminalPlan(card,{...base,actorIds:['a'],persona,context:{divination:{day:'2026-10-26',actorId:'a',kind:'npc',cards}}});
 assert.ok(!JSON.stringify(npcPlan.messages).includes('玩家绝不外传的私人背景设定'),'private persona must not leak into an NPC fortune reading');
 const playerPlan=terminalPlan(card,{...base,persona,context:{divination:{day:'2026-10-26',actorId:'player',kind:'player',cards}}});
 assert.ok(JSON.stringify(playerPlan.messages).includes('玩家绝不外传的私人背景设定'));// own reading keeps it
});
