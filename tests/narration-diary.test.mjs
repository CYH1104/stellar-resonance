import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMessages,normalizeModelState} from '../server/ai.mjs';
import {continuedMessages,repairedMessages,streamStory} from '../server/story-stream.mjs';
import {defaultTheaters,theaterTemplates} from '../src/domain/theaters.ts';
const card={world:{greeting:[]},places:[],characters:[{id:'char-one',name:'楚昭南',spiritAnimal:'金雕',intro:'精神体：金雕'}]};
const state={player:{id:'player',name:'祁言',present:true,spiritAnimal:'白猫'},characters:[{id:'char-one',name:'楚昭南',present:false,spiritAnimal:'金雕'}]};
const settings=()=>{const t=defaultTheaters();t[3]={slot:4,enabled:true,kind:'custom',title:'精神体日记',instruction:'从已知精神体的视角记录一段轻松日常；没有精神体资料时不要擅自发明种类。'};return t;};
const request=()=>({persona:{name:'祁言',spiritAnimal:'白猫'},state,input:'我去领重力环',history:[{role:'assistant',content:'你看向站在警报中的祁言。'}],presets:[],memories:[],theaterSettings:settings()});
test('generation binds second-person narration to the player and reasserts it near the action without rewriting presets',()=>{
  const result=buildMessages(card,request()),context=JSON.parse(result.messages[2].content.split('：\n')[1]);assert.equal(context.narrativeViewpoint.playerName,'祁言');assert.equal(context.narrativeViewpoint.playerId,'player');const guard=result.messages.at(-2);assert.equal(guard.role,'system');assert.ok(guard.content.includes('你”永远指'));assert.ok(guard.content.includes('祁言'));assert.equal(result.messages.at(-1).content,'我去领重力环');
});
test('spirit diary template requires a first-person entry separate from momentary spirit OS',()=>{
  assert.match(theaterTemplates.find(t=>t.id==='spirit').instruction,/第一人称/);const result=buildMessages(card,request()),context=JSON.parse(result.messages[2].content.split('：\n')[1]),plan=context.theaterPlans.find(t=>t.slot===4);assert.equal(plan.templateId,'spirit');assert.ok(plan.diaryOwners.some(o=>o.ownerId==='player'&&o.spiritAnimal==='白猫'));assert.ok(result.messages[0].content.includes('diary'));
});
test('presets retain their roles/switches and assistant prefill while narrator identity remains the player',()=>{
  const entries=[{id:'p1',name:'角色预填',content:'楚昭南：',enabled:true,role:'assistant',position:'after'},{id:'p2',name:'关闭条目',content:'不要开启这个条目',enabled:false,role:'system'}],before=JSON.stringify(entries);
  const result=buildMessages(card,{...request(),promptEntries:entries,state:{...state,player:{...state.player,name:'楚昭南'}}});assert.equal(JSON.stringify(entries),before);assert.equal(result.state.player.name,'祁言');assert.equal(result.messages.at(-1).role,'assistant');assert.equal(result.messages.at(-1).content,'楚昭南：');assert.ok(!result.messages.some(m=>m.content==='不要开启这个条目'));assert.ok(result.messages.find(m=>m.content.startsWith('[固定玩家视角]')).content.includes('祁言'));
});
test('manual/automatic continuation and state-only repair reaffirm player identity and diary format',()=>{
  const messages=buildMessages(card,request()).messages;assert.ok(continuedMessages(messages,'你上前看向祁言。','祁言').at(-1).content.includes('你”永远指'));assert.ok(continuedMessages(messages,'截断','祁言').at(-1).content.includes('祁言'));
  const control=repairedMessages(messages,'固定正文',card,state,{theaterSettings:settings()}).at(-1).content;assert.ok(control.includes('第一人称完整日记'));assert.ok(control.includes('祁言'));
});
const raw=()=>({presentCharacterIds:[],player:{spiritThought:'耳朵竖起来听消息。'},characters:[],event:'正常推进',forum:[{id:'p',authorName:'路人',content:'公开日常'}],theaters:[{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'同学',content:'今天食堂上新'}]},{slot:4,kind:'custom',title:'精神体日记',content:'',diary:{ownerId:'player',title:'偷偷留给我的鱼干',date:'0578.09.01',mood:'满足',content:'今天我在窗台发现了一块鱼干，闻起来很香。\n\n我决定先留半块给主人，也许明天还能一起晒太阳。'}}]});
const options={theaterSettings:settings(),persona:{name:'祁言'},requireDynamicState:true};
test('live diary returns canonical spirit author and structured entry, preserving the separate momentary OS',()=>{
  const value=raw();value.theaters[1].diary.ownerName='不采用的名字';value.theaters[1].diary.spiritAnimal='不采用的种类';const result=normalizeModelState(card,state,value,options),diary=result.theaters.find(t=>t.slot===4).diary;assert.equal(diary.ownerName,'祁言');assert.equal(diary.spiritAnimal,'白猫');assert.equal(diary.date,'0578.09.01');assert.equal(result.player.spiritThought,'耳朵竖起来听消息。');assert.notEqual(diary.content,result.player.spiritThought);
  for(const mutate of [v=>delete v.theaters[1].diary,v=>v.theaters[1].diary.ownerId='invented',v=>v.theaters[1].diary.content='白猫在窗边甩动尾巴，趴下睡着了。']){const bad=raw();mutate(bad);assert.throws(()=>normalizeModelState(card,state,bad,options),{code:'MODEL_STATE_DIARY_INVALID'});}
});
test('missing diary receives bounded state-only repair without rewriting the fixed main story',async()=>{
  const first=raw();delete first.theaters[1].diary;first.theaters[1].content='白猫甩了甩尾巴。';const response=v=>new Response(JSON.stringify({choices:[{message:{content:v}}]}),{headers:{'Content-Type':'application/json'}});let calls=0;const events=[];
  for await(const e of streamStory({card,state,options,messages:buildMessages(card,request()).messages,connection:{url:'https://synthetic.example/v1/chat/completions'},profile:{model:'synthetic-model',temperature:.7,maxTokens:2000},key:'synthetic-key',firstResponse:response('你站在安全线外。<SR_STATE>'+JSON.stringify(first)+'</SR_STATE><SR_DONE>'),signal:new AbortController().signal,fetchImpl:async()=>{calls++;return response('<SR_STATE>'+JSON.stringify(raw())+'</SR_STATE><SR_DONE>');}}))events.push(e);
  assert.equal(calls,1);assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'你站在安全线外。');assert.equal(events.filter(e=>e.type==='done').length,1);assert.equal(events.at(-1).outcome.theaters[1].diary.ownerName,'祁言');
});
test('no known spirit allows an explicit missing-information note instead of inventing a diary author',()=>{
  const unknown={player:{id:'player',name:'祁言',present:true},characters:[{id:'char-one',name:'楚昭南',present:false}]},value=raw(),noSpiritCard={...card,characters:[{id:'char-one',name:'楚昭南'}]};delete value.theaters[1].diary;value.theaters[1].content='尚未设定精神体，无法写日记。';delete value.player;assert.equal(normalizeModelState(noSpiritCard,unknown,value,options).theaters[1].content,'尚未设定精神体，无法写日记。');
});
