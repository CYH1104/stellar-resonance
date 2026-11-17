import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
// Exact public inference origins only; never wildcard entire cloud domains.
export const officialApiOrigins=Object.freeze([
 'https://api.openai.com','https://api.anthropic.com','https://generativelanguage.googleapis.com',
 'https://api.deepseek.com','https://dashscope.aliyuncs.com','https://dashscope-intl.aliyuncs.com','https://dashscope-us.aliyuncs.com',
 'https://ark.cn-beijing.volces.com','https://api.hunyuan.cloud.tencent.com','https://qianfan.baidubce.com',
 'https://open.bigmodel.cn','https://api.z.ai','https://api.moonshot.cn','https://api.minimax.cn',
 'https://api.x.ai','https://api.mistral.ai'
]);
const withOfficial=value=>({...value,officialOrigins:[...officialApiOrigins]});
const fail=code=>Object.assign(Error(code),{code,status:code==='API_ORIGIN_NOT_ALLOWED'?403:400});
export function allowedOrigin(value){
 try{if(typeof value!=='string'||!value.trim()||value.length>2000||/[\r\n\t]/.test(value))throw Error();const u=new URL(value.trim());if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error();return u.origin;}catch{throw fail('INVALID_API_ORIGIN');}
}
export function createRelayPolicy(file,{required=true,enabled=true}={}){
 let writes=Promise.resolve();
 async function read(){try{const data=JSON.parse(await readFile(file,'utf8'));if(data.version!==1||!Array.isArray(data.origins)||data.origins.length>100)throw Error();return withOfficial({version:1,origins:[...new Set(data.origins.map(allowedOrigin).filter(origin=>!officialApiOrigins.includes(origin)))]});}catch(e){if(e.code==='ENOENT')return withOfficial({version:1,origins:[]});throw fail('API_POLICY_UNAVAILABLE');}}
 async function persist(origins){if(!Array.isArray(origins))throw fail('INVALID_API_ORIGIN');const normalized=[...new Set(origins.map(allowedOrigin))].filter(origin=>!officialApiOrigins.includes(origin));if(normalized.length>100)throw fail('API_POLICY_LIMIT');const value={version:1,origins:normalized};await mkdir(dirname(file),{recursive:true,mode:0o700});const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600});await rename(temporary,file);return withOfficial(value);}
 function enqueue(run){const result=writes.then(run);writes=result.catch(()=>{});return result;}
 function save(origins){return enqueue(()=>persist(origins));}
 function add(origins){return enqueue(async()=>{if(!Array.isArray(origins))throw fail('INVALID_API_ORIGIN');const current=await read(),merged=[...new Set([...current.origins,...origins.map(allowedOrigin).filter(origin=>!officialApiOrigins.includes(origin))])];if(merged.length>100)throw fail('API_POLICY_LIMIT');const value=await persist(merged);return {...value,added:merged.length-current.origins.length};});}
 async function assert(url){if(!enabled){allowedOrigin(url);return;}const policy=await read();if(!required&&policy.origins.length===0)return;let origin;try{origin=new URL(url).origin;}catch{throw fail('INVALID_API_ORIGIN');}if(!officialApiOrigins.includes(origin)&&!policy.origins.includes(origin))throw fail('API_ORIGIN_NOT_ALLOWED');}
 function guard(fetchImpl){return async(url,options)=>{await assert(typeof url==='string'||url instanceof URL?url:url.url);return fetchImpl(url,{...options,redirect:'error'});};}
 return {enabled,read,save,add,assert,guard};
}
