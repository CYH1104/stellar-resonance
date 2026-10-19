import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMessages,endpoint,normalizeModelState,StoryDecoder,RESPONSE_END,completionChunks} from '../server/ai.mjs';
import {spiritAnimalOf} from '../server/card.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {applyPromptEntries} from '../server/presets.mjs';
import {importTavernPreset} from '../src/domain/presets.ts';
import {fetchModelList} from '../server/models.mjs';
import {requestEmbeddings} from '../server/embeddings.mjs';
const card={characters:[{id:'one',name:'甲',sex:'Alpha',intro:'私有设定'},{id:'two',name:'乙',sex:'Beta'}],world:{greeting:['迎新']},places:[]};
const state={player:{id:'player',name:'玩家',present:true},characters:card.characters.map(c=>({id:c.id,name:c.name,present:c.id==='one'}))};
test('split markers never leak control JSON, full roster controls entrances and exits',()=>{
  const d=new StoryDecoder();let text='';for(const c of '中文正文。<SR_STATE>{"presentCharacterIds":["two"],"event":"进入下一幕","characters":[{"id":"two","innerThought":"可展示想法","affinity":36}]}</SR_STATE>'+RESPONSE_END)text+=d.push(c);
  assert.equal(text,'中文正文。');const out=d.finish(card,state);assert.deepEqual(out.characters,[{id:'one',present:false},{id:'two',present:true,innerThought:'可展示想法',affinity:36}]);
});
test('empty scene is valid; omitted, duplicate and unknown rosters are rejected',()=>{
  assert.ok(normalizeModelState(card,state,{presentCharacterIds:[],event:'独处'}).characters.every(c=>!c.present));
  for(const raw of [{event:'缺名单'},{presentCharacterIds:['one','one'],event:'重复'},{presentCharacterIds:['ghost'],event:'未知'}])assert.throws(()=>normalizeModelState(card,state,raw));
});
test('malformed or unfinished blocks never produce outcome; oversized single chunks rejected',()=>{
  for(const raw of ['只有正文','正文<SR_STATE>{bad}</SR_STATE>','正文<SR_STATE>{"event":"x"}','正文<SR_STATE>{}</SR_STATE>extra']){const d=new StoryDecoder();d.push(raw);assert.throws(()=>d.finish(card,state));}
  assert.throws(()=>new StoryDecoder().push('正文<SR_STATE>'+'x'.repeat(100001)));
});
test('card and player persona, opening, history and memories are assembled in order',()=>{
  const request={input:'我的行动',persona:{name:'玩家',background:'玩家背景',spiritAnimal:'白猫',other:'喜欢安静'},state,opening:'迎新原文',history:[{role:'user',content:'之前行动'},{role:'assistant',content:'之前剧情'}],memories:['长期记忆'],presets:['叙事预设']};
  const {messages}=buildMessages(card,request);assert.ok(!messages[1].content.includes('私有设定'));assert.ok(messages[2].content.includes('长期记忆'));assert.equal(messages[3].content,'迎新原文');assert.equal(messages.at(-1).content,'我的行动');
  assert.ok(messages[0].content.includes('do not imply physical presence'));assert.ok(!buildMessages(card,{...request,historyStart:5}).messages.some(m=>m.content==='迎新原文'));
  assert.ok(messages[2].content.includes('白猫'));assert.ok(messages[2].content.includes('喜欢安静'));
  assert.ok(messages[0].content.includes('including player.spiritThought'));assert.ok(messages[0].content.includes('fresh nonempty spiritThought'));
});
test('API URL normalization rejects embedded credentials, query strings and insecure remote URLs',()=>{
  assert.equal(endpoint('https://synthetic.example/v1/'),'https://synthetic.example/v1/chat/completions');assert.equal(endpoint('http://127.0.0.1:8888/v1/chat/completions'),'http://127.0.0.1:8888/v1/chat/completions');
  for(const url of ['file:///secret','http://remote.example/v1','https://key@example.com','https://example.com/?key=secret','https://example.com/#secret'])assert.throws(()=>endpoint(url));
});
test('explicit spirit label is extracted, nickname is not a spirit animal',()=>{
  assert.equal(spiritAnimalOf({str:'精神力 S级 · 精神体 星辉圣龙',shos:'帝国冰山'}),'星辉圣龙');assert.equal(spiritAnimalOf({shos:'帝国冰山'}),undefined);
});
test('real prompt assembly respects roles, depth, disabled rows, triggers and name placeholders',()=>{
  const messages=[{role:'system',content:'rule'},{role:'system',content:'card'},{role:'system',content:'state'},{role:'assistant',content:'历史'},{role:'user',content:'本轮'}];
  const entry=(id,content,extra={})=>({id,name:id,content,enabled:true,...extra});
  const out=applyPromptEntries(messages,[entry('a','你好 {{user}}',{role:'user',position:'before'}),entry('b','历史内',{role:'assistant',position:'in-chat',depth:1}),entry('c','后置',{position:'after'}),entry('d','不发送',{enabled:false}),entry('e','仅重演',{triggers:['regenerate']})],{name:'测试玩家'},'角色','normal');
  assert.equal(out[3].content,'你好 测试玩家');assert.equal(out[3].role,'user');assert.equal(out.findIndex(m=>m.content==='历史内'),out.findIndex(m=>m.content==='本轮')-1);assert.equal(out.at(-1).content,'后置');assert.ok(!out.some(m=>['不发送','仅重演'].includes(m.content)));
});
test('spirit identity remains canonical while spirit OS may update',()=>{
  const c={...card,characters:[{id:'one',name:'甲',str:'精神体 白虎'}]};const s={player:{...state.player,spiritAnimal:'白猫'},characters:[state.characters[0]]};
  const out=normalizeModelState(c,s,{presentCharacterIds:['one'],event:'事件',player:{spiritThought:'想睡觉'},characters:[{id:'one',spiritAnimal:'错误种类',spiritThought:'先观察'}]});
  assert.equal(out.characters[0].spiritAnimal,'白虎');assert.equal(out.characters[0].spiritThought,'先观察');assert.equal(out.player.spiritThought,'想睡觉');
});
test('a configured player spirit requires an AI-generated OS each round, not a missing-data placeholder',()=>{
  const s={...state,player:{...state.player,spiritAnimal:'白猫',spiritThought:'上一轮想晒太阳'}};
  for(const player of [undefined,{}, {spiritThought:''},{spiritThought:'  '},{spiritThought:'未提供'}])assert.throws(()=>normalizeModelState(card,s,{presentCharacterIds:[],event:'新一轮',...(player?{player}:{})}),{code:'PLAYER_SPIRIT_THOUGHT_MISSING'});
  const out=normalizeModelState(card,s,{presentCharacterIds:[],event:'报到处有人靠近',player:{spiritThought:'耳朵竖起来了，先看看来的是谁。'}});assert.equal(out.player.spiritThought,'耳朵竖起来了，先看看来的是谁。');
  const noSpirit=normalizeModelState(card,state,{presentCharacterIds:[],event:'事件',player:{spiritThought:'不应为未知精神体编造'}});assert.equal(noSpirit.player.spiritThought,undefined);
});
test('enabled theater slots and user-char fanfic pairing are validated independently of presence',()=>{
  const settings=defaultTheaters();settings[2].enabled=true;settings[2].charId='two';
  const raw={presentCharacterIds:[],event:'主线事件',theaters:[{slot:3,kind:'fanfic',title:'番外',content:'独立日常',participantIds:['player','two']}]};
  const out=normalizeModelState(card,state,raw,{theaterSettings:settings,persona:{name:'玩家',primaryGender:'男'}});assert.equal(out.theaters[0].pairing.category,'待补充');assert.ok(out.characters.every(c=>!c.present));
  assert.throws(()=>normalizeModelState(card,state,{...raw,theaters:[{...raw.theaters[0],participantIds:['one','two']}]},{theaterSettings:settings}));
  settings[2].enabled=false;assert.deepEqual(normalizeModelState(card,state,raw,{theaterSettings:settings}).theaters,[]);
});
test('model discovery accepts compatible list shapes and drops invalid or duplicate IDs',async()=>{
  for(const value of [{data:[{id:'b'},{id:'a'},{id:'a'}]},{models:[{name:'a'},{name:'b'}]},['b','a']]){
    const result=await fetchModelList({apiBaseUrl:'http://127.0.0.1:8888/v1',key:'synthetic-key',signal:new AbortController().signal,fetchImpl:async()=>new Response(JSON.stringify(value))});assert.deepEqual(result.models,['a','b']);
  }
});
test('invalid and oversized model-list responses are rejected safely',async()=>{
  for(const content of ['<html>not JSON</html>',JSON.stringify({unexpected:'value'}),'x'.repeat(1024*1024+1)])await assert.rejects(()=>fetchModelList({apiBaseUrl:'https://synthetic.example/v1',key:'synthetic-key',signal:new AbortController().signal,fetchImpl:async()=>new Response(content)}),e=>['INVALID_MODEL_LIST','MODEL_LIST_TOO_LARGE'].includes(e.code));
});
test('large preset libraries do not send disabled text or hit the old 250-entry cap',()=>{
  const entries=Array.from({length:374},(_,i)=>({id:`p${i}`,name:`条目${i}`,content:i===0?'有效提示':'停用文字'.repeat(400),enabled:i===0}));
  const messages=applyPromptEntries([{role:'system',content:'rule'},{role:'system',content:'card'},{role:'system',content:'state'},{role:'user',content:'行动'}],entries,{name:'玩家'},'角色');
  assert.ok(messages.some(m=>m.content==='有效提示'));assert.ok(!messages.some(m=>m.content.includes('停用文字')));
});
test('more than 250 enabled rows are allowed, while only active text counts toward context limits',()=>{
  const messages=[{role:'system',content:'r'},{role:'system',content:'c'},{role:'system',content:'s'},{role:'user',content:'行动'}];
  const entries=Array.from({length:374},(_,i)=>({id:`p${i}`,name:`条目${i}`,content:'简短提示',enabled:true}));assert.equal(applyPromptEntries(messages,entries,{name:'玩家'},'角色').length,378);
  assert.throws(()=>applyPromptEntries(messages,Array.from({length:10},(_,i)=>({id:`p${i}`,name:'大条目',content:'x'.repeat(40000),enabled:true})),{name:'玩家'},'角色'),e=>e.code==='PRESET_CONTEXT_TOO_LARGE');
});

