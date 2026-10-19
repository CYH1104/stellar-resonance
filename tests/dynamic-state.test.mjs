import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMessages,normalizeModelState,RESPONSE_END} from '../server/ai.mjs';
import {streamStory} from '../server/story-stream.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
const card={characters:[{id:'one',name:'甲',spiritAnimal:'白狐'}],world:{greeting:[]},places:[]};
const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'one',name:'甲',spiritAnimal:'白狐',affinity:36,present:false}]};
const settings=defaultTheaters();settings[2].enabled=true;settings[3].enabled=true;
const options={requireDynamicState:true,theaterSettings:settings,persona:{name:'玩家'}};
const valid=()=>({presentCharacterIds:['one'],characters:[{id:'one',affinity:42,spiritThought:'想凑过去闻闻。'}],event:'在门口相遇',forum:[{id:'post',authorName:'路人',content:'今天广场很热闹'}],theaters:[{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'同学',content:'晚饭吃什么？'}]},{slot:3,kind:'fanfic',title:'同人文',content:'你和甲一起去买饮料。'.repeat(100)+'\nEND',complete:true,participantIds:['player','one']},{slot:4,kind:'custom',title:'日记',content:'白狐在窗边晒太阳。'}]});
test('同人文过短或缺少完篇确认会触发明确错误，不能提交为合格小剧场',()=>{
 const short=valid();short.theaters[1].content='文'.repeat(799);assert.throws(()=>normalizeModelState(card,state,short,options),{code:'MODEL_FANFIC_TOO_SHORT'});
 const unfinished=valid();unfinished.theaters[1].content='文'.repeat(800);delete unfinished.theaters[1].complete;assert.throws(()=>normalizeModelState(card,state,unfinished,options),{code:'MODEL_FANFIC_UNFINISHED'});
 unfinished.theaters[1].complete=true;unfinished.theaters[1].content+='\nEND';assert.equal(normalizeModelState(card,state,unfinished,options).theaters[1].complete,true);
});
test('短同人文走已有补修预算，补齐后正文不重写',async()=>{
 const first=valid();first.theaters[1].content='未写完的短片段';const response=s=>new Response(JSON.stringify({choices:[{message:{content:s}}]}),{headers:{'Content-Type':'application/json'}}),events=[];let calls=0;
 for await(const e of streamStory({card,state,options,messages:[],connection:{url:'https://synthetic.example/v1/chat/completions'},profile:{model:'test',temperature:.7,maxTokens:4000},key:'synthetic-key',firstResponse:response('固定正文。<SR_STATE>'+JSON.stringify(first)+'</SR_STATE>'+RESPONSE_END),signal:new AbortController().signal,fetchImpl:async()=>{calls++;return response('<SR_STATE>'+JSON.stringify(valid())+'</SR_STATE>'+RESPONSE_END);}}))events.push(e);
 assert.equal(calls,1);assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'固定正文。');assert.equal(events.at(-1).type,'done');assert.equal(events.find(e=>e.type==='repair').code,'MODEL_FANFIC_TOO_SHORT');
});
test('AI affinity is retained as an MVU update and previous affinity reaches the next model request',()=>{
  assert.equal(normalizeModelState(card,state,valid(),options).characters[0].affinity,42);
  const {messages}=buildMessages(card,{persona:{name:'玩家',other:'与甲从小认识'},state,input:'打招呼',history:[],presets:[],memories:[],theaterSettings:settings});
  assert.equal(JSON.parse(messages.find(m=>m.content.includes('Current state JSON (authoritative, read-only)')).content.split('Current state JSON (authoritative, read-only):\n')[1].split('\n')[0]).stat_data.characters.one.affinity,36);
  assert.ok(!messages[0].content.includes('不输出或变更好感度'));
});
test('present characters must return affinity and known spirit OS; enabled scenes cannot silently disappear',()=>{
  const a=valid();delete a.characters[0].affinity;assert.throws(()=>normalizeModelState(card,state,a,options),{code:'CHARACTER_AFFINITY_MISSING'});
  const b=valid();delete b.characters[0].spiritThought;assert.throws(()=>normalizeModelState(card,state,b,options),{code:'CHARACTER_SPIRIT_THOUGHT_MISSING'});
  for(const key of ['forum','theaters']){const c=valid();delete c[key];assert.throws(()=>normalizeModelState(card,state,c,options),{code:'MODEL_THEATERS_MISSING'});}
  const empty=valid();empty.theaters[1].content=' ';assert.throws(()=>normalizeModelState(card,state,empty,options),{code:'MODEL_FANFIC_TOO_SHORT'});
});
test('missing dynamic fields trigger state-only repair, preserve prose and commit all four windows once',async()=>{
  const json=text=>new Response(JSON.stringify({choices:[{message:{content:text}}]}),{headers:{'Content-Type':'application/json'}});
  const first=valid();delete first.theaters;let calls=0;const events=[];
  for await(const event of streamStory({card,state,options,messages:[],connection:{url:'https://synthetic.example/v1/chat/completions'},profile:{model:'test',temperature:0.7,maxTokens:2000},key:'synthetic-key',firstResponse:json('固定正文<SR_STATE>'+JSON.stringify(first)+'</SR_STATE>'+RESPONSE_END),signal:new AbortController().signal,fetchImpl:async()=>{calls++;return json('<SR_STATE>'+JSON.stringify(valid())+'</SR_STATE>'+RESPONSE_END);}}))events.push(event);
  assert.equal(calls,1);assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'固定正文');assert.equal(events.filter(e=>e.type==='done').length,1);assert.equal(events.at(-1).outcome.theaters.length,3);
});

test('one successful completion contains story, actor updates, four theaters and next actions together',async()=>{
 const outcome={...valid(),suggestions:['向甲询问报到流程','查看门口的告示']},events=[];let extraCalls=0;
 const firstResponse=new Response(JSON.stringify({choices:[{message:{content:'你在门口遇见甲。<SR_STATE>'+JSON.stringify(outcome)+'</SR_STATE>'+RESPONSE_END}}]}),{headers:{'Content-Type':'application/json'}});
 for await(const e of streamStory({card,state,options,messages:[],connection:{url:'https://synthetic.example/v1/chat/completions'},profile:{model:'test',temperature:0.7,maxTokens:4000},key:'synthetic-key',firstResponse,signal:new AbortController().signal,fetchImpl:async()=>{extraCalls++;throw Error('unexpected extra request');}}))events.push(e);
 assert.equal(extraCalls,0);assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'你在门口遇见甲。');
 const done=events.at(-1);assert.equal(done.type,'done');assert.equal(done.outcome.characters[0].affinity,42);assert.equal(done.outcome.forum.length,1);assert.equal(done.outcome.theaters.length,3);assert.deepEqual(done.outcome.suggestions,outcome.suggestions);
});
