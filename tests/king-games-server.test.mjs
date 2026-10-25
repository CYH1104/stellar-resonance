import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const card={characters:[{id:'a',name:'陆离'},{id:'b',name:'卫锋'}]};
const data={task:'tolerance',actorIds:['a','b'],input:'请为每位参与者依据人设设定酒量耐受度。',persona:{name:'玩家'},context:{}};
test('tolerance plan injects the player pseudo-actor and requires ids',()=>{
 const p=terminalPlan(card,{...data,actorIds:['player','a','b'],context:{state:{characters:[{id:'a',name:'陆离'}]}}});
 assert.ok(p.messages[0].content.includes('耐受度'));
 assert.throws(()=>terminalPlan(card,{...data,actorIds:[]}));
 const solo=terminalPlan(card,{...data,actorIds:['player']});// player-only request is valid via roster injection
 assert.ok(solo.ids.includes('player'));
});
test('tolerance result must cover exactly the requested ids with integers 1..10',()=>{
 const p=terminalPlan(card,data);
 const ok={tolerances:[{id:'a',value:1},{id:'b',value:10}]};
 assert.deepEqual(parseTerminalResult(JSON.stringify(ok),p),ok);
 assert.throws(()=>parseTerminalResult('{"tolerances":[{"id":"a","value":1}]}',p));
 assert.throws(()=>parseTerminalResult('{"tolerances":[{"id":"a","value":1},{"id":"b","value":11}]}',p));
 assert.throws(()=>parseTerminalResult('{"tolerances":[{"id":"a","value":0},{"id":"b","value":5}]}',p));
 assert.throws(()=>parseTerminalResult('{"tolerances":[{"id":"a","value":1.5},{"id":"b","value":5}]}',p));
 assert.throws(()=>parseTerminalResult('{"tolerances":[{"id":"a","value":5},{"id":"a","value":5}]}',p));
 assert.throws(()=>parseTerminalResult('{"tolerances":[{"id":"a","value":5},{"id":"player","value":5}]}',p));
});
const longText='散场后的走廊还留着一点果酒的味道。'.repeat(200);
test('afterparty result needs at least 1200 visible characters and keeps the summary',()=>{
 const p=terminalPlan(card,{task:'afterparty',actorIds:[],input:'请生成afterparty正文。',persona:{name:'玩家'},context:{}});
 const r=parseTerminalResult(JSON.stringify({text:longText,summary:'散场复盘'}),p);
 assert.equal(r.summary,'散场复盘');assert.ok(r.text.length>1200);
 assert.throws(()=>parseTerminalResult(JSON.stringify({text:'太短了。'}),p),e=>e.reason==='AFTERPARTY_LENGTH'&&e.retryable===true);
 const padded='甲乙丙丁'.repeat(400);// whitespace-only padding must not count toward the visible length
 assert.throws(()=>parseTerminalResult(JSON.stringify({text:padded.slice(0,300)+'\n'+'　'.repeat(2000)}),p),e=>e.reason==='AFTERPARTY_LENGTH');
 const noSummary=parseTerminalResult(JSON.stringify({text:longText}),p);
 assert.ok(noSummary.summary.length>0);
 assert.throws(()=>parseTerminalResult(JSON.stringify({text:'好'.repeat(8001)}),p));
});

test('afterparty plan accepts end-time participants including the player and forwards the prior draft',()=>{
 const p=terminalPlan(card,{task:'afterparty',actorIds:['player','a'],input:'请生成afterparty正文。',persona:{name:'玩家'},context:{priorDraft:'旧草稿，字数不足。'}});
 assert.ok(p.ids.includes('player'));
 assert.ok(p.messages.at(-1).content.includes('旧草稿，字数不足。'));
 assert.throws(()=>terminalPlan(card,{task:'afterparty',actorIds:['zz'],input:'x',persona:{name:'玩家'},context:{}}));
});
