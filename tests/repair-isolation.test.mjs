import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMessages,StoryDecoder} from '../server/ai.mjs';
import {repairedMessages,continuedMessages} from '../server/story-stream.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
const card={world:{name:'学院',greeting:[],entries:[]},characters:[{id:'one',name:'甲'}],places:[]};
const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'one',name:'甲',present:false,affinity:5}]};
const settings=defaultTheaters().map(s=>({...s,enabled:false}));
test('state-only repair drops preset roles, examples, opening and story history on the server',()=>{
 const request={persona:{name:'玩家'},state,input:'观察',history:[{role:'assistant',content:'HISTORY_FORMAT_SENTINEL'}],memories:['KNOWN_MEMORY'],presets:['LEGACY_PRESET_SENTINEL'],promptEntries:[{id:'x',name:'style',enabled:true,role:'assistant',content:'PRESET_FORMAT_SENTINEL'}],opening:'OPENING_SENTINEL',theaterSettings:settings,worldInfo:[{content:'WORLD_FACT_SENTINEL',position:0,depth:4,order:1,role:'system'}],continuation:{partial:'固定正文',mode:'state'}};
 const built=buildMessages(card,request),messages=repairedMessages(built.messages,'固定正文',card,built.state,{theaterSettings:settings,worldInfo:built.repairLore,suggestionsEnabled:false});
 const text=JSON.stringify(messages);for(const sentinel of ['HISTORY_FORMAT_SENTINEL','LEGACY_PRESET_SENTINEL','PRESET_FORMAT_SENTINEL','OPENING_SENTINEL'])assert.ok(!text.includes(sentinel));assert.ok(text.includes('WORLD_FACT_SENTINEL'));assert.ok(text.includes('固定正文'));
 const normal=buildMessages(card,{...request,continuation:undefined});assert.ok(JSON.stringify(continuedMessages(normal.messages,'固定正文','玩家')).includes('PRESET_FORMAT_SENTINEL'));
});
test('a skipped actor field yields partial state while valid roster and affinity survive',()=>{
 const d=new StoryDecoder();d.push('正文<status>'+JSON.stringify({presentCharacterIds:['one'],characters:[{id:'one',affinity:22,mentalPowerLevel:[]}],event:'见面'})+'</status><done>');
 const out=d.finish(card,state,{singleStateCall:true,theaterSettings:settings});assert.equal(out.stateUpdate.status,'partial');assert.ok(out.stateUpdate.codes.includes('STATE_FIELD_SKIPPED'));assert.equal(out.characters[0].affinity,22);assert.equal(out.characters[0].present,true);assert.ok(!Object.hasOwn(out.characters[0],'mentalPowerLevel'));
});
test('every split of a truncated platform state tag is withheld from public deltas',()=>{
 for(const tag of ['status','SR_STATE','UpdateVariable']){
 const source='正文<'+tag+'>{"characters":[{"id":"one","affinity":';
 for(let i=0;i<=source.length;i++){const d=new StoryDecoder(),visible=d.push(source.slice(0,i))+d.push(source.slice(i));assert.equal(visible,'正文','split '+i+' '+tag);}
 }
});
