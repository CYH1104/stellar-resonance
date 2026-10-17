import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildMessages,StoryDecoder} from '../server/ai.mjs';
import {repairedMessages,streamStory} from '../server/story-stream.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
const card={world:{entries:[]},characters:[{id:'pro-00',name:'甲'}],places:[]};
const request={persona:{name:'玩家',appearance:'',personality:'',background:''},state:{player:{id:'player',name:'玩家',present:true},characters:[{id:'pro-00',name:'甲',present:false}]},input:'行动',opening:'',history:[{role:'assistant',content:'历史保留哨兵'}],memories:['记忆保留哨兵'],presets:[],theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),suggestionsEnabled:false};
test('disabled features remove instructions and dedicated context without removing history or memories',()=>{
 const built=buildMessages(card,{...request,previousTheaters:[{slot:2,kind:'group',title:'旧群聊',content:'群聊历史哨兵'}],forumContext:[{authorName:'甲',content:'论坛历史哨兵',replies:[]}]});const text=JSON.stringify(built.messages);
 for(const token of ['群聊历史哨兵','论坛历史哨兵','本轮关闭','diceEvent','theaterPlans','同人文','精神体日记','suggestions'])assert.ok(!text.includes(token),token);
 for(const token of ['历史保留哨兵','记忆保留哨兵'])assert.ok(text.includes(token));
 const repaired=JSON.stringify(repairedMessages(built.messages,'正文',card,built.state,{theaterSettings:request.theaterSettings,suggestionsEnabled:false}));assert.ok(!repaired.includes('diceEvent'));assert.ok(!repaired.includes('群聊历史哨兵'));
});
test('only enabled side-scene schema is sent',()=>{const built=buildMessages(card,{...request,theaterSettings:request.theaterSettings.map(t=>({...t,enabled:t.slot===2}))});const text=JSON.stringify(built.messages);assert.ok(text.includes('messages'));assert.ok(!text.includes('同人文'));assert.ok(!text.includes('diaryOwners'));});
test('final transport contract enumerates every enabled side scene and suggestions after preset injection',()=>{
 const built=buildMessages(card,{...request,suggestionsEnabled:true,theaterSettings:defaultTheaters(),promptEntries:[{id:'p',name:'格式预设',enabled:true,content:'STYLE_SENTINEL',position:'before'}]});
 const protocol=built.messages.find(m=>m.content.includes('[Output contract'));
 assert.ok(protocol.content.includes('Enabled output fields'));for(const token of ['"forum"','"theaters"','"messages"','"suggestions"'])assert.ok(protocol.content.includes(token));
 assert.ok(built.messages.indexOf(protocol)>built.messages.findIndex(m=>m.content==='STYLE_SENTINEL'));
});
test('disabling state generation omits state instructions and retains existing state on return',()=>{const built=buildMessages(card,{...request,stateEnabled:false});const text=JSON.stringify(built.messages);assert.ok(!text.includes('affinity'));const decoder=new StoryDecoder();decoder.push('正文<SR_STATE>{"event":"行动","presentCharacterIds":["pro-00"],"characters":[{"id":"pro-00","affinity":80}]}</SR_STATE><SR_DONE>');const out=decoder.finish(card,built.state,{singleStateCall:true,stateEnabled:false,theaterSettings:request.theaterSettings});assert.equal(out.characters[0].present,false);assert.equal(out.characters[0].affinity,undefined);});
test('complete state without a marker or prose preserves valid side data with no automatic call',async()=>{
 const built=buildMessages(card,request),raw='<SR_STATE>'+JSON.stringify({presentCharacterIds:[],player:{spiritThought:''},characters:[],event:'校园通讯中断',suggestions:[],forum:[{id:'one',authorName:'匿名',content:'通讯故障'}]})+'</SR_STATE>';
 const events=[];let calls=0;for await(const event of streamStory({card,state:built.state,options:{singleStateCall:true,theaterSettings:defaultTheaters().map(t=>({...t,enabled:t.slot===1})),captureFormatErrors:true},messages:built.messages,firstResponse:new Response(JSON.stringify({choices:[{message:{content:raw}}]}),{headers:{'Content-Type':'application/json'}}),signal:new AbortController().signal,fetchImpl:async()=>{calls++;throw Error('unexpected extra call');}}))events.push(event);
 assert.equal(calls,0);assert.equal(events.at(-1).type,'done');assert.equal(events.at(-1).outcome.forum[0].content,'通讯故障');assert.ok(events.some(e=>e.type==='diagnostic'&&e.diagnostic.code==='STATE_STORY_MISSING'));
});
