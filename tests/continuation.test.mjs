import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RESPONSE_END,STATE_OPEN,STATE_CLOSE,StoryDecoder} from '../server/ai.mjs';
import {ContinuationJoiner,continuedMessages,streamStory} from '../server/story-stream.mjs';
const card={characters:[],world:{greeting:[]},places:[]},state={player:{id:'player',name:'玩家',present:true},characters:[]};
const profile={id:'story',model:'synthetic-model',temperature:0.7,maxTokens:1600,topP:0.8};
const metadata=STATE_OPEN+JSON.stringify({presentCharacterIds:[],event:'收到回复'})+STATE_CLOSE;
const json=text=>new Response(JSON.stringify({choices:[{message:{content:text}}]}),{headers:{'Content-Type':'application/json'}});
function sse(text){const bytes=new TextEncoder().encode([...text].map(c=>'data: '+JSON.stringify({choices:[{delta:{content:c}}]})+'\n\n').join('')+'data: [DONE]\n\n');return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});}
async function run(parts,{partial='',stateOnly=false,controller=new AbortController(),firstSignal,onEvent,fetchFailure=false}={}){
  const events=[],calls=[];let error;
  try{for await(const event of streamStory({card,state,options:{},messages:[{role:'system',content:'固定规则'},{role:'system',content:'私有卡片'},{role:'user',content:'原行动'}],partial,stateOnly,connection:{url:'https://synthetic.example/v1/chat/completions'},profile,key:'synthetic-key',firstResponse:parts[0] instanceof Response?parts[0]:sse(parts[0]),firstSignal,signal:controller.signal,fetchImpl:async(url,options)=>{assert.equal(options.signal.aborted,false);calls.push({url,payload:JSON.parse(options.body),authorization:options.headers.Authorization});if(fetchFailure)throw new Error('synthetic-network-down');return sse(parts[calls.length]||'');}})){events.push(event);onEvent?.(event);}}
  catch(e){error=e;}
  return {events,calls,error,text:events.filter(e=>e.type==='delta').map(e=>e.text).join('')};
}
test('first complete response has no continuation and exposes neither marker nor state',async()=>{
  const result=await run(['完整正文。'+metadata+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.text,'完整正文。');assert.equal(result.calls.length,0);assert.equal(result.events.filter(e=>e.type==='done').length,1);
});
test('model reasoning and fake state markers inside it are hidden before protocol decoding',async()=>{
  const result=await run(['<think>synthetic-secret'+metadata+RESPONSE_END+'</think>正文。'+metadata+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.text,'正文。');assert.equal(result.calls.length,0);assert.ok(!JSON.stringify(result.events).includes('synthetic-secret'));
});
test('a reply containing only unclosed reasoning fails explicitly without extra billed continuations',async()=>{
  const result=await run(['<thinking>synthetic-secret']);assert.equal(result.error.code,'MODEL_REASONING_UNCLOSED');assert.equal(result.text,'');assert.equal(result.calls.length,0);assert.ok(!JSON.stringify(result.events).includes('synthetic-secret'));
});
test('a new reasoning block in a fresh continuation cannot trap its body in the prior unclosed block',async()=>{
  const result=await run(['已有正文。<thinking>synthetic-secret','<thinking>new-secret</thinking>续写正文。'+metadata+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.text,'已有正文。续写正文。');assert.equal(result.calls.length,1);assert.ok(!JSON.stringify(result.calls).includes('synthetic-secret'));assert.ok(!JSON.stringify(result.events).includes('new-secret'));
});
test('an actual continuation of a cut reasoning block stays hidden until its closing tag',async()=>{
  const result=await run(['已有正文。<thinking>synthetic-secret','still-secret</thinking>续写正文。'+metadata+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.text,'已有正文。续写正文。');assert.ok(!JSON.stringify(result.events).includes('still-secret'));
});
test('malformed hidden JSON is repaired without appending or repeating any visible prose',async()=>{
  const result=await run(['原正文已结束。'+STATE_OPEN+'{bad json}'+STATE_CLOSE+RESPONSE_END,'不要显示这句重写正文。'+metadata+RESPONSE_END]);
  assert.equal(result.error,undefined);assert.equal(result.text,'原正文已结束。');assert.equal(result.calls.length,1);assert.equal(result.events.filter(e=>e.type==='done').length,1);assert.equal(result.events.find(e=>e.type==='repair').code,'MODEL_STATE_JSON_INVALID');assert.ok(result.calls[0].payload.messages.at(-1).content.includes('不重新掷骰'));
});
test('body cutoff appends exactly once, retains original card/model/key and completes state only at end',async()=>{
  const result=await run(['你在报到处等待。','老师拿来了登记表。'+metadata+RESPONSE_END]);
  assert.equal(result.error,undefined);assert.equal(result.text,'你在报到处等待。老师拿来了登记表。');assert.deepEqual(result.events.filter(e=>e.type==='continuation').map(e=>e.attempt),[1]);
  assert.equal(result.calls[0].payload.model,profile.model);assert.equal(result.calls[0].payload.top_p,0.8);assert.equal(result.calls[0].authorization,'Bearer synthetic-key');assert.equal(result.calls[0].payload.messages[1].content,'私有卡片');assert.equal(result.calls[0].payload.messages.at(-2).content,'你在报到处等待。');assert.equal(result.events.at(-1).type,'done');
});
test('cutoffs inside markers and JSON all resume without leaking protocol fragments',async()=>{
  const full='中文正文。'+metadata+RESPONSE_END;
  for(const cut of [1,6,9,full.indexOf('present')+4,full.indexOf(STATE_CLOSE)+4,full.length-4]){const result=await run([full.slice(0,cut),full.slice(cut)]);assert.equal(result.error,undefined,'cut '+cut);assert.equal(result.text,'中文正文。','cut '+cut);assert.equal(result.events.at(-1).type,'done');}
});
test('state closed without final marker requests only completion and commits once',async()=>{
  const result=await run(['正文。'+metadata,RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.calls.length,1);assert.equal(result.text,'正文。');assert.equal(result.events.filter(e=>e.type==='done').length,1);
});
test('non-streaming upstream JSON can also be continued after cutoff',async()=>{
  const result=await run([json('收到半句。'),'补充后文。'+metadata+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.text,'收到半句。补充后文。');assert.equal(result.calls.length,1);
});
test('transport reset after a delivered delta preserves it and continues in the next request',async()=>{
  let pulls=0;const broken=new Response(new ReadableStream({pull(c){if(pulls++===0)c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'断线前正文。'}}]})+'\n\n'));else c.error(new TypeError('synthetic socket reset'));}}),{headers:{'Content-Type':'text/event-stream'}});
  const result=await run([broken,'断线后接上。'+metadata+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.calls.length,1);assert.equal(result.text,'断线前正文。断线后接上。');assert.equal(result.events.at(-1).type,'done');
});
test('an expired first-request timer does not abort the next continuation request',async()=>{
  const timer=new AbortController();const response=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'超时前正文。'}}]})+'\n\n'));timer.signal.addEventListener('abort',()=>c.error(timer.signal.reason),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});
  const result=await run([response,'补完。'+metadata+RESPONSE_END],{firstSignal:timer.signal,onEvent:e=>{if(e.type==='delta'&&!timer.signal.aborted)timer.abort(new DOMException('synthetic timeout','TimeoutError'));}});
  assert.equal(result.error,undefined);assert.equal(result.calls.length,1);assert.equal(result.text,'超时前正文。补完。');assert.equal(result.events.at(-1).type,'done');
});
test('successful third continuation is accepted, with exactly three extra requests',async()=>{
  const result=await run(['第','一','轮','完成。'+metadata+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.calls.length,3);assert.equal(result.text,'第一轮完成。');assert.equal(result.events.at(-1).type,'done');
});
test('three incomplete continuations stop with preserved prose and no state commit',async()=>{
  const result=await run(['初稿。','补一。','补二。','补三。']);assert.equal(result.error?.code,'AUTO_CONTINUE_LIMIT');assert.equal(result.calls.length,3);assert.equal(result.text,'初稿。补一。补二。补三。');assert.ok(!result.events.some(e=>e.type==='done'));assert.deepEqual(result.events.filter(e=>e.type==='continuation').map(e=>e.attempt),[1,2,3]);
});
test('failed continuation requests consume the same budget, never loop indefinitely',async()=>{
  const result=await run(['半句正文。'],{fetchFailure:true});assert.equal(result.error?.code,'AUTO_CONTINUE_LIMIT');assert.equal(result.calls.length,3);assert.equal(result.text,'半句正文。');
});
test('user stop before a continuation request prevents further API calls',async()=>{
  const controller=new AbortController();const result=await run(['半句正文。'],{controller,onEvent:e=>{if(e.type==='continuation')controller.abort();}});assert.equal(result.error?.name,'AbortError');assert.equal(result.calls.length,0);assert.ok(!result.events.some(e=>e.type==='done'));
});
test('manual continuation primes existing prose and removes an exact repeated boundary',async()=>{
  const partial='你站在报到处，等待老师回应。';const result=await run([partial+'老师递来登记表。'+metadata+RESPONSE_END],{partial});assert.equal(result.error,undefined);assert.equal(result.text,'老师递来登记表。');assert.equal(result.events.at(-1).type,'done');assert.equal(result.calls.length,0);
});
test('restarted state and end markers do not leak previously cut marker prefixes',async()=>{
  for(const parts of [['正文。<SR_ST',metadata+RESPONSE_END],['正文。'+metadata+'<SR_D',RESPONSE_END],['正文。'+STATE_OPEN+'{"presentChar',metadata+RESPONSE_END]]){const result=await run(parts);assert.equal(result.error,undefined);assert.equal(result.text,'正文。');}
});
test('invalid hidden state exhausts only three repairs and reports its precise reason without a commit',async()=>{
  const broken=STATE_OPEN+'{"presentCharacterIds":["unknown"],"event":"事件"}'+STATE_CLOSE+RESPONSE_END;
  const result=await run(['正文。'+broken,broken,broken,broken]);assert.equal(result.error?.code,'STATE_REPAIR_LIMIT');assert.equal(result.error?.reasonCode,'MODEL_STATE_ROSTER_INVALID');assert.equal(result.calls.length,3);assert.equal(result.text,'正文。');assert.ok(!result.events.some(e=>e.type==='done'));
});

test('continuation and metadata repair share the same extra-request budget',async()=>{
  const result=await run(['前半句。','后半句。'+STATE_OPEN+'{bad}'+STATE_CLOSE+RESPONSE_END,metadata+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.calls.length,2);assert.equal(result.text,'前半句。后半句。');assert.deepEqual(result.events.filter(e=>['continuation','repair'].includes(e.type)).map(e=>[e.type,e.attempt]),[['continuation',1],['repair',2]]);
});
test('user stopping metadata repair prevents its API call and never commits state',async()=>{
  const controller=new AbortController();const result=await run(['正文。'+STATE_OPEN+'{bad}'+STATE_CLOSE+RESPONSE_END],{controller,onEvent:e=>{if(e.type==='repair')controller.abort();}});assert.equal(result.error?.name,'AbortError');assert.equal(result.calls.length,0);assert.ok(!result.events.some(e=>e.type==='done'));
});
test('manual state-only repair never modifies already saved prose, even if the model repeats it',async()=>{
  const result=await run(['错误重复的正文。'+metadata+RESPONSE_END],{partial:'已存正文。',stateOnly:true});assert.equal(result.error,undefined);assert.equal(result.text,'');assert.equal(result.events.at(-1).type,'done');
});
test('fenced JSON in a hidden block is accepted without an extra model call',async()=>{
  const result=await run(['正文。'+STATE_OPEN+'```json\n{"presentCharacterIds":[],"event":"完成"}\n```'+STATE_CLOSE+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.calls.length,0);assert.equal(result.text,'正文。');
});
test('completion marker alone is hidden and never proves a round is complete',()=>{
  const d=new StoryDecoder();let text='';for(const char of '正文。'+RESPONSE_END)text+=d.push(char);assert.equal(text,'正文。');assert.throws(()=>d.finish(card,state),{code:'MODEL_RESPONSE_INCOMPLETE'});
});
test('overlap joiner preserves new words and only removes exact repeats of at least eight characters',()=>{
  const joiner=new ContinuationJoiner('先前的一句完整正文。');let out='';for(const c of '先前的一句完整正文。然后继续。')out+=joiner.push(c);out+=joiner.finish();assert.equal(out,'然后继续。');
  const short=new ContinuationJoiner('哈哈');assert.equal(short.push('哈哈，继续。')+short.finish(),'哈哈，继续。');assert.ok(continuedMessages([], '原正文').at(-1).content.includes('不重新掷骰'));
});

test('bundled suggestions complete in the initial response, with no extra API for missing or malformed choices',async()=>{
 for(const suggestions of [['观察四周','询问向导'],undefined,'错误格式']){
  const raw=STATE_OPEN+JSON.stringify({presentCharacterIds:[],event:'推进',suggestions})+STATE_CLOSE+RESPONSE_END;
  const result=await run(['完整正文。'+raw]);assert.equal(result.error,undefined);assert.equal(result.calls.length,0);assert.equal(result.text,'完整正文。');
  assert.deepEqual(result.events.at(-1).outcome.suggestions,Array.isArray(suggestions)?suggestions:[]);
 }
});
test('suggestions cut mid-state resume through the existing continuation budget, then commit with the body',async()=>{
 const raw='正常正文。'+STATE_OPEN+JSON.stringify({presentCharacterIds:[],event:'推进',suggestions:['查看公告','询问向导']})+STATE_CLOSE+RESPONSE_END;
 const cut=raw.indexOf('询问')+1;const result=await run([raw.slice(0,cut),raw.slice(cut)]);
 assert.equal(result.error,undefined);assert.equal(result.text,'正常正文。');assert.equal(result.calls.length,1);assert.deepEqual(result.events.at(-1).outcome.suggestions,['查看公告','询问向导']);
});

test('comment-only preset output retries once without exposing hidden text',async()=>{
 const result=await run(['<!-- hidden-only-preset -->','恢复的正常正文。'+metadata+RESPONSE_END]);assert.equal(result.error,undefined);assert.equal(result.calls.length,1);assert.equal(result.text,'恢复的正常正文。');assert.ok(!JSON.stringify(result.events).includes('hidden-only-preset'));assert.ok(result.calls[0].payload.messages.at(-1).content.includes('不得把正文包在 HTML 注释'));
});
test('repeated comment-only output stops after one retry',async()=>{
 const result=await run(['<!-- hidden-first -->','<!-- hidden-second -->']);assert.equal(result.error.code,'MODEL_NO_VISIBLE_CONTENT');assert.equal(result.calls.length,1);assert.equal(result.text,'');
});
