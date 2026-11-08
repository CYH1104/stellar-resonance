import {test} from 'node:test';import assert from 'node:assert/strict';import {completionChunks} from '../server/ai.mjs';
const collect=async response=>{let out='';for await(const part of completionChunks(response))out+=part;return out;};
test('visible text completion fields and final message fallback remain visible without reading tool arguments',async()=>{
 for(const choice of [{text:'兼容正文'},{delta:{},message:{content:'兼容正文'}},{delta:{content:''},message:{content:'兼容正文'}},{message:{content:null},text:'兼容正文'}]){
  assert.equal(await collect(Response.json({choices:[choice]})),'兼容正文');
  assert.equal(await collect(new Response('data: '+JSON.stringify({choices:[choice]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}})),'兼容正文');
 }
});
test('inspect OpenAI bytes when a relay mislabels SSE as JSON or JSON as SSE/plain text',async()=>{
 for(const mime of ['text/event-stream','text/plain','application/octet-stream',''])assert.equal(await collect(new Response(JSON.stringify({choices:[{message:{content:'正文'}}]}),{headers:mime?{'Content-Type':mime}:{}})),'正文');
 for(const mime of ['application/json','text/plain','TEXT/EVENT-STREAM; charset=utf-8'])assert.equal(await collect(new Response(': heartbeat\r\ndata: '+JSON.stringify({choices:[{delta:{content:'正文'}}]})+'\r\n\r\ndata: [DONE]\r\n\r\n',{headers:{'Content-Type':mime}})),'正文');
});
test('tool-only output is classified and never interpreted as a visible reply',async()=>{
 for(const part of [{tool_calls:[{function:{name:'private',arguments:'PRIVATE_ARGUMENTS'}}]},{function_call:{name:'private',arguments:'PRIVATE_ARGUMENTS'}}])await assert.rejects(()=>collect(Response.json({choices:[{message:part,finish_reason:'tool_calls'}]})),e=>e.code==='MODEL_TOOL_CALL_ONLY'&&!JSON.stringify(e).includes('PRIVATE_ARGUMENTS'));
});
test('HTML and unknown JSON are rejected, and hidden reasoning stays hidden under compatibility fallback',async()=>{
 for(const body of ['<html>PRIVATE_LOGIN</html>',JSON.stringify({content:'PRIVATE_NOT_CHOICES'}),JSON.stringify({choices:[]})])await assert.rejects(()=>collect(new Response(body,{headers:{'Content-Type':'text/event-stream'}})),e=>e.code==='INVALID_MODEL_RESPONSE'&&!JSON.stringify(e).includes('PRIVATE'));
 assert.equal(await collect(Response.json({choices:[{text:'<think>PRIVATE_THOUGHT</think>正文'}]})),'正文');
});
test('one-byte SSE boundaries, cancellation, and empty/reasoning-only replies keep their original behavior',async()=>{
 const bytes=new TextEncoder().encode('data: '+JSON.stringify({choices:[{text:'逐字正文',finish_reason:'stop'}]})+'\r\n\r\n');let cancelled=false;
 const response=new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}});
 assert.equal(await collect(response),'逐字正文');assert.equal(cancelled,true);
 for(const beforeRead of [true,false]){
  cancelled=false;const controller=new AbortController(),stalled=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
  if(beforeRead)controller.abort();const pending=(async()=>{for await(const part of completionChunks(stalled,{signal:controller.signal}))assert.fail(part);})();if(!beforeRead)controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(cancelled,true);
 }
 for(const [message,code]of [[{content:''},'MODEL_EMPTY_RESPONSE'],[{content:null,reasoning_content:'PRIVATE_THOUGHT'},'MODEL_REASONING_ONLY']])await assert.rejects(()=>collect(Response.json({choices:[{message}]})),e=>e.code===code&&!JSON.stringify(e).includes('PRIVATE'));
});
