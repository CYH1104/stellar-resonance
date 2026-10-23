import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyMvu} from '../src/domain/mvu.ts';
import {StoryDecoder} from '../server/ai.mjs';import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';import {defaultTheaters} from '../src/domain/theaters.ts';
const card={world:{name:'学院'},characters:[{id:'a',name:'甲'},{id:'b',name:'乙'}],places:[]};const state={player:{id:'player',name:'玩家',present:true},characters:[],variables:{}};
test('opening scene stays separate from ending MVU and invalid scene does not discard prose',()=>{
 const snapshot={日期:'2042-03-05',星期:'星期三',时间:'08:30',地点:'教室'};const raw={event:'离开教室',openingScene:snapshot,mvu:[{op:'replace',path:'/custom/时间地点/时间',value:'19:00'}]};
 const decode=value=>{const d=new StoryDecoder();d.push('正文。<SR_STATE>'+JSON.stringify(value)+'</SR_STATE><SR_DONE>');return d.finish(card,state,{singleStateCall:true,stateEnabled:true,suggestionsEnabled:false,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))});};
 assert.deepEqual(decode(raw).openingScene,snapshot);assert.equal(applyMvu(state,decode(raw).mvu).variables.时间地点.时间,'19:00');assert.equal(decode({...raw,openingScene:{...snapshot,时间:'99:99'}}).openingScene,undefined);
});
test('game interaction parses multiple paragraphs intact and only lets present NPCs speak',()=>{
 const plan=terminalPlan(card,{task:'game-interact',actorIds:['a','b'],input:'我做完了，你觉得呢？',persona:{name:'玩家'},context:{command:'分享一件趣事',betrayal:false}});const text='他放下杯子。\n\n“我听着。”\n\n窗边的风吹动衣角。';
 const raw=JSON.stringify({replies:[{id:'b',text,refused:false,penalty:''}]});assert.equal(parseTerminalResult(raw,plan).replies[0].text,text);assert.match(plan.messages[0].content,/按语义自然分段/);
 assert.throws(()=>parseTerminalResult(JSON.stringify({replies:[{id:'player',text,refused:false,penalty:''}]}),plan));const betrayal={...plan,betrayal:true};assert.throws(()=>parseTerminalResult(raw,betrayal));
});

import {openCompletion,completionChunks} from '../server/ai.mjs';
test('upstream refusal retains HTTP status without exposing provider secrets',async()=>{
 await assert.rejects(openCompletion({connection:{url:'https://example.invalid'},key:'private',profile:{model:'model',temperature:1,maxTokens:100},messages:[],signal:new AbortController().signal,fetchImpl:async()=>new Response('provider secret',{status:400})}),e=>e.code==='UPSTREAM_REJECTED'&&e.upstreamStatus===400&&!JSON.stringify(e).includes('provider secret'));
});
test('empty output distinguishes exhausted output budget and refusal',async()=>{
 for(const [message,finish_reason,code] of [[{content:null},'length','MODEL_OUTPUT_LIMIT'],[{content:null,refusal:'no'},'stop','MODEL_REFUSAL'],[{content:null},'stop','MODEL_EMPTY_RESPONSE']]){
 const response=new Response(JSON.stringify({choices:[{message,finish_reason}]}),{headers:{'content-type':'application/json'}});
 await assert.rejects(async()=>{for await(const chunk of completionChunks(response)){}},e=>e.code===code);
 }
});
