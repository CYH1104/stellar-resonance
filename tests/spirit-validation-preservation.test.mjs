import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder,normalizeModelState} from '../server/ai.mjs';
import {stateProtocol} from '../server/state-protocol.mjs';
import {missingRepairPlan} from '../src/domain/repairPlan.ts';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {newSession,finishVariant,stateAt} from '../src/domain/story.ts';
const card={characters:[],world:{name:'学院'},places:[]};
const initial=()=>({player:{id:'player',name:'玩家',present:true,spiritAnimal:'狼',spiritThought:'旧玩家 OS'},characters:[{id:'npc-one',name:'甲',present:true,affinity:10,spiritAnimal:'狐',spiritThought:'旧 NPC OS'}]});
const options={singleStateCall:true,requireDynamicState:true,theaterSettings:defaultTheaters().map(s=>({...s,enabled:false}))};
function decode(state,payload,extra=''){
 const d=new StoryDecoder();d.push('固定正文<status>'+JSON.stringify(payload)+'</status>'+extra+'<done>');
 return d.finish(card,state,options);
}
function commit(state,out){
 const session=newSession('验证',{name:'玩家',appearance:'',personality:'',background:''},'');session.initial=state;
 const variant={id:'v',text:'固定正文',status:'incomplete',createdAt:new Date().toISOString()};
 session.turns.push({id:'t',input:'继续',selected:0,variants:[variant]});finishVariant(session,0,variant,out);return stateAt(session);
}
test('a rejected MVU transaction keeps independent spirit, relationship and roster updates',()=>{
 const state=initial();const out=decode(state,{event:'交谈',presentCharacterIds:['npc-one'],characters:[{id:'npc-one',spiritThought:'我竖起耳朵听他解释。',innerThought:'先听听。',relationship:'正在交谈',affinity:99}],player:{spiritThought:'我想看看柜台后面。'}},'<UpdateVariable><JSONPatch>[{"op":"delta","path":"/characters/missing/affinity","value":2}]</JSONPatch></UpdateVariable>');
 assert.equal(out.characters.find(c=>c.id==='npc-one').spiritThought,'我竖起耳朵听他解释。');
 assert.equal(out.characters.find(c=>c.id==='npc-one').relationship,'正在交谈');
 assert.equal(commit(state,out).characters.find(c=>c.id==='npc-one').affinity,10);
 assert.equal(out.player.spiritThought,'我想看看柜台后面。');
 assert.ok(out.stateUpdate.codes.includes('STATE_MVU_REJECTED'));
});
test('first arrival registers spirit and OS together; accepted attitude does not swallow them',()=>{
 const state=initial();const out=decode(state,{event:'新人到场',presentCharacterIds:['npc-new'],characters:[{id:'npc-new',name:'乙',present:true,spiritAnimal:'白猫',spiritThought:'我想靠近闻闻他的衣角。',attitude:'neutral',strength:'small'}]});
 const actor=out.characters.find(c=>c.id==='npc-new');
 assert.equal(actor.spiritAnimal,'白猫');assert.equal(actor.spiritThought,'我想靠近闻闻他的衣角。');assert.equal(actor.present,true);
 assert.ok(!out.stateUpdate.codes.includes('STATE_SPIRIT_THOUGHT_STALE'));
});
test('valid NPC OS survives even when spirit metadata has not yet been registered',()=>{
 const state=initial();delete state.characters[0].spiritAnimal;
 const out=decode(state,{event:'交谈',presentCharacterIds:['npc-one'],characters:[{id:'npc-one',spiritThought:'对方精神体未出现',attitude:'neutral',strength:'small'}]});
 assert.equal(out.characters.find(c=>c.id==='npc-one').spiritThought,'对方精神体未出现');
});
test('three successive turns refresh both OS fields; repeated and placeholder OS stay repairable',()=>{
 let state=initial();
 for(let i=1;i<=3;i++){
  const out=decode(state,{event:'交谈'+i,presentCharacterIds:['npc-one'],characters:[{id:'npc-one',spiritThought:'这轮我注意到新动静'+i,attitude:'neutral',strength:'small'}],player:{spiritThought:'我正在观察四周'+i}});
  state=commit(state,out);
  assert.equal(state.characters[0].spiritThought,'这轮我注意到新动静'+i);
  assert.equal(state.player.spiritThought,'我正在观察四周'+i);
 }
 const out=decode(state,{event:'继续',presentCharacterIds:['npc-one'],characters:[{id:'npc-one',spiritThought:state.characters[0].spiritThought,attitude:'neutral',strength:'small'}],player:{spiritThought:'待生成'}});
 assert.ok(out.stateUpdate.codes.includes('STATE_SPIRIT_THOUGHT_STALE'));
 assert.deepEqual(missingRepairPlan(out,state,[],true,false).spiritIds.sort(),['npc-one','player']);
});
test('direct compatibility path preserves valid fields when MVU is invalid',()=>{
 const state=initial();const out=normalizeModelState(card,state,{event:'继续',presentCharacterIds:['npc-one'],characters:[{id:'npc-one',spiritThought:'新反应'}],mvu:[{op:'delta',path:'/characters/no/affinity',value:3}]},{...options,validationWarnings:[]});
 assert.equal(out.characters.find(c=>c.id==='npc-one').spiritThought,'新反应');
});
test('final protocol explicitly requires first-arrival and fresh per-turn spirit OS',()=>{
 const prompt=stateProtocol({state:initial()});assert.ok(prompt.includes('Starting on the first physical appearance'));assert.ok(prompt.includes('replace the previous OS'));assert.ok(prompt.includes('Do not invent a spirit identity'));
});
test('a conflicting alias and a null character row do not swallow another valid field',()=>{
 const state=initial();const out=decode(state,{event:'交谈',presentCharacterIds:['npc-one'],characters:[null,{id:'npc-one',spiritThought:'标准值',精神体OS:'冲突值',innerThought:'先看清楚再说。',attitude:'neutral',strength:'small'}]});
 assert.ok(out.stateUpdate.codes.includes('STATE_FIELD_CONFLICT'));
 assert.equal(out.characters.find(c=>c.id==='npc-one').innerThought,'先看清楚再说。');
 assert.equal(commit(state,out).characters.find(c=>c.id==='npc-one').spiritThought,'旧 NPC OS');
});
