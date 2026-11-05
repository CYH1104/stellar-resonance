import {it,expect} from 'vitest';
import {sessionNativeApi} from '../src/native/api';
import {NativeSettings} from '../src/native/settings';
import {NativePresets} from '../src/native/presets';
import {NativeCredentials} from '../src/native/credentials';
import {NativeWorkspaceRepository} from '../src/native/repository';
import {NativePersonaLibrary} from '../src/native/personas';
import {newSession,defaults,finishVariant,backup,parseBackup} from '../src/domain/story';
import {sessionNativeMessages} from '../src/native/academyMessages';
import {academyWorldAvatar} from '../src/native/world';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {applyTerminalBatch} from '../src/domain/terminalMain';
import {blankPersona} from '../src/domain/persona';
import type {Variant} from '../src/domain/contracts';
import {nativePresetList,encodeNativePresetDraft} from '../src/domain/nativePreset';

// Explicit, disposable local instance only. This test never targets the deployed site.
const origin=(globalThis as typeof globalThis&{process?:{env:Record<string,string|undefined>}}).process?.env.NATIVE_STORAGE_TEST_ORIGIN;
function api(){
  if(origin!=='http://127.0.0.1:8998')throw Error('Only the isolated native storage proof instance is allowed');
  const cookies=new Map<string,string>();
  return sessionNativeApi(async(path,init)=>{
    const headers=new Headers(init?.headers);if(cookies.size)headers.set('Cookie',[...cookies].map(([k,v])=>k+'='+v).join('; '));
    const response=await fetch(origin+path,{...init,headers});
    for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],n=pair.indexOf('=');cookies.set(pair.slice(0,n),pair.slice(n+1));}
    return response;
  });
}
it.skipIf(!origin)('recovers from invalid editor input and round trips a large native draft through real settings and restore copies',async()=>{
 const settings=new NativeSettings(api()),repo=new NativeWorkspaceRepository(settings,new NativeCredentials(settings),new NativePresets(settings),async()=>{});
 const before=(await repo.read())!,config=before.archive!.nativePreset!;
 config.preset={...config.preset,extensions:{...config.preset.extensions,draftProof:'原生草稿'.repeat(410000)}};
 const text=encodeNativePresetDraft(config,JSON.stringify(config.preset,null,2));expect(text.length).toBeGreaterThan(3000000);
 await expect(repo.writeEditorDraft('preset:native-runtime','{"api_key":"synthetic-rejected"}')).rejects.toThrow('凭据');
 await repo.writeEditorDraft('preset:native-runtime',text);
 const loaded=(await repo.read())!;expect(loaded.archive!.editorDrafts!['preset:native-runtime']).toBe(text);
 expect(parseBackup(backup(loaded)).archive!.editorDrafts!['preset:native-runtime']).toBe(text);
 const cloud=parseCloudSave(createCloudSave(loaded,loaded.preferences)).snapshot;
 await repo.prepareCloudRecovery(loaded);const release=await repo.lockRestore();
 try{await repo.write({...loaded,archive:{...loaded.archive!,editorDrafts:{}}},undefined,true);}finally{await release();}
 const copy=await repo.readCloudRecovery('workspace');expect(copy!.archive!.editorDrafts!['preset:native-runtime']).toBe(text);
 await repo.write(cloud);expect((await repo.read())!.archive!.editorDrafts!['preset:native-runtime']).toBe(text);
 await repo.writeEditorDraft('preset:native-runtime',null);await repo.write(copy!);
 expect((await repo.read())!.archive!.editorDrafts!['preset:native-runtime']).toBe(text);
 await repo.writeEditorDraft('preset:native-runtime',null);
},60000);
it.skipIf(!origin)('keeps native extension arrays and nested preset fields through original files and backup formats',async()=>{
 const settings=new NativeSettings(api()),presets=new NativePresets(settings),before=await presets.read();
 const extra={large:Array(5001).fill(0),nested:Array.from({length:30}).reduce(value=>({child:value}),{} as any)};
 const next={...before,preset:{...before.preset,extensions:{...before.preset.extensions,compatibilityProof:extra}}};
 await presets.save(next,before);const actual=await presets.read();expect(actual.preset.extensions.compatibilityProof).toEqual(extra);
 const snapshot={version:1 as const,sessions:[],preferences:defaults(),archive:{version:1 as const,nativePreset:actual}};
 expect(parseBackup(backup(snapshot)).archive!.nativePreset!.preset.extensions.compatibilityProof).toEqual(extra);expect(parseCloudSave(createCloudSave(snapshot,defaults())).snapshot.archive!.nativePreset!.preset.extensions.compatibilityProof).toEqual(extra);
},30000);
it.skipIf(!origin)('rolls back native files when a later file in the same settings transaction is rejected',async()=>{
  const client=api(),before=await client.post('/api/settings/get',{}),document=JSON.parse(before.settings),name='rollback_'+crypto.randomUUID();
  const presetName=before.openai_setting_names[0],preset=JSON.parse(before.openai_settings[0]);
  await expect(client.post('/api/plugins/academy-compat/settings/save',{expected:JSON.stringify(document),document,nativeFiles:[
    {family:'presets',name:presetName,before:preset,after:{...preset,proof_transaction:true}},
    {family:'worldinfo',name,after:{invalid_worldbook:true}},
  ]})).rejects.toThrow();
  const after=await client.post('/api/settings/get',{});
  expect(JSON.parse(after.settings)).toEqual(document);expect(JSON.parse(after.openai_settings[after.openai_setting_names.indexOf(presetName)])).toEqual(preset);expect(after.world_names).not.toContain(name);
},30000);
it.skipIf(!origin)('persists full academy messages, private terminal records, original images and drafts using the unmodified native server',async()=>{
  const connection=api(),settings=new NativeSettings(connection),presets=new NativePresets(settings),credentials=new NativeCredentials(settings);
  const repository=new NativeWorkspaceRepository(settings,credentials,presets,async()=>{throw Error('Archive application must be explicit in this isolated chat test');});
  const before=await repository.read();expect(before!.archive!.nativePreset!.preset.prompts).toBeInstanceOf(Array);
  if(await repository.hasInterruptedRestore())await repository.clearInterruptedRestore();
  const s=newSession('原生保存实测',{name:'测试用户',appearance:'',background:'',personality:''},'完整开场');s.terminal=emptyTerminal();
  s.terminal.contacts=[{id:'contact-proof',name:'自定义哥哥',present:false}];s.terminal.friends=[{id:'contact-proof',status:'accepted',reply:'好',note:''}];
  const variant:Variant={id:'first',text:'第一稿',status:'incomplete',createdAt:new Date().toISOString()};s.turns=[{id:'turn',input:'问候',selected:0,variants:[variant]}];
  finishVariant(s,0,variant,{event:'问候',terminal:{protocolVersion:2,groups:[],privateMessages:[{id:'contact-proof',text:'原生私聊必须保留',topic:'近况'}],friendRequests:[]}});applyTerminalBatch(s,variant.outcome!.terminal!,0);
  s.turns[0].variants.push({...structuredClone(variant),id:'alternate',text:'第二稿'});s.turns[0].selected=1;s.draftInput='未发送的输入';
  await repository.write({version:1,sessions:[...before!.sessions,s],preferences:{...defaults(),mode:'server'},archive:before!.archive});
  await repository.writeInputDraft(s.id,'修改后的未发送输入');
  const freshSettings=new NativeSettings(connection),freshRepository=new NativeWorkspaceRepository(freshSettings,new NativeCredentials(freshSettings),new NativePresets(freshSettings),async()=>{});
  const restored=await freshRepository.read(),session=restored!.sessions.find(v=>v.id===s.id)!;
  expect(session.turns).toEqual(s.turns);expect(session.terminal).toEqual(s.terminal);expect(session.draftInput).toBe('修改后的未发送输入');
  const ref=settings.current().chats!.find(v=>v.id===s.id)!;
  const native=await connection.post('/api/chats/get',{avatar_url:ref.avatar,file_name:ref.file});
  expect(native[3].swipes).toEqual(['第一稿','第二稿']);expect(native[3].mes).toBe('第二稿');
  const personas=new NativePersonaLibrary(settings),png=await connection.blob('/img/user-default.png');
  const profile={id:'native-proof-profile',name:'人设原图实测',persona:{...blankPersona(),name:'人设测试',rawText:'保留完整原始人设\n下一行'},memo:'备忘录',remark:'备注',sourceSessionIds:[s.id],avatar:png,portrait:png,updatedAt:new Date().toISOString()};
  await personas.save(profile);await personas.saveDraft({...profile,id:'',name:'未完成草稿',persona:{...profile.persona,name:''}});
  const freshPersonas=new NativePersonaLibrary(new NativeSettings(connection)),state=await freshPersonas.readBackupState(),file=state.files.find(f=>f.id===profile.id)!;
  expect(file.persona).toEqual(profile.persona);expect(file.memo).toBe(profile.memo);expect(file.remark).toBe(profile.remark);expect(file.sourceSessionIds).toEqual([s.id]);
  expect(new Uint8Array(await file.avatar!.arrayBuffer())).toEqual(new Uint8Array(await png.arrayBuffer()));expect(state.draft!.persona.name).toBe('');
  await settings.reload();await repository.prepareCloudRecovery({...restored!,archive:{...restored!.archive,version:1}});
  const recovery=await repository.readCloudRecovery('workspace');expect(recovery!.sessions.find(v=>v.id===s.id)!.terminal).toEqual(s.terminal);expect(await repository.hasInterruptedRestore()).toBe(true);
  await repository.clearInterruptedRestore();
  const initialPreset=await presets.read(),name='原生预设实测-'+crypto.randomUUID(),id='proof_'+crypto.randomUUID().replaceAll('-','');
  const next={...initialPreset,id,name,preset:{...initialPreset.preset,openai_max_tokens:65536,proof_extension:{unknown:'preserved'}},presets:nativePresetList(initialPreset)};
  await presets.save(next,initialPreset);const added=await presets.read();expect(added.id).toBe(id);expect(added.preset.proof_extension).toEqual({unknown:'preserved'});expect(added.preset.openai_max_tokens).toBe(65536);
  await presets.save({...added,name:name+'重命名'},added);const renamed=await presets.read();expect(renamed.name).toBe(name+'重命名');expect(nativePresetList(renamed).some(p=>p.name===name)).toBe(false);
  await presets.save(null,renamed);const reset=await presets.read();expect(reset.name).toBe('Default');expect(nativePresetList(reset).some(p=>p.id===id)).toBe(true);
  await presets.save(initialPreset,reset);
},60000);

