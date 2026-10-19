import {defaultTheaters} from '../src/domain/theaters.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder,normalizeModelState,buildMessages} from '../server/ai.mjs';
import {newSession,finishVariant,stateAt} from '../src/domain/story.ts';
const card={characters:[{id:'guide',name:'样例引导员',str:'精神力 特级 · 精神体 白猫'}],world:{greeting:['迎新']},places:[]};
const session=()=>{const s=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'正文');s.initial.characters=s.initial.characters.slice(0,1);s.initial.characters[0].spiritAnimal='白猫';return s;};
const patch='<UpdateVariable><JSONPatch>[{"op":"delta","path":"/characters/guide/affinity","value":3},{"op":"add","path":"/characters/guide/spiritThought","value":"安静观察"},{"op":"add","path":"/custom/clock","value":1}]</JSONPatch></UpdateVariable>';
const control='<SR_STATE>{"presentCharacterIds":["guide"],"event":"走进校园"}</SR_STATE>';
test('MVU markers split at every character stay hidden, commit once with full response',()=>{const s=session(),d=new StoryDecoder();let visible='';for(const c of '正文。'+patch+control+'<SR_DONE>')visible+=d.push(c);assert.equal(visible,'正文。');assert.equal(d.hasCompletionMarker(),true);const out=d.finish(card,stateAt(s),{requireDynamicState:true,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))});s.turns.push({id:'t',input:'行动',selected:0,variants:[]});const v={id:'v',text:visible,status:'incomplete',createdAt:''};s.turns[0].variants.push(v);finishVariant(s,0,v,out);assert.equal(stateAt(s).characters[0].affinity,33);assert.equal(stateAt(s).variables.clock,1);});
test('post-state MVU blocks work; truncated or invalid updates do not commit',()=>{let d=new StoryDecoder();d.push('正文。'+control+patch+'<SR_DONE>');assert.equal(d.finish(card,stateAt(session())).mvu.length,3);for(const suffix of [patch+control,patch.slice(0,-4)+control+'<SR_DONE>','<UpdateVariable>_.set("player.name", "x");</UpdateVariable>'+control+'<SR_DONE>']){d=new StoryDecoder();d.push('正文。'+suffix);assert.throws(()=>d.finish(card,stateAt(session())));}});
test('conflicting SR_STATE/MVU fields and invalid arrays fail safely',()=>{const state=stateAt(session());assert.throws(()=>normalizeModelState(card,state,{presentCharacterIds:['guide'],event:'事件',mvu:[{op:'delta',path:'/characters/guide/affinity',value:3}],characters:[{id:'guide',affinity:1}]}),e=>e.code==='MODEL_STATE_CHARACTERS_INVALID');assert.throws(()=>normalizeModelState(card,state,{presentCharacterIds:[],event:'事件',mvu:[],characters:{}}),e=>e.code==='MODEL_STATE_CHARACTERS_INVALID');});
test('prompts include only this session MVU data and fixed-rule mental grade constraints',()=>{const s=session();const {messages,state}=buildMessages(card,{persona:s.persona,input:'行动',history:[],memories:[],presets:[],state:stateAt(s)});assert.match(messages[0].content,/AFFINITY REVIEW:/);assert.match(messages[0].content,new RegExp('author-controlled identity/mentalPowerLevel'));assert.match(messages[2].content,/stat_data/);assert.equal(state.characters[0].mentalPowerLevel,'特级');});

test('single-call valid MVU survives malformed status and stale affinity snapshots',()=>{
 const state=stateAt(session()),options={singleStateCall:true,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))};
 for(const status of ['<SR_STATE>{broken}</SR_STATE>','<SR_STATE>'+JSON.stringify({presentCharacterIds:['guide'],event:'互动',characters:[{id:'guide',affinity:30}]})+'</SR_STATE>']){
  const d=new StoryDecoder();d.push('正文。'+patch+status+'<SR_DONE>');const out=d.finish(card,state,options);
  assert.equal(out.characters.find(c=>c.id==='guide').affinity,33);
 }
});
