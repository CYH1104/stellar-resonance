import {test} from 'node:test';import assert from 'node:assert/strict';
import {elevenBatchPlan,parseElevenBatchResult} from '../server/eleven-batch.mjs';
import {liarPlan,parseLiarResult} from '../server/liar-dice.mjs';
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const card={world:{name:'学院',entries:[]},characters:[{id:'a',name:'甲',primaryGender:'男',sex:'Omega',personality:'谨慎但有时好胜'},{id:'b',name:'乙',primaryGender:'女',sex:'Alpha',personality:'爱冒险'}]},participants=[{id:'player',name:'玩家'},{id:'a',name:'甲'},{id:'b',name:'乙'}];
const base=(task,ids)=>({task,actorIds:ids,input:'桌上互动',persona:{name:'玩家'},context:{state:{characters:[]},audience:['player',...ids],memories:[],party:{}}});
function eleven(){const d=base('party-eleven-batch',['a','b']);d.context.party={kind:'eleven',round:1,wave:1,phase:'playing',banker:'player',participants,privateHands:[{id:'a',hand:['S-8'],stopped:false},{id:'b',hand:['H-5'],stopped:false}],missingTolerances:[],publicLines:[{id:'player',text:'我就一点，别怕。'}],playerInput:'我就一点，别怕。',publicTable:[{id:'player',cardCount:2,stopped:false},{id:'a',cardCount:1,stopped:false},{id:'b',cardCount:1,stopped:false}]};return d;}
const slots=(plan,ids)=>{plan.dialoguePlan={version:1,slots:ids};plan.party.dialogueSchedule=plan.dialoguePlan;};
test('eight-point personalities may hit or stand; only public counts and speech become guessing evidence',()=>{
 const plan=elevenBatchPlan(card,eleven()),prompt=JSON.stringify(plan.messages);assert.ok(prompt.includes('8点既可以冒险要牌'));assert.ok(prompt.includes('公开可见的张数'));assert.ok(prompt.includes('谨慎但有时好胜'));assert.ok(prompt.includes('爱冒险'));assert.equal(plan.party.publicTable[0].cardCount,2);assert.ok(!Object.hasOwn(plan.party.publicTable[0],'hand'));slots(plan,['b','a','b']);
 const dialogue=[{id:'b',text:'我先看看你。'},{id:'a',text:'别想吓住我。'},{id:'b',text:'我还没说完。'}];
 for(const choice of ['hit','stand']){const result=parseElevenBatchResult(JSON.stringify({characters:[{id:'a',choice},{id:'b',choice:'stand'}],dialogue,tolerances:[]}),plan);assert.equal(result.characters[0].choice,choice);assert.deepEqual(result.dialogue.lines.map(r=>r.id),['b','a','b']);}
 const fake=eleven();fake.context.party.publicTable[0].hand=['S-A','C-2'];assert.throws(()=>elevenBatchPlan(card,fake));
});
test('a silent NPC still needs its private decision while repeated table dialogue preserves order',()=>{
 const plan=elevenBatchPlan(card,eleven());slots(plan,['a','a']);const result={characters:[{id:'a',choice:'hit'},{id:'b',choice:'stand'}],dialogue:[{id:'a',text:'我再看看。'},{id:'a',text:'你也别急。'}],tolerances:[]};const parsed=parseElevenBatchResult(JSON.stringify(result),plan);assert.equal(parsed.characters[1].text,'');assert.equal(parsed.dialogue.lines.length,2);result.characters.pop();assert.throws(()=>parseElevenBatchResult(JSON.stringify(result),plan));
});
test('liar dice accepts variable ordered speech without giving the model any other roll',()=>{
 const d=base('party-liar-turn',['a']);d.context.party={kind:'liar',round:1,participants,turn:'a',starter:'a',moves:[],ownDice:[1,2,3,4,5]};const plan=liarPlan(card,d);slots(plan,['b','a','b']);const out=parseLiarResult(JSON.stringify({action:'bid',bid:{count:3,face:6,pure:false},dialogue:[{id:'b',text:'这可未必。'},{id:'a',text:'你尽管猜。'},{id:'b',text:'我不急。'}]}),plan);assert.equal(out.dialogueVersion,1);assert.deepEqual(out.replies.map(r=>r.id),['b','a','b']);assert.ok(!Object.hasOwn(plan.party,'dice'));
 const next=base('party-liar-turn',['b']);next.context.party={kind:'liar',round:1,participants,turn:'b',starter:'a',moves:[{id:'a',action:'bid',bid:out.bid,text:'',replies:out.replies,dialogueVersion:1}],lastBid:out.bid,ownDice:[2,2,3,4,6]};const nextPlan=liarPlan(card,next);assert.deepEqual(nextPlan.party.moves[0].replies.map(r=>r.id),['b','a','b']);next.context.party.moves[0].dialogueVersion=2;assert.throws(()=>liarPlan(card,next));
});
test('truth spectators receive only public table context; free reactions use the same flexible protocol',()=>{
 const d=base('party-truth',['a']);d.context.memories=['PRIVATE_TARGET_MEMORY'];d.context.party={kind:'truth',round:1,participants,stage:'choose',target:'a',card:{id:'t',truth:'说说印象。',dare:'挥挥手。'}};const plan=terminalPlan(card,d);assert.deepEqual(plan.dialogueIds,['a','b']);assert.ok(!JSON.stringify(plan.messages).includes('PRIVATE_TARGET_MEMORY'));slots(plan,['b','a']);const out=parseTerminalResult(JSON.stringify({choice:'truth',text:'我选真心话。',dialogue:[{id:'b',text:'那我听着。'},{id:'a',text:'可别笑我。'}]}),plan);assert.deepEqual(out.dialogue.lines.map(r=>r.id),['b','a']);
 const chat=base('party-reactions',['a','b']);chat.context.party={kind:'truth',round:1,participants,summary:'回答已完成。',playerInput:'你们怎么看？'};const cp=terminalPlan(card,chat);slots(cp,['b','b']);const response=parseTerminalResult(JSON.stringify({dialogue:[{id:'b',text:'我先说。'},{id:'b',text:'还没完呢。'}]}),cp);assert.equal(response.dialogueVersion,1);assert.equal(response.replies.length,2);
});
