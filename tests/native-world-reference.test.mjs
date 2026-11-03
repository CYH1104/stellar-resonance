import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ensureAcademyWorld,migrateAcademyWorld,academyWorldAvatar} from '../native/academy-plugin/world.mjs';

const copy=value=>structuredClone(value);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const path=ref=>JSON.stringify([ref.avatar,ref.file]);
function fixture(){
  const references=[{id:'one',avatar:'old-one.png',file:'first'},{id:'two',avatar:'old-two.png',file:'second'}];
  const rows=id=>[
    {chat_metadata:{integrity:'original-'+id,other:{retained:true},stellar_academy:{version:1,session:{id,name:id,terminal:{privateMessages:['private-'+id],room:{round:7}},persona:{rawText:'full persona'},worldbookIds:['book']}}}},
    {mes:'opening-'+id,is_user:false,extra:{other:'keep',stellar_academy:{version:1,role:'opening'}}},
    {mes:'input-'+id,is_user:true,extra:{stellar_academy:{version:1,role:'user',turn:{id:'turn',selected:1}}}},
    {mes:'second reply',is_user:false,swipe_id:1,swipes:['first reply','second reply'],swipe_info:[{extra:{stellar_academy:{version:1,variant:{id:'a'}}}},{extra:{other:'keep',stellar_academy:{version:1,variant:{id:'b'}}}}],extra:{stellar_academy:{version:1,role:'assistant',turnId:'turn'}}},
  ];
  let document={extension_settings:{other:{untouched:true},stellar_academy:{version:1,revision:3,chats:references,personas:[{id:'p',sourceSessionIds:['one','two']}],editorDrafts:{'new-game':'untouched'},recovery:{workspace:'user/files/old.json'}}},power_user:{personas:{'own.png':'Player'}},accountStorage:{theme:'retained'}};
  const chats=new Map(references.map(ref=>[path(ref),rows(ref.id)])),files=new Map(),cards=new Map(),events=[];
  const f={chats,files,cards,events,failCopy:0,alterCopy:false,failSettings:false,corruptRecovery:false,foreignTarget:false,onCopy:undefined,
    get document(){return document;},set document(value){document=value;},
    async call(family,route,body){
      events.push({family,route,body:copy(body)});
      if(family==='settings'){
        if(route==='/get')return {settings:JSON.stringify(document)};
        if(route==='/save'){if(f.failSettings)throw Error('disk full');document=copy(body);return {result:'ok'};}
      }
      if(family==='characters'){
        if(route==='/get'){const card=cards.get(body.avatar_url);if(!card)throw Object.assign(Error('missing'),{status:404});return copy(card);}
        if(route==='/create'){const avatar=body.file_name+'.png';cards.set(avatar,{avatar,name:body.ch_name,data:{name:body.ch_name,extensions:JSON.parse(body.extensions)}});return avatar;}
      }
      if(family==='files'&&route==='/upload'){files.set(body.name,Buffer.from(body.data,'base64').toString());return {path:'user/files/'+body.name};}
      if(family==='chats'){
        const target=path({avatar:body.avatar_url,file:body.file_name});
        if(route==='/get')return copy(chats.get(target)|| (f.foreignTarget&&body.avatar_url===academyWorldAvatar?[{foreign:'untouched'}]:[]));
        if(route==='/save'){
          if(f.failCopy>0&&--f.failCopy===0)throw Error('copy interrupted');
          const value=copy(body.chat);if(f.alterCopy)value[1].mes='corrupt';chats.set(target,value);f.onCopy?.();return {ok:true};
        }
      }
      throw Error('Unexpected native route '+family+route);
    },
    async readRecovery(name){return f.corruptRecovery?'corrupt':files.get(name);},
    request(){return {expected:JSON.stringify(document.extension_settings.stellar_academy),chats:document.extension_settings.stellar_academy.chats.map(ref=>({id:ref.id,hash:hash(chats.get(path(ref)))}))};},
  };
  return f;
}
const migrate=f=>migrateAcademyWorld(f.call,f.request(),f.readRecovery);

test('multiple sessions share one public native card, retaining every raw row and unrelated account setting',async()=>{
  const f=fixture(),before=copy(f.document),sources=copy([...f.chats]);
  const result=await migrate(f);
  assert.equal(result.migrated,true);assert.equal(f.cards.size,1);
  assert.equal(f.events.filter(e=>e.family==='characters'&&e.route==='/create').length,1);
  assert.equal(new Set(result.chats.map(ref=>ref.avatar)).size,1);assert.equal(result.chats[0].avatar,academyWorldAvatar);
  assert.notEqual(result.chats[0].file,result.chats[1].file);
  for(let n=0;n<sources.length;n++){
    assert.deepEqual(f.chats.get(sources[n][0]),sources[n][1]);
    assert.deepEqual(f.chats.get(path(result.chats[n])),sources[n][1]);
  }
  const recovery=JSON.parse(f.files.get(result.recovery.split('/').pop()));
  assert.deepEqual(recovery.settings,before);assert.deepEqual(recovery.sources.map(s=>s.rows),sources.map(s=>s[1]));
  assert.deepEqual(f.document.power_user,before.power_user);assert.deepEqual(f.document.accountStorage,before.accountStorage);
  assert.deepEqual(f.document.extension_settings.stellar_academy.personas,before.extension_settings.stellar_academy.personas);
  assert.deepEqual(f.document.extension_settings.stellar_academy.editorDrafts,before.extension_settings.stellar_academy.editorDrafts);
  assert.equal(f.document.extension_settings.stellar_academy.recovery.workspace,'user/files/old.json');
  assert.equal(result.revision,4);
  assert.ok(f.events.findIndex(e=>e.family==='files')<f.events.findIndex(e=>e.family==='chats'&&e.route==='/save'));
  assert.equal(f.events.some(e=>e.route==='/delete'),false);
  const repeated=await migrate(f);assert.equal(repeated.migrated,false);assert.equal(f.files.size,1);
});

