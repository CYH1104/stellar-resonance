import type {Preferences,Session,Snapshot} from '../domain/contracts';
import type {BackupArchive} from '../domain/backupArchive';
import {backup,parseBackup,defaults} from '../domain/story';
import {localEditorDrafts,nativeDraftKey} from '../storage/localDraftCompatibility';
import {cleanEditorDrafts} from '../domain/backupArchive';
import type {LocalApiCredentials} from '../storage/apiCredentials';
import type {NativePresetConfig} from '../domain/nativePreset';
import {NativeSettings,type NativeChatReference} from './settings';
import {NativeCredentials} from './credentials';
import {sessionNativeMessages,nativeMessagesSession,type NativeChatRow} from './academyMessages';
import {uploadNativeBlob} from './api';

export interface NativePresetFiles {
  read():Promise<NativePresetConfig>;
  save(value:NativePresetConfig|null,expected:NativePresetConfig|null|undefined):Promise<void>;
}
// Session/preferences are JSON data; accept the existing Vue reactive view too.
const clone=<T>(value:T):T=>value===undefined?value:JSON.parse(JSON.stringify(value));
export class NativeWorkspaceRepository {
  private snapshot?:Snapshot;
  private documents=new Map<string,NativeChatRow[]>();
  private tail:Promise<unknown>=Promise.resolve();
  private unsafe=false;private restoreOwner?:string;
  constructor(readonly settings:NativeSettings,private credentials:NativeCredentials,private presets:NativePresetFiles,private applyArchive:(value:BackupArchive)=>Promise<unknown>){}
  hasUnsafeNativeDrafts(){return this.unsafe;}
  session(id:string){const value=this.snapshot?.sessions.find(s=>s.id===id);if(!value)throw Error('本次任务的原生存档未找到。');return clone(value);}
  private queue<T>(action:()=>Promise<T>):Promise<T>{const result=this.tail.then(action);this.tail=result;return result;}
  private refs(){const refs=this.settings.current().chats||[];const ids=new Set();for(const ref of refs){if(!ref||typeof ref.id!=='string'||ids.has(ref.id)||typeof ref.avatar!=='string'||!ref.avatar.endsWith('.png')||/[\\/]/.test(ref.avatar)||typeof ref.file!=='string'||!ref.file||/[\\/]/.test(ref.file))throw Error('原生存档索引无法识别，原资料保留。');ids.add(ref.id);}return clone(refs);}
  private async document(ref:NativeChatReference){const rows=await this.settings.api.post('/api/chats/get',{avatar_url:ref.avatar,file_name:ref.file});if(!Array.isArray(rows)||!rows.length)throw Error('原生聊天文件未找到，已停止覆盖；请检查存档。');if(nativeMessagesSession(rows).id!==ref.id)throw Error('原生聊天与存档关联不符。');return rows as NativeChatRow[];}
  private async saveDocument(ref:NativeChatReference,rows:NativeChatRow[],name:string){
    const result=await this.settings.api.post('/api/chats/save',{avatar_url:ref.avatar,file_name:ref.file,ch_name:name,chat:rows});
    if(result?.ok!==true)throw Error('原生聊天未确认保存，当前内容保留。');
    const saved=await this.document(ref);if(JSON.stringify(saved)!==JSON.stringify(rows))throw Error('原生聊天保存结果不一致，已停止后续操作。');
    this.documents.set(ref.id,saved);
  }
  private async createReference(session:Session){
    const id=crypto.randomUUID();
    const avatar=await this.settings.api.text('/api/characters/create',{ch_name:session.name||'学院会话',file_name:'academy-'+id,description:'',first_mes:session.opening});
    if(!avatar||!avatar.endsWith('.png')||/[\\/]/.test(avatar))throw Error('原生角色关联未创建，当前存档保留在页面。');
    return {id:session.id,avatar,file:'academy-'+id};
  }
  async read():Promise<Snapshot|undefined>{
    const scope=await this.settings.load(),sessions:Session[]=[];
    this.documents.clear();
    for(const ref of this.refs()){const rows=await this.document(ref),session=nativeMessagesSession(rows);if(scope.inputDrafts?.[session.id]!==undefined)session.draftInput=scope.inputDrafts[session.id];sessions.push(session);this.documents.set(ref.id,rows);}
    const preferences=clone(scope.preferences||defaults());preferences.mode='server';
    const drafts=localEditorDrafts(scope.editorDrafts||{});this.unsafe=drafts.blocked;
    const archive:BackupArchive={version:1,nativePreset:await this.presets.read()};
    if(Object.keys(drafts.safe).length)archive.editorDrafts=drafts.safe;
    this.snapshot=parseBackup(backup({version:1,sessions,preferences,archive}));
    return clone(this.snapshot);
  }
  private requireWritable(){if(!this.snapshot)throw Error('原生存档尚未载入。');if(this.unsafe)throw Error('旧预设草稿无法安全保存，请先清理草稿；原资料保留。');const state=this.settings.current();if(state.restorePending&&!this.restoreOwner)throw Error('上次恢复尚未完成，已停止普通覆盖。');if(state.restoreLock&&state.restoreLock.expires>Date.now()&&state.restoreLock.owner!==this.restoreOwner)throw Error('其他页面正在恢复资料，请稍后重新载入。');}
  async write(value:Snapshot,recoveryFor?:string,completeRestore=false):Promise<void>{return this.queue(()=>this.writeSnapshot(value,recoveryFor,completeRestore));}
  private async writeSnapshot(value:Snapshot,recoveryFor?:string,completeRestore=false):Promise<void>{
    this.requireWritable();const safe=parseBackup(backup(value));await this.settings.assertCurrent();
    const before=this.refs(),current=new Map<string,NativeChatRow[]>();
    // Validate all loaded files before writing any, so stale pages do not start overwriting.
    for(const ref of before){const rows=await this.document(ref),known=this.documents.get(ref.id);if(known&&JSON.stringify(rows)!==JSON.stringify(known))throw Error('原生聊天已在其他页面修改，已停止保存。');current.set(ref.id,rows);}
    if(recoveryFor)await this.saveRecovery(this.snapshot!,recoveryFor,false);
    if(safe.archive?.nativePreset!==undefined)await this.presets.save(safe.archive.nativePreset,this.snapshot?.archive?.nativePreset);
    if(safe.archive&&Object.keys(safe.archive).some(key=>!['version','nativePreset','editorDrafts','newGameDraft','nativeWorldInfoVersion','terminalTaskVersion','terminalContextVersion'].includes(key)))await this.applyArchive(safe.archive);
    const next:NativeChatReference[]=[];
    for(const session of safe.sessions){
      let ref=before.find(ref=>ref.id===session.id);if(!ref)ref=await this.createReference(session);
      const clean=clone(session);delete clean.draftInput;
      const rows=sessionNativeMessages(clean,current.get(session.id));
      if(JSON.stringify(rows)!==JSON.stringify(current.get(session.id)))await this.saveDocument(ref,rows,session.name);
      next.push(ref);
    }
    await this.settings.update(scope=>{
      if(completeRestore&&(!this.restoreOwner||scope.restoreLock?.owner!==this.restoreOwner||scope.restoreLock.expires<=Date.now()))throw Error('原生恢复锁已失效，已停止覆盖。');
      scope.preferences=clone(safe.preferences);scope.chats=next;
      scope.inputDrafts=Object.fromEntries(safe.sessions.filter(s=>s.draftInput!==undefined).map(s=>[s.id,s.draftInput!]));
      if(safe.archive?.editorDrafts!==undefined)scope.editorDrafts={...safe.archive.editorDrafts,...(scope.editorDrafts?.['new-game']?{'new-game':scope.editorDrafts['new-game']}:{})};
      if(safe.archive?.newGameDraft)scope.editorDrafts={...scope.editorDrafts,'new-game':JSON.stringify(safe.archive.newGameDraft)};
      if(completeRestore)scope.restorePending=false;
    });
    for(const ref of before)if(!next.some(value=>value.id===ref.id)){
      await this.settings.api.post('/api/chats/delete',{avatar_url:ref.avatar,chatfile:ref.file+'.jsonl'});this.documents.delete(ref.id);
    }
    this.snapshot=clone({...safe,...(safe.archive===undefined&&this.snapshot?.archive?{archive:this.snapshot.archive}:{})});
  }
  async writeInputDraft(sessionId:string,text:string){return this.queue(async()=>{this.requireWritable();if(typeof text!=='string'||text.length>16000||!this.snapshot!.sessions.some(s=>s.id===sessionId))throw Error('输入草稿关联不正确。');await this.settings.update(scope=>{scope.inputDrafts={...scope.inputDrafts,[sessionId]:text};});this.snapshot!.sessions.find(s=>s.id===sessionId)!.draftInput=text;});}
  async readEditorDrafts(){const result=localEditorDrafts(this.settings.current().editorDrafts||{});this.unsafe=result.blocked;return clone(result.safe);}
  async writeEditorDraft(key:string,text:string|null){return this.queue(async()=>{
    if(!this.snapshot)throw Error('原生存档尚未载入。');cleanEditorDrafts({[key]:text??''});
    if(this.unsafe&&key!==nativeDraftKey)throw Error('请先清理无法校验的原生预设草稿。');
    await this.settings.update(scope=>{scope.editorDrafts={...scope.editorDrafts};if(text===null)delete scope.editorDrafts[key];else scope.editorDrafts[key]=text;});
    this.unsafe=localEditorDrafts(this.settings.current().editorDrafts||{}).blocked;
  });}
  async writeNativePreset(value:NativePresetConfig|null,expected:NativePresetConfig|null|undefined,preferences:Preferences){return this.queue(async()=>{this.requireWritable();await this.presets.save(value,expected);await this.settings.update(scope=>{scope.preferences=clone(preferences);});this.snapshot!.preferences=clone(preferences);this.snapshot!.archive={...this.snapshot!.archive,version:1,nativePreset:value};});}
  async writeConfiguration(preferences:Preferences,credentials:LocalApiCredentials,bindings:{id:string;ids:string[];before?:string[]}[]=[]){return this.queue(async()=>{
    const value=clone(this.snapshot!);if(!value)throw Error('原生存档尚未载入。');value.preferences=clone(preferences);
    for(const binding of bindings){const session=value.sessions.find(s=>s.id===binding.id);if(!session||JSON.stringify(session.worldbookIds||[])!==JSON.stringify(binding.before||[]))throw Error('世界书绑定已改变，请重新编辑。');session.worldbookIds=[...binding.ids];}
    await this.writeSnapshot(value);await this.credentials.write(credentials);
  });}
  async writeTerminalSession(session:Session){return this.queue(async()=>{const value=clone(this.snapshot!);if(!value)throw Error('原生存档尚未载入。');const target=value.sessions.find(s=>s.id===session.id);if(!target)throw Error('终端存档不存在。');target.terminal=clone(session.terminal);target.updatedAt=session.updatedAt;await this.writeSnapshot(value);});}
  private async saveRecovery(value:Snapshot,id:string,pending:boolean){const text=backup(value);parseBackup(text);const path=await uploadNativeBlob(this.settings.api,new Blob([text],{type:'application/json'}),'academy-recovery-'+crypto.randomUUID()+'.json');await this.settings.update(scope=>{scope.recovery={...scope.recovery,[id]:path};if(pending)scope.restorePending=true;});}
  async prepareCloudRecovery(value:Snapshot){return this.queue(async()=>{await this.settings.assertCurrent();await this.saveRecovery(value,'workspace',true);});}
  async readCloudRecovery(id:string):Promise<Snapshot|undefined>{const path=this.settings.current().recovery?.[id];if(!path)return;return parseBackup(await(await this.settings.api.blob(path)).text());}
  async hasInterruptedRestore(){return this.settings.current().restorePending===true;}
  async clearInterruptedRestore(){await this.settings.update(scope=>{scope.restorePending=false;});}
  async lockRestore():Promise<()=>Promise<void>>{
    const owner=crypto.randomUUID();
    const lease=async(release=false)=>{await this.settings.update(scope=>{if(release){if(scope.restoreLock?.owner===owner)delete scope.restoreLock;return;}if(scope.restoreLock&&scope.restoreLock.owner!==owner&&scope.restoreLock.expires>Date.now())throw Error('另一页面正在恢复原生资料。');scope.restoreLock={owner,expires:Date.now()+120000};});};
    await lease();this.restoreOwner=owner;const timer=setInterval(()=>{void lease().catch(()=>{});},15000);
    return async()=>{clearInterval(timer);if(this.restoreOwner===owner)this.restoreOwner=undefined;await lease(true);};
  }
  async readApiCredentials(){return this.credentials.read();}
  async writeApiCredentials(value:LocalApiCredentials){await this.credentials.write(value);}
  async exportApiCredentials(value:LocalApiCredentials){return this.credentials.exportKeys(value);}
}
