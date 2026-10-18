import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeModelState,buildMessages} from '../server/ai.mjs';
const card={world:{name:'测试世界',greeting:[]},places:[],characters:[{id:'guide',name:'引导员'}]};
const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'guide',name:'引导员',present:true,affinity:0}]};
const npc={id:'npc-brother',name:'林川',present:false,relationship:'哥哥',affinity:35};
test('registers a valid unknown NPC in single-call compatibility and carries it into the next request',()=>{
 const warnings=[];const out=normalizeModelState(card,state,{event:'提及哥哥',presentCharacterIds:['guide'],characters:[npc]},{singleStateCall:true,validationWarnings:warnings});
 assert.deepEqual(out.characters.find(c=>c.id===npc.id),npc);assert.ok(!warnings.includes('STATE_UNKNOWN_CHARACTER_SKIPPED'));
 const next={...state,characters:[...state.characters,npc]};
 const result=buildMessages(card,{persona:{name:'玩家',appearance:'',personality:'',background:'哥哥叫林川'},state:next,input:'询问哥哥',history:[],memories:[],presets:[],stateEnabled:true});
 assert.ok(JSON.stringify(result.messages).includes(npc.id));assert.ok(JSON.stringify(result.messages).includes('哥哥'));
});
test('supports MVU-created NPCs and strict state path without a second model invocation',()=>{
 for(const singleStateCall of [false,true]){const out=normalizeModelState(card,state,{event:'哥哥来访',presentCharacterIds:[npc.id],characters:[],mvu:[{op:'add',path:'/characters/npc-brother',value:{...npc,present:true}}]},{singleStateCall,validationWarnings:[]});assert.equal(out.characters.find(c=>c.id===npc.id)?.name,npc.name);assert.equal(out.characters.find(c=>c.id===npc.id)?.present,true);}
});
test('retains over fifty registered NPCs and ignores new actor output when status is disabled',()=>{
 const many={...state,characters:[...state.characters,...Array.from({length:80},(_,i)=>({...npc,id:'npc-'+i,name:'角色'+i}))]};
 const out=normalizeModelState(card,many,{event:'多人档案',presentCharacterIds:[],characters:[{id:'npc-79',relationship:'哥哥'}]},{singleStateCall:true,validationWarnings:[]});
 assert.equal(out.characters.length,81);assert.equal(out.characters.find(c=>c.id==='npc-79').relationship,'哥哥');
 const disabled=normalizeModelState(card,state,{event:'仅正文',characters:[npc],presentCharacterIds:[npc.id]},{singleStateCall:true,stateEnabled:false,validationWarnings:[]});assert.ok(!disabled.characters.some(c=>c.id===npc.id));
});
