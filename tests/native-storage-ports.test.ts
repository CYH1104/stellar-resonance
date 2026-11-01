import {describe,it,expect} from 'vitest';
import {NativeApi} from '../src/native/api';
import {NativeSettings} from '../src/native/settings';
import {NativeAccountStorage} from '../src/native/accountStorage';
import {NativeCredentials} from '../src/native/credentials';
import {NativePersonaLibrary} from '../src/native/personas';
import {sessionNativeMessages,nativeMessagesSession} from '../src/native/academyMessages';
import {blankPersona} from '../src/domain/persona';
import {newSession,finishVariant} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {applyTerminalBatch} from '../src/domain/terminalMain';
import {personaLibraryStamp} from '../src/storage/personaLibrary';
import type {Variant} from '../src/domain/contracts';

function fixture(){
  let document:any={extension_settings:{other:{untouched:true}},power_user:{personas:{},persona_descriptions:{}}};
  const calls:{path:string;body:any}[]=[],resources=new Map<string,Blob>(),secrets:any[]=[];
  let failSave=false;
  const api=new NativeApi(()=>({'X-CSRF-Token':'synthetic'}),async(path,init)=>{
    path=String(path);const body=init?.body instanceof FormData?init.body:init?.body?JSON.parse(String(init.body)):undefined;
    calls.push({path,body});const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
    if(path==='/api/settings/get')return json({settings:JSON.stringify(document)});
    if(path==='/api/plugins/academy-compat/settings/save'){if(failSave)return json({error:true},500);if(body.expected!==JSON.stringify(document))return json({error:'NATIVE_DATA_CONFLICT'},409);document=structuredClone(body.document);return json({result:'ok'});}
    if(path==='/api/files/upload'){const bytes=Uint8Array.from(atob(body.data),(x:string)=>x.charCodeAt(0));const target='/user/files/'+body.name;resources.set(target,new Blob([bytes]));return json({path:target});}
    if(path==='/api/avatars/upload'){const target=body.get('overwrite_name');resources.set('/User%20Avatars/'+target,body.get('avatar'));return json({path:target});}
    if(path==='/img/user-default.png')return new Response(new Blob(['default'],{type:'image/png'}));
    if(resources.has(path))return new Response(resources.get(path));
    if(path==='/api/secrets/read')return json({api_key_custom:secrets});
    if(path==='/api/secrets/write'){secrets.forEach(s=>s.active=false);const id=crypto.randomUUID();secrets.push({id,active:true,label:body.label});return json({id});}
    if(path==='/api/secrets/delete'){const n=secrets.findIndex(s=>s.id===body.id);if(n>=0)secrets.splice(n,1);return new Response(null,{status:204});}
    if(path==='/api/secrets/rotate'){secrets.forEach(s=>s.active=s.id===body.id);return new Response(null,{status:204});}
    throw Error('Unexpected native route '+path);
  });
  return {api,calls,resources,secrets,settings:new NativeSettings(api),get document(){return document;},set failSave(value:boolean){failSave=value;}};
}
const file=()=>({id:'profile-1',name:'独立档案名',persona:{...blankPersona(),name:'玩家',rawText:'完整原文\n  保留空格\n'},memo:'备忘',remark:'备注',sourceSessionIds:['session-before'],updatedAt:'2026-10-30T01:00:00.000Z',avatar:new Blob(['avatar-original'],{type:'image/png'}),portrait:new Blob(['portrait-original'],{type:'image/webp'})});