const embedArgs=()=>({connection:{url:'https://synthetic.example/v1/chat/completions'},profile:{model:'embedding-model'},key:'synthetic-key',texts:['one','two'],signal:new AbortController().signal});
test('embedding results reject duplicate indices, mismatched dimensions and malformed vectors',async()=>{
  for(const data of [[],[{index:0,embedding:[1]},{index:0,embedding:[2]}],[{index:0,embedding:[1]},{index:1,embedding:[1,2]}],[{index:0,embedding:[]},{index:1,embedding:[2]}],[{index:0,embedding:['NaN']},{index:1,embedding:[2]}]]){
    await assert.rejects(requestEmbeddings({...embedArgs(),fetchImpl:async()=>new Response(JSON.stringify({data}))}),{code:'INVALID_EMBEDDING_RESPONSE'});
  }
});
test('embedding errors do not reveal upstream text or key and reject invalid input before fetching',async()=>{
  for(const [status,code] of [[401,'UPSTREAM_AUTH'],[404,'EMBEDDING_NOT_SUPPORTED'],[429,'UPSTREAM_RATE_LIMIT']]){
    await assert.rejects(requestEmbeddings({...embedArgs(),fetchImpl:async()=>new Response('synthetic-private-key-and-error',{status})}),e=>e.code===code&&!e.message.includes('synthetic-private'));
  }
  let calls=0;for(const texts of [[],[' '],['x'.repeat(16001)],Array(33).fill('x')])await assert.rejects(requestEmbeddings({...embedArgs(),texts,fetchImpl:async()=>{calls++;}}),{code:'INVALID_EMBEDDING_REQUEST'});
  assert.equal(calls,0);
});
test('oversized embedding response is cancelled instead of retained',async()=>{
  let cancelled=false;const response=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8*1024*1024+1));},cancel(){cancelled=true;}}));
  await assert.rejects(requestEmbeddings({...embedArgs(),fetchImpl:async()=>response}),{code:'INVALID_EMBEDDING_RESPONSE'});assert.equal(cancelled,true);
});

