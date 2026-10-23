import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adaptStateOutput,outputManifest} from '../server/state-output.mjs';
import {terminalCodePrompt} from '../server/terminal-codes.mjs';
import {applyMvu} from '../src/domain/mvu.ts';
import {terminalCodeBindings,terminalCodePath} from '../src/domain/terminalCodeVariables.ts';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {StoryDecoder} from '../server/ai.mjs';
const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'teacher',name:'卫锋',present:true}],variables:{}};
test('terminal codes still accompany prose with actor updates disabled',()=>{
 const decoder=new StoryDecoder();decoder.push('卫锋说：终端码12345678901。<UpdateVariable><JSONPatch>'+JSON.stringify([{op:'replace',path:terminalCodePath('teacher'),value:'12345678901'}])+'</JSONPatch></UpdateVariable>');
 const result=decoder.finish({world:{name:'学院'},characters:state.characters,places:[]},state,{singleStateCall:true,stateEnabled:false,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),suggestionsEnabled:false});
 assert.equal(terminalCodeBindings(applyMvu(state,result.mvu)).teacher,'12345678901');
});
test('canonical output binds only an actually narrated code, with per-ID schema',()=>{
 const path=terminalCodePath('teacher'),raw={schemaVersion:'state-output-v1',requestId:'codes',event:'交换号码',characters:[],customUpdates:[{path,action:'set',value:'12345678901',reason:'卫锋在正文中告知本人终端码'}]};
 assert.ok(outputManifest(state).customVariableSchema[path]);
 const good=adaptStateOutput(raw,state,{requestId:'codes',prose:'卫锋说：我的终端码是12345678901。'},()=>{});assert.equal(terminalCodeBindings(applyMvu(state,good.raw.mvu)).teacher,'12345678901');
 const warnings=[],bad=adaptStateOutput(raw,state,{requestId:'codes',prose:'卫锋拒绝给出号码。'},code=>warnings.push(code));assert.equal(bad.raw.mvu,undefined);assert.ok(warnings.includes('STATE_CUSTOM_REJECTED'));
 const prompt=terminalCodePrompt([],state.characters,false).content;assert.match(prompt,/custom\/终端码/);assert.match(prompt,/同一个UpdateVariable/);assert.match(prompt,/不使用服务器随机号/);
});
