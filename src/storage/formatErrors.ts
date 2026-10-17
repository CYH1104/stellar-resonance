import {accountDatabase} from './accountScope';
export interface FormatErrorRecord {id:string;at:string;sessionId:string;turnId:string;code:string;raw:string;kind?:'format'|'runtime'}
export class FormatErrorRepository {
 private async db(){return new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(accountDatabase('academy-format-errors-v1'),1);q.onupgradeneeded=()=>q.result.createObjectStore('errors');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
 async read():Promise<FormatErrorRecord[]>{const db=await this.db();try{return await new Promise((resolve,reject)=>{const q=db.transaction('errors').objectStore('errors').get('records');q.onsuccess=()=>resolve(Array.isArray(q.result)?q.result.slice(0,100):[]);q.onerror=()=>reject(q.error);});}finally{db.close();}}
 async write(records:FormatErrorRecord[]){const db=await this.db();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('errors','readwrite');tx.objectStore('errors').put(records.slice(0,100),'records');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
}