test('imported model alias reaches message assembly as assistant, without enabling disabled rows',()=>{
  const imported=importTavernPreset(JSON.stringify({prompts:[{identifier:'enabled',role:'model',content:'synthetic-model-response',enabled:true},{identifier:'disabled',role:'model',content:'must-not-send',enabled:false}]}));
  const result=applyPromptEntries([{role:'system',content:'rule'},{role:'system',content:'card'},{role:'system',content:'context'},{role:'user',content:'action'}],imported.entries,{name:'player'},'char');
  assert.deepEqual(result.find(m=>m.content==='synthetic-model-response'),{role:'assistant',content:'synthetic-model-response'});assert.ok(!result.some(m=>m.role==='model'||m.content==='must-not-send'));
});

test('dice forces a bound main-story event plan by roll, not only a score in context',()=>{
  for(const [value,grade,direction]of [[1,'大凶','negative'],[20,'不利','negative'],[50,'平平','neutral'],[80,'顺遂','positive'],[100,'大吉','positive']]){
    const dice={value,grade,rulesVersion:'d100-v1'};const result=buildMessages(card,{persona:{name:'玩家'},input:'去报到',state,history:[],memories:[],presets:[],dice});
    const context=JSON.parse(result.messages[2].content.split(':\n')[1]);assert.equal(context.dicePlan?.direction,direction);assert.ok(result.messages[0].content.includes('Enact a concrete consequence naturally'));
  }
});
test('forged dice labels are rejected; missing or opposite dice event cannot commit state',()=>{
  const base={persona:{name:'玩家'},input:'去报到',state,history:[],memories:[],presets:[]};
  assert.throws(()=>buildMessages(card,{...base,dice:{value:1,grade:'大吉',rulesVersion:'d100-v1'}}),{code:'INVALID_DICE'});
  const dice={value:1,grade:'大凶',rulesVersion:'d100-v1'},raw={presentCharacterIds:[],event:'遇到阻碍'};
  assert.throws(()=>normalizeModelState(card,state,raw,{dice}),{code:'DICE_EVENT_MISSING'});
  assert.throws(()=>normalizeModelState(card,state,{...raw,diceEvent:{direction:'positive',description:'获得帮助'}},{dice}),{code:'DICE_EVENT_MISMATCH'});
  const out=normalizeModelState(card,state,{...raw,diceEvent:{direction:'negative',description:'报到资料缺页，需要补办'}},{dice});assert.equal(out.diceEvent.description,'报到资料缺页，需要补办');
});

