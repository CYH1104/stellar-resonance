import type { Repository, Snapshot } from '../domain/contracts';
import { backup, parseBackup } from '../domain/story';
import {cleanLocalApiCredentials,type LocalApiCredentials} from './apiCredentials';
import {accountDatabase} from './accountScope';
export class IndexedDbRepository implements Repository {
  private connection?: Promise<IDBDatabase>;
  private baseline?:string;
  private loaded=false;
  private restoreOwner?:string;
  constructor(private name = accountDatabase('stellar-resonance-v1')) {}
  private open(): Promise<IDBDatabase> {
    if(this.connection)return this.connection;
    let failed=false;
    const opening=new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
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
      const tx = db.transaction('workspace','readonly'); const request = tx.objectStore('workspace').get('snapshot');
      request.onsuccess = () => { try { const value=request.result?parseBackup(request.result):undefined;this.baseline=request.result;this.loaded=true;resolve(value); } catch(e) { reject(e); } };
      request.onerror = () => reject(new Error('本地存档读取失败'));
    });
  }
  async write(value: Snapshot,recoveryFor?:string,completeRestore=false): Promise<void> {
    const serialized = backup(value); parseBackup(serialized); const db = await this.open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('workspace','readwrite'),store=tx.objectStore('workspace');let stale=false;
      const owner=this.restoreOwner,current=store.get('snapshot'),lock=completeRestore&&owner?store.get('restore-lock'):undefined;let count=0;const commit=()=>{if(++count!==(lock?2:1))return;if(current.result!==this.baseline&&(this.loaded||current.result!==undefined)||lock&&(lock.result?.owner!==owner||lock.result.expires<=Date.now())){stale=true;tx.abort();return;}if(recoveryFor&&current.result)store.put(current.result,'cloud-recovery:'+recoveryFor);store.put(serialized,'snapshot');if(completeRestore)store.delete('restore-pending');};current.onsuccess=commit;if(lock)lock.onsuccess=commit;
      tx.oncomplete = () => {this.baseline=serialized;this.loaded=true;resolve();}; tx.onerror = tx.onabort = () => reject(new Error(stale?'存档已被其他页面修改，已停止覆盖保存；请导出当前草稿并刷新页面。':'本地保存失败，请导出备份并检查存储空间'));
    });
  }
  async prepareCloudRecovery(value:Snapshot):Promise<void>{
    const text=backup(value);parseBackup(text);const db=await this.open();
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace');let stale=false;const current=store.get('snapshot');current.onsuccess=()=>{if(current.result!==this.baseline){stale=true;tx.abort();return;}store.put(text,'cloud-recovery:workspace');store.put(true,'restore-pending');};tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error(stale?'存档已被其他页面修改，已停止恢复。':'恢复前备份保存失败，原数据未覆盖。'));});
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
    const safe=cleanLocalApiCredentials(value),db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put(safe,'api-credentials');
      tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(new Error('API Key 未能保存到本机，请检查浏览器存储空间。'));
    });
  }
}
