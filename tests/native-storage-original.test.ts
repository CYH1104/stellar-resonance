import {it,expect} from 'vitest';
import {sessionNativeApi} from '../src/native/api';
import {NativeSettings} from '../src/native/settings';
import {NativePresets} from '../src/native/presets';
import {NativeCredentials} from '../src/native/credentials';
import {NativeWorkspaceRepository} from '../src/native/repository';
import {NativePersonaLibrary} from '../src/native/personas';
import {newSession,defaults,finishVariant} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {applyTerminalBatch} from '../src/domain/terminalMain';
import {blankPersona} from '../src/domain/persona';
import type {Variant} from '../src/domain/contracts';
import {nativePresetList} from '../src/domain/nativePreset';

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
it.skipIf(!origin)('rolls back native files when a later file in the same settings transaction is rejected',async()=>{
  const client=api(),before=await client.post('/api/settings/get',{}),document=JSON.parse(before.settings),name='rollback_'+crypto.randomUUID();
  const presetName=before.openai_setting_names[0],preset=JSON.parse(before.openai_settings[0]);
  await expect(client.post('/api/plugins/academy-compat/settings/save',{expected:JSON.stringify(document),document,nativeFiles:[
    {family:'presets',name:presetName,before:preset,after:{...preset,proof_transaction:true}},
    {family:'worldinfo',name,after:{invalid_worldbook:true}},
  ]})).rejects.toThrow();
  const after=await client.post('/api/settings/get',{});
  expect(JSON.parse(after.settings)).toEqual(document);expect(after.openai_settings[after.openai_setting_names.indexOf(presetName)]).toEqual(before.openai_settings[0]);expect(after.world_names).not.toContain(name);
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