it.skipIf(!origin)('migrates old per-session cards to one native world without losing source JSONL, personas, terminal records or backup recovery',async()=>{
  const connection=api(),settings=new NativeSettings(connection),presets=new NativePresets(settings);
  const repository=new NativeWorkspaceRepository(settings,new NativeCredentials(settings),presets,async()=>{});
  await repository.read();
  const legacy=newSession('旧世界引用迁移',{name:'旧玩家',appearance:'完整外观',background:'完整背景',personality:'性格'},'旧开场');
  legacy.terminal=emptyTerminal();legacy.terminal.contacts=[{id:'contact-migration',name:'哥哥',present:false}];
  legacy.terminal.friends=[{id:'contact-migration',status:'accepted',reply:'保留好友',note:'自定义备注'}];
  const v:Variant={id:'migration-first',text:'旧第一稿',status:'incomplete',createdAt:new Date().toISOString()};
  legacy.turns=[{id:'migration-turn',input:'旧输入',selected:0,variants:[v]}];
  finishVariant(legacy,0,v,{event:'旧事实',terminal:{protocolVersion:2,groups:[],privateMessages:[{id:'contact-migration',text:'必须保留旧私聊',topic:'近况'}],friendRequests:[]}});
  applyTerminalBatch(legacy,v.outcome!.terminal!,0);
  legacy.turns[0].variants.push({...structuredClone(v),id:'migration-second',text:'旧第二稿'});legacy.turns[0].selected=1;
  legacy.draftInput='迁移前未发送';
  const rows=sessionNativeMessages({...legacy,draftInput:undefined});
  rows[0].chat_metadata.unrelated_extension={nested:['keep',1]};rows[3].swipe_info[0].extra.unrelated='keep-swipe';
  const oldAvatar=await connection.text('/api/characters/create',{ch_name:'旧会话',file_name:'legacy-proof-'+crypto.randomUUID(),description:'',first_mes:''});
  const oldRef={id:legacy.id,avatar:oldAvatar,file:'old-file-'+crypto.randomUUID()};
  await connection.post('/api/chats/save',{avatar_url:oldRef.avatar,file_name:oldRef.file,ch_name:'旧会话',chat:rows});
  await settings.update(scope=>{scope.chats=[...scope.chats!,oldRef];scope.inputDrafts={...scope.inputDrafts,[legacy.id]:legacy.draftInput!};});
  const freshSettings=new NativeSettings(connection),fresh=new NativeWorkspaceRepository(freshSettings,new NativeCredentials(freshSettings),new NativePresets(freshSettings),async()=>{});
  const before=(await fresh.read())!,rawBefore=JSON.parse((await connection.post('/api/settings/get',{})).settings);
  const cardCount=(await connection.post('/api/characters/all',{})).length;
  await fresh.write(before);
  const refs=freshSettings.current().chats!;expect(refs.every(ref=>ref.avatar===academyWorldAvatar)).toBe(true);
  const migrated=refs.find(ref=>ref.id===legacy.id)!;
  expect(await connection.post('/api/chats/get',{avatar_url:oldRef.avatar,file_name:oldRef.file})).toEqual(rows);
  expect(await connection.post('/api/chats/get',{avatar_url:migrated.avatar,file_name:migrated.file})).toEqual(rows);
  const recoveryPath=freshSettings.current().recovery!['native-world-migration'];
  const migrationRecovery=JSON.parse(await(await connection.blob(recoveryPath)).text());
  expect(migrationRecovery.settings).toEqual(rawBefore);expect(migrationRecovery.sources.find((source:any)=>source.reference.id===legacy.id).rows).toEqual(rows);
  const rawAfter=JSON.parse((await connection.post('/api/settings/get',{})).settings);
  const withoutIndex=(document:any)=>{document=structuredClone(document);for(const field of ['chats','revision','recovery'])delete document.extension_settings.stellar_academy[field];return document;};
  expect(withoutIndex(rawAfter)).toEqual(withoutIndex(rawBefore));
  const added=newSession('第二个新会话',{name:'新玩家',appearance:'',background:'',personality:''},'新开场');
  const saved={...before,sessions:[...before.sessions,added]};await fresh.write(saved);
  expect((await connection.post('/api/characters/all',{})).length).toBe(cardCount);
  expect(new Set(freshSettings.current().chats!.map(ref=>ref.avatar))).toEqual(new Set([academyWorldAvatar]));
  const local=parseBackup(backup(saved));expect(local.sessions.find(s=>s.id===legacy.id)).toEqual(before.sessions.find(s=>s.id===legacy.id));
  const cloud=parseCloudSave(createCloudSave(saved,saved.preferences)).snapshot;
  await fresh.prepareCloudRecovery(saved);const release=await fresh.lockRestore();
  try{await fresh.write(cloud,undefined,true);}finally{await release();}
  const recovery=await fresh.readCloudRecovery('workspace');expect(recovery!.sessions).toEqual(local.sessions);
  await fresh.write(recovery!);
  const reopenedSettings=new NativeSettings(connection),reopened=new NativeWorkspaceRepository(reopenedSettings,new NativeCredentials(reopenedSettings),new NativePresets(reopenedSettings),async()=>{});
  const reloaded=(await reopened.read())!;
  expect(reloaded.sessions.find(s=>s.id===legacy.id)).toEqual(before.sessions.find(s=>s.id===legacy.id));
  expect(reloaded.sessions.map(s=>s.id)).toEqual(saved.sessions.map(s=>s.id));
},60000);
