import {cleanAvatarAppearance,type AvatarAppearance} from '../domain/avatarAppearance';
import type {Persona} from '../domain/contracts';
import {normalizePersona,personaLimits} from '../domain/persona';
import {accountDatabase,accountStorage} from './accountScope';
const hiddenSessionsKey='academy:persona-hidden-sessions:v1';
export function hiddenPersonaSessionIds():string[]{try{const value=JSON.parse(accountStorage.getItem(hiddenSessionsKey)||'[]');return Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'):[];}catch{return [];}}
export function hidePersonaSessions(ids:string[]){accountStorage.setItem(hiddenSessionsKey,JSON.stringify([...new Set([...hiddenPersonaSessionIds(),...ids])]));}
export interface PersonaFile {avatarAppearance?:AvatarAppearance;id:string;name:string;persona:Persona;updatedAt:string;portrait?:Blob;avatar?:Blob;useAsHomeImage?:boolean;memo?:string;remark?:string;sourceSessionIds?:string[]}
type PersonaSession={id:string;persona:Persona;updatedAt:string};
export function personaSourceSessionIds(file:PersonaFile|undefined,sessions:PersonaSession[],known:string[]=[]){
 return [...new Set([...(file?.sourceSessionIds||[]),...known,...(file?sessions.filter(s=>samePersona(s.persona,file.persona)).map(s=>s.id):[])])];
}
export function samePersona(a:Persona,b:Persona){
 const first=normalizePersona(a,false),second=normalizePersona(b,false);
 return (Object.keys(personaLimits) as (keyof typeof personaLimits)[]).every(key=>(first[key]||'')===(second[key]||''));
}
export function personaMediaFile(files:PersonaFile[],session:{id:string;persona:Persona}){
 const linked=files.find(f=>f.sourceSessionIds?.includes(session.id));
 if(linked)return linked;
 return files.find(f=>(f.portrait||f.avatar)&&samePersona(f.persona,session.persona));
}
/** A session is a fallback for an unsaved archive, not a second archive after editing. */
export function personaArchiveEntries(files:PersonaFile[],sessions:PersonaSession[],hidden=hiddenPersonaSessionIds()):PersonaFile[]{
 const linked=new Set(files.flatMap(f=>f.sourceSessionIds||[])),result=[...files];
 for(const session of sessions){
  if(hidden.includes(session.id)||linked.has(session.id)||result.some(f=>samePersona(f.persona,session.persona)))continue;
  result.push({id:'session/'+session.id,name:session.persona.name,persona:session.persona,updatedAt:session.updatedAt});
 }
 return result;
}
export function resolvePersonaArchiveFile(file:PersonaFile,files:PersonaFile[]){
 return files.find(f=>f.id===file.id)||(file.id.startsWith('session/')?files.find(f=>f.sourceSessionIds?.includes(file.id.slice(8))||samePersona(f.persona,file.persona)):undefined)||file;
}
export function validatePersonaTextFile(name:string,size:number){if(!/\.(txt|md)$/i.test(name))throw Error('只能导入 .txt 或 .md 人设文件。');if(size>256*1024)throw Error('文件不能超过 256KB。');}
export class PersonaLibrary {
  private db?:Promise<IDBDatabase>;
  private open(){return this.db ||=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(accountDatabase('stellar-persona-library'),2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('files'))r.result.createObjectStore('files',{keyPath:'id'});if(!r.result.objectStoreNames.contains('drafts'))r.result.createObjectStore('drafts');};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();this.db=undefined;};resolve(r.result);};r.onerror=()=>reject(Error('无法打开本机人物档案库'));});}
  async readDraft():Promise<PersonaFile|undefined>{const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get('editor');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('人设草稿读取失败'));});}
  async saveDraft(file:PersonaFile){const safe={...file,persona:{...file.persona},sourceSessionIds:[...(file.sourceSessionIds||[])],avatarAppearance:cleanAvatarAppearance(file.avatarAppearance)};const db=await this.open();await new Promise<void>((resolve,reject)=>{const t=db.transaction('drafts','readwrite');t.objectStore('drafts').put(safe,'editor');t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(Error('人设草稿保存失败'));});}
  async list():Promise<PersonaFile[]>{const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=()=>resolve(r.result.sort((a:PersonaFile,b:PersonaFile)=>b.updatedAt.localeCompare(a.updatedAt)));r.onerror=()=>reject(Error('档案读取失败'));});}
  async save(file:PersonaFile){if(file.memo!==undefined&&typeof file.memo!=='string')throw Error('备忘录格式不正确');const safe={...file,avatarAppearance:cleanAvatarAppearance(file.avatarAppearance),persona:normalizePersona(file.persona)};const db=await this.open();await new Promise<void>((resolve,reject)=>{const t=db.transaction('files','readwrite');t.objectStore('files').put(safe);t.oncomplete=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('academy:persona-avatar-updated'));resolve();};t.onerror=t.onabort=()=>reject(Error('档案保存失败，当前文字仍保留'));});}
  async clearDraft(){const db=await this.open();await new Promise<void>((resolve,reject)=>{const t=db.transaction('drafts','readwrite');t.objectStore('drafts').delete('editor');t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(Error('清除人设草稿失败'));});}
  async remove(id:string){const db=await this.open();await new Promise<void>((resolve,reject)=>{const t=db.transaction(['files','drafts'],'readwrite');t.objectStore('files').delete(id);const draft=t.objectStore('drafts').get('editor');draft.onsuccess=()=>{if(draft.result?.id===id)t.objectStore('drafts').delete('editor');};t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(Error('删除失败，请重试'));});}
}