test('a closed state block alone cannot prove completion; hidden final marker is required',()=>{
  const decoder=new StoryDecoder();decoder.push('尚未确认结束的正文<SR_STATE>{"presentCharacterIds":[],"event":"事件"}</SR_STATE>');
  assert.throws(()=>decoder.finish(card,state),{code:'MODEL_RESPONSE_INCOMPLETE'});
});
test('public state failures identify a safe category without revealing model values',()=>{
  const valid={presentCharacterIds:[],event:'事件'};
  for(const [patch,code]of [[{other:'synthetic-private-payload'},'MODEL_STATE_FIELDS_INVALID'],[{presentCharacterIds:null},'MODEL_STATE_ROSTER_INVALID'],[{event:''},'MODEL_STATE_EVENT_INVALID'],[{player:{ability:123}},'MODEL_STATE_PLAYER_INVALID'],[{characters:[{id:'one',innerThought:123}]},'MODEL_STATE_CHARACTERS_INVALID'],[{forum:[{content:'synthetic-private-payload'}]},'MODEL_STATE_FORUM_INVALID'],[{theaters:[{slot:2,kind:'group'}]},'MODEL_STATE_THEATERS_INVALID']])assert.throws(()=>normalizeModelState(card,state,{...valid,...patch}),error=>error.code===code&&!error.message.includes('synthetic-private-payload'));
});
test('provider reasoning channels, thinking content blocks and tagged content are never emitted',async()=>{
  const response=new Response(JSON.stringify({choices:[{message:{reasoning_content:'separate-secret',reasoning:'another-secret',content:[{type:'thinking',thinking:'block-secret'},{type:'text',thought:true,text:'thought-secret'},{type:'text',text:'<Think_rules>tagged-secret</Think_rules>正文'}]}}]}),{headers:{'Content-Type':'application/json'}});let out='';for await(const part of completionChunks(response))out+=part;assert.equal(out,'正文');
});
test('encoded reasoning in state strings and old assistant history is removed, story OS stays visible',()=>{
  const d=new StoryDecoder();d.push('正文<SR_STATE>'+JSON.stringify({presentCharacterIds:[],event:'事件',player:{spiritThought:'<think>synthetic-secret</think>想睡觉'}}).replaceAll('<','\\u003c')+'</SR_STATE>'+RESPONSE_END);assert.equal(d.finish(card,{...state,player:{...state.player,spiritAnimal:'白猫'}}).player.spiritThought,'想睡觉');
  const built=buildMessages(card,{input:'行动',persona:{name:'玩家'},state,history:[{role:'assistant',content:'<think>history-secret</think>旧正文'}],memories:['<analysis>memory-secret</analysis>记忆'],presets:[]});assert.ok(!JSON.stringify(built.messages).includes('history-secret'));assert.ok(!JSON.stringify(built.messages).includes('memory-secret'));assert.ok(JSON.stringify(built.messages).includes('旧正文'));
});
test('same-depth injection follows Tavern priority first and reversed role groups',()=>{
  const base=[{role:'system',content:'rules'},{role:'system',content:'card'},{role:'system',content:'state'},{role:'user',content:'action'}];const entries=[['s','system',0],['a','assistant',0],['u2','user',9],['u1','user',1]].map(([id,role,order])=>({id,name:id,content:id,role,order,enabled:true,position:'in-chat',depth:0}));const out=applyPromptEntries(base,entries,{name:'玩家'},'角色');assert.deepEqual(out.slice(-4).map(m=>m.content),['a','s','u1','u2']);
});