describe('original-native storage adapters',()=>{
  it('rejects the losing native settings writer even when both pages passed the read check',async()=>{
    const f=fixture(),other=new NativeSettings(f.api);await Promise.all([f.settings.load(),other.load()]);
    const results=await Promise.allSettled([f.settings.update(s=>{s.inputDrafts={one:'first'};}),other.update(s=>{s.inputDrafts={two:'second'};})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);expect(f.document.extension_settings.stellar_academy.revision).toBe(1);
  });
  it('coalesces UI setting changes and prevents overwriting external native account storage edits',async()=>{
    const f=fixture(),store=new NativeAccountStorage(f.settings,{});await store.initialize();store.setItem('academy:brightness','0.8');store.setItem('academy:chat-avatar-hidden','true');await store.flush();
    expect(f.document.accountStorage).toEqual({'academy:brightness':'0.8','academy:chat-avatar-hidden':'true'});expect(f.document.extension_settings.stellar_academy.revision).toBe(1);
    f.document.accountStorage.external='new';store.setItem('academy:brightness','0.7');await expect(store.flush()).rejects.toThrow('其他页面');expect(f.document.accountStorage['academy:brightness']).toBe('0.8');
  });
  it('round trips every session field, alternate draft, private message and pending input through native messages',()=>{
    const s=newSession('学院会话',{name:'用户',appearance:'',background:'',personality:''},'开场');
    s.terminal=emptyTerminal();s.terminal.contacts=[{id:'contact-custom',name:'自己哥哥',present:false}];s.terminal.friends=[{id:'contact-custom',status:'accepted',reply:'好',note:''}];
    s.draftInput='未发送';s.worldbookIds=['book-a'];
    const first:Variant={id:'v1',text:'第一稿',status:'incomplete',createdAt:'now'};
    s.turns=[{id:'t1',input:'问候',variants:[first],selected:0}];
    finishVariant(s,0,first,{event:'问候',terminal:{protocolVersion:2,groups:[],privateMessages:[{id:'contact-custom',text:'记得吃饭。',topic:'近况'}],friendRequests:[]}});
    applyTerminalBatch(s,first.outcome!.terminal!,0);
    s.turns[0].variants.push({...structuredClone(first),id:'v2',text:'第二稿'});s.turns[0].selected=1;
    s.turns.push({id:'pending',input:'还在生成',selected:0,variants:[]});
    const rows=sessionNativeMessages(s);
    expect(rows[3].swipes).toEqual(['第一稿','第二稿']);
    expect(nativeMessagesSession(rows)).toEqual(s);
  });
  it('honors native edits and selected swipes without dropping other native extensions',()=>{
    const s=newSession('编辑',{name:'用户',appearance:'',background:'',personality:''},'开场');
    s.turns=[{id:'t',input:'原输入',selected:0,variants:[{id:'a',text:'原文',status:'incomplete',createdAt:'now'},{id:'b',text:'另一稿',status:'incomplete',createdAt:'now'}]}];
    const rows=sessionNativeMessages(s);rows[0].chat_metadata.external={keep:1};rows[2].extra.external='keep';rows[3].swipe_info[0].extra.external='swipe';
    rows[2].mes='原生改输入';rows[3].mes='原生编辑后的另一稿';rows[3].swipe_id=1;
    const restored=nativeMessagesSession(rows);expect(restored.turns[0].input).toBe('原生改输入');expect(restored.turns[0].variants[1].text).toBe('原生编辑后的另一稿');
    const saved=sessionNativeMessages(restored,rows);expect(saved[0].chat_metadata.external).toEqual({keep:1});expect(saved[2].extra.external).toBe('keep');expect(saved[3].swipe_info[0].extra.external).toBe('swipe');
    rows[3].swipe_info[0].extra.stellar_academy.version=2;expect(()=>nativeMessagesSession(rows)).toThrow('版本');
  });
  it('stores raw keys only in original Secrets and preserves unrelated active native credentials',async()=>{
    const f=fixture();await f.settings.load();f.secrets.push({id:'unrelated',active:true});
    const credentials=new NativeCredentials(f.settings);
    await credentials.write({version:1,remember:true,keys:{main:'synthetic-main',phone:'synthetic-phone'},confirmed:{}});
    const saved=await credentials.read();expect(saved!.keys.main).toMatch(/^native-secret:/);expect(saved!.keys.phone).not.toBe(saved!.keys.main);
    expect(JSON.stringify(f.document)).not.toContain('synthetic-main');expect(JSON.stringify(f.document)).not.toContain('synthetic-phone');
    expect(f.secrets.find(s=>s.id==='unrelated').active).toBe(true);
    expect(await credentials.payload(saved!.keys.phone)).toEqual({secret_id:saved!.keys.phone.slice('native-secret:'.length)});
    expect((await credentials.exportKeys(saved!)).keys).toEqual({main:'synthetic-main',phone:'synthetic-phone'});
    await expect(new NativeCredentials(f.settings).exportKeys(saved!)).rejects.toThrow('重新输入');
  });
  it('keeps server profiles, notes, drafts, source links and original images after a fresh client opens',async()=>{
    const f=fixture(),library=new NativePersonaLibrary(f.settings),input=file();
    await library.save(input);await library.saveDraft({...input,id:'',name:'未完成',persona:{...input.persona,name:''}});
    const fresh=new NativePersonaLibrary(new NativeSettings(f.api)),state=await fresh.readBackupState();
    expect(state.files).toHaveLength(1);expect(state.files[0]).toMatchObject({...input,avatar:expect.any(Blob),portrait:expect.any(Blob)});
    expect(await state.files[0].avatar!.text()).toBe('avatar-original');expect(await state.files[0].portrait!.text()).toBe('portrait-original');
    expect(state.files[0].portrait!.type).toBe('image/webp');expect(state.draft!.persona.name).toBe('');
    expect(JSON.stringify(f.document)).not.toContain('avatar-original');expect(f.document.extension_settings.other).toEqual({untouched:true});
    expect(Object.values(f.document.power_user.personas)).toEqual(['玩家']);
  });
  it('does not overwrite native persona edits while saving an unfinished draft',async()=>{
    const f=fixture(),library=new NativePersonaLibrary(f.settings);await library.save(file());
    const avatar=Object.keys(f.document.power_user.personas)[0];f.document.power_user.persona_descriptions[avatar].description='原生界面更新过的人设';
    await library.saveDraft({...file(),persona:{...blankPersona(),name:''}});
    expect(f.document.power_user.persona_descriptions[avatar].description).toBe('原生界面更新过的人设');
    expect((await library.list())[0].persona.rawText).toBe('原生界面更新过的人设');
  });
  it('detects stale pages before overwriting profiles, and metadata revisions do not invalidate persona restore',async()=>{
    const f=fixture(),library=new NativePersonaLibrary(f.settings);await library.save(file());
    const staleSettings=new NativeSettings(f.api),stale=new NativePersonaLibrary(staleSettings);await stale.list();
    const before=await library.readBackupState();await f.settings.update(s=>{s.inputDrafts={session:'typing'};});
    const revision=await library.replace(before.files,before.draft,personaLibraryStamp(before.files,before.draft),before.revision);expect(revision).toBe(before.revision);
    await library.save({...file(),memo:'已更新'});
    await expect(stale.save({...file(),memo:'旧页覆盖'})).rejects.toThrow('其他页面');
    expect((await library.list())[0].memo).toBe('已更新');
  });
  it('stops backup on missing or changed image files rather than silently exporting profiles without images',async()=>{
    const f=fixture(),library=new NativePersonaLibrary(f.settings);await library.save(file());
    const path=[...f.resources.keys()].find(p=>p.endsWith('.image'))!;f.resources.set(path,new Blob(['changed']));
    await expect(library.readBackupState()).rejects.toThrow('图片内容已改变');
    expect(f.document.extension_settings.stellar_academy.personas).toHaveLength(1);
    const visible=await library.list();expect(visible).toHaveLength(1);expect(visible[0].persona.rawText).toBe(file().persona.rawText);expect(visible[0].memo).toBe('备忘');
    await expect(library.save({...visible[0],memo:'不能顺便清除丢失的图片'})).rejects.toThrow('原图尚未读到');
  });
  it('keeps a previous avatar and persona intact if the final native settings save fails',async()=>{
    const f=fixture(),library=new NativePersonaLibrary(f.settings);await library.save(file());const before=JSON.stringify(f.document);
    f.failSave=true;await expect(library.save({...file(),avatar:new Blob(['new'],{type:'image/png'})})).rejects.toThrow();
    expect(JSON.stringify(f.document)).toBe(before);
    expect([...f.resources.keys()].filter(k=>k.startsWith('/User%20Avatars/'))).toHaveLength(2);
  });
  it('rejects future metadata and unexpected resource addresses before writing',async()=>{
    const f=fixture();f.document.extension_settings.stellar_academy={version:2,revision:1};
    await expect(new NativePersonaLibrary(f.settings).save(file())).rejects.toThrow('版本');
    expect(f.calls.every(c=>c.path==='/api/settings/get')).toBe(true);
    for(const path of ['https://external/key','/user/files/../settings.json','/user/files/%2e%2e','/api/secrets/read'])await expect(f.api.blob(path)).rejects.toThrow('地址');
  });
});
