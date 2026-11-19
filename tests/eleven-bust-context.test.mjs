import {test} from 'node:test';import assert from 'node:assert/strict';import {elevenBatchPlan,parseElevenBatchResult} from '../server/eleven-batch.mjs';
const card={world:{name:'学院',entries:[]},characters:[{id:'a',name:'甲'},{id:'b',name:'乙'}]},participants=[{id:'player',name:'玩家'},{id:'a',name:'甲'},{id:'b',name:'乙'}];
function data(){return {task:'party-eleven-batch',actorIds:['a','b'],input:'本次发牌',persona:{name:'玩家'},context:{state:{characters:[]},memories:[],audience:['player','a','b'],party:{kind:'eleven',round:1,wave:2,phase:'playing',banker:'b',participants,privateHands:[{id:'a',hand:['S-10','H-3'],stopped:true},{id:'b',hand:['C-8'],stopped:false}],missingTolerances:[],publicLines:[],playerInput:'',publicTable:[{id:'player',cardCount:2,stopped:true,bust:true,hand:['D-10','S-2'],score:12},{id:'a',cardCount:2,stopped:true,bust:true,hand:['S-10','H-3'],score:13},{id:'b',cardCount:1,stopped:false}]}}};}
test('only a verified bust exposes public cards and points; other hands remain private',()=>{
 const plan=elevenBatchPlan(card,data());assert.equal(plan.party.publicTable[0].score,12);assert.deepEqual(plan.party.publicTable[0].hand,['D-10','S-2']);assert.ok(!Object.hasOwn(plan.party.publicTable[2],'hand'));assert.equal(plan.party.privateHands[0].canChoose,false);assert.ok(JSON.stringify(plan.messages).includes('全员爆牌无胜负'));
 const out=parseElevenBatchResult(JSON.stringify({characters:[{id:'a',choice:null,text:'我13点爆牌了。'},{id:'b',choice:'stand',text:'那我不贪了。'}],tolerances:[]}),plan);assert.equal(out.characters[0].choice,null);assert.equal(out.characters[0].text,'我13点爆牌了。');
});
test('forged public scores, unbusted card disclosure and duplicate cards are rejected before upstream use',()=>{
 for(const change of [d=>d.context.party.publicTable[0].score=13,d=>{const r=d.context.party.publicTable[2];r.hand=['C-8'];r.score=8;},d=>{const r=d.context.party.publicTable[2];r.bust=true;r.hand=['C-8'];r.score=8;r.stopped=true;},d=>d.context.party.publicTable[0].hand=['S-10','S-2']]){const d=data();change(d);assert.throws(()=>elevenBatchPlan(card,d));}
});
test('a published all-bust settlement has no winner and must be consistent with the public cards',()=>{
 const d=data();d.context.party.phase='complete';d.context.party.privateHands[1]={id:'b',hand:['C-10','D-3'],stopped:true};d.context.party.publicTable[2]={id:'b',cardCount:2,stopped:true,bust:true,hand:['C-10','D-3'],score:13};d.context.party.settlement={kind:'all-bust'};assert.deepEqual(elevenBatchPlan(card,d).party.settlement,{kind:'all-bust'});
 const fake=data();fake.context.party.phase='complete';fake.context.party.settlement={kind:'all-bust'};assert.throws(()=>elevenBatchPlan(card,fake));
 d.context.party.settlement={kind:'winner',winner:'b'};assert.deepEqual(elevenBatchPlan(card,d).party.settlement,{kind:'winner',winner:'b'},'old completed records keep their settled result');
});
