import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {featureContract} from '../server/feature-prompts.mjs';
import {buildMessages} from '../server/ai.mjs';
import {streamStory} from '../server/story-stream.mjs';
const card={world:{name:'学院',entries:[],greeting:[]},characters:[],places:[]};
const state={player:{id:'player',name:'玩家',present:true},characters:[]};
const settings=[...defaultTheaters(),{slot:8,kind:'custom',title:'新增八',instruction:''},{slot:9,kind:'custom',title:'新增九',instruction:''}].map(t=>({...t,enabled:t.slot>1,kind:t.slot>2?'custom':t.kind,instruction:'SLOT_'+t.slot}));
test('player-added companion slots finish in one upstream response with no follow-up call',async()=>{
 const contract=featureContract(settings.filter(s=>s.enabled));for(let n=2;n<=9;n++)assert.ok(contract.includes('<theater slot="'+n+'">'));
 const scenes=settings.filter(s=>s.enabled).map(s=>({slot:s.slot,kind:s.kind,title:s.title,content:s.kind==='group'?'':'内容'+s.slot,...(s.kind==='group'?{messages:[{speaker:'同学',content:'你好'}]}:{})}));
 const content='正文<status>'+JSON.stringify({presentCharacterIds:[],characters:[],event:'主线',theaters:scenes})+'</status><done>';
 let calls=0;const events=[];const firstResponse=new Response('data: '+JSON.stringify({choices:[{delta:{content},finish_reason:'stop'}]})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 for await(const e of streamStory({card,state,messages:[],options:{singleStateCall:true,theaterSettings:settings,requireDynamicState:true},firstResponse,signal:new AbortController().signal,fetchImpl:async()=>{calls++;throw Error('Unexpected extra request');}}))events.push(e);
 assert.equal(calls,0);assert.deepEqual(events.at(-1).outcome.theaters.map(s=>s.slot),[2,3,4,5,6,7,8,9]);assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'正文');
});
test('disabled extra slots never send their instruction or dedicated scene history',()=>{
 const theaterSettings=settings.map(t=>({...t,enabled:t.slot===2}));
 const request={persona:{name:'玩家'},state,input:'观察',history:[],memories:[],presets:[],theaterSettings,previousTheaters:[{slot:7,kind:'custom',title:'秘密专栏',content:'HIDDEN_SLOT_HISTORY'}]};
 const result=buildMessages(card,request);const sent=JSON.stringify(result.messages);assert.ok(!sent.includes('SLOT_7'));assert.ok(!sent.includes('HIDDEN_SLOT_HISTORY'));assert.ok(sent.includes('SLOT_2'));
});
