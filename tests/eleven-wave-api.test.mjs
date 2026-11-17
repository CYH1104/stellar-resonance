import {test} from 'node:test';import assert from 'node:assert/strict';
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const card={characters:[{id:'a',name:'甲',personality:'嘴硬'},{id:'b',name:'乙',personality:'沉稳'}]};
const participants=[{id:'player',name:'玩家'},{id:'a',name:'甲'},{id:'b',name:'乙'}];
function data(task,party,ids=['a']){return{task,actorIds:ids,input:'玩家尚未公开的选择=hit',persona:{name:'玩家'},context:{party,audience:['player',...ids],memories:['旧记忆真实点数7 SECRET_SCORE'],story:[{input:'PLAYER_CHOICE',text:'SECRET_STORY'}],state:{characters:[{id:'a',name:'甲',present:true,innerThought:'SECRET_THOUGHT'},{id:'b',name:'乙',present:true}]}}};}
const privateParty={kind:'eleven',round:2,wave:1,hand:['S-3','H-4'],score:7,maxCards:5,banker:'b',participants,stood:[],publicLines:[{id:'player',text:'我牌很小。'}]};
const talkParty={kind:'eleven',round:2,wave:1,banker:'b',participants,stood:['b'],publicLines:[{id:'player',text:'我才两点。'}],playerInput:'我才两点。'};
test('real dispatch private decision returns only choice and drops all legacy speech and unrelated input/history',()=>{
 const plan=terminalPlan(card,data('party-eleven',privateParty)),sent=JSON.stringify(plan.messages);
 assert.equal(plan.task,'party-eleven');assert.ok(sent.includes('S-3'));assert.ok(sent.includes('H-4'));for(const secret of ['SECRET_SCORE','SECRET_STORY','SECRET_THOUGHT','PLAYER_CHOICE','玩家尚未公开的选择=hit'])assert.ok(!sent.includes(secret),secret);
 assert.deepEqual(parseTerminalResult('{"choice":"stand"}',plan),{choice:'stand'});
 assert.deepEqual(parseTerminalResult('{"choice":"hit","text":"我的真实七点，公开！"}',plan),{choice:'hit'});
 assert.deepEqual(parseTerminalResult('{"choice":"hit","text":{"legacy":"ignored"}}',plan),{choice:'hit'});
 for(const patch of [{choices:{player:'hit'}},{playerInput:'尚未公开的决定'},{otherHands:{b:['S-A']}},{wave:6}])assert.throws(()=>terminalPlan(card,data('party-eleven',{...privateParty,...patch})),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,data('party-eleven',privateParty,['a','b'])));
});
test('talk is one batch covering every NPC including stopped actors and contains no private cards or memory',()=>{
 const plan=terminalPlan(card,data('party-eleven-talk',talkParty,['b','a'])),sent=JSON.stringify(plan.messages);
 assert.ok(sent.includes('我才两点'));for(const secret of ['SECRET_SCORE','SECRET_STORY','SECRET_THOUGHT','S-3','H-4'])assert.ok(!sent.includes(secret),secret);
 assert.deepEqual(plan.party.stood,['b']);assert.deepEqual(plan.ids,['b','a']);
 assert.deepEqual(parseTerminalResult('{"replies":[{"id":"a","text":"我牌很小。"},{"id":"b","text":"我已经停了，你们继续。"}]}',plan),{replies:[{id:'a',text:'我牌很小。'},{id:'b',text:'我已经停了，你们继续。'}]});
 for(const result of [{replies:[{id:'a',text:'少一人'}]},{replies:[{id:'a',text:'重复'},{id:'a',text:'重复'}]},{replies:[{id:'player',text:'替玩家'},{id:'b',text:'b'}]},{replies:[{id:'a',text:'a'.repeat(201)},{id:'b',text:'b'}]},{replies:[{id:'a',text:'a',choice:'hit'},{id:'b',text:'b'}]}])assert.throws(()=>parseTerminalResult(JSON.stringify(result),plan),e=>e.code==='INVALID_TERMINAL_RESULT');
});
test('talk rejects hidden choices/hand data, missing NPCs, invalid public lines and unknown keys before a request',()=>{
 for(const patch of [{hand:['S-3']},{score:7},{deck:['S-A']},{choices:{a:'hit'}},{privateNotes:'secret'},{wave:0},{publicLines:[{id:'other',text:'x'}]},{publicLines:[{id:'a',text:'x'.repeat(501)}]},{publicLines:[{id:'a',text:'x',choice:'hit'}]}])assert.throws(()=>terminalPlan(card,data('party-eleven-talk',{...talkParty,...patch},['a','b'])),e=>e.code==='INVALID_TERMINAL_REQUEST');
 assert.throws(()=>terminalPlan(card,data('party-eleven-talk',talkParty,['a'])));
 const plan=terminalPlan(card,data('party-eleven',{...privateParty,hand:['S-10','H-A','C-J'],score:11.5}));assert.throws(()=>parseTerminalResult('{"choice":"hit"}',plan));
});
