import {test} from 'node:test';
import assert from 'node:assert/strict';
import {streamStory} from '../server/story-stream.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
const card={characters:[],world:{greeting:[]},places:[]},state={player:{id:'player',name:'玩家',present:true},characters:[]};
const json=(text,finish_reason)=>new Response(JSON.stringify({choices:[{message:{content:text},finish_reason}]}),{headers:{'Content-Type':'application/json'}});
async function run(firstResponse){
 const events=[];let error,calls=0;
 try{for await(const event of streamStory({card,state,options:{singleStateCall:true,captureFormatErrors:true,requireDynamicState:true,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))},messages:[],firstResponse,signal:new AbortController().signal,fetchImpl:async()=>{calls++;throw Error('No automatic retry allowed');}}))events.push(event);}catch(e){error=e;}
 return {events,error,calls,text:events.filter(e=>e.type==='delta').map(e=>e.text).join('')};
}
test('single-call token cutoff preserves the exact prefix without committing a recovered state',async()=>{
 const text='<Interleaving>普通正文尚未说完，隔着一层';
 const result=await run(json(text,'length'));
 assert.equal(result.text,text);assert.equal(result.error?.code,'MODEL_OUTPUT_LIMIT');assert.equal(result.calls,0);
 assert.ok(!result.events.some(e=>e.type==='done'));
 assert.ok(result.events.some(e=>e.type==='diagnostic'&&e.diagnostic.finishReason==='length'&&e.diagnostic.stage==='rejected'));
 assert.equal(result.events.find(e=>e.type==='format-error')?.raw,text);
});
test('a reset after visible text cannot be swallowed by state compatibility',async()=>{
 const text='连接中断之前的正文。';let reads=0;
 const response=new Response(new ReadableStream({pull(c){if(reads++===0)c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n'));else c.error(Error('synthetic connection reset'));}}),{headers:{'Content-Type':'text/event-stream'}});
 const result=await run(response);assert.equal(result.text,text);assert.equal(result.error?.code,'MODEL_STREAM_INTERRUPTED');assert.equal(result.calls,0);assert.ok(!result.events.some(e=>e.type==='done'));
});
test('filtered partial prose remains available without claiming a completed turn',async()=>{
 const result=await run(json('已收到的一段正文。','content_filter'));
 assert.equal(result.error?.code,'MODEL_REFUSAL');assert.equal(result.text,'已收到的一段正文。');assert.equal(result.calls,0);assert.ok(!result.events.some(e=>e.type==='done'));
});
test('a normal legacy stop still preserves compatibility and records the real stop reason',async()=>{
 const result=await run(json('正常结束的旧格式正文。','stop'));
 assert.equal(result.error,undefined);assert.equal(result.events.at(-1).type,'done');assert.equal(result.calls,0);
 assert.ok(result.events.some(e=>e.type==='diagnostic'&&e.diagnostic.finishReason==='stop'));
 assert.equal(result.events.at(-1).outcome.stateUpdate.storyComplete,false);
});
test('an explicitly completed payload is preserved even if a provider clips extra trailing output',async()=>{
 const result=await run(json('完整正文。<status>{"event":"结束","presentCharacterIds":[]}</status><done>','length'));
 assert.equal(result.error,undefined);assert.equal(result.events.at(-1).type,'done');assert.equal(result.events.at(-1).outcome.stateUpdate.storyComplete,true);
});
