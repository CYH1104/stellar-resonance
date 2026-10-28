import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {effectScope} from 'vue';
import {cleanNativePresetConfig,editNativePreset,addNativePreset,type NativePresetConfig} from '../src/domain/nativePreset';
import {cleanBackupArchive} from '../src/domain/backupArchive';
import {backup,parseBackup,defaults,newSession} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {useWorkspace} from '../src/app/useWorkspace';
import {HttpGateway} from '../src/gateway/http';
import {IndexedDbRepository} from '../src/storage/repository';
import {accountDatabase} from '../src/storage/accountScope';
const raw=(temperature:number):NativePresetConfig=>({version:1,preset:{temperature,openai_max_tokens:2048,show_thoughts:true,prompts:[{identifier:'a',role:'system',content:'原始\n内容',enabled:true,injection_depth:2,injection_trigger:['normal'],future:{untouched:true}}],prompt_order:[{character_id:100001,order:[{identifier:'a',enabled:true}]}],extensions:{future:{keep:['one',2]}},proxy_password:''}});
let scope:ReturnType<typeof effectScope>|undefined;
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());const data=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});vi.stubGlobal('window',new EventTarget());vi.stubGlobal('__ACADEMY_ACCOUNT__',{id:'native-backup-'+crypto.randomUUID()});vi.spyOn(HttpGateway.prototype,'bootstrap').mockResolvedValue(undefined);});
afterEach(()=>{scope?.stop();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function workspace(){scope=effectScope();const w=scope.run(()=>useWorkspace())!;await vi.waitFor(()=>expect(w.loading.value).toBe(false));const s=newSession('原存档',{name:'合成人设',appearance:'',background:'',personality:''},'开场');w.sessions.value.push(s);w.sessionId.value=s.id;await w.save();return w;}
it('keeps raw extension/trigger/depth/order fields and updates actual native enable flags without rewriting original',()=>{
 const value=raw(0.2),next=editNativePreset(value,{temperature:0.8,prompts:[{identifier:'a',enabled:false,content:'修改'}]});
 expect(next.preset.prompt_order[0].order[0].enabled).toBe(false);expect(next.preset.prompts[0].injection_trigger).toEqual(['normal']);expect(next.preset.prompts[0].injection_depth).toBe(2);expect(next.preset.extensions).toEqual(value.preset.extensions);expect(value.preset.prompts[0].content).toBe('原始\n内容');expect(next.preset.show_thoughts).toBe(true);
});
it('rejects unknown envelope versions/fields, ambiguous identifiers, unsafe keys and credential-bearing presets',()=>{
 expect(()=>cleanBackupArchive({version:1,nativePreset:{...raw(0.2),version:2}})).toThrow();expect(()=>cleanNativePresetConfig({...raw(0.2),future:true})).toThrow();
 const duplicate=raw(0.2);duplicate.preset.prompts.push({...duplicate.preset.prompts[0]});expect(()=>cleanNativePresetConfig(duplicate)).toThrow();
 for(const item of [{api_key:'SYNTHETIC_KEY'},{custom_include_headers:'Authorization: synthetic'},{extensions:{apiKey:'synthetic'}}])expect(()=>cleanNativePresetConfig({version:1,preset:{...raw(0.2).preset,...item}})).toThrow('凭据');
 expect(()=>cleanNativePresetConfig(JSON.parse('{"version":1,"preset":{"__proto__":{}}}'))).toThrow();
});
it('uses one persisted archive for local download, cloud upload, overwrite and complete pre-overwrite recovery',async()=>{
 const w=await workspace(),a=raw(0.2),b=raw(0.8);await w.saveNativePreset(a);
 const repo=new IndexedDbRepository();expect((await repo.read())!.archive!.nativePreset).toEqual(a);
 const local=backup({version:1,sessions:w.sessions.value,preferences:w.preferences,archive:{version:1,nativePreset:a}});expect(parseBackup(local).archive!.nativePreset).toEqual(a);
 const cloud=await w.createCloudWorkspaceBackup();expect(parseCloudSave(cloud).snapshot.archive!.nativePreset).toEqual(a);
 await w.saveNativePreset(b);await w.restoreCloudSave(cloud);expect(w.nativePreset.value).toEqual(a);
 expect((await new IndexedDbRepository().readCloudRecovery('workspace'))!.archive!.nativePreset).toEqual(b);
 await w.undoCloudRestore();expect(w.nativePreset.value).toEqual(b);expect((await new IndexedDbRepository().read())!.archive!.nativePreset).toEqual(b);
});
it('old files preserve existing native data, append import retains current config, replacement applies incoming config',async()=>{
 const w=await workspace(),a=raw(0.2),b=raw(0.8);await w.saveNativePreset(a);const s=newSession('导入档',{name:'合成',appearance:'',background:'',personality:''},'');
 expect(await w.importBackup(backup({version:1,sessions:[s],preferences:defaults()}),true)).toBe(true);expect(w.nativePreset.value).toEqual(a);
 const incoming=backup({version:1,sessions:[s],preferences:defaults(),archive:{version:1,nativePreset:b}});
 expect(await w.importBackup(incoming)).toBe(true);expect(w.nativePreset.value).toEqual(a);
 expect(await w.importBackup(incoming,true)).toBe(true);expect(w.nativePreset.value).toEqual(b);
 const invalid=JSON.parse(incoming);invalid.archive.nativePreset.version=2;expect(await w.importBackup(JSON.stringify(invalid),true)).toBe(false);expect(w.nativePreset.value).toEqual(b);
});
it('failed workspace restore cannot activate incoming native config and preserves the full recovery copy',async()=>{
 const w=await workspace(),a=raw(0.2),b=raw(0.8);await w.saveNativePreset(b);const s=newSession('FAIL_NATIVE_RESTORE',{name:'合成',appearance:'',background:'',personality:''},'');
 const incoming=createCloudSave({version:1,sessions:[s],preferences:defaults(),archive:{version:1,nativePreset:a}},defaults());
 const original=IndexedDbRepository.prototype.write;vi.spyOn(IndexedDbRepository.prototype,'write').mockImplementation(async function(this:IndexedDbRepository,value,...args){if(value.sessions.some(s=>s.name==='FAIL_NATIVE_RESTORE'))throw Error('synthetic-write-failure');return original.call(this,value,...args);});
 await expect(w.restoreCloudSave(incoming)).rejects.toThrow('synthetic-write-failure');expect(w.nativePreset.value).toEqual(b);expect(w.sessions.value[0].name).toBe('原存档');expect((await new IndexedDbRepository().readCloudRecovery('workspace'))!.archive!.nativePreset).toEqual(b);
});
it('native saves respect the existing restore lease and reject stale pages without overwriting',async()=>{
 const w=await workspace(),a=raw(0.2),b=raw(0.8),other=new IndexedDbRepository();await other.read();const unlock=await other.lockRestore();
 try{await expect(w.saveNativePreset(a)).rejects.toThrow('其他页面');expect(w.nativePreset.value).toBeUndefined();}finally{await unlock();}
 await w.saveNativePreset(a);await expect(other.writeNativePreset(b,undefined,defaults())).rejects.toThrow('其他页面');expect((await new IndexedDbRepository().read())!.archive!.nativePreset).toEqual(a);
});
it('HTTP requests contain a saved native snapshot while ordinary deployments retain the existing request shape',async()=>{
 const config=raw(0.2),calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({items:['ok']}),{headers:{'Content-Type':'application/json'}});}));
 const gateway=new HttpGateway(()=>config);gateway.capabilities.native=true;await gateway.utility('summary',['synthetic'],defaults().profiles[0],'not-backed-up',new AbortController().signal);expect(calls[0].nativePreset).toEqual(config);
 gateway.capabilities.native=false;await gateway.utility('summary',['synthetic'],defaults().profiles[0],'not-backed-up',new AbortController().signal);expect(calls[1].nativePreset).toBeUndefined();
});
it('blocks credential-bearing complete and incomplete native drafts on every archive path',()=>{
 for(const text of ['{"api_key":"synthetic"}', '{"Authorization":"Bearer synthetic', '{"custom_include_headers":"synthetic"}', '{"\\u0061pi_key":"synthetic"}']){
  const archive={version:1 as const,editorDrafts:{'preset:native-runtime':text}};
  expect(()=>cleanBackupArchive(archive)).toThrow('凭据');
  expect(()=>backup({version:1,sessions:[],preferences:defaults(),archive})).toThrow('凭据');
  expect(()=>createCloudSave({version:1,sessions:[],preferences:defaults(),archive},defaults())).toThrow('凭据');
 }
 expect(cleanBackupArchive({version:1,editorDrafts:{'preset:native-runtime':'{"proxy_password":"","prompts":['}}).editorDrafts).toBeDefined();
});
it('restores a complete preset library and its task bindings atomically, including the pre-overwrite copy',async()=>{
 const w=await workspace(),a=cleanNativePresetConfig({...addNativePreset(raw(.2),raw(.8).preset,'手机','phone'),taskPresets:{story:'default',terminal:'phone'}});await w.saveNativePreset(a);const cloud=await w.createCloudWorkspaceBackup();
 const b=addNativePreset(a,raw(.6).preset,'新副本','extra');await w.saveNativePreset(b);await w.restoreCloudSave(cloud);expect(w.nativePreset.value).toEqual(a);expect((await new IndexedDbRepository().readCloudRecovery('workspace'))!.archive!.nativePreset).toEqual(b);await w.undoCloudRestore();expect(w.nativePreset.value).toEqual(b);expect((await new IndexedDbRepository().read())!.archive!.nativePreset).toEqual(b);
});
it('boots an unsafe legacy root, preserves a newer safe editor draft and resumes initial native migration after explicit cleanup',async()=>{
 const repo=new IndexedDbRepository(),value={version:1 as const,sessions:[newSession('旧人设保留',{name:'旧人设',appearance:'',background:'',personality:''},'')],preferences:defaults(),archive:{version:1 as const,editorDrafts:{'preset:ordinary':'普通草稿'}}};await repo.read();await repo.write(value);const safeDraft=JSON.stringify(raw(.4).preset);await repo.writeEditorDraft('preset:native-runtime',safeDraft);
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(accountDatabase('stellar-resonance-v1'),2);q.onsuccess=()=>resolve(q.result);q.onerror=reject;});await new Promise<void>((resolve,reject)=>{const t=db.transaction('records','readwrite'),store=t.objectStore('records'),q=store.get('["workspace"]');q.onsuccess=()=>{const root=JSON.parse(q.result);root.archive.editorDrafts['preset:native-runtime']='{"api_key":"SYNTHETIC_OLD_KEY"}';store.put(JSON.stringify(root),'["workspace"]');};t.oncomplete=()=>resolve();t.onerror=reject;});db.close();
 scope=effectScope();const w=scope.run(()=>useWorkspace())!;await vi.waitFor(()=>expect(w.loading.value).toBe(false));expect(w.unsafeNativeDrafts.value).toBe(true);expect(w.sessions.value[0].persona.name).toBe('旧人设');await expect(w.createCloudWorkspaceBackup()).rejects.toThrow('清理旧预设草稿');w.nativeDefaultPreset.value=raw(.3);await w.clearUnsafeNativeDrafts();expect(w.unsafeNativeDrafts.value).toBe(false);expect(w.nativePreset.value).toEqual(raw(.3));expect(await w.readEditorDraft('preset:native-runtime')).toBe(safeDraft);expect(await w.readEditorDraft('preset:ordinary')).toBe('普通草稿');expect((await w.createCloudWorkspaceBackup())).not.toContain('SYNTHETIC_OLD_KEY');
});
