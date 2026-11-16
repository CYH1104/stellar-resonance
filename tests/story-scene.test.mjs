import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder} from '../server/ai.mjs';
import {stateProtocol} from '../server/state-protocol.mjs';
import {outputManifest} from '../server/state-output.mjs';
import {applyMvu} from '../src/domain/mvu.ts';
import {scenePaths,storyScene} from '../src/domain/storyScene.ts';
import {defaultTheaters} from '../src/domain/theaters.ts';
const state={player:{id:'player',name:'玩家',present:true},characters:[],variables:{score:2}};
const card={world:{name:'学院'},places:[],characters:[]};
function decode(text,enabled=true){const d=new StoryDecoder();assert.ok(d.push(text).includes('正文'));return d.finish(card,state,{singleStateCall:true,stateEnabled:enabled,requestId:'scene-test',theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),suggestionsEnabled:false});}
test('existing canonical state response captures scene fields with the prose',()=>{
 const customUpdates=Object.entries(scenePaths).map(([key,path])=>({path,action:'set',value:({日期:'2042-03-05',时间:'18:42',地点:'图书馆'})[key],reason:'正文明确到达图书馆时的日期和时间。'}));
 const raw={schemaVersion:'state-output-v1',requestId:'scene-test',event:'到达',presentCharacterIds:[],characters:[],customUpdates};
 const out=decode('正文<SR_STATE>'+JSON.stringify(raw)+'</SR_STATE><SR_DONE>');
 assert.deepEqual(storyScene(applyMvu(state,out.mvu)),{日期:'2042-03-05',时间:'18:42',地点:'图书馆'});
 assert.equal(out.stateUpdate.codes.includes('STATE_CUSTOM_REJECTED'),false);
 for(const path of Object.values(scenePaths))assert.equal(outputManifest(state).customVariableSchema[path].type,'string');
});
test('scene-only MVU remains active with actor updates disabled and ignores other variables',()=>{
 const ops=[{op:'replace',path:scenePaths.时间,value:'18:42'},{op:'delta',path:'/custom/score',value:100}];
 const out=decode('正文<UpdateVariable><JSONPatch>'+JSON.stringify(ops)+'</JSONPatch></UpdateVariable><SR_DONE>',false);
 assert.equal(storyScene(applyMvu(state,out.mvu)).时间,'18:42');assert.equal(applyMvu(state,out.mvu).variables.score,2);
 assert.equal(out.stateUpdate.status,'disabled');assert.ok(!out.stateUpdate.codes.includes('STATE_MVU_REJECTED'));
});
test('malformed scene values retain previous state without discarding prose',()=>{
 const out=decode('正文<UpdateVariable><JSONPatch>'+JSON.stringify([{op:'replace',path:scenePaths.时间,value:'99:99'}])+'</JSONPatch></UpdateVariable><SR_DONE>',false);
 assert.equal(out.mvu,undefined);assert.ok(out.stateUpdate.codes.includes('STATE_SCENE_RETAINED'));
});
test('first fictional calendar is permitted only when world and history have not established one',()=>{
 for(const stateEnabled of [true,false]){
  const text=stateProtocol({state,stateEnabled});
  assert.ok(text.includes('优先遵守世界设定、世界书'));
  assert.ok(text.includes('允许在首次实际场景中建立'));
  assert.ok(text.includes('此后沿用该历法，不每轮重新创建日期'));
  assert.ok(text.includes('绝不采用电脑、服务器或现实当前日期时间'));
  assert.ok(text.includes('不能用正文结尾转场后的值覆盖开场'));
  assert.ok(text.includes('虚构星历不能套用现实公历推算星期'));
 }
 const openingScene={日期:'星历578年09月01日',时间:'08:00',地点:'教室',人物:['玩家','开场同伴']};
 const ops=[{op:'replace',path:scenePaths.日期,value:'星历578年09月01日'},{op:'replace',path:scenePaths.时间,value:'19:00'},{op:'replace',path:scenePaths.地点,value:'图书馆'}];
 const text='正文：星历578年09月01日从教室出发，19:00到达图书馆。<SR_STATE>'+JSON.stringify({event:'到达',openingScene})+'</SR_STATE><UpdateVariable><JSONPatch>'+JSON.stringify(ops)+'</JSONPatch></UpdateVariable><SR_DONE>';
 const result=decode(text,false);assert.deepEqual(result.openingScene,openingScene);assert.equal(storyScene(applyMvu(state,result.mvu)).时间,'19:00');
});
test('both prompt modes define scene output in the same response and repair does not advance it',()=>{
 for(const stateEnabled of [true,false]){const text=stateProtocol({state,stateEnabled});assert.ok(text.includes(scenePaths.时间));assert.ok(text.includes('不额外'));}
 assert.ok(!stateProtocol({state,repairPlan:{}}).includes('[剧情时间地点 MVU'));
});
