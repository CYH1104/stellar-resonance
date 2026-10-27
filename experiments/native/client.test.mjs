import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loopbackOrigin,createNativeClient,createNativeFetch} from './native-client.mjs';
test('spike refuses external runtime and fixture origins',()=>{
 for(const url of ['https://127.0.0.1:8830','http://localhost:8830','http://user@127.0.0.1:8830','http://127.0.0.1:8830/anything'])assert.throws(()=>loopbackOrigin(url));
 assert.throws(()=>createNativeClient({origin:'http://127.0.0.1:8830',upstream:'https://example.com/v1'}));
});
test('native request preserves CSRF/session, abort, sampling and locks reasoning off',async()=>{
 const calls=[];const controller=new AbortController();
 const client=createNativeClient({origin:'http://127.0.0.1:8830',upstream:'http://127.0.0.1:8832/v1',fetchImpl:async(url,options)=>{
  calls.push({url,options});if(url.endsWith('/csrf-token'))return new Response('{"token":"test-token"}',{headers:{'Set-Cookie':'session=test; HttpOnly'}});
  return new Response('data: [DONE]\n\n');
 }});
 await client.complete({model:'test',messages:[{role:'user',content:'hello'}],temperature:0.7,max_tokens:512,include_reasoning:true,custom_url:'https://evil.invalid'},controller.signal);
 assert.equal(calls[1].options.signal,controller.signal);assert.equal(calls[1].options.headers.Cookie,'session=test');assert.equal(calls[1].options.headers['X-CSRF-Token'],'test-token');
 const payload=JSON.parse(calls[1].options.body);assert.equal(payload.include_reasoning,false);assert.equal(payload.custom_url,'http://127.0.0.1:8832/v1');assert.equal(payload.temperature,0.7);
});
test('unexpected URLs never escape the isolated native transport',async()=>{
 let called=false;const transport=createNativeFetch({complete:()=>{called=true;}});
 await assert.rejects(()=>transport('https://example.com',{method:'POST'}),/BLOCKED/);assert.equal(called,false);
});
test('already aborted request does not initialize a native session',async()=>{
 const controller=new AbortController();controller.abort();let called=false;
 const client=createNativeClient({origin:'http://127.0.0.1:8830',upstream:'http://127.0.0.1:8832/v1',fetchImpl:()=>{called=true;}});
 await assert.rejects(()=>client.complete({},controller.signal));assert.equal(called,false);
});
test('native SSE without Content-Type is validated and preserved byte for byte',async()=>{
 const data='data: {"choices":[{"delta":{"content":"正文"}}]}\n\ndata: [DONE]\n\n';
 const client=createNativeClient({origin:'http://127.0.0.1:8830',upstream:'http://127.0.0.1:8832/v1',fetchImpl:async url=>url.endsWith('/csrf-token')?new Response('{"token":"test"}',{headers:{'Set-Cookie':'session=test'}}):new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('da'));c.enqueue(new TextEncoder().encode(data.slice(2)));c.close();}}))});
 const response=await client.complete({messages:[]});assert.match(response.headers.get('content-type'),/text\/event-stream/);assert.equal(await response.text(),data);
});
test('native HTML or JSON error content is not disguised as SSE',async()=>{
 for(const content of ['<html>failure</html>','{"error":"failure"}']){
  const client=createNativeClient({origin:'http://127.0.0.1:8830',upstream:'http://127.0.0.1:8832/v1',fetchImpl:async url=>url.endsWith('/csrf-token')?new Response('{"token":"test"}',{headers:{'Set-Cookie':'session=test'}}):new Response(content)});
  await assert.rejects(()=>client.complete({messages:[]}),/NOT_SSE/);
 }
});
