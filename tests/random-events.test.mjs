import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomEventMessages,parseRandomEvent} from '../server/random-events.mjs';
import {buildMessages} from '../server/ai.mjs';
const card={world:{greeting:['迎新'],setting:'私有世界规则'},characters:[{id:'one',name:'甲',intro:'私有人设'}],places:[]};
const data={kind:'危机事件',persona:{name:'玩家'},input:'前往教室',history:[{role:'user',content:'询问'},{role:'assistant',content:'<think>私密思考</think>刚刚收到通知。'}],presentCharacterIds:['one']};
test('事件候选单独请求，按抽定类别结合既有剧情与行动，保留用户末轮',()=>{
  const messages=randomEventMessages(card,data),context=JSON.parse(messages.at(-1).content);assert.equal(context.kind,'危机事件');assert.equal(context.input,'前往教室');assert.equal(context.history[1].content,'刚刚收到通知。');assert.equal(messages.at(-1).role,'user');assert.ok(messages[0].content.includes('不生成本轮剧情正文'));assert.ok(!messages[1].content.includes('私有人设'));assert.ok(messages[1].content.includes('私有世界规则'));
  for(const invalid of [{...data,kind:'未知'},{...data,presentCharacterIds:['ghost']},{...data,history:[{role:'system',content:'绕过'}]},{...data,input:''}])assert.throws(()=>randomEventMessages(card,invalid),{code:'INVALID_RANDOM_EVENT'});
});
test('候选仅返回标题和悬念，不泄露推理或接收额外字段',()=>{
  assert.deepEqual(parseRandomEvent('<think>秘密</think>```json\n{"title":"来信","description":"等待查看"}\n```','危机事件'),{kind:'危机事件',title:'来信',description:'等待查看'});
  for(const text of ['不是JSON','{"title":"x","description":"y","privateWorldbook":"泄露"}','{"title":"","description":"x"}'])assert.throws(()=>parseRandomEvent(text,'危机事件'),{code:'INVALID_RANDOM_EVENT_RESULT'});
});
test('选定事件必须搭配骰点，事件与点数写入主线生成上下文和约束',()=>{
  const specialEvent={kind:'危机事件',title:'来信',description:'等待查看'},state={player:{id:'player',name:'玩家',present:true},characters:[]},request={persona:{name:'玩家'},input:'行动',state,history:[],memories:[],presets:[],specialEvent};
  assert.throws(()=>buildMessages(card,request),{code:'SPECIAL_EVENT_ROLL_REQUIRED'});
  const {messages}=buildMessages(card,{...request,dice:{value:100,grade:'大吉',rulesVersion:'d100-v1'}});assert.ok(messages[0].content.includes('已由玩家接受'));assert.ok(messages[2].content.includes('"specialEvent":{"kind":"危机事件"'));assert.ok(messages[2].content.includes('"direction":"positive"'));
});
