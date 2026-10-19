import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder} from '../server/ai.mjs';
const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'one',name:'甲',present:true,affinity:10},{id:'two',name:'乙',present:true,affinity:5}]};
const card={world:{name:'世界'},characters:[],places:[]};
function finish(payload,options={}){const d=new StoryDecoder();d.push('正文<status>'+JSON.stringify(payload)+'</status><done>');return d.finish(card,state,{singleStateCall:true,...options});}
test('disabled state processing ignores delta exits and roster conflicts',()=>{
 const out=finish({event:'继续交谈',present:['one'],exit:['one'],characters:[]},{stateEnabled:false});
 assert.ok(out.characters.every(c=>c.present!==false));assert.equal(out.stateUpdate.status,'disabled');
});
test('targeted affinity repair reviews only the requested actor in delta mode',()=>{
 const out=finish({event:'补全',present:[],enter:[],exit:[],characters:[{id:'two',attitude:'neutral'}]},{repairPlan:{roster:false,affinityIds:['two'],spiritIds:[],theaterSlots:[],suggestions:false}});
 assert.deepEqual(out.stateUpdate.review,{two:'unchanged'});
 assert.ok(!out.stateUpdate.codes.includes('STATE_ATTITUDE_REVIEW_MISSING'));
});
test('unambiguous name reconciliation canonicalizes delta roster review IDs',()=>{
 const out=finish({event:'交谈',present:['wrong','two'],characters:[{id:'wrong',name:'甲',attitude:'positive',strength:'small'},{id:'two',name:'乙',attitude:'neutral'}]});
 assert.equal(out.characters.find(c=>c.id==='one').affinity,12);
 assert.deepEqual(out.stateUpdate.review,{one:'changed',two:'unchanged'});
 assert.ok(!out.stateUpdate.codes.includes('STATE_ATTITUDE_REVIEW_MISSING'));
});
test('dictionary-form character cards retain embedded attitudes',()=>{
 const out=finish({event:'交谈',present:['one','two'],characters:{one:{name:'甲',attitude:'positive'},two:{name:'乙',attitude:'neutral'}}});
 assert.equal(out.characters.find(c=>c.id==='one').affinity,12);
 assert.ok(!out.stateUpdate.codes.includes('STATE_ATTITUDE_REVIEW_MISSING'));
});
test('a malformed character row does not discard other valid status cards',()=>{
 const out=finish({event:'交谈',present:['one','two'],characters:[null,{id:'one',attitude:'positive'},{id:'two',attitude:'neutral'}]});
 assert.equal(out.characters.find(c=>c.id==='one').affinity,12);
 assert.ok(out.stateUpdate.codes.includes('STATE_FIELD_SKIPPED'));
});
