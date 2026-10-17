import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder} from '../server/ai.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {parseStateJson} from '../server/state-json.mjs';
import {streamStory} from '../server/story-stream.mjs';
const card={world:{},places:[],characters:[]},state={player:{id:'player',name:'玩家',present:true},characters:[]};
const settings=defaultTheaters().map(s=>({...s,enabled:s.slot===4}));
test('多段小剧场字符串含模型未转义的换行时保留段落，不误判为状态JSON格式错误',()=>{
 const value={presentCharacterIds:[],event:'原事件',theaters:[{slot:4,kind:'custom',title:'自定义',content:'第一段。\n第二段。'}]};
 const raw=JSON.stringify(value).replace('第一段。\\n第二段。','第一段。\n第二段。');
 const decoder=new StoryDecoder();decoder.push('固定正文。<SR_STATE>'+raw+'</SR_STATE><SR_DONE>');
 const result=decoder.finish(card,state,{theaterSettings:settings});assert.equal(result.theaters[0].content,'第一段。\n第二段。');assert.equal(decoder.story,'固定正文。');
});
test('只规范化字符串内控制符与结构尾随逗号，内容里的逗号和引号保持不变',()=>{
 const result=parseStateJson('{"text":"逗号,}，引号\\"保留，段落\n下一段\t缩进", "items":[1,2,],}');assert.equal(result.value.text,'逗号,}，引号"保留，段落\n下一段\t缩进');assert.deepEqual(result.value.items,[1,2]);assert.equal(result.info.controls,2);assert.equal(result.info.trailingCommas,2);
 assert.deepEqual(parseStateJson('```json {"event":"正常"} ```').value,{event:'正常'});
});
test('不猜测缺失引号、逗号或字段；失败诊断不带原文、Key 或模型推理',()=>{
 for(const text of ['{"event":"synthetic-secret", "theaters":[','{"event":"synthetic-secret" "x":1}','secret-prefix {"event":"ok"}']){
  assert.throws(()=>parseStateJson(text),e=>{assert.equal(e.code,'MODEL_STATE_JSON_INVALID');assert(!JSON.stringify(e).includes('synthetic-secret'));assert(!JSON.stringify(e.diagnostic).includes('secret-prefix'));assert.equal(e.diagnostic.format,'invalid');return true;});
 }
});
test('真实流式多段状态通过语法规范化一次提交，不重复付费补修；无效JSON维持三次上限',async()=>{
 const body=value=>new Response(JSON.stringify({choices:[{message:{content:value},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}});
 const valid={presentCharacterIds:[],event:'完成',theaters:[{slot:4,kind:'custom',title:'自定义',content:'第一段\n第二段'}]},raw=JSON.stringify(valid).replace('第一段\\n第二段','第一段\n第二段');let calls=0;const events=[];
 for await(const e of streamStory({card,state,options:{theaterSettings:settings},messages:[],connection:{url:'https://synthetic.example/v1/chat/completions'},profile:{model:'test',temperature:.7,maxTokens:2000},key:'synthetic-key',firstResponse:body('正文。<SR_STATE>'+raw+'</SR_STATE><SR_DONE>'),signal:new AbortController().signal,fetchImpl:async()=>{calls++;throw Error('Unexpected retry');}}))events.push(e);
 assert.equal(calls,0);assert.equal(events.at(-1).type,'done');assert.equal(events.find(e=>e.type==='diagnostic').diagnostic.format,'normalized');
 const failures=[];try{for await(const e of streamStory({card,state,options:{},messages:[],connection:{url:'https://synthetic.example/v1/chat/completions'},profile:{model:'test',temperature:.7,maxTokens:2000},key:'synthetic-key',firstResponse:body('正文。<SR_STATE>{"event":"secret" "oops":1}</SR_STATE><SR_DONE>'),signal:new AbortController().signal,fetchImpl:async()=>{calls++;return body('<SR_STATE>{"event":"secret" "oops":1}</SR_STATE><SR_DONE>');}}))failures.push(e);assert.fail('Expected failure');}catch(e){assert.equal(e.code,'STATE_REPAIR_LIMIT');assert.equal(e.reasonCode,'MODEL_STATE_JSON_INVALID');}
 assert.equal(calls,3);assert(failures.filter(e=>e.type==='diagnostic').every(e=>!JSON.stringify(e).includes('secret')));assert(!failures.some(e=>e.type==='done'));
});
