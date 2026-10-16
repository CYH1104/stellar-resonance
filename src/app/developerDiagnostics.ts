import {reactive} from 'vue';
import {cleanDiagnostic,type GenerationDiagnostic} from '../domain/diagnostics';
export const developerDiagnostics=reactive({unlocked:false,entries:[] as (GenerationDiagnostic&{at:string})[]});
export function recordDiagnostic(value:unknown){if(!developerDiagnostics.unlocked)return;const safe=cleanDiagnostic(value);if(safe){developerDiagnostics.entries.unshift({...safe,at:new Date().toLocaleTimeString()});developerDiagnostics.entries.splice(20);}}
export function lockDiagnostics(){developerDiagnostics.unlocked=false;developerDiagnostics.entries=[];}
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export interface DeveloperLock {version:1;salt:string;hash:string}
async function derive(password:string,salt:string){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g)!,h=>parseInt(h,16)),iterations:120000,hash:'SHA-256'},material,256)));}
export function validDeveloperLock(v:unknown):v is DeveloperLock{const x=v as DeveloperLock;return !!x&&x.version===1&&/^[a-f0-9]{32}$/.test(x.salt)&&/^[a-f0-9]{64}$/.test(x.hash);}
export async function createDeveloperLock(password:string):Promise<DeveloperLock>{if(password.length<6||password.length>200)throw Error('密令须为6～200个字符');const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return {version:1,salt,hash:await derive(password,salt)};}
export async function verifyDeveloperLock(password:string,lock:DeveloperLock):Promise<boolean>{if(!validDeveloperLock(lock)||password.length>200)return false;const hash=await derive(password,lock.salt);let delta=0;for(let i=0;i<hash.length;i++)delta|=hash.charCodeAt(i)^lock.hash.charCodeAt(i);return delta===0;}
export const developerLockKey='stellar:developer-diagnostics:v1';
