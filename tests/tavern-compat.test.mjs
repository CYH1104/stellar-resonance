import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder,normalizeModelState} from '../server/ai.mjs';
import {streamStory} from '../server/story-stream.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {applyMvu} from '../src/domain/mvu.ts';

const card={characters:[{id:'one',name:'甲',spiritAnimal:'白猫'},{id:'two',name:'乙'}]};
const state={player:{id:'player',name:'玩家',present:true,spiritAnimal:'白狐',spiritThought:'旧玩家OS'},characters:[{id:'one',name:'甲',present:true,affinity:5,spiritAnimal:'白猫',spiritThought:'旧角色OS',identity:'学员'},{id:'two',name:'乙',present:false,affinity:0}],variables:{clock:1}};
const settings=defaultTheaters().map(t=>({...t,enabled:false}));
const options=(extra={})=>({singleStateCall:true,requireDynamicState:true,theaterSettings:settings,validationWarnings:[],...extra});
const base=()=>({presentCharacterIds:['one'],event:'本轮实际交谈',characters:[{id:'one',affinity:8,spiritThought:'看看门外'}],player:{spiritThought:'想吃点心'}});
const patch=ops=>'<UpdateVariable><JSONPatch>'+JSON.stringify(ops)+'</JSONPatch></UpdateVariable>';
const response=raw=>new Response(JSON.stringify({choices:[{message:{content:raw}}]}),{headers:{'Content-Type':'application/json'}});

