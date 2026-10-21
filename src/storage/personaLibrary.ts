import {cleanAvatarAppearance,type AvatarAppearance} from '../domain/avatarAppearance';
import type {Persona} from '../domain/contracts';
import {normalizePersona} from '../domain/persona';
import {accountDatabase} from './accountScope';
export interface PersonaFile {avatarAppearance?:AvatarAppearance;id:string;name:string;persona:Persona;updatedAt:string;portrait?:Blob;avatar?:Blob;useAsHomeImage?:boolean;memo?:string}
export function validatePersonaTextFile(name:string,size:number){if(!/\.(txt|md)$/i.test(name))throw Error('只能导入 .txt 或 .md 人设文件。');if(size>256*1024)throw Error('文件不能超过 256KB。');}
export class PersonaLibrary {
  private db?:Promise<IDBDatabase>;
  private open(){return this.db ||=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(accountDatabase('stellar-persona-library'),1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();this.db=undefined;};resolve(r.result);};r.onerror=()=>reject(Error('无法打开本机人物档案库'));});}
  async list():Promise<PersonaFile[]>{const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=()=>resolve(r.result.sort((a:PersonaFile,b:PersonaFile)=>b.updatedAt.localeCompare(a.updatedAt)));r.onerror=()=>reject(Error('档案读取失败'));});}
  async save(file:PersonaFile){if(file.memo!==undefined&&typeof file.memo!=='string')throw Error('备忘录格式不正确');const safe={...file,avatarAppearance:cleanAvatarAppearance(file.avatarAppearance),persona:normalizePersona(file.persona)};const db=await this.open();await new Promise<void>((resolve,reject)=>{const t=db.transaction('files','readwrite');t.objectStore('files').put(safe);t.oncomplete=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('academy:persona-avatar-updated'));resolve();};t.onerror=t.onabort=()=>reject(Error('档案保存失败，当前文字仍保留'));});}
  async remove(id:string){const db=await this.open();await new Promise<void>((resolve,reject)=>{const t=db.transaction('files','readwrite');t.objectStore('files').delete(id);t.oncomplete=()=>resolve();t.onerror=()=>reject(Error('删除失败，请重试'));});}
}

