import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder} from '../server/ai.mjs';
import {applyMvu,prepareMvuUpdates} from '../src/domain/mvu.ts';
const state={player:{id:'player',name:'玩家',present:true},characters:[]};
const card={world:{name:'世界'},characters:[],places:[]};
test('status declares new NPC before its field delta, registration persists into later turns',()=>{
 const decoder=new StoryDecoder();decoder.push('遇到接待员。<UpdateVariable><Analysis>Help increased trust.</Analysis><JSONPatch>[{"op":"delta","path":"/characters/new-npc/affinity","value":3}]</JSONPatch></UpdateVariable><status>{"event":"交谈","presentCharacterIds":["new-npc"],"characters":[{"id":"new-npc","name":"接待员"}]}</status><done>');
 const out=decoder.finish(card,state,{singleStateCall:true});
 assert.ok(!out.stateUpdate.codes.includes('STATE_MVU_REJECTED'));
 assert.equal(out.characters.find(c=>c.id==='new-npc').affinity,3);
});
test('explicit registration is moved before deltas and initialized once without resetting existing affinity',()=>{
 const updates=prepareMvuUpdates(state,[{op:'delta',path:'/characters/new/affinity',value:4},{op:'insert',path:'/characters/new',value:{id:'new',name:'新角色'}}]);
 assert.equal(updates[0].op,'insert');const next=applyMvu(state,updates);assert.equal(next.characters[0].affinity,4);
 const following=prepareMvuUpdates(next,[{op:'delta',path:'/characters/new/affinity',value:-1}],[{id:'new',name:'新角色',affinity:0}]);
 assert.equal(following.length,1);assert.equal(applyMvu(next,following).characters[0].affinity,3);
 assert.throws(()=>applyMvu(state,prepareMvuUpdates(state,[{op:'delta',path:'/characters/unknown/affinity',value:4}])));
});
test('missing variable output and rejected target are distinct diagnostics',()=>{
 const missing=new StoryDecoder();missing.push('正文<status>{"event":"观察","characters":[],"presentCharacterIds":[]}</status><done>');
 assert.ok(missing.finish(card,state,{singleStateCall:true}).stateUpdate.codes.includes('STATE_MVU_OUTPUT_MISSING'));
 const rejected=new StoryDecoder();rejected.push('正文<UpdateVariable><JSONPatch>[{"op":"delta","path":"/characters/ghost/affinity","value":1}]</JSONPatch></UpdateVariable><done>');
 assert.ok(rejected.finish(card,state,{singleStateCall:true}).stateUpdate.codes.includes('STATE_MVU_PATH_REJECTED'));
});
test('known NPC without an affinity receives one neutral initializer before its first delta',()=>{
 const old={...state,characters:[{id:'known',name:'老角色',present:true}]};
 const prepared=prepareMvuUpdates(old,[{op:'delta',path:'/characters/known/affinity',value:2}]);
 assert.equal(prepared[0].op,'insert');const next=applyMvu(old,prepared);assert.equal(next.characters[0].affinity,2);
 assert.equal(prepareMvuUpdates(next,[{op:'delta',path:'/characters/known/affinity',value:1}]).length,1);
});
