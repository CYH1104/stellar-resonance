import {test} from 'node:test';import assert from 'node:assert/strict';
import {streamStory} from '../server/story-stream.mjs';import {buildMessages} from '../server/ai.mjs';
import {createLocalServer} from '../server/app.mjs';
import {readFile} from 'node:fs/promises';
import {defaultTheaters} from '../src/domain/theaters.ts';
const theaters=defaultTheaters().map(t=>({...t,enabled:false}));
const card={world:{greeting:[]},places:[],characters:[{id:'guide',name:'引导员'}]};
const state={player:{id:'player',name:'访客',present:true},characters:[]};
const outputParsing={version:1,enabled:true,tags:['foundation','ecot','辅助:草稿']};
const options={outputParsing,singleStateCall:true,stateEnabled:false,suggestionsEnabled:false,theaterSettings:theaters,captureFormatErrors:true};
const text='<foundation><status>{"event":"FAKE_STATE_CANARY"}</status>HIDDEN_CANARY<ecot>nested</ecot></foundation>保留正文。<辅助:草稿>OTHER_CANARY</辅助:草稿><SR_STATE>{"event":"真正事件"}</SR_STATE><SR_DONE>';
const json=()=>Response.json({choices:[{message:{content:text},finish_reason:'stop'}]});
const sse=()=>new Response(new ReadableStream({start(c){for(const part of text)c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:part}}]})+'\n\n'));c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));c.close();}}));
for(const [name,response] of [['json',json],['one-character SSE',sse]])test(name+' auxiliary examples never reach story/state parser, logs or raw records',async()=>{
 const events=[];for await(const event of streamStory({card,state,options,messages:[],firstResponse:response(),signal:new AbortController().signal,fetchImpl:async()=>{throw Error('No paid retry');}}))events.push(event);
 assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'保留正文。');assert.equal(events.at(-1).type,'done');assert.equal(events.at(-1).outcome.event,'真正事件');assert.ok(!JSON.stringify(events).includes('CANARY'));
});
test('assistant history and recall strip custom blocks; user inputs and preset source remain untouched',()=>{
 const result=buildMessages(card,{outputParsing,persona:{name:'访客'},state,input:'当前<ecot>用户输入</ecot>',history:[{role:'assistant',content:'<foundation>HIDDEN_CANARY</foundation>旧正文'},{role:'user',content:'<foundation>玩家文字</foundation>'}],memories:['<ecot>RECALL_CANARY</ecot>记忆'],presets:['<foundation>预设格式说明</foundation>'],opening:'',theaterSettings:theaters});
 const all=JSON.stringify(result);assert.ok(!all.includes('HIDDEN_CANARY'));assert.ok(!all.includes('RECALL_CANARY'));assert.ok(all.includes('旧正文'));assert.ok(all.includes('玩家文字'));assert.ok(all.includes('预设格式说明'));assert.ok(all.includes('当前<ecot>用户输入</ecot>'));
 assert.throws(()=>buildMessages(card,{outputParsing:{...outputParsing,version:2}}),e=>e.code==='INVALID_OUTPUT_PARSING');
});
test('route validates parsing settings before touching model services',async()=>{
 let calls=0;const app=await createLocalServer({projectRoot:process.cwd(),port:0,card:JSON.parse(await readFile('server/example/feature-demo.json','utf8')),fetchImpl:async()=>{calls++;return json();}});try{await app.start();const base='http://127.0.0.1:'+app.server.address().port;const auth=await fetch(base+'/api/bootstrap');const cookie=auth.headers.get('set-cookie')?.split(';')[0];const r=await fetch(base+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({outputParsing:{...outputParsing,version:2}})});assert.equal(r.status,400);assert.equal((await r.json()).code,'INVALID_OUTPUT_PARSING');assert.equal(calls,0);}finally{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));}
});
test('cancel and timeout while inside an auxiliary block release the response and never emit its late text',async()=>{
 for(const timeout of [false,true]){const controller=new AbortController();let cancelled=false;const response=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'<foundation>HIDDEN_CANARY'}}]})+'\n\n'));},cancel(){cancelled=true;}}));const events=[];
 const promise=(async()=>{for await(const e of streamStory({card,state,options,messages:[],firstResponse:response,signal:controller.signal,attemptTimeoutMs:20,fetchImpl:async()=>{throw Error('No retry');}}))events.push(e);})();if(!timeout)setTimeout(()=>controller.abort(),5);
 await assert.rejects(promise);assert.equal(cancelled,true);assert.ok(!JSON.stringify(events).includes('HIDDEN_CANARY'));assert.ok(!events.some(e=>e.type==='done'));
 }
});