test('finish_reason completes and cancels a relay stream even if DONE and socket close never arrive',async()=>{
  let cancelled=false;const bytes=new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'正常正文'},finish_reason:'stop'}]})+'\n\n');
  const response=new Response(new ReadableStream({start(c){c.enqueue(bytes);},cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
  let result='';for await(const part of completionChunks(response))result+=part;assert.equal(result,'正常正文');assert.equal(cancelled,true);
});
test('full messages in SSE, untyped text blocks and the final event without a blank separator are accepted',async()=>{
  const response=new Response('data: '+JSON.stringify({choices:[{message:{content:[{text:'兼容正文'}]},finish_reason:'stop'}]}),{headers:{'Content-Type':'text/event-stream'}});
  let result='';for await(const part of completionChunks(response))result+=part;assert.equal(result,'兼容正文');
});
test('empty, hidden-only and reasoning-only replies produce distinct safe errors and safe progress',async()=>{
  for(const [message,code]of [[{content:''},'MODEL_EMPTY_RESPONSE'],[{content:null,reasoning_content:'synthetic-private-thought'},'MODEL_REASONING_ONLY'],[{content:'<think>synthetic-private-thought'},'MODEL_REASONING_UNCLOSED'],[{content:'<!--synthetic-private-thought-->'},'MODEL_NO_VISIBLE_CONTENT']]){
    const progress=[];await assert.rejects(async()=>{for await(const part of completionChunks(new Response(JSON.stringify({choices:[{message}]}),{headers:{'Content-Type':'application/json'}}),{onProgress:p=>progress.push(p)}))assert.fail(part);},error=>error.code===code&&!error.message.includes('synthetic-private'));
    assert.ok(!JSON.stringify(progress).includes('synthetic-private'));assert.equal(progress.at(-1).visibleChars,0);
  }
});
test('abort interrupts a stalled body reader and cancels upstream',async()=>{
  let cancelled=false;const controller=new AbortController();
  const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
  const result=(async()=>{for await(const part of completionChunks(response,{signal:controller.signal}))assert.fail(part);})();
  controller.abort(new DOMException('timeout','TimeoutError'));await assert.rejects(result,{name:'TimeoutError'});assert.equal(cancelled,true);
});

test('story prompt and hidden state bundle next actions without making them mandatory for valid state',()=>{
 const request={input:'行动',persona:{name:'玩家'},state,opening:'',history:[],memories:[],presets:[]};
 assert.ok(buildMessages(card,request).messages[0].content.includes('suggestions'));
 const d=new StoryDecoder();let visible='';
 for(const c of '正常正文。<SR_STATE>'+JSON.stringify({presentCharacterIds:[],event:'推进',suggestions:['<think>secret</think>观察四周','询问向导']})+'</SR_STATE>'+RESPONSE_END)visible+=d.push(c);
 assert.equal(visible,'正常正文。');assert.deepEqual(d.finish(card,state).suggestions,['观察四周','询问向导']);
 for(const suggestions of [undefined,[],null,42])assert.deepEqual(normalizeModelState(card,state,{presentCharacterIds:[],event:'推进',suggestions}).suggestions,[]);
});

test('group folders do not enter model messages and a paused folder does not activate its children',()=>{
 const group={id:'head',name:'UI group only',order:0,collapsed:true,enabled:false};
 const rows=[{id:'a',name:'A',enabled:true,content:'Paused prompt must not enter model context',group},{id:'b',name:'B',enabled:true,content:'Active prompt',group:{...group,id:'other',enabled:true}}];
 const messages=applyPromptEntries([{role:'system',content:'rule'},{role:'system',content:'card'},{role:'system',content:'state'},{role:'user',content:'action'}],rows,{name:'玩家'},'角色');
 assert.ok(messages.some(m=>m.content==='Active prompt'));assert.ok(!JSON.stringify(messages).includes('Paused prompt'));assert.ok(!JSON.stringify(messages).includes('UI group only'));
});

test('mental power level reaches story context from author facts and generated patches cannot rewrite it',()=>{
 const request={input:'评定精神力',persona:{name:'玩家',mentalPowerLevel:'A级'},state:{...state,player:{...state.player,mentalPowerLevel:'S级'}},history:[],presets:[],memories:[]};
 const built=buildMessages(card,request);assert.equal(built.state.player.mentalPowerLevel,'A级');assert.ok(built.messages[0].content.includes('no invented ranks'));
 const out=normalizeModelState(card,built.state,{presentCharacterIds:[],event:'重新评定',player:{mentalPowerLevel:'SS级'},characters:[{id:'one',mentalPowerLevel:'A级'}]});assert.equal(out.player.mentalPowerLevel,undefined);assert.equal(out.characters[0].mentalPowerLevel,undefined);
 for(const value of ['',null,42,'x'.repeat(101)])assert.equal(normalizeModelState(card,built.state,{presentCharacterIds:[],event:'错误更新',player:{mentalPowerLevel:value}}).player.mentalPowerLevel,undefined);
 assert.equal(normalizeModelState(card,built.state,{presentCharacterIds:[],event:'普通交流'}).player,undefined);
});