test('screen-shot style full actor MVU rejects the entire variable transaction while preserving valid side scenes',()=>{
  const raw={...base(),mvu:[{op:'add',path:'/characters/one',value:{id:'one',name:'错误改名',spiritAnimal:'错误种类',primaryGender:'男',present:true,affinity:7,identity:'学员',spiritThought:'旧补丁OS'}},{op:'add',path:'/custom/clock',value:2}],theaters:[{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'甲',content:String.raw`第一行\\n\\n第二行`}]}]};
  const opts=options({theaterSettings:settings.map(t=>({...t,enabled:t.slot===2}))}),out=normalizeModelState(card,state,raw,opts);
  const next=out.mvu?applyMvu(state,out.mvu):structuredClone(state);for(const actor of out.characters)Object.assign(next.characters.find(c=>c.id===actor.id),actor);
  assert.equal(next.characters[0].name,'甲');assert.equal(next.characters[0].spiritAnimal,'白猫');assert.equal(next.characters[0].affinity,5);assert.equal(next.variables.clock,1);assert.equal(out.theaters[0].messages[0].content,'第一行\n\n第二行');assert.ok(opts.validationWarnings.includes('STATE_MVU_REJECTED'));
});
test('legacy state maps, exact names, numeric strings and Chinese field aliases normalize without changing raw data',()=>{
  const raw={presentCharacterIds:['甲'],event:'交谈',characters:{one:{好感度:'12',精神体OS:'新的想法',mentalPowerLevel:[]}},player:{spiritThought:'想睡觉'}};const saved=JSON.stringify(raw);
  const out=normalizeModelState(card,state,raw,options());assert.equal(out.characters[0].affinity,12);assert.equal(out.characters[0].spiritThought,'新的想法');assert.deepEqual(out.characters.filter(c=>c.present).map(c=>c.id),['one']);assert.equal(JSON.stringify(raw),saved);
});
test('invalid single fields retain previous values, valid fields and forum posts survive independently',()=>{
  const raw={...base(),characters:[{id:'one',affinity:'not-a-number',identity:'新身份',spiritThought:''},{id:'unknown',affinity:99}],player:{spiritThought:[]},forum:[{id:'valid',authorName:'甲',content:'有效帖子',comments:[{id:'bad',content:3},{id:'ok',authorName:'乙',content:'有效评论'}]},{id:'bad',content:3}]};
  const out=normalizeModelState(card,state,raw,options({theaterSettings:settings.map(t=>({...t,enabled:t.slot===1}))}));
  assert.equal(out.characters[0].identity,undefined);assert.equal(out.characters[0].affinity,undefined);assert.equal(out.characters[0].spiritThought,undefined);assert.equal(out.player,undefined);assert.equal(out.forum.length,1);assert.equal(out.forum[0].comments.length,1);
});
test('missing or entirely unknown roster retains scene, explicit empty roster clears scene',()=>{
  for(const presentCharacterIds of [undefined,['not-a-real-id']]){const out=normalizeModelState(card,state,{...base(),presentCharacterIds},options());assert.ok(out.characters.find(c=>c.id==='one').present);}
  assert.ok(normalizeModelState(card,state,{...base(),presentCharacterIds:[]},options()).characters.every(c=>!c.present));
});
test('diary embedded in content and an unrelated invalid side scene do not discard valid group or diary',()=>{
  const opts=options({theaterSettings:settings.map(t=>({...t,enabled:[2,4].includes(t.slot),...(t.slot===4?{templateId:'spirit',title:'精神体日记'}:{})}))});
  const out=normalizeModelState(card,state,{...base(),theaters:[{slot:'2',kind:'group',messages:[{name:'甲',text:'消息'}]},{slot:3,kind:'fanfic',content:[]},{slot:4,kind:'custom',content:{ownerId:'one',title:'猫的日记',mood:'开心',content:'我今天晒了太阳。'}}]},opts);
  assert.equal(out.theaters.length,2);assert.equal(out.theaters[0].messages[0].content,'消息');assert.equal(out.theaters[1].diary.ownerId,'one');assert.equal(out.theaters[1].diary.spiritAnimal,'白猫');assert.equal(out.theaters[1].content,'我今天晒了太阳。');
});
test('MVU ahead of and between prose paragraphs never hides or duplicates subsequent prose at any chunk split',()=>{
  const raw=patch([])+'第一段。'+patch([])+'第二段。<SR_STATE>'+JSON.stringify(base())+'</SR_STATE><SR_DONE>';
  for(let split=0;split<=raw.length;split++){const decoder=new StoryDecoder();const visible=decoder.push(raw.slice(0,split))+decoder.push(raw.slice(split));assert.equal(visible,'第一段。第二段。');assert.equal(decoder.story,visible);assert.equal(decoder.finish(card,state,options()).characters[0].affinity,8);}
  const decoder=new StoryDecoder();let visible='';for(const c of raw)visible+=decoder.push(c);assert.equal(visible,'第一段。第二段。');decoder.finish(card,state,options());
});
test('compatible state completes in the original call and records recovered raw output without automatic model calls',async()=>{
  let calls=0;const raw='正文保留。<SR_STATE>'+JSON.stringify({...base(),characters:[{id:'one',affinity:'8',spiritThought:'看门口'}]})+'</SR_STATE><SR_DONE>',events=[];
  for await(const event of streamStory({card,state,options:options({captureFormatErrors:true}),messages:[],profile:{model:'test'},connection:{url:'https://synthetic.example'},key:'synthetic',signal:new AbortController().signal,firstResponse:response(raw),fetchImpl:async()=>{calls++;throw Error('Unexpected call');}}))events.push(event);
  assert.equal(calls,0);assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'正文保留。');assert.equal(events.at(-1).type,'done');assert.equal(events.find(e=>e.type==='format-error').code,'STATE_COMPAT_RECOVERED');
});
test('unsafe custom paths remain rejected, known character identity and valid state remain intact',()=>{
  const out=normalizeModelState(card,state,{...base(),mvu:[{op:'add',path:'/custom/__proto__/polluted',value:true}]},options());assert.equal(out.mvu,undefined);assert.equal({}.polluted,undefined);assert.equal(out.characters[0].affinity,undefined);assert.ok(!out.characters.some(c=>c.affinity!==undefined));
});
