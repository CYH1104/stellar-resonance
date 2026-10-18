import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder,normalizeModelState} from '../server/ai.mjs';
import {compatibleState} from '../server/state-compat.mjs';
import {internalPrompt} from '../server/internal-prompts.mjs';
import {newSession,stateAt,finishVariant} from '../src/domain/story.ts';
import {defaultTheaters} from '../src/domain/theaters.ts';
const card={characters:[{id:'guide',name:'角色'}],world:{greeting:[]},places:[]};
function fixture(){const session=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'正文');session.initial.characters=session.initial.characters.slice(0,1);return session;}
test('server accepts both affinity boundaries and the extended positive range',()=>{
 const state=stateAt(fixture());for(const affinity of [-100,150,200]){
  const result=normalizeModelState(card,state,{event:'互动',presentCharacterIds:['guide'],characters:[{id:'guide',affinity}]},{requireDynamicState:true,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))});assert.equal(result.characters[0].affinity,affinity);
 }
 for(const affinity of [-101,201])assert.throws(()=>normalizeModelState(card,state,{event:'互动',presentCharacterIds:['guide'],characters:[{id:'guide',affinity}]},{requireDynamicState:true,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))}));
 assert.match(internalPrompt('ai.5',{p0:'<done>',p1:'<done>'}),/\[-100,200\]/);
});
test('every stream split captures numeric-string delta once and preserves prose',()=>{
 const text='正文。<UpdateVariable><JSONPatch>[{"op":"delta","path":"/characters/guide/affinity","value":"170"}]</JSONPatch></UpdateVariable><SR_STATE>{"event":"关系变化","presentCharacterIds":["guide"]}</SR_STATE><SR_DONE>';
 for(let i=0;i<=text.length;i++){
  const s=fixture(),d=new StoryDecoder();const visible=d.push(text.slice(0,i))+d.push(text.slice(i));const outcome=d.finish(card,stateAt(s));const v={id:'v',text:visible,status:'incomplete',createdAt:''};s.turns.push({id:'t',input:'行动',selected:0,variants:[v]});finishVariant(s,0,v,outcome);assert.equal(v.text,'正文。');assert.equal(stateAt(s).characters[0].affinity,200);
 }
});
test('compatible fields retain the old affinity on invalid input, with valid prose state intact',()=>{
 const state=stateAt(fixture());
 for(const affinity of ['200','201','']){
  const warnings=[];const result=compatibleState({event:'正文已发生',presentCharacterIds:['guide'],characters:[{id:'guide',affinity}]},card,state,{validationWarnings:warnings});
  assert.equal(result.event,'正文已发生');assert.equal(result.characters.find(c=>c.id==='guide')?.affinity,affinity==='200'?200:undefined);assert.equal(state.characters[0].affinity,30);
 }
});

test('invalid or ambiguous MVU rejects the whole transaction without losing prose or choices',()=>{
 const state=stateAt(fixture()),opts={singleStateCall:true,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))};
 const block=ops=>'<UpdateVariable><JSONPatch>'+JSON.stringify(ops)+'</JSONPatch></UpdateVariable>';
 const good={op:'delta',path:'/characters/guide/affinity',value:2},bad={op:'replace',path:'/characters/guide/affinity',value:201};
 for(const patches of [block([good,bad]),block([good])+block([good])]){
  const decoder=new StoryDecoder();assert.equal(decoder.push('正文保留。'+patches+'<choices>["观察"]</choices><done>'),'正文保留。');
  const outcome=decoder.finish(card,state,opts);assert.equal(outcome.stateUpdate.status,'retained');assert.deepEqual(outcome.suggestions,['观察']);assert.equal(outcome.mvu,undefined);assert.ok(!outcome.characters.some(c=>c.affinity!==undefined));assert.equal(state.characters[0].affinity,30);
 }
});

test('truncated variable block retains old state and explicitly records incomplete output',()=>{
 const decoder=new StoryDecoder(),state=stateAt(fixture());decoder.push('正文。<UpdateVariable><JSONPatch>[{"op":"delta"');
 const outcome=decoder.finish(card,state,{singleStateCall:true,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))});
 assert.equal(decoder.story,'正文。');assert.equal(outcome.stateUpdate.status,'retained');assert.equal(outcome.stateUpdate.storyComplete,false);assert.equal(outcome.mvu,undefined);
});
