import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder,buildMessages,completionChunks} from '../server/ai.mjs';
import {parseStateJson} from '../server/state-json.mjs';
import {streamStory} from '../server/story-stream.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';

const card={world:{greeting:[]},places:[],characters:[{id:'guide',name:'引导员'}]};
const state={player:{id:'player',name:'访客',present:true},characters:[{id:'guide',name:'引导员',present:true,affinity:12}]};
const settings=defaultTheaters().map(t=>({...t,enabled:t.slot===1||t.slot===2}));
const content='保留正文。<status>{"event":"办理登记","presentCharacterIds":["guide"],"characters":[]}</status>'+
 '<choices><选项>1. 查看公告</选项><选项>2. 询问引导员</选项></choices>'+
 '<forum>[{"id":"f1","authorName":"校园墙","content":"今天图书馆开放延长啦","comments":[]}</forum>'+
 '<theater slot="2">{"slot":2,"kind":"group","messages":[{"speaker":"引导员","content":"值班交接完成"}]}</theater>'+
 '<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable><done>';

test('recover only a missing outer container around a complete child, never guess partial values or MVU',()=>{
 assert.deepEqual(parseStateJson('[{"content":"完整"}',{closeOuterContainer:true}).value,[{content:'完整'}]);
 for(const raw of ['[{"content":"未结束','[{"content":','[{"content":"完整"},','[{"nested":[{"x":1}','[{"x":1}]junk','[{"x":1}}'])assert.throws(()=>parseStateJson(raw,{closeOuterContainer:true}));
 assert.throws(()=>parseStateJson('[{"op":"delta","path":"/x","value":2}'));
});

test('live failure shape retains prose, restores forum, unwraps buttons and keeps group scene without a retry',async()=>{
 let calls=0;const events=[];
 for await(const event of streamStory({card,state,options:{singleStateCall:true,requireDynamicState:true,theaterSettings:settings},messages:[],firstResponse:new Response(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}}),signal:new AbortController().signal,fetchImpl:async()=>{calls++;throw Error('Unexpected paid retry');}}))events.push(event);
 assert.equal(calls,0);assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'保留正文。');
 const result=events.at(-1).outcome;assert.equal(events.at(-1).type,'done');
 assert.deepEqual(result.suggestions,['查看公告','询问引导员']);assert.equal(result.forum.length,1);assert.equal(result.theaters[0].messages[0].content,'值班交接完成');
 assert.ok(!result.stateUpdate.codes.includes('STATE_AFFINITY_RETAINED'));assert.equal(result.stateUpdate.storyComplete,true);
});

test('JSON choices also unwrap known option tags, ordinary comparison text remains unchanged',()=>{
 const d=new StoryDecoder();d.push('正文<status>{"event":"等待","presentCharacterIds":[]}</status><choices>["<选项>1. 查看公告</选项>","比较 2 < 3"]</choices><done>');
 assert.deepEqual(d.finish(card,state,{singleStateCall:true,theaterSettings:settings.map(t=>({...t,enabled:false}))}).suggestions,['查看公告','比较 2 < 3']);
});

test('player accidentally included in NPC patches is routed to player fields without inventing an NPC or overriding identity',()=>{
 const d=new StoryDecoder();d.push('正文<status>'+JSON.stringify({event:'等待',presentCharacterIds:[],characters:[{id:'player',name:'错误姓名',spiritThought:'数组里的精神体想法',affinity:100,innerThought:'不应展示'}],player:{spiritThought:'专用字段优先'}})+'</status><done>');
 const result=d.finish(card,{...state,player:{...state.player,spiritAnimal:'白猫'}},{singleStateCall:true,theaterSettings:settings.map(t=>({...t,enabled:false}))});
 assert.equal(result.player.spiritThought,'专用字段优先');assert.equal(result.player.affinity,undefined);assert.equal(result.player.name,undefined);assert.ok(!result.characters.some(c=>c.id==='player'));assert.ok(!result.stateUpdate.codes.includes('STATE_UNKNOWN_CHARACTER_SKIPPED'));
});

test('enabled companion examples use closed protocol blocks; model reasoning cutoffs stay hidden without a new call',async()=>{
 const built=buildMessages(card,{persona:{name:'访客'},state,input:'询问登记',history:[],memories:[],presets:[],opening:'',theaterSettings:settings});
 const prompt=built.messages.map(m=>m.content).join('\n');
 assert.ok(prompt.includes('<forum>[{'));assert.ok(prompt.includes('<choices>['));assert.ok(prompt.includes('Do not emit reasoning tags'));
 const disabled=buildMessages(card,{persona:{name:'访客'},state,input:'等待',history:[],memories:[],presets:[],opening:'',suggestionsEnabled:false,theaterSettings:settings.map(t=>({...t,enabled:false}))});
 assert.ok(!disabled.messages.some(m=>m.content.includes('Companion format example')));
 let visible='';await assert.rejects(async()=>{for await(const part of completionChunks(new Response(JSON.stringify({choices:[{message:{content:'<think>private-cutoff'},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}})))visible+=part;},e=>e.code==='MODEL_REASONING_UNCLOSED');assert.equal(visible,'');
});
