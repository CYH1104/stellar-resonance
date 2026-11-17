import {test} from 'node:test';import assert from 'node:assert/strict';
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const card={characters:[{id:'a',name:'甲',hiddenPrompt:'PRIVATE-A'},{id:'b',name:'乙',hiddenPrompt:'PRIVATE-B'}]};
const participants=[{id:'player',name:'用户'},{id:'a',name:'甲'},{id:'b',name:'乙'}];
function request(task,party,ids=['a']){return {task,actorIds:ids,input:'游戏行动',persona:{name:'用户'},context:{party,audience:['player',...ids],state:{characters:[]},memories:[]}};}
const eleven={kind:'eleven',round:1,participants,banker:'player',hand:['S-A','H-9'],score:10,maxCards:5,stood:[]};
test('party requests dispatch through terminal contract and carry only own cards to the chosen actor',()=>{
 const p=terminalPlan(card,request('party-eleven',eleven));const raw=JSON.stringify(p.messages);
 assert.ok(raw.includes('S-A'));assert.ok(!raw.includes('PRIVATE-B'));assert.ok(!raw.includes('opponentHands'));assert.deepEqual(parseTerminalResult('{"choice":"stand","text":"我停牌。"}',p),{choice:'stand',text:'我停牌。'});
 for(const patch of [{deck:['S-K']},{opponentHands:{b:['S-K']}},{score:11.5}])assert.throws(()=>terminalPlan(card,request('party-eleven',{...eleven,...patch})),e=>e.code==='INVALID_TERMINAL_REQUEST');
});
test('party result cannot rewrite random choices, roster or penalties',()=>{
 const p=terminalPlan(card,request('party-eleven',eleven));assert.throws(()=>parseTerminalResult('{"choice":"stand","text":"停牌","winner":"a"}',p));
 const invite=terminalPlan(card,request('party-invite',{kind:'truth',participants},['a','b']));assert.throws(()=>parseTerminalResult('{"decisions":[{"id":"a","accepted":true,"reply":"好"}]}',invite));
 const response=terminalPlan(card,request('party-truth',{kind:'truth',round:1,participants,target:'a',stage:'respond',choice:'truth',card:{id:'t1',truth:'第一印象？',dare:'唱一句歌。'}}));
 assert.deepEqual(parseTerminalResult('{"text":"我拒绝。","refused":true}',response),{text:'我拒绝。',refused:true});
 assert.throws(()=>parseTerminalResult('{"text":"完成","refused":false,"drunk":0}',response));
 const reaction=terminalPlan(card,request('party-reactions',{kind:'truth',round:1,participants,summary:'玩家完成挑战。'},['a']));assert.throws(()=>parseTerminalResult('{"replies":[{"id":"b","text":"越权"}]}',reaction));
});
test('unknown tasks, invalid audience and illegal hit are rejected',()=>{
 assert.throws(()=>terminalPlan(card,request('party-hack',eleven)));
 const bad=request('party-eleven',eleven);bad.context.audience.push('b');assert.throws(()=>terminalPlan(card,bad));
 const full=terminalPlan(card,request('party-eleven',{...eleven,hand:['S-10','H-A','C-J'],score:11.5}));assert.throws(()=>parseTerminalResult('{"choice":"hit","text":"要牌"}',full));
});
