import type { Repository, Snapshot } from '../domain/contracts';
import { backup, parseBackup } from '../domain/story';
import {cleanLocalApiCredentials,type LocalApiCredentials} from './apiCredentials';
import {accountDatabase} from './accountScope';
import {snapshotRows,rowsSnapshot,validateRowKeys,rowKey,rowValue,terminalRows,type SnapshotRows,recordFormat} from './recordSnapshot';
import {validateTerminal} from '../domain/personalTerminal';
import {isTerminalMemoryNote} from '../domain/terminalLedger';
import {cleanEditorDrafts} from '../domain/backupArchive';
export class IndexedDbRepository implements Repository {
  private connection?: Promise<IDBDatabase>;
  private loaded=false;
  private restoreOwner?:string;
  private revision?:number;
  private rows:SnapshotRows=new Map();
  constructor(private name = accountDatabase('stellar-resonance-v1')) {}
  private open(): Promise<IDBDatabase> {
    if(this.connection)return this.connection;
    let failed=false;
    const opening=new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 2);
      request.onupgradeneeded = () => {
        const tx=request.transaction!;if(failed){tx.abort();return;}
        const db=request.result;if(!db.objectStoreNames.contains('workspace'))db.createObjectStore('workspace');
        if(!db.objectStoreNames.contains('records'))db.createObjectStore('records');
        const workspace=tx.objectStore('workspace'),records=tx.objectStore('records'),old=workspace.get('snapshot');
        old.onsuccess=()=>{try{
          const value=old.result?parseBackup(old.result):undefined;
          if(value){const rows=snapshotRows(value);validateRowKeys(rows);for(const [key,text]of rows)records.put(text,key);workspace.put(old.result,'legacy-snapshot-before-records');const editors={...(value.archive?.editorDrafts||{}),...(value.archive?.newGameDraft?{'new-game':JSON.stringify(value.archive.newGameDraft)}:{})};if(Object.keys(editors).length)workspace.put(cleanEditorDrafts(editors),'editor-drafts');}
          workspace.put({format:recordFormat,revision:0,initialized:!!value},'record-state');
        }catch{tx.abort();}};
      };
      request.onerror = () => {failed=true;reject(new Error('无法打开本地存档，请检查浏览器存储权限'));};
      request.onblocked = () => {failed=true;reject(new Error('请关闭旧版本网页后重试'));};
      request.onsuccess = () => { const db = request.result;if(failed){db.close();return;} db.onversionchange = () => { db.close(); this.connection=undefined; }; resolve(db); };
    });
    this.connection=opening;
    void opening.catch(()=>{if(this.connection===opening)this.connection=undefined;});
    return opening;
  }
  async read(): Promise<Snapshot | undefined> {
    const db = await this.open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(['workspace','records'],'readonly'),state=tx.objectStore('workspace').get('record-state'),keys=tx.objectStore('records').getAllKeys(),values=tx.objectStore('records').getAll();
      tx.oncomplete=()=>{try{if(state.result?.format!==recordFormat||!Number.isSafeInteger(state.result.revision))throw Error('存档记录版本不兼容');const rows=new Map(keys.result.map((key,i)=>[String(key),values.result[i] as string]));validateRowKeys(rows);const raw=rowsSnapshot(rows),value=raw?parseBackup(backup(raw)):undefined;this.rows=rows;this.revision=state.result.revision;this.loaded=true;resolve(value);}catch(e){reject(e);}};
      tx.onerror=tx.onabort=()=>reject(new Error('本地存档读取失败'));
    });
  }
  async write(value: Snapshot,recoveryFor?:string,completeRestore=false): Promise<void> {
    const safe=parseBackup(backup(value)),rows=snapshotRows(safe);await this.commitRows(rows,true,{recoveryFor,completeRestore,editorDrafts:safe.archive?.editorDrafts,...(safe.archive?.newGameDraft?{newGameDraft:JSON.stringify(safe.archive.newGameDraft)}:{})});
  }
  private async commitRows(next:SnapshotRows,replace=false,options:{recoveryFor?:string;completeRestore?:boolean;credentials?:LocalApiCredentials;editorChange?:{key:string;text:string|null};editorDrafts?:Record<string,string>;newGameDraft?:string}={}){
    const db=await this.open(),oldRows=this.rows;
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(['workspace','records'],'readwrite'),workspace=tx.objectStore('workspace'),records=tx.objectStore('records'),state=workspace.get('record-state'),lock=workspace.get('restore-lock'),pending=workspace.get('restore-pending'),editors=options.editorChange||options.editorDrafts||options.newGameDraft?workspace.get('editor-drafts'):undefined;let done=0,reason='',revision=0;
      const commit=()=>{if(++done!==(editors?4:3))return;try{const meta=state.result,owner=this.restoreOwner;
        if(meta?.format!==recordFormat){reason='存档记录版本不兼容';tx.abort();return;}
        if((this.loaded?meta.revision!==this.revision:meta.initialized)||lock.result?.expires>Date.now()&&lock.result.owner!==owner||pending.result&&!owner){reason='存档已被其他页面修改或正在恢复，已停止覆盖保存；请导出当前草稿并刷新页面。';tx.abort();return;}
        if(options.completeRestore&&(!owner||lock.result?.owner!==owner||lock.result.expires<=Date.now())){reason='恢复锁已失效，原数据未覆盖。';tx.abort();return;}
        if(options.recoveryFor){const prior=rowsSnapshot(oldRows);if(prior)workspace.put(backup(prior),'cloud-recovery:'+options.recoveryFor);}
        for(const [key,text]of next)if(oldRows.get(key)!==text)records.put(text,key);
        if(replace)for(const key of oldRows.keys())if(!next.has(key))records.delete(key);
        revision=meta.revision+1;workspace.put({format:recordFormat,revision,initialized:next.has(rowKey('workspace'))||oldRows.has(rowKey('workspace'))||!!options.credentials||!!options.editorChange},'record-state');
        if(options.credentials)workspace.put(options.credentials,'api-credentials');
        if(editors){const old=cleanEditorDrafts(editors.result||{}),drafts:Record<string,string>=options.editorDrafts?{...options.editorDrafts,...(old['new-game']?{'new-game':old['new-game']}:{})}:{...old};if(options.newGameDraft!==undefined)drafts['new-game']=options.newGameDraft;if(options.editorChange){if(options.editorChange.text===null)delete drafts[options.editorChange.key];else drafts[options.editorChange.key]=options.editorChange.text;}workspace.put(cleanEditorDrafts(drafts),'editor-drafts');}
        if(options.completeRestore)workspace.delete('restore-pending');
        }catch(e){reason=e instanceof Error?e.message:'本地写入失败';tx.abort();}
      };state.onsuccess=lock.onsuccess=pending.onsuccess=commit;if(editors)editors.onsuccess=commit;
      tx.oncomplete=()=>{this.rows=replace?new Map(next):next.size?new Map([...oldRows,...next]):oldRows;this.revision=revision;this.loaded=true;resolve();};tx.onerror=tx.onabort=()=>reject(Error(reason||'本地保存失败，请导出备份并检查存储空间'));
    });
  }
  async writeInputDraft(sessionId:string,text:string){if(typeof text!=='string'||text.length>16000)throw Error('输入草稿不正确');const key=rowKey('session',sessionId),row=rowValue(this.rows,key);row.value.draftInput=text;await this.commitRows(new Map([[key,JSON.stringify(row)]]));}
  async readEditorDrafts():Promise<Record<string,string>>{const db=await this.open();return new Promise((resolve,reject)=>{const q=db.transaction('workspace').objectStore('workspace').get('editor-drafts');q.onsuccess=()=>{try{resolve(cleanEditorDrafts(q.result||{}));}catch(e){reject(e);}};q.onerror=()=>reject(Error('编辑草稿读取失败'));});}
  async writeEditorDraft(key:string,text:string|null){cleanEditorDrafts({[key]:text??''});await this.commitRows(new Map(),false,{editorChange:{key,text}});}
  async writeConfiguration(preferences:Snapshot['preferences'],credentials:LocalApiCredentials,bindings:{id:string;ids:string[];before?:string[]}[]=[]){const safe=parseBackup(backup({version:1,sessions:[],preferences})).preferences;const rows=this.rows.has(rowKey('workspace'))?new Map([[rowKey('preferences'),JSON.stringify(safe)]]):snapshotRows({version:1,sessions:[],preferences:safe});for(const binding of bindings){const key=rowKey('session',binding.id),row=rowValue(this.rows,key);if(JSON.stringify(row.value.worldbookIds||[])!==JSON.stringify(binding.before||[]))throw Error('世界书绑定已改变，请重新编辑');if(!binding.ids.every(id=>(safe.worldbooks||[]).some(b=>b.id===id)))throw Error('世界书绑定无效');row.value.worldbookIds=binding.ids;rows.set(key,JSON.stringify(row));}await this.commitRows(rows,false,{credentials:cleanLocalApiCredentials(credentials)});}
  async writeTerminalSession(session:import('../domain/contracts').Session){
    if(!session.terminal)return;validateTerminal(session.terminal);
    const next=new Map(this.rows),key=rowKey('session',session.id),header=rowValue(next,key),fragments=terminalRows(session.terminal,session.id);
    const types=new Set(['terminal','conversation','message','room','round','divination']);for(const record of next.keys()){const [type,sid]=JSON.parse(record);if(sid===session.id&&types.has(type))next.delete(record);}
    for(const [key,value]of fragments)next.set(key,value);header.terminal=true;
    const notes=session.memories.filter(isTerminalMemoryNote),kept=header.memories.filter((id:string)=>{const old=rowValue(next,id);if(isTerminalMemoryNote(old)){next.delete(id);return false;}return true;});
    header.memories=[...kept,...notes.map(m=>{const id=rowKey('memory',session.id,m.id);next.set(id,JSON.stringify(m));return id;})];next.set(key,JSON.stringify(header));await this.commitRows(next,true);
  }
  async prepareCloudRecovery(value:Snapshot):Promise<void>{
    const text=backup(value);parseBackup(text);const db=await this.open();
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace');let stale=false;const current=store.get('record-state');current.onsuccess=()=>{if(current.result?.revision!==this.revision){stale=true;tx.abort();return;}store.put(text,'cloud-recovery:workspace');store.put(true,'restore-pending');};tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error(stale?'存档已被其他页面修改，已停止恢复。':'恢复前备份保存失败，原数据未覆盖。'));});
  }
  async lockRestore():Promise<()=>Promise<void>>{
    const db=await this.open(),owner=crypto.randomUUID();
    const lease=(release=false)=>new Promise<void>((resolve,reject)=>{const t=db.transaction('workspace','readwrite'),store=t.objectStore('workspace'),q=store.get('restore-lock');let blocked=false;q.onsuccess=()=>{const old=q.result;if(release){if(old?.owner===owner)store.delete('restore-lock');return;}if(old&&old.owner!==owner&&old.expires>Date.now()){blocked=true;t.abort();return;}store.put({owner,expires:Date.now()+120000},'restore-lock');};t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(Error(blocked?'另一页面正在恢复备份，请等待完成后再试。':'恢复锁写入失败，请重试。'));});
    await lease();this.restoreOwner=owner;const timer=setInterval(()=>{void lease().catch(()=>{});},15000);
    return async()=>{clearInterval(timer);if(this.restoreOwner===owner)this.restoreOwner=undefined;await lease(true);};
  }
  async hasInterruptedRestore():Promise<boolean>{if(typeof indexedDB==='undefined')return false;const db=await this.open();return new Promise((resolve,reject)=>{const q=db.transaction('workspace').objectStore('workspace').get('restore-pending');q.onsuccess=()=>resolve(q.result===true);q.onerror=()=>reject(Error('恢复状态读取失败'));});}
  async clearInterruptedRestore():Promise<void>{const db=await this.open();await new Promise<void>((resolve,reject)=>{const t=db.transaction('workspace','readwrite');t.objectStore('workspace').delete('restore-pending');t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(Error('恢复状态保存失败'));});}
  async readCloudRecovery(id:string):Promise<Snapshot|undefined>{
    const db=await this.open();return new Promise((resolve,reject)=>{const request=db.transaction('workspace','readonly').objectStore('workspace').get('cloud-recovery:'+id);request.onsuccess=()=>{try{resolve(request.result?parseBackup(request.result):undefined);}catch(e){reject(e);}};request.onerror=()=>reject(Error('无法读取覆盖前备份。'));});
  }
  async readApiCredentials():Promise<LocalApiCredentials|undefined>{
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction('workspace','readonly').objectStore('workspace').get('api-credentials');
      request.onsuccess=()=>{try{resolve(request.result?cleanLocalApiCredentials(request.result):undefined);}catch(e){reject(e);}};
      request.onerror=()=>reject(new Error('本机 API 凭据读取失败'));
    });
  }
  async writeApiCredentials(value:LocalApiCredentials):Promise<void>{
    await this.commitRows(new Map(),false,{credentials:cleanLocalApiCredentials(value)});
  }
}
