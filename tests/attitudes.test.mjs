import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder} from '../server/ai.mjs';
import {attitudeUpdates} from '../server/attitudes.mjs';
import {applyMvu} from '../src/domain/mvu.ts';
import {newSession,finishVariant,stateAt,selectVariant,truncate} from '../src/domain/story.ts';
const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'lin',name:'林',present:true,affinity:10}]};
const card={world:{name:'世界'},characters:[],places:[]};
test('one status card carries identity, attitude and thoughts without separate MVU',()=>{
 const d=new StoryDecoder();d.push('正文<status>'+JSON.stringify({event:'帮助新同学',presentCharacterIds:['new'],characters:[{id:'new',name:'新同学',present:true,attitude:'positive',strength:'small',innerThought:'谢谢帮助'}]})+'</status><done>');
 const out=d.finish(card,state,{singleStateCall:true});
 assert.equal(out.characters.find(c=>c.id==='new').affinity,2);
 assert.equal(out.characters.find(c=>c.id==='new').innerThought,'谢谢帮助');
 assert.deepEqual(out.stateUpdate.affinityReviewedIds,['new']);
 assert.ok(!out.stateUpdate.codes.includes('STATE_ATTITUDE_REVIEW_MISSING'));
 assert.ok(!out.stateUpdate.codes.includes('STATE_UNKNOWN_CHARACTER_SKIPPED'));
 assert.ok(!out.stateUpdate.codes.includes('STATE_MVU_OUTPUT_MISSING'));
});
test('status name reconciles a changed model ID before applying attitude',()=>{
 const warnings=[],reviewed=[];
 const ops=attitudeUpdates({changes:[{id:'changed',attitude:'positive'}]},state,c=>warnings.push(c),[{id:'changed',name:'林'},{id:'changed',present:true}],id=>reviewed.push(id));
 assert.equal(applyMvu(state,ops).characters[0].affinity,12);
 assert.deepEqual(reviewed,['lin']);assert.deepEqual(warnings,[]);
});
test('server calculates fixed deltas, clamps boundaries, registers new NPCs and isolates invalid judgments',()=>{
 const warnings=[];
 const ops=attitudeUpdates({changes:[{id:'lin',attitude:'positive',strength:'small'},{id:'new',name:'新角色',attitude:'negative',strength:'large'},{id:'bad',attitude:'wrong'},{id:'lin',attitude:'positive',strength:'large'}]},state,c=>warnings.push(c));
 const after=applyMvu(state,ops);assert.equal(after.characters[0].affinity,12);assert.equal(after.characters[1].affinity,-5);assert.equal(warnings.length,2);
 for(const [old,attitude,expected]of [[99,'positive',100],[-99,'negative',-100]]){const s={...state,characters:[{...state.characters[0],affinity:old}]};assert.equal(applyMvu(s,attitudeUpdates({changes:[{id:'lin',attitude,strength:'large'}]},s)).characters[0].affinity,expected);}
});
test('attitude block split at every character stays hidden and commits once, legacy delta is not also applied',()=>{
 const raw='<attitudes>{"changes":[{"id":"lin","attitude":"positive","strength":"small"}]}</attitudes>正文<UpdateVariable><JSONPatch>[{"op":"delta","path":"/characters/lin/affinity","value":5}]</JSONPatch></UpdateVariable><status>{"event":"交谈","presentCharacterIds":["lin"],"characters":[]}</status><done>';
 for(let i=1;i<raw.length;i++){const d=new StoryDecoder();assert.equal(d.push(raw.slice(0,i))+d.push(raw.slice(i)),'正文');const out=d.finish(card,state,{singleStateCall:true});assert.equal(out.characters.find(c=>c.id==='lin').affinity,12);}
});
test('neutral judgment preserves values and missing or invalid review is explicitly diagnosed',()=>{
 const d=new StoryDecoder();d.push('<attitudes>{"changes":[{"id":"lin","attitude":"neutral"}]}</attitudes>正文<done>');const out=d.finish(card,state,{singleStateCall:true});assert.ok(!out.stateUpdate.codes.includes('STATE_MVU_OUTPUT_MISSING'));assert.equal(out.characters.find(c=>c.id==='lin').affinity,undefined);
 const bad=new StoryDecoder();bad.push('<attitudes>{"changes":[{"id":"lin","attitude":"oops"}]}</attitudes>正文<done>');assert.ok(bad.finish(card,state,{singleStateCall:true}).stateUpdate.codes.includes('STATE_ATTITUDE_INVALID'));
});
test('neutral review overrides a stale absolute status score',()=>{
 const d=new StoryDecoder();d.push('<attitudes>{"changes":[{"id":"lin","attitude":"neutral"}]}</attitudes>正文<status>{"event":"问好","presentCharacterIds":["lin"],"characters":[{"id":"lin","affinity":99}]}</status><done>');
 const out=d.finish(card,state,{singleStateCall:true});assert.ok(out.characters.every(c=>c.affinity===undefined));assert.deepEqual(out.stateUpdate.affinityReviewedIds,['lin']);
});
test('a new status card always has numeric affinity and omitted present-card judgments are reported',()=>{
 const d=new StoryDecoder();d.push('<attitudes>{"changes":[]}</attitudes>正文<status>{"event":"登记","presentCharacterIds":["clerk"],"characters":[{"id":"clerk","name":"值班人员","relationship":"接待工作人员"}]}</status><done>');
 const out=d.finish(card,state,{singleStateCall:true});const actor=out.characters.find(c=>c.id==='clerk');assert.equal(actor.affinity,0);assert.ok(out.stateUpdate.codes.includes('STATE_ATTITUDE_REVIEW_MISSING'));
});
test('saved outcomes replay once across repeated reads, variants and rollback',()=>{
 const s=newSession('测试',{name:'玩家',appearance:'',background:'',personality:''},'');s.initial=state;
 const a={id:'a',text:'帮助',createdAt:'',status:'incomplete'},b={id:'b',text:'争吵',createdAt:'',status:'incomplete'};s.turns.push({id:'t',input:'交流',selected:0,variants:[a,b]});
 for(const [variant,attitude]of [[a,'positive'],[b,'negative']]){const d=new StoryDecoder();d.push('<attitudes>'+JSON.stringify({changes:[{id:'lin',attitude,strength:'small'}]})+'</attitudes>正文<done>');finishVariant(s,0,variant,d.finish(card,state,{singleStateCall:true}));}
 assert.equal(stateAt(s).characters[0].affinity,12);assert.equal(stateAt(s).characters[0].affinity,12);selectVariant(s,0,1);assert.equal(stateAt(s).characters[0].affinity,8);truncate(s,0);assert.equal(stateAt(s).characters[0].affinity,10);
});
