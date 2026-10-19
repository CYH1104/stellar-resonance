import type { Repository, Snapshot } from '../domain/contracts';
import { backup, parseBackup } from '../domain/story';
import {cleanLocalApiCredentials,type LocalApiCredentials} from './apiCredentials';
import {accountDatabase} from './accountScope';
interface StoredSnapshot {revision:number;text:string}
const storedSnapshot=(value:unknown):StoredSnapshot|undefined=>{
  if(value===undefined)return;
  if(typeof value==='string')return {revision:0,text:value};
  if(value&&typeof value==='object'&&typeof (value as StoredSnapshot).text==='string'&&Number.isInteger((value as StoredSnapshot).revision))return value as StoredSnapshot;
  throw new Error('无法识别的本地存档格式');
};
export class IndexedDbRepository implements Repository {
  private connection?: Promise<IDBDatabase>;
  /** Last revision read or written by this tab; writes are compare-and-swap. */
  revision = 0;
  constructor(private name = accountDatabase('stellar-resonance-v1')) {}
  private open(): Promise<IDBDatabase> {
    return this.connection ||= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onerror = () => reject(new Error('无法打开本地存档，请检查浏览器存储权限'));
      request.onblocked = () => reject(new Error('请关闭旧版本网页后重试'));
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); this.connection=undefined; }; resolve(db); };
    });
  }
  async read(): Promise<Snapshot | undefined> {
    const db = await this.open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('workspace','readonly'); const request = tx.objectStore('workspace').get('snapshot');
      request.onsuccess = () => { try { const stored=storedSnapshot(request.result); if(!stored){this.revision=0;resolve(undefined);return;} this.revision=stored.revision; resolve(parseBackup(stored.text)); } catch(e) { reject(e); } };
      request.onerror = () => reject(new Error('本地存档读取失败'));
    });
  }
  async write(value: Snapshot, expected = this.revision): Promise<void> {
    const serialized = backup(value); parseBackup(serialized); const db = await this.open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('workspace','readwrite'), store = tx.objectStore('workspace');
      const request = store.get('snapshot'); let stale = false;
      request.onsuccess = () => {
        try {
          const current = storedSnapshot(request.result);
          if ((current?.revision ?? 0) !== expected) { stale = true; tx.abort(); return; }
          store.put({revision: expected + 1, text: serialized} satisfies StoredSnapshot, 'snapshot');
        } catch (error) { stale = true; tx.abort(); reject(error); }
      };
      request.onerror = () => { stale = true; tx.abort(); };
      tx.oncomplete = () => { this.revision = expected + 1; resolve(); };
      tx.onerror = tx.onabort = () => {
        if (stale) reject(Object.assign(new Error('存档已被其他标签页更新，请重新载入后再保存'), {code:'STALE_WRITE'}));
        else reject(new Error('本地保存失败，请导出备份并检查存储空间'));
      };
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
