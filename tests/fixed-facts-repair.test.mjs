import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder,normalizeModelState,buildMessages} from '../server/ai.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {mergeRepairOutcome} from '../src/domain/stateRepair.ts';
const card={world:{name:'学院',entries:[]},places:[],characters:[{id:'one',name:'甲',identity:'学生',mentalPowerLevel:'S级(空间操纵)'}]};
const persona={name:'玩家',identity:'玩家设定',mentalPowerLevel:'B级'};
const state={player:{id:'player',name:'玩家',present:true,identity:'污染',mentalPowerLevel:'未知'},characters:[{id:'one',name:'甲',present:false,affinity:0,identity:'污染',mentalPowerLevel:'未知'}]};
const settings=defaultTheaters().map(s=>({...s,enabled:false}));
test('服务端输入使用权威人设，模型乱改不使同批在场和好感度失败',()=>{
 const built=buildMessages(card,{persona,state,input:'观察',history:[],presets:[],memories:[],theaterSettings:settings});assert.equal(built.state.characters[0].identity,'学生');assert.equal(built.state.player.identity,'玩家设定');
 const out=normalizeModelState(card,built.state,{event:'到场',presentCharacterIds:['one'],mvu:[{op:'replace',path:'/characters/one/identity',value:'编造职业'},{op:'replace',path:'/characters/one/mentalPowerLevel',value:'S'},{op:'delta',path:'/characters/one/affinity',value:5}],characters:[{id:'one',identity:42,mentalPowerLevel:'未知'}],player:{identity:'编造身份'}},{singleStateCall:true,theaterSettings:settings,persona,validationWarnings:[]});
 assert.equal(out.characters[0].present,true);assert.equal(out.characters[0].affinity,5);assert.equal(out.characters[0].identity,undefined);assert.equal(out.player?.identity,undefined);
});
test('真实服务端解码器标记逐角色的名单回退，客户端补修保留本轮有效在场值',()=>{
 const decoder=new StoryDecoder();decoder.push('<status>{"event":"补全","characters":[]}</status><done>');
 const out=decoder.finish(card,state,{singleStateCall:true,theaterSettings:settings,persona});assert.deepEqual(out.stateUpdate.retainedPresentIds,['one']);
 const effective=structuredClone(state);effective.characters[0].present=true;effective.characters[0].affinity=5;
 const merged=mergeRepairOutcome({event:'已到场',characters:[{id:'one',present:true,affinity:5}]},out,state,effective);assert.equal(merged.characters[0].present,true);assert.equal(merged.characters[0].affinity,5);
 const empty=new StoryDecoder();empty.push('<status>{"event":"已离场","presentCharacterIds":[]}</status><done>');assert.deepEqual(empty.finish(card,state,{singleStateCall:true,theaterSettings:settings,persona}).stateUpdate.retainedPresentIds,[]);
 const explicit=new StoryDecoder();explicit.push('<status>{"event":"明确离场","mvu":[{"op":"replace","path":"/characters/one/present","value":false}]}</status><done>');
 const leave=explicit.finish(card,state,{singleStateCall:true,theaterSettings:settings,persona});assert.deepEqual(leave.stateUpdate.retainedPresentIds,[]);assert.equal(mergeRepairOutcome({event:'已到场'},leave,state,effective).characters[0].present,false);
});
