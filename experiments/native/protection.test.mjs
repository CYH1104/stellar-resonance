import {test} from 'node:test';
import assert from 'node:assert/strict';
import {patchRawPreset,protectedRuntimePreset,validatePublicGeneration} from './preset-policy.mjs';
const original={temperature:1,show_thoughts:true,prompts:[{identifier:'a',content:'old',enabled:true,injection_trigger:['normal'],injection_depth:2,extra:{future:true}}],prompt_order:[{character_id:100001,order:[{identifier:'a',enabled:true}]}],extensions:{future:{unknown:[1,2]},tavern_helper:{scripts:[{content:'untrusted'}]}}};
test('editing sampling preserves every untouched raw field',()=>{const next=patchRawPreset(original,{temperature:0.4});assert.deepEqual({...next,temperature:1},original);assert.equal(original.temperature,1);});
test('editing prompt text/enable preserves trigger, depth, unknown fields and ordering',()=>{
 const next=patchRawPreset(original,{prompts:[{identifier:'a',content:'new',enabled:false}]});
 assert.deepEqual(next.prompts[0].injection_trigger,['normal']);assert.equal(next.prompts[0].injection_depth,2);assert.deepEqual(next.prompts[0].extra,{future:true});assert.equal(next.prompt_order[0].order[0].enabled,false);assert.equal(original.prompt_order[0].order[0].enabled,true);assert.deepEqual(next.extensions,original.extensions);assert.equal(original.prompts[0].content,'old');
});
test('runtime reasoning policy cannot be enabled by imported preset and does not rewrite original',()=>{
 const effective=protectedRuntimePreset({...original,include_reasoning:true,request_thoughts:true,should_return_reasoning:true});for(const key of ['show_thoughts','include_reasoning','request_thoughts','should_return_reasoning'])assert.equal(effective[key],false);assert.equal(original.show_thoughts,true);assert.deepEqual(effective.prompts,original.prompts);
});
test('prototype pollution and ambiguous/unknown prompt edits fail closed',()=>{
 assert.throws(()=>patchRawPreset(original,JSON.parse('{"__proto__":{"admin":true}}')));assert.throws(()=>patchRawPreset(original,{prompts:[{identifier:'missing',content:'x'}]}));assert.throws(()=>patchRawPreset(original,{prompts:[{identifier:'a'},{identifier:'a'}]}));assert.equal({}.admin,undefined);
});
test('public generation cannot supply full messages, private slots, keys, scripts or reasoning flags',()=>{
 for(const key of ['messages','privateCard','key','script','include_reasoning','show_thoughts','preset'])assert.throws(()=>validatePublicGeneration({input:'hello',[key]:true}));
 assert.deepEqual(validatePublicGeneration({input:'hello'}),{input:'hello'});assert.throws(()=>validatePublicGeneration({input:''}));
});
