import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModelState,buildMessages} from '../server/ai.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {theaterRequirementError} from '../src/domain/theaterRequirements.ts';
const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'lu',name:'陆 离',present:false,affinity:0}]};
const card={world:{greeting:[]},places:[],characters:state.characters};
const settings=defaultTheaters().map(t=>({...t,enabled:false}));
const normalize=raw=>normalizeModelState(card,state,raw,{singleStateCall:true,theaterSettings:settings,validationWarnings:[]});
test('unique normalized names resolve a present NPC without creating duplicates',()=>{
 const result=normalize({event:'见面',presentCharacterIds:['陆离'],characters:[{name:'陆离',affinity:2}]});
 assert.equal(result.characters.find(c=>c.id==='lu').present,true);
 assert.equal(result.characters.find(c=>c.id==='lu').affinity,2);
 assert.equal(result.characters.length,1);
});
test('explicit valid MVU presence survives a stale roster snapshot',()=>{
 const result=normalize({event:'见面',presentCharacterIds:[],characters:[],mvu:[{op:'replace',path:'/characters/lu/present',value:true}]});
 assert.equal(result.characters.find(c=>c.id==='lu').present,true);
});
test('an unknown generated ID with a unique existing name updates the existing NPC',()=>{
 const result=normalize({event:'见面',presentCharacterIds:['guessed-luli'],characters:[{id:'guessed-luli',name:'陆离',affinity:3}]});
 assert.equal(result.characters.length,1);assert.equal(result.characters[0].id,'lu');assert.equal(result.characters[0].affinity,3);assert.equal(result.characters[0].present,true);
});
test('ambiguous names cannot choose an NPC, while explicit MVU departure beats an old roster',()=>{
 const twins={...state,characters:[...state.characters,{id:'other',name:'陆离',present:false}]};
 const result=normalizeModelState({...card,characters:twins.characters},twins,{event:'见面',presentCharacterIds:['陆离'],characters:[]},{singleStateCall:true,theaterSettings:settings});
 assert.ok(result.characters.every(c=>!c.present));
 const present={...state,characters:state.characters.map(c=>({...c,present:true}))};
 const left=normalizeModelState(card,present,{event:'离开',presentCharacterIds:['lu'],characters:[],mvu:[{op:'replace',path:'/characters/lu/present',value:false}]},{singleStateCall:true,theaterSettings:settings});
 assert.equal(left.characters[0].present,false);
});
test('a fanfic needs a final standalone END, not just a complete flag',()=>{
 const scene={slot:3,kind:'fanfic',title:'番外',content:'文'.repeat(800),complete:true};
 assert.equal(theaterRequirementError(scene),'MODEL_FANFIC_UNFINISHED');
 assert.equal(theaterRequirementError({...scene,content:scene.content+'\n\nEND'}),undefined);
 assert.equal(theaterRequirementError({...scene,content:scene.content+'\nEND\n尚未写完'}),'MODEL_FANFIC_UNFINISHED');
});
test('a spirit diary needs a generated signature and story date, never a UI invented ending',()=>{
 const scene={slot:4,kind:'custom',title:'日记',content:'',diary:{ownerId:'player',title:'日记',content:'我'.repeat(200)}};
 assert.equal(theaterRequirementError(scene,true),'MODEL_DIARY_UNFINISHED');
 assert.equal(theaterRequirementError({...scene,diary:{...scene.diary,signatureName:'小白',signatureDate:'学院第2日'}},true),undefined);
});
test('completion markers stay in the mandatory contract even with custom theater instructions',()=>{
 const enabled=settings.map(t=>({...t,enabled:t.slot===3||t.slot===4,...(t.slot===4?{templateId:'spirit'}:{})}));
 const built=buildMessages(card,{persona:{name:'玩家',spiritAnimal:'白猫'},state:{...state,player:{...state.player,spiritAnimal:'白猫'}},input:'继续',history:[],memories:[],presets:[],theaterSettings:enabled});
 const prompt=built.messages.map(m=>m.content).join('\n');
 assert.match(prompt,/END/);assert.match(prompt,/signatureName/);assert.match(prompt,/signatureDate/);
});
