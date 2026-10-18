import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder} from '../server/ai.mjs';
import {streamStory} from '../server/story-stream.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
const card={world:{greeting:[]},characters:[],places:[]},state={player:{id:'player',name:'玩家',present:true},characters:[]};
const settings=defaultTheaters().map(t=>({...t,enabled:t.slot===2||t.slot===4}));
const group={slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'校园墙',content:'图书馆今晚延时开放'}]};
const custom={slot:4,kind:'custom',title:'片段',content:'一段独立日常。'};
const status='<status>'+JSON.stringify({presentCharacterIds:[],characters:[],event:'办理登记',theaters:[group]})+'</status>';
test('mixed state and independent theater envelopes merge by slot, without dropping complete content',()=>{
 const d=new StoryDecoder();d.push('正文。'+status+'<theater slot="4">'+JSON.stringify(custom)+'</theater><theater slot="2">'+JSON.stringify({...group,messages:[]})+'</theater><done>');
 const out=d.finish(card,state,{singleStateCall:true,theaterSettings:settings,requireDynamicState:true});
 assert.deepEqual(out.theaters.map(s=>s.slot),[2,4]);assert.equal(out.theaters[0].messages[0].content,group.messages[0].content);
 assert.ok(!out.stateUpdate.codes.includes('STATE_SIDE_SCENE_RETAINED'));
});
test('premature application done does not cancel later SSE companion blocks or trigger another model request',async()=>{
 let calls=0;const encode=new TextEncoder(),events=[];
 const parts=['正文。'+status+'<done>','<theater slot="4">'+JSON.stringify(custom)+'</theater>'];
 const body=parts.map(content=>'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n').join('')+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\n';
 const firstResponse=new Response(new ReadableStream({start(c){c.enqueue(encode.encode(body));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
 for await(const e of streamStory({card,state,messages:[],options:{singleStateCall:true,theaterSettings:settings,requireDynamicState:true},firstResponse,signal:new AbortController().signal,fetchImpl:async()=>{calls++;throw Error('Unexpected retry');}}))events.push(e);
 assert.equal(calls,0);assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'正文。');assert.deepEqual(events.at(-1).outcome.theaters.map(s=>s.slot),[2,4]);assert.equal(events.at(-1).outcome.stateUpdate.storyComplete,true);
});
test('provider finish_reason still ends a stream whose socket stays open',async()=>{
 let cancelled=false;const data='data: '+JSON.stringify({choices:[{delta:{content:'正文。'+status+'<done>'},finish_reason:'stop'}]})+'\n\n';
 const firstResponse=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(data));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
 const events=[];for await(const e of streamStory({card,state,messages:[],options:{singleStateCall:true,theaterSettings:settings.map(t=>({...t,enabled:false}))},firstResponse,signal:new AbortController().signal,attemptTimeoutMs:1000}))events.push(e);
 assert.equal(events.at(-1).type,'done');assert.equal(cancelled,true);
});
