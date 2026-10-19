import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder} from '../server/ai.mjs';
import {normalizeModelState} from '../server/ai.mjs';

const card={world:{name:'世界'},characters:[{id:'one',name:'甲'},{id:'two',name:'乙'}],places:[]};
const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'one',name:'甲',present:true,affinity:10},{id:'two',name:'乙',present:false}]};
const finish=payload=>{const decoder=new StoryDecoder();decoder.push('正文<status>'+JSON.stringify(payload)+'</status><done>');return decoder.finish(card,state,{singleStateCall:true});};

test('silence keeps a prior present actor, records missing and never turns it into an exit',()=>{
 const out=finish({event:'独自等待',present:[],enter:[],exit:[],characters:[]});
 assert.equal(out.characters.find(c=>c.id==='one').present,true);
 assert.equal(out.stateUpdate.review.one,'missing');
 assert.equal(out.stateUpdate.status,'partial');
 assert.ok(out.stateUpdate.codes.includes('STATE_ATTITUDE_REVIEW_MISSING'));
});

test('an explicit exit is the only way to leave without leaving a missing review',()=>{
 const out=finish({event:'甲离开',present:[],enter:[],exit:['one'],characters:[]});
 assert.equal(out.characters.find(c=>c.id==='one').present,false);
 assert.equal(out.stateUpdate.review?.one,undefined);
});

test('a row with present:true enters a new actor even when present does not repeat it',()=>{
 const out=finish({event:'乙走进来',present:[],enter:[],exit:[],characters:[{id:'two',name:'乙',present:true,attitude:'neutral',strength:'small'}]});
 assert.equal(out.characters.find(c=>c.id==='two').present,true);
 assert.equal(out.stateUpdate.review.two,'changed');
 assert.equal(out.stateUpdate.review.one,'missing');
});

test('a conflicting present and exit is rejected instead of guessed',()=>{
 assert.throws(()=>finish({event:'冲突',present:['one'],enter:[],exit:['one'],characters:[]}),{code:'MODEL_STATE_ROSTER_INVALID'});
});

test('legacy presentCharacterIds keeps the old full-roster semantics and writes no delta review',()=>{
 const out=finish({event:'旧格式',presentCharacterIds:['two'],characters:[]});
 assert.equal(out.characters.find(c=>c.id==='one').present,false);
 assert.equal(out.stateUpdate.review,undefined);
});

test('normalizeModelState rejects a delta roster naming an unknown actor',()=>{
 assert.throws(()=>normalizeModelState(card,state,{event:'未知',present:['ghost'],characters:[]}),{code:'UNKNOWN_MODEL_CHARACTER'});
});

test('commitGroups keeps the valid actor patch and records the partial update',()=>{
 const decoder=new StoryDecoder();
 decoder.push('正文<UpdateVariable><JSONPatch>[{"op":"delta","path":"/characters/one/affinity","value":5},{"op":"replace","path":"/characters/two/affinity","value":999}]</JSONPatch></UpdateVariable><status>{"event":"各自反应","present":["one"],"characters":[]}</status><done>');
 const out=decoder.finish(card,state,{singleStateCall:true,commitGroups:true});
 assert.equal(out.characters.find(c=>c.id==='one').affinity,15);
 assert.equal(out.characters.find(c=>c.id==='two').affinity,undefined);
 assert.ok(out.stateUpdate.codes.includes('STATE_MVU_PARTIAL'));
});
