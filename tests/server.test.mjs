import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {get} from 'node:http';
import {createLocalServer} from '../server/app.mjs';
import {RESPONSE_END} from '../server/ai.mjs';
import {extractPro} from '../scripts/extract-pro.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
const root=resolve(import.meta.dirname,'..');
let app,base,cookie,source,calls=[];
const profile={id:'test',apiBaseUrl:'https://synthetic.example/v1',model:'synthetic-model',temperature:0.7,maxTokens:1600};
const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...headers},body:JSON.stringify(body)});
const events=text=>text.split('\n\n').filter(t=>t.startsWith('data: ')).map(t=>JSON.parse(t.slice(6)));
function sides(payload){
  const context=JSON.parse(payload.messages[2].content.split('：\n')[1]);
  return {forum:context.theaterPlans.some(t=>t.slot===1)?[{id:'test-post',authorName:'校园同学',content:'今天食堂上新了'}]:[],theaters:context.theaterPlans.filter(t=>t.slot>1).map(t=>({slot:t.slot,kind:t.kind,title:t.title,content:t.kind==='group'?'':t.kind==='fanfic'?'独立番外内容'.repeat(160):'独立番外内容',...(t.kind==='group'?{messages:[{speaker:'同学',content:'群聊独有的问候'}]}:{}),...(t.kind==='fanfic'?{complete:true,participantIds:t.participantIds||['player','pro-02']}:{} )}))};
}
function fakeFetch(url,options){
  if(options.method==='GET'){
    calls.push({url,...options});
    if(options.headers.Authorization==='Bearer invalid-model-key')return new Response('synthetic-secret-error',{status:401});
    if(url.includes('/unsupported/'))return new Response('unsupported',{status:404});
    return new Response(JSON.stringify({data:[{id:'model-z'},{id:'model-a'},{id:'model-a'},{id:null}]}),{headers:{'Content-Type':'application/json'}});
  }
  const payload=JSON.parse(options.body);calls.push({url,...options,payload});
  if(payload.model.startsWith('probe-')){
    if(payload.model==='probe-auth')return new Response('synthetic-private-key-and-error',{status:401});
    if(payload.model==='probe-network')throw new TypeError('synthetic-private-network-detail');
    if(Array.isArray(payload.input))return new Response(JSON.stringify({data:[{index:0,embedding:[0.5,0.1,0.2]}]}));
    return new Response(JSON.stringify({choices:[{message:payload.model==='probe-reasoning'?{reasoning_content:'synthetic-private-thought',content:null}:{content:'OK'}}]}),{headers:{'Content-Type':'application/json'}});
  }
  if(Array.isArray(payload.input))return new Response(JSON.stringify({data:payload.input.map((text,index)=>({index,embedding:[index+1,0.5]})).reverse()}),{headers:{'Content-Type':'application/json'}});
  const action=payload.messages.at(-1).content;
  if(payload.messages[0].content.startsWith('你只设计一个尚未发生'))return new Response(JSON.stringify({choices:[{message:{content:'<think>不能展示</think>{"title":"意外来信","description":"一封未署名来信等待你决定是否查看。"}'}}]}),{headers:{'Content-Type':'application/json'}});
  if(payload.messages[0].content.startsWith('你为剧情内的虚构校园论坛'))return new Response(JSON.stringify({choices:[{message:{content:payload.model==='forum-plain'?'我推荐食堂的新菜。':payload.model==='forum-cut'?'{"content":"未完':payload.model==='forum-alias'?'{"reply":"我推荐食堂的新菜。"}':'{"content":"我推荐食堂的新菜。"}'}}]}),{headers:{'Content-Type':'application/json'}});
  if(payload.messages.some(m=>m.role==='user'&&m.content==='state-repair')){
    const repairing=action.startsWith('[系统状态补修');const content=repairing?'<SR_STATE>'+JSON.stringify({...sides(payload),presentCharacterIds:[],event:'状态补修完成'})+'</SR_STATE>'+RESPONSE_END:'原正文完整。<SR_STATE>{bad}</SR_STATE>'+RESPONSE_END;
    return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});
  }
  const scenario=payload.messages.find(m=>m.role==='user'&&['cut-success','cut-limit','cut-manual'].includes(m.content))?.content;
  if(scenario){
    const continuing=action.startsWith('[系统续写控制');
    const ending='<SR_STATE>'+JSON.stringify({...sides(payload),presentCharacterIds:[],event:'续写完成'})+'</SR_STATE>'+RESPONSE_END;
    const content=scenario==='cut-limit'?'一段未完正文。':scenario==='cut-manual'?'接上新正文。'+ending:continuing?'后半句。'+ending:'前半句。';
    return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});
  }
  if(payload.messages[0].content.startsWith('你帮助玩家填写')){
    const {wish}=JSON.parse(action);const persona=wish==='bad-persona'?{name:'新生',privateWorldbook:'不能返回'}:{name:'林星',appearance:'黑发',personality:'慢热',background:'入学新生',spiritAnimal:'白色小猫',other:'喜欢安静'};
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(persona)}}]}),{headers:{'Content-Type':'application/json'}});
  }
  if(action==='auth-error')return new Response('synthetic-key-and-private-internal',{status:401});
  if(payload.messages.some(m=>m.role==='user'&&m.content==='invalid'))return new Response(JSON.stringify({choices:[{message:{content:'正文仍可阅读，但状态不合法。<SR_STATE>{"presentCharacterIds":["invented"],"event":"错误"}</SR_STATE>'}}]}),{headers:{'Content-Type':'application/json'}});
  const ids=action==='leave'?[]:['pro-02'];
  const context=JSON.parse(payload.messages[2].content.split('：\n')[1]),plan=context.dicePlan;
  const diceEvent=plan?{direction:action==='dice-opposite'?'positive':plan.direction,description:plan.direction==='negative'?'报到资料缺页，需要补办。':plan.direction==='positive'?'值班人员帮你找到空闲窗口，报到进度提前。':'窗口换班时了解了公开流程。'}:undefined;
  const text=(diceEvent?diceEvent.description:'')+'收到远程通讯；眼前人物由这一幕决定。<SR_STATE>'+JSON.stringify({presentCharacterIds:ids,characters:[{id:'pro-02',innerThought:'先听他说完。',affinity:99,spiritThought:'先观察门口。'}],event:diceEvent?.description||'本轮场景已推进',...(diceEvent&&action!=='dice-missing'?{diceEvent}:{}),...(action==='spirit-ok'?{player:{spiritThought:'竖起耳朵观察来人。'}}:{}),...(action==='identity'?{player:{identity:'项目助理',innerThought:'不应该返回玩家想法'}}:{}),...sides(payload),...(action==='theaters'?{player:{spiritThought:'想睡觉'},theaters:[{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'同学',content:'群聊独有的问候'}]},{slot:3,kind:'fanfic',title:'番外',content:'user 与 char 的独立日常。'.repeat(100),complete:true,participantIds:['player','pro-02']},{slot:4,kind:'custom',title:'采访',content:'采访的独立内容。'}]}:{})})+'</SR_STATE>'+RESPONSE_END;
  const bytes=new TextEncoder().encode([...text].map(char=>'data: '+JSON.stringify({choices:[{delta:{content:char}}]})+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n');
  return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=19)c.enqueue(bytes.slice(i,i+19));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
}
before(async()=>{source=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));app=await createLocalServer({projectRoot:root,port:0,fetchImpl:fakeFetch,card:source});base=`http://127.0.0.1:${await app.start()}`;const response=await fetch(base+'/api/bootstrap');cookie=response.headers.get('set-cookie').split(';')[0];});
after(async()=>{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));});
async function game(){return (await post('/api/new-game',{persona:{name:'测试玩家',primaryGender:'男'}})).json();}
async function request(input='提到秦凛的名字，但他没有到场。') {const g=await game();return {persona:{name:'测试玩家'},opening:g.opening,history:[],memories:[],presets:[],state:g.initial,profile,key:'synthetic-key',input};}
test('bootstrap exposes counts and public map only, no card definitions or cast selector',async()=>{
  const value=await(await fetch(base+'/api/bootstrap')).json();assert.equal(value.runtime,'local-card');assert.equal(value.capabilities.keyRequired,true);assert.equal(value.capabilities.continue,true);assert.equal(value.counts.characters,source.characters.length);assert.equal(value.places.length,source.places.length);assert.deepEqual(value.characters,[]);
  for(const c of source.characters)assert.ok(!JSON.stringify(value).includes(c.intro));
});
test('new game awaits AI scene, no fabricated fields and no client-selected cast accepted',async()=>{
  const g=await game();assert.equal(g.presenceStatus,'awaiting-ai');assert.ok(g.initial.characters.every(c=>!c.present&&!('affinity'in c)&&!('innerThought'in c)));assert.deepEqual(g.initial.characters.map(c=>c.primaryGender),source.characters.map(c=>c.primaryGender));assert.equal(g.initial.characters[0].secondaryGender,'Alpha');assert.equal(g.initial.player.primaryGender,'男');assert.equal(g.opening,source.world.greeting.join('\n'));
  assert.equal(g.initial.characters[0].spiritAnimal,'白狐');assert.notEqual(g.initial.characters[0].spiritAnimal,source.characters[0].shos);
  assert.equal((await post('/api/new-game',{persona:{name:'访客'},presentCharacterIds:[]})).status,400);
  assert.equal((await fetch(base+'/api/new-game',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
});
test('private files and encoded traversal never served',async()=>{
  for(const path of ['/server/private/extracted-pro.json','/server/ai.mjs','/src/domain/story.ts','/scripts/extract-pro.mjs','/%73erver/private/extracted-pro.json','/assets/..%5cserver%5cprivate%5cextracted-pro.json'])assert.equal((await fetch(base+path)).status,404,path);
});
test('cross-origin and foreign host requests denied',async()=>{
  assert.equal((await post('/api/new-game',{persona:{name:'访客'}},{Origin:'https://unrelated.example'})).status,403);
  const status=await new Promise((resolve,reject)=>{get(base+'/api/bootstrap',{headers:{Host:'unrelated.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(status,403);
});
test('selected map introduction stays available',async()=>{const place=source.places[0];const value=await(await post('/api/place',{id:place.id})).json();assert.equal(value.description,place.intro);assert.ok(!('rule'in value));});
test('unconfigured model refuses generation instead of quoting source',async()=>{const response=await post('/api/generate',await request());assert.equal(response.status,412);assert.equal((await response.json()).code,'MODEL_NOT_CONFIGURED');assert.equal(calls.length,0);});
test('empty names cannot start and persona helper requires a configured model',async()=>{
  for(const name of ['', '  '])assert.equal((await post('/api/new-game',{persona:{name}})).status,400);
  assert.equal((await post('/api/persona',{wish:'新生',draft:{name:''},profile,key:'synthetic-key'})).status,412);
});
test('registering address makes no external request; URL credentials rejected',async()=>{
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:'https://secret@example.com/v1'})).status,400);
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);assert.equal(calls.length,0);
});
test('actual model request includes private card; SSE exposes story and validated full scene only',async()=>{
  const result=events(await(await post('/api/generate',await request())).text());const story=result.filter(e=>e.type==='delta').map(e=>e.text).join('');const done=result.at(-1);
  assert.equal(done.type,'done');assert.ok(!story.includes('SR_STATE'));assert.ok(!story.includes('presentCharacterIds'));assert.deepEqual(done.outcome.characters.filter(c=>c.present).map(c=>c.id),['pro-02']);assert.equal(done.outcome.characters.length,source.characters.length);assert.equal(done.outcome.characters[1].affinity,99);
  assert.ok(calls.at(-1).payload.messages.some(m=>m.content.includes(source.characters[0].intro)));assert.equal(calls.at(-1).redirect,'error');assert.equal(calls.at(-1).headers.Authorization,'Bearer synthetic-key');
});
test('next model full scene clears departed actors, independent of mentioned name',async()=>{
  const r=await request('leave');r.state.characters[1].present=true;const result=events(await(await post('/api/generate',r)).text());assert.ok(result.at(-1).outcome.characters.every(c=>c.present===false));
});
test('invalid state emits a precise reason after bounded repairs and no committed update',async()=>{const count=calls.length;const result=events(await(await post('/api/generate',await request('invalid'))).text());assert.equal(calls.length-count,4);assert.equal(result.at(-1).type,'error');assert.equal(result.at(-1).code,'STATE_REPAIR_LIMIT');assert.equal(result.at(-1).reasonCode,'UNKNOWN_MODEL_CHARACTER');assert.ok(!result.some(e=>e.type==='done'));assert.ok(!JSON.stringify(result).includes('invented'));});
test('upstream error bodies and credentials are not returned',async()=>{const response=await post('/api/generate',await request('auth-error'));assert.equal(response.status,502);assert.deepEqual(await response.json(),{code:'UPSTREAM_AUTH'});});
test('client roster, changed endpoints, missing keys and unconfigured embeddings are rejected',async()=>{
  assert.equal((await post('/api/generate',{...await request(),presentCharacterIds:['pro-01']})).status,400);
  assert.equal((await post('/api/generate',{...await request(),profile:{...profile,apiBaseUrl:'https://other.example/v1'}})).status,412);
  assert.equal((await post('/api/generate',{...await request(),key:''})).status,400);
  assert.equal((await post('/api/embeddings',{texts:['test']})).status,412);
});
test('persona helper calls model with world context and returns only validated player fields',async()=>{
  const response=await post('/api/persona',{wish:'想玩一个慢热的新生',draft:{name:'',spiritAnimal:'白猫',other:'喜欢安静'},profile,key:'synthetic-key'});assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.persona.name,'林星');assert.equal(result.persona.spiritAnimal,'白色小猫');assert.equal(result.persona.other,'喜欢安静');assert.deepEqual(Object.keys(result),['persona']);
  const sent=calls.at(-1).payload.messages;assert.ok(sent[1].content.includes(source.world.greeting[0]));assert.ok(!sent[1].content.includes(source.characters[0].intro));
  assert.equal(JSON.parse(sent.at(-1).content).current.spiritAnimal,'白猫');
});
test('invalid AI persona response or wish never returns partial/private fields',async()=>{
  const response=await post('/api/persona',{wish:'bad-persona',draft:{name:''},profile,key:'synthetic-key'});assert.equal(response.status,502);assert.deepEqual(await response.json(),{code:'INVALID_PERSONA_RESULT'});
  assert.equal((await post('/api/persona',{wish:'  ',draft:{name:''},profile,key:'synthetic-key'})).status,400);
});
test('HTTP stream delivers three independent side scenes and spirit OS without duplicating them in story deltas',async()=>{
  const r=await request('theaters');r.persona.spiritAnimal='白猫';r.theaterSettings=defaultTheaters();r.theaterSettings[2].enabled=true;r.theaterSettings[2].charId='pro-02';r.theaterSettings[3].enabled=true;r.profile={...profile,topP:0.8,frequencyPenalty:0.3,presencePenalty:0.4};
  const result=events(await(await post('/api/generate',r)).text());assert.equal(result.at(-1).type,'done');const out=result.at(-1).outcome;assert.equal(out.theaters.length,3);assert.equal(out.theaters.find(t=>t.slot===3).pairing.category,'待补充');assert.equal(out.player.spiritThought,'想睡觉');assert.equal(out.characters.find(c=>c.id==='pro-02').spiritThought,'先观察门口。');
  assert.ok(!result.filter(e=>e.type==='delta').map(e=>e.text).join('').includes('群聊独有的问候'));assert.equal(calls.at(-1).payload.top_p,0.8);assert.equal(calls.at(-1).payload.frequency_penalty,0.3);
});
test('models can be fetched before choosing a model, with GET only and without private context',async()=>{
  const response=await post('/api/models',{apiBaseUrl:'https://synthetic.example/v1/chat/completions',key:'synthetic-key'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{models:['model-a','model-z']});
  assert.equal(calls.at(-1).url,'https://synthetic.example/v1/models');assert.equal(calls.at(-1).method,'GET');assert.equal(calls.at(-1).body,undefined);assert.equal(calls.at(-1).redirect,'error');
});
test('model discovery rejects bad URL or missing key and hides upstream error bodies',async()=>{
  assert.equal((await post('/api/models',{apiBaseUrl:'https://synthetic-key@example.com/v1',key:'synthetic-key'})).status,400);
  assert.equal((await post('/api/models',{apiBaseUrl:profile.apiBaseUrl,key:''})).status,400);
  const bad=await post('/api/models',{apiBaseUrl:profile.apiBaseUrl,key:'invalid-model-key'});assert.equal(bad.status,502);assert.deepEqual(await bad.json(),{code:'UPSTREAM_AUTH'});
  const unsupported=await post('/api/models',{apiBaseUrl:'https://synthetic.example/unsupported',key:'synthetic-key'});assert.deepEqual(await unsupported.json(),{code:'MODEL_LIST_NOT_SUPPORTED'});
});
test('extractor rejects executable initializers instead of running source',()=>{
  assert.throws(()=>extractPro('const SPLASH_CHARACTERS = (()=>{throw Error("must never execute")})();','literal-test.js'),/Only literal/);
  const data=extractPro('const SPLASH_CHARACTERS=[{no:"01",name:"名字",sex:"Alpha",intro:"原文"}];const MAP_COORD="坐标原文";const MAP_PLACES=[];','literal-test.js');assert.equal(data.characters[0].intro,'原文');
});

test('independent embedding connection sends only text and uses returned indices',async()=>{
  const embedding={...profile,id:'embedding',apiBaseUrl:'https://vector.example/v1',model:'vector-model'};
  assert.equal((await post('/api/connection',{profileId:embedding.id,apiBaseUrl:embedding.apiBaseUrl})).status,200);
  const response=await post('/api/embeddings',{texts:['记忆一','记忆二'],profile:embedding,key:'synthetic-vector-key'});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{vectors:[[1,0.5],[2,0.5]]});
  const sent=calls.at(-1);assert.equal(sent.url,'https://vector.example/v1/embeddings');assert.equal(sent.headers.Authorization,'Bearer synthetic-vector-key');
  assert.deepEqual(sent.payload,{model:'vector-model',input:['记忆一','记忆二'],encoding_format:'float'});assert.equal(sent.redirect,'error');
  assert.equal((await post('/api/embeddings',{texts:[],profile:embedding,key:'synthetic-vector-key'})).status,400);
});

test('HTTP dice plan yields visible actual effects; missing or reversed event refuses state commit',async()=>{
  for(const [value,grade,direction]of [[1,'大凶','negative'],[100,'大吉','positive']]){
    const r=await request('dice-ok');r.dice={value,grade,rulesVersion:'d100-v1'};const result=events(await(await post('/api/generate',r)).text());assert.equal(result.at(-1).type,'done');assert.equal(result.at(-1).outcome.diceEvent.direction,direction);
    assert.ok(result.filter(e=>e.type==='delta').map(e=>e.text).join('').includes(result.at(-1).outcome.diceEvent.description));
  }
  for(const [action,code]of [['dice-missing','DICE_EVENT_MISSING'],['dice-opposite','DICE_EVENT_MISMATCH']]){const r=await request(action);r.dice={value:1,grade:'大凶',rulesVersion:'d100-v1'};const result=events(await(await post('/api/generate',r)).text());assert.equal(result.at(-1).code,code);assert.ok(!result.some(e=>e.type==='done'));}
  const r=await request();r.dice={value:1,grade:'大吉',rulesVersion:'d100-v1'};const count=calls.length;const response=await post('/api/generate',r);assert.equal(response.status,400);assert.equal((await response.json()).code,'INVALID_DICE');assert.equal(calls.length,count);
});
test('player identity initializes from persona and updates independently, player inner thought is filtered',async()=>{
  const g=await(await post('/api/new-game',{persona:{name:'访客',identity:'学院新生'}})).json();assert.equal(g.initial.player.identity,'学院新生');
  const r=await request('identity');r.persona.identity='学院新生';r.state.player.identity='学院新生';const result=events(await(await post('/api/generate',r)).text());assert.equal(result.at(-1).type,'done');assert.deepEqual(result.at(-1).outcome.player,{identity:'项目助理'});
});
test('HTTP generation returns AI spirit OS for a configured player spirit and reports omission explicitly',async()=>{
  for(const action of ['spirit-ok','spirit-missing']){
    const r=await request(action);r.persona.spiritAnimal='白猫';const count=calls.length;const result=events(await(await post('/api/generate',r)).text());assert.equal(calls.length-count,action==='spirit-ok'?1:4);
    if(action==='spirit-ok'){assert.equal(result.at(-1).type,'done');assert.equal(result.at(-1).outcome.player.spiritThought,'竖起耳朵观察来人。');}
    else{assert.equal(result.at(-1).code,'STATE_REPAIR_LIMIT');assert.equal(result.at(-1).reasonCode,'PLAYER_SPIRIT_THOUGHT_MISSING');assert.ok(!result.some(e=>e.type==='done'));assert.ok(result.some(e=>e.type==='delta'));}
    assert.ok(calls.at(-1).payload.messages[0].content.includes('每轮必须输出 player.spiritThought'));
  }
});

test('HTTP cutoff automatically continues once and returns only joined prose and one final state',async()=>{
  const count=calls.length;const result=events(await(await post('/api/generate',await request('cut-success'))).text());
  assert.equal(calls.length-count,2);assert.deepEqual(result.filter(e=>e.type==='continuation').map(e=>e.attempt),[1]);
  assert.equal(result.filter(e=>e.type==='delta').map(e=>e.text).join(''),'前半句。后半句。');assert.equal(result.filter(e=>e.type==='done').length,1);
  assert.equal(calls.at(-1).payload.messages.at(-2).content,'前半句。');assert.ok(!JSON.stringify(result).includes('SR_DONE'));assert.ok(!JSON.stringify(result).includes('SR_STATE'));
});
test('HTTP cutoff exhausts exactly three extra calls before error, without committing state',async()=>{
  const count=calls.length;const result=events(await(await post('/api/generate',await request('cut-limit'))).text());
  assert.equal(calls.length-count,4);assert.deepEqual(result.filter(e=>e.type==='continuation').map(e=>e.attempt),[1,2,3]);assert.equal(result.at(-1).code,'AUTO_CONTINUE_LIMIT');assert.ok(!result.some(e=>e.type==='done'));assert.ok(result.some(e=>e.type==='delta'));
});
test('HTTP manual continuation seeds existing prose and rejects malformed partials before a model call',async()=>{
  const r=await request('cut-manual');r.generationType='continue';r.continuation={partial:'已有正文。'};
  const count=calls.length;const result=events(await(await post('/api/generate',r)).text());assert.equal(calls.length-count,1);assert.equal(result.at(-1).type,'done');assert.equal(result.filter(e=>e.type==='delta').map(e=>e.text).join(''),'接上新正文。');assert.equal(calls.at(-1).payload.messages.at(-2).content,'已有正文。');
  for(const continuation of [{partial:''},{partial:'  '},{partial:42},{partial:'正文',extra:true},[],null])assert.equal((await post('/api/generate',{...r,continuation})).status,400);
  assert.equal(calls.length-count,1);
});
test('HTTP automatically repairs JSON state and hides all repair output, committing exactly once',async()=>{
  const count=calls.length,result=events(await(await post('/api/generate',await request('state-repair'))).text());assert.equal(calls.length-count,2);assert.equal(result.filter(e=>e.type==='delta').map(e=>e.text).join(''),'原正文完整。');assert.equal(result.filter(e=>e.type==='done').length,1);assert.equal(result.find(e=>e.type==='repair').code,'MODEL_STATE_JSON_INVALID');assert.equal(result.at(-1).outcome.event,'状态补修完成');
});
test('probe performs one small real text or embedding call before configuration, without private game context',async()=>{
  for(const kind of ['text','embedding']){
    const count=calls.length,p={...profile,id:'unregistered-probe',model:'probe-ok'},r=await post('/api/probe',{profile:p,key:'synthetic-key',kind});
    assert.equal(r.status,200);const result=await r.json();assert.equal(result.kind,kind);assert.ok(result.durationMs>=0);assert.equal(calls.length-count,1);assert.ok(!JSON.stringify(calls.at(-1).payload).includes(source.world.greeting[0]));
    if(kind==='text'){assert.equal(result.visibleChars,2);assert.equal(calls.at(-1).payload.max_tokens,512);assert.equal(calls.at(-1).payload.messages.length,1);}
    else{assert.equal(result.dimensions,3);assert.deepEqual(calls.at(-1).payload.input,['连接测试']);}
    assert.ok(!('vectors'in result));assert.ok(!('content'in result));
  }
});
test('probe exposes safe specific failures and rejects unsafe URLs or missing credentials before fetching',async()=>{
  for(const [model,code]of [['probe-auth','UPSTREAM_AUTH'],['probe-network','MODEL_UNREACHABLE'],['probe-reasoning','MODEL_REASONING_ONLY']]){
    const r=await post('/api/probe',{profile:{...profile,model},key:'synthetic-key',kind:'text'});assert.equal(r.status,502);assert.deepEqual(await r.json(),{code});
  }
  const count=calls.length;
  for(const body of [{profile:{...profile,apiBaseUrl:'https://secret@example.com/v1'},key:'synthetic-key',kind:'text'},{profile,key:'',kind:'text'},{profile,key:'synthetic-key',kind:'unsupported'}])assert.equal((await post('/api/probe',body)).status,400);
  assert.equal(calls.length,count);
});
test('forum replies use the selected registered connection and return only server-chosen author plus one reply',async()=>{
  const auxiliary={...profile,id:'forum-aux',apiBaseUrl:'https://forum.synthetic.example/v1'};await post('/api/connection',{profileId:auxiliary.id,apiBaseUrl:auxiliary.apiBaseUrl});
  const count=calls.length,response=await post('/api/forum-reply',{profile:auxiliary,key:'synthetic-forum-key',userName:'测试玩家',post:{authorName:'路人',content:'食堂上新'},comments:[{authorName:'测试玩家',content:'推荐哪个？'}]});assert.equal(response.status,200);const reply=await response.json();assert.deepEqual(Object.keys(reply).sort(),['authorId','authorName','content']);assert.equal(reply.content,'我推荐食堂的新菜。');assert.equal(calls.length-count,1);assert.equal(calls.at(-1).url,'https://forum.synthetic.example/v1/chat/completions');assert.equal(calls.at(-1).headers.Authorization,'Bearer synthetic-forum-key');assert.ok(!JSON.stringify(reply).includes('synthetic-forum-key'));assert.ok(!('affinity'in reply));
  const last=JSON.parse(calls.at(-1).payload.messages.at(-1).content);assert.equal(last.comments[0].content,'推荐哪个？');assert.ok(!('state'in last));
});
test('bad forum requests are rejected before a paid model call',async()=>{
  const count=calls.length;const response=await post('/api/forum-reply',{profile,key:'synthetic-key',userName:'玩家',post:{authorName:'路人',content:'动态'},comments:[]});assert.equal(response.status,400);assert.equal((await response.json()).code,'INVALID_FORUM_REPLY');assert.equal(calls.length,count);
});
test('forum HTTP accepts plain and alias responses with one request, while truncated JSON stays an explicit failure',async()=>{
  for(const model of ['forum-plain','forum-alias','forum-cut']){
    const count=calls.length,response=await post('/api/forum-reply',{profile:{...profile,model},key:'synthetic-key',userName:'玩家',post:{authorName:'路人',content:'动态'},comments:[{authorName:'玩家',content:'你好'}]});assert.equal(response.status,model==='forum-cut'?502:200);const value=await response.json();if(model==='forum-cut')assert.equal(value.code,'INVALID_FORUM_REPLY_RESULT');else assert.equal(value.content,'我推荐食堂的新菜。');assert.equal(calls.length-count,1);
  }
});
test('HTTP manual state-only repair returns no new prose and validates its mode before calling the provider',async()=>{
  const r=await request('cut-manual');r.continuation={partial:'已保存的完整正文。',mode:'state'};const count=calls.length,result=events(await(await post('/api/generate',r)).text());assert.equal(calls.length-count,1);assert.equal(result.at(-1).type,'done');assert.ok(!result.some(e=>e.type==='delta'));assert.ok(calls.at(-1).payload.messages.at(-1).content.startsWith('[系统状态补修'));
  for(const mode of ['unsafe',true,{}])assert.equal((await post('/api/generate',{...r,continuation:{partial:'正文',mode}})).status,400);assert.equal(calls.length-count,1);
});

test('random-event endpoint uses selected model and returns candidate only, without main story or private fields',async()=>{
  const route={...profile,id:'random-events',model:'events-model'};await post('/api/connection',{profileId:route.id,apiBaseUrl:route.apiBaseUrl});const before=calls.length;
  const response=await post('/api/random-event',{kind:'惊喜事件',persona:{name:'测试玩家'},input:'走进教室',history:[],presentCharacterIds:[],profile:route,key:'synthetic-key'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{kind:'惊喜事件',title:'意外来信',description:'一封未署名来信等待你决定是否查看。'});assert.equal(calls.length,before+1);assert.equal(calls.at(-1).payload.model,'events-model');assert.ok(calls.at(-1).payload.max_tokens<=2000);
  const invalid=await post('/api/random-event',{kind:'未知',persona:{name:'测试玩家'},input:'走进教室',history:[],presentCharacterIds:[],profile:route,key:'synthetic-key'});assert.equal(invalid.status,400);assert.equal((await invalid.json()).code,'INVALID_RANDOM_EVENT');assert.equal(calls.length,before+1);
});

