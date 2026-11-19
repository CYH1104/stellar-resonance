import {test} from 'node:test';import assert from 'node:assert/strict';
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const card={world:{name:'学院'},characters:[{id:'a',name:'甲',primaryGender:'男',sex:'Omega'},{id:'b',name:'乙',primaryGender:'女',sex:'Alpha'}]},participants=[{id:'player',name:'玩家'},{id:'a',name:'甲'},{id:'b',name:'乙'}];
const party={kind:'liar',round:1,participants,turn:'a',starter:'a',moves:[],ownDice:[1,2,3,4,5]};
function data(task='party-liar-turn'){const ids=task==='party-liar-turn'?['a']:['a','b'];return {task,actorIds:ids,input:'行动',persona:{name:'玩家',rawText:'HIDDEN_DICE_PERSONA'},context:{state:{characters:[]},audience:['player',...ids],memories:['DICE_MEMORY_SECRET'],party:JSON.parse(JSON.stringify(party))}};}
test('one NPC request returns one legal move and all table dialogue without other dice or raw persona/memory',()=>{
 const plan=terminalPlan(card,data()),prompt=JSON.stringify(plan.messages);assert.ok(prompt.includes('ownDice'));assert.ok(!prompt.includes('DICE_MEMORY_SECRET'));assert.ok(!prompt.includes('HIDDEN_DICE_PERSONA'));assert.ok(prompt.includes('严禁内心独白'));
 const out=parseTerminalResult(JSON.stringify({action:'bid',bid:{count:3,face:6,pure:false},replies:[{id:'a',text:'我不怕你开。'},{id:'b',text:'先别急着信他。'}]}),plan);assert.equal(out.action,'bid');assert.deepEqual(out.replies.map(r=>r.id),['a','b']);
 assert.throws(()=>parseTerminalResult(JSON.stringify({action:'bid',bid:{count:2,face:6,pure:false},replies:out.replies}),plan));assert.throws(()=>parseTerminalResult(JSON.stringify({action:'open',replies:out.replies}),plan));
 const leak=data();leak.context.party.opponentDice={player:[6,6,6,6,6]};assert.throws(()=>terminalPlan(card,leak));
});
test('a legacy pending NPC move can receive only public speech without another action or private hand',()=>{
 const d=data('party-liar-reply');delete d.context.party.ownDice;const action={id:'a',action:'bid',bid:{count:3,face:6,pure:false},text:'',replies:[]};d.context.party.moves=[action];d.context.party.lastAction=action;d.context.party.lastBid=action.bid;d.context.party.turn='b';const plan=terminalPlan(card,d);assert.ok(!Object.hasOwn(plan.party,'ownDice'));assert.equal(parseTerminalResult(JSON.stringify({replies:[{id:'a',text:'我可不急。'},{id:'b',text:'那就看看。'}]}),plan).replies.length,2);
});
test('player action response has all NPC speech but no private roll or model action',()=>{
 const d=data('party-liar-reply');delete d.context.party.ownDice;d.context.party.lastAction={id:'player',action:'bid',bid:{count:3,face:6,pure:true},text:'我叫三个斋六。',replies:[]};d.context.party.lastBid={count:3,face:6,pure:true};d.context.party.turn='a';d.context.party.moves=[d.context.party.lastAction];const plan=terminalPlan(card,d);assert.equal(Object.hasOwn(JSON.parse(plan.messages.at(-1).content).party,'ownDice'),false);
 const out=parseTerminalResult(JSON.stringify({replies:[{id:'a',text:'内心想着：他肯定骗人。'},{id:'b',text:'我可能有，也可能没有。'}]}),plan);assert.equal(out.replies[0].text,'想知道？开了再看。');assert.equal(out.replies[1].text,'我可能有，也可能没有。');assert.throws(()=>parseTerminalResult(JSON.stringify({action:'open',replies:out.replies}),plan));
});
