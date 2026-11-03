import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {nativeAuthor,nativeAuthorRoutes} from '../native/academy-plugin/author.mjs';
import {defaultEditorData,validateEditorData} from '../server/editor-store.mjs';
import {catalogFromEditor,academyTasks} from '../native/academy-plugin/tasks.mjs';
import {promptDefinitions} from '../server/internal-prompts.mjs';
import {privateGeneration} from '../native/academy-plugin/generation.mjs';
import {terminalPlans} from '../native/academy-plugin/terminal.mjs';
const base={version:1,source:{sha256:'a'.repeat(64)},characters:[{id:'real-a',no:'01',name:'正式角色甲',hiddenPrompt:'PRIVATE_OLD_CHARACTER_12345'}],world:{name:'学院',sourceText:'PRIVATE_OLD_WORLD_123456789',greeting:['原始开场'],departments:[]},places:[],missing:[]};
test('author writes reload native projections and overrides without expiring pending tasks or mixing author versions',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'native-author-'));const initial=validateEditorData(defaultEditorData(base));await writeFile(resolve(dir,'extracted-pro.json'),JSON.stringify(base));await writeFile(resolve(dir,'editor-data.json'),JSON.stringify(initial));
 let catalog=catalogFromEditor(base,initial);const tasks=academyTasks(catalog),terminal=terminalPlans(),old=tasks.plan('owner','utility',{task:'summary',texts:['合成正文']});
 const terminalOld=terminal.plan('owner',{task:'friend',actorIds:['real-a'],input:'问候',persona:{name:'合成用户'},context:{state:{characters:[{id:'real-a',name:'正式角色甲'}]}}},catalog.card);
 const author=nativeAuthor({directory:dir,root:process.cwd(),catalog:async()=>catalog,changed:async editor=>{catalog=catalogFromEditor(base,editor);tasks.updateCatalog(catalog);}});
 try{
  const before=await author.read(),next=structuredClone(before.data),definition=promptDefinitions.find(d=>d.id==='app.2');
  next.greeting=['新开场'];next.entries[0].content='PRIVATE_NEW_WORLD_123456789';next.characters[0].name='更新后的角色';next.map={main:'https://fixture.invalid/new-map.png',secondary:'',places:{}};next.internalPrompts={'app.2':definition.template+'\nSYNTHETIC_NEW_OVERRIDE'};
  const saved=await author.save({data:next,revision:before.revision});assert.notEqual(saved.revision,before.revision);assert.deepEqual(tasks.catalog().greeting,['新开场']);assert.equal(tasks.cards().characters[0].name,'更新后的角色');assert.equal(tasks.map().map.main,next.map.main);
  assert.deepEqual(JSON.parse(await readFile(resolve(dir,'editor-data.previous.json'),'utf8')),initial);
  const newer=tasks.plan('owner','utility',{task:'summary',texts:['合成正文']});assert.ok(JSON.stringify(newer.messages).includes('SYNTHETIC_NEW_OVERRIDE'));assert.ok(!JSON.stringify(old.messages).includes('SYNTHETIC_NEW_OVERRIDE'));
  assert.equal(tasks.preparation('owner',old.token).authorCard.world.entries[0].content,'PRIVATE_OLD_WORLD_123456789');assert.equal(tasks.preparation('owner',newer.token).authorCard.world.entries[0].content,'PRIVATE_NEW_WORLD_123456789');assert.equal(terminal.preparation('owner',terminalOld.token).authorCard.world.entries[0].content,'PRIVATE_OLD_WORLD_123456789');
  const received=[],compiler={compile:async value=>{received.push(value);return {messages:[{role:'system',content:'synthetic compiled'}],effects:{sticky:{},cooldown:{}},variables:{},globals:{}};},close:async()=>{}};
  const generation=privateGeneration({catalog:async()=>catalog,tasks:async()=>tasks,terminal,compiler});await generation.prepare('owner',{family:'tasks',token:old.token,profile:{model:'fixture',apiBaseUrl:'https://fixture.invalid',maxTokens:50},pipeline:{preset:{},books:[],effects:{sticky:{},cooldown:{}},variables:{},globals:{}}},new AbortController().signal);
  assert.ok(JSON.stringify(received[0]).includes('PRIVATE_OLD_WORLD_123456789'));assert.ok(!JSON.stringify(received[0]).includes('PRIVATE_NEW_WORLD_123456789'));
  assert.deepEqual(tasks.finish('owner',old.token,'已完成旧请求'),{items:['已完成旧请求']});
  await assert.rejects(author.save({data:before.data,revision:before.revision}),{code:'EDITOR_CONFLICT'});assert.deepEqual((await author.read()).data,saved.data);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('native author routes reject ordinary accounts before reading any private content',async()=>{
 const routes=new Map();let reads=0,writes=0;nativeAuthorRoutes({post:(path,handler)=>routes.set(path,handler)},{read:async()=>{reads++;return {private:'AUTHOR_ONLY'};},save:async()=>{writes++;return {ok:true};}});
 const response=()=>({statusCode:200,status(value){this.statusCode=value;return this;},json(value){this.value=value;return this;}});
 for(const user of [undefined,{profile:{handle:'regular',admin:false}}])for(const route of ['/author/read','/author/save']){const result=response();await routes.get(route)({user,body:{}},result);assert.equal(result.statusCode,403);assert.ok(!JSON.stringify(result.value).includes('AUTHOR_ONLY'));}
 assert.equal(reads,0);assert.equal(writes,0);const admin=response();await routes.get('/author/read')({user:{profile:{handle:'owner',admin:true}}},admin);assert.equal(admin.value.private,'AUTHOR_ONLY');
});
