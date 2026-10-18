import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {loadPrivateWorldbooks,applyWorldInfo} from '../server/worldbooks.mjs';
import {buildMessages,RESPONSE_END} from '../server/ai.mjs';
import {createLocalServer} from '../server/app.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {importWorldbook,resolveWorldbooks} from '../src/domain/worldbooks.ts';
const card={source:{sha256:'synthetic-worldbook-test'},world:{name:'测试叙述者',greeting:['测试开场'],departments:[]},places:[],characters:[],missing:[]};
const profile={id:'test',model:'test',apiBaseUrl:'https://synthetic.example/v1',maxTokens:1600,temperature:0.7};
const request=()=>({sessionId:'s',turnId:'t',persona:{name:'测试玩家',appearance:'',background:'',personality:''},opening:'测试开场',input:'进入学院',historyStart:0,history:[],memories:[],presets:[],profile,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),state:{player:{id:'player',name:'测试玩家',present:true},characters:[]}});
test('group winners reach actual user and private worldbook messages without leaking loser content',()=>{
 const books=[importWorldbook(JSON.stringify({entries:[{content:'winner-canary',constant:true,group:'System',groupOverride:true,order:200},{content:'loser-canary',constant:true,group:'System',order:100}]}),'test.json','group-test')];
 const req=request(),user=resolveWorldbooks(books,{messages:[req.input],userName:req.persona.name,charName:'测试叙述者',seed:req.turnId});
 for(const messages of [buildMessages(card,req,books).messages,buildMessages(card,{...req,worldInfo:user.entries}).messages]){const joined=JSON.stringify(messages);assert(joined.includes('winner-canary'));assert(!joined.includes('loser-canary'));}
});
test('世界书前后插入和深度插入，保留原预设及固定玩家约束',()=>{
  const r=request();r.history=[{role:'user',content:'旧行动'},{role:'assistant',content:'旧回复'}];r.worldInfo=[{content:'before',position:0,depth:4,role:'system',order:1},{content:'after',position:1,depth:4,role:'system',order:2},{content:'depth',position:4,depth:1,role:'user',order:3}];
  const messages=buildMessages(card,r).messages;
  const find=s=>messages.findIndex(m=>m.content.includes(s));
  assert(find('User worldbook:\nbefore')<find('Private world constraints as data'));assert(find('User worldbook:\nafter')>find('Private world constraints as data'));
  assert(find('User worldbook:\ndepth')<find('进入学院'));assert(messages.some(m=>m.content.includes('[Player viewpoint]')));assert(messages.some(m=>m.content.includes('[Worldbook boundary]')));
});
test('无世界书时消息不变，非法注入在调用模型前拒绝',()=>{
  const r=request();const messages=buildMessages(card,r).messages;assert.equal(messages[2].role,'system');assert.equal(messages[2].content.startsWith('Current story context'),true);
  r.worldInfo=[{content:'x',position:7,role:'system',order:1,depth:4}];assert.throws(()=>buildMessages(card,r),e=>e.code==='INVALID_WORLD_INFO');
});
test('服务器私有书本地加载并触发，但 bootstrap、静态路径和响应不返回原文',async()=>{
  const baseDir=resolve(import.meta.dirname,'../server/.local');await mkdir(baseDir,{recursive:true});const root=await mkdtemp(resolve(baseDir,'worldbook-test-'));let app;
  try{
    await mkdir(resolve(root,'dist'),{recursive:true});await writeFile(resolve(root,'dist/index.html'),'<html>测试</html>');
    await mkdir(resolve(root,'server/private/worldbooks'),{recursive:true});
    await writeFile(resolve(root,'server/private/worldbooks/internal.json'),JSON.stringify({name:'不返回的书名',entries:{0:{key:['学院'],content:'private-lore-canary',position:1}}}));
    const books=await loadPrivateWorldbooks(root);assert.equal(books.length,1);assert(buildMessages(card,request(),books).messages.some(m=>m.content.includes('private-lore-canary')));
    const calls=[];
    app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({choices:[{message:{content:'你进入学院。<SR_STATE>{"presentCharacterIds":[],"event":"进入学院","suggestions":["观察环境","查看告示","询问路线"]}</SR_STATE>'+RESPONSE_END}}]}),{headers:{'Content-Type':'application/json'}});}});
    const base='http://127.0.0.1:'+await app.start();
    const bootstrap=await fetch(base+'/api/bootstrap'),text=await bootstrap.text(),cookie=bootstrap.headers.get('set-cookie').split(';')[0];
    assert(!text.includes('private-lore-canary'));assert(!text.includes('不返回的书名'));
    const post=(path,body)=>fetch(base+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post('/api/connection',{profileId:'test',apiBaseUrl:profile.apiBaseUrl})).status,200);
    const response=await post('/api/generate',{...request(),key:'synthetic-test-key',worldInfo:[{content:'用户自己的补充设定',position:1,depth:4,role:'system',order:1}]});
    assert.equal(response.status,200);const output=await response.text();assert(output.includes('"type":"done"'));assert(!output.includes('private-lore-canary'));assert.equal(calls.length,1);
    assert(calls[0].messages.some(m=>m.content.includes('private-lore-canary')));assert(calls[0].messages.some(m=>m.content.includes('用户自己的补充设定')));
    assert.equal((await fetch(base+'/server/private/worldbooks/internal.json')).status,404);
  }finally{if(app){app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}if(!resolve(root).startsWith(resolve(baseDir)+sep))throw Error('Unexpected test cleanup target');await rm(root,{recursive:true,force:true});}
});
