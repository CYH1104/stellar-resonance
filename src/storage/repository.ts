import type { Repository, Snapshot } from '../domain/contracts';
import { backup, parseBackup } from '../domain/story';
import {cleanLocalApiCredentials,type LocalApiCredentials} from './apiCredentials';
import {accountDatabase} from './accountScope';
export class IndexedDbRepository implements Repository {
  private connection?: Promise<IDBDatabase>;
  private baseline?:string;
  private loaded=false;
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
  async write(value: Snapshot): Promise<void> {
    const serialized = backup(value); parseBackup(serialized); const db = await this.open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('workspace','readwrite'),store=tx.objectStore('workspace');let stale=false;
      const current=store.get('snapshot');current.onsuccess=()=>{if(current.result!==this.baseline&&(this.loaded||current.result!==undefined)){stale=true;tx.abort();return;}store.put(serialized,'snapshot');};
      tx.oncomplete = () => {this.baseline=serialized;this.loaded=true;resolve();}; tx.onerror = tx.onabort = () => reject(new Error(stale?'存档已被其他页面修改，已停止覆盖保存；请导出当前草稿并刷新页面。':'本地保存失败，请导出备份并检查存储空间'));
    });
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
