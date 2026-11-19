import {test} from 'node:test';import assert from 'node:assert/strict';
import {createGameDialoguePlan,parseGameDialogue,cleanGameSpeech} from '../server/game-dialogue.mjs';
test('dialogue plans vary order and message counts, permit rare silent actors and retain mandatory performers',()=>{
 const rolls=[0,85,99];let i=0;const plan=createGameDialoguePlan(['a','b','c'],[],n=>i<3?rolls[i++]:0);assert.equal(plan.slots.filter(id=>id==='a').length,0);assert.equal(plan.slots.filter(id=>id==='b').length,2);assert.equal(plan.slots.filter(id=>id==='c').length,3);assert.notDeepEqual(plan.slots,['b','b','c','c','c']);
 const required=createGameDialoguePlan(['a','b'],['b'],()=>0);assert.deepEqual(required.slots,['b']);assert.equal(createGameDialoguePlan(['a','b'],[],()=>0).slots.length,1);
});
test('ordered repeated speakers are preserved and only planned NPC public speech can be accepted',()=>{
 const plan={version:1,slots:['b','a','b']},raw=[{id:'b',text:'我可不信。'},{id:'a',text:'那就看你敢不敢。'},{id:'b',text:'你先别急。'}];assert.deepEqual(parseGameDialogue(raw,plan,['a','b']),{version:1,lines:raw});
 for(const rows of [raw.slice(1),[{id:'player',text:'代替用户'},...raw.slice(1)],[raw[1],raw[0],raw[2]],raw.map((r,i)=>i===1?{...r,secret:'牌'}:r)])assert.throws(()=>parseGameDialogue(rows,plan,['a','b']));
 assert.equal(cleanGameSpeech('我心里有数，你尽管来。'),'我心里有数，你尽管来。');assert.equal(cleanGameSpeech('旁白：他在思考。'),'先听听你怎么说。');
});