test('reuses the fixed world and never overwrites a conflicting character at its reserved filename',async()=>{
  const f=fixture();await ensureAcademyWorld(f.call);await ensureAcademyWorld(f.call);assert.equal(f.cards.size,1);
  f.cards.get(academyWorldAvatar).data.description='unexpected private or user content';
  await assert.rejects(ensureAcademyWorld(f.call),{code:'NATIVE_WORLD_RESOURCE_CONFLICT'});
  assert.equal(f.cards.get(academyWorldAvatar).data.description,'unexpected private or user content');
  assert.equal(f.events.filter(e=>e.route==='/create').length,1);
});

for(const failure of ['copy','readback','backup','settings'])test(`keeps the old index and all sources after ${failure} failure; explicit retry succeeds`,async()=>{
  const f=fixture(),before=copy(f.document),sources=copy([...f.chats]);
  if(failure==='copy')f.failCopy=2;if(failure==='readback')f.alterCopy=true;if(failure==='backup')f.corruptRecovery=true;if(failure==='settings')f.failSettings=true;
  await assert.rejects(migrate(f));assert.deepEqual(f.document,before);
  for(const [key,rows]of sources)assert.deepEqual(f.chats.get(key),rows);
  if(failure==='backup')assert.equal(f.events.some(e=>e.family==='chats'&&e.route==='/save'),false);
  f.failCopy=0;f.alterCopy=false;f.corruptRecovery=false;f.failSettings=false;
  assert.equal((await migrate(f)).migrated,true);assert.equal(f.cards.size,1);
});

test('rejects stale baselines before copying and source changes during copying before index commit',async()=>{
  const f=fixture(),request=f.request();f.chats.values().next().value[1].mes='independent edit';
  await assert.rejects(migrateAcademyWorld(f.call,request,f.readRecovery),{code:'NATIVE_DATA_CONFLICT'});
  assert.equal(f.events.some(e=>e.route==='/create'||e.route==='/save'||e.family==='files'),false);
  const g=fixture(),before=copy(g.document);let changed=false;
  g.onCopy=()=>{if(!changed){g.chats.values().next().value[1].mes='edit during migration';changed=true;}};
  await assert.rejects(migrate(g),{code:'NATIVE_DATA_CONFLICT'});assert.deepEqual(g.document,before);
  assert.equal(g.chats.values().next().value[1].mes,'edit during migration');
});

test('does not overwrite an independent settings edit or an occupied target',async()=>{
  const f=fixture();f.onCopy=()=>{f.document.accountStorage.theme='changed elsewhere';};
  await assert.rejects(migrate(f),{code:'NATIVE_DATA_CONFLICT'});assert.equal(f.document.extension_settings.stellar_academy.chats[0].avatar,'old-one.png');
  assert.equal(f.document.accountStorage.theme,'changed elsewhere');
  const g=fixture(),before=copy(g.document);g.foreignTarget=true;
  await assert.rejects(migrate(g),{code:'NATIVE_WORLD_TARGET_CONFLICT'});assert.deepEqual(g.document,before);
});

test('cancelled migration retains its original index and source files',async()=>{
  const f=fixture(),before=copy(f.document),sources=copy([...f.chats]),controller=new AbortController();
  f.onCopy=()=>controller.abort();
  await assert.rejects(migrateAcademyWorld(f.call,f.request(),f.readRecovery,controller.signal),{name:'AbortError'});
  assert.deepEqual(f.document,before);for(const [key,rows]of sources)assert.deepEqual(f.chats.get(key),rows);
});

test('refuses aliased/future chat records and respects the active restore owner',async()=>{
  const f=fixture();f.document.extension_settings.stellar_academy.chats[1]={...f.document.extension_settings.stellar_academy.chats[0],id:'two'};
  await assert.rejects(migrate(f),{code:'NATIVE_WORLD_INDEX_INVALID'});assert.equal(f.events.length,1);
  const g=fixture();g.chats.values().next().value[0].chat_metadata.stellar_academy.version=2;
  await assert.rejects(migrate(g),{code:'NATIVE_WORLD_CHAT_INVALID'});assert.equal(g.files.size,0);
  const h=fixture();h.document.extension_settings.stellar_academy.restorePending=true;h.document.extension_settings.stellar_academy.restoreLock={owner:'own',expires:Date.now()+60000};
  await assert.rejects(migrate(h),{code:'NATIVE_WORLD_RESTORE_BUSY'});
  const result=await migrateAcademyWorld(h.call,{...h.request(),restoreOwner:'own'},h.readRecovery);
  assert.equal(result.migrated,true);assert.equal(h.document.extension_settings.stellar_academy.restorePending,true);
  assert.equal(h.document.extension_settings.stellar_academy.restoreLock.owner,'own');
});
