import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
const fail=code=>Object.assign(Error(code),{code,status:code==='API_ORIGIN_NOT_ALLOWED'?403:400});
export function allowedOrigin(value){
 try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error();return u.origin;}catch{throw fail('INVALID_API_ORIGIN');}
}
export function createRelayPolicy(file,{required=true}={}){
 let writes=Promise.resolve();
 async function read(){try{const data=JSON.parse(await readFile(file,'utf8'));if(data.version!==1||!Array.isArray(data.origins)||data.origins.length>100)throw Error();return {version:1,origins:[...new Set(data.origins.map(allowedOrigin))]};}catch(e){if(e.code==='ENOENT')return {version:1,origins:[]};throw fail('API_POLICY_UNAVAILABLE');}}
 function save(origins){const run=async()=>{if(!Array.isArray(origins)||origins.length>100)throw fail('INVALID_API_ORIGIN');const value={version:1,origins:[...new Set(origins.map(allowedOrigin))]};await mkdir(dirname(file),{recursive:true,mode:0o700});const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600});await rename(temporary,file);return value;};const result=writes.then(run);writes=result.catch(()=>{});return result;}
 async function assert(url){const policy=await read();if(!required&&policy.origins.length===0)return;let origin;try{origin=new URL(url).origin;}catch{throw fail('INVALID_API_ORIGIN');}if(!policy.origins.includes(origin))throw fail('API_ORIGIN_NOT_ALLOWED');}
 function guard(fetchImpl){return async(url,options)=>{await assert(typeof url==='string'||url instanceof URL?url:url.url);return fetchImpl(url,{...options,redirect:'error'});};}
 return {read,save,assert,guard};
}
