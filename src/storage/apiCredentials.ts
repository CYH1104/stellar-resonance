/** Browser-only record, deliberately separate from the exported workspace snapshot. */
export interface LocalApiCredentials {
  version:1;
  remember:boolean;
  keys:Record<string,string>;
  confirmed:Record<string,{apiBaseUrl:string;model:string}>;
}
export function apiAddress(value=''){try{return new URL(value.trim()).href;}catch{return value.trim();}}
export function cleanLocalApiCredentials(value:unknown):LocalApiCredentials{
  const bad=()=>new Error('本机 API 凭据记录不正确，请在设置中清除后重新保存。');
  if(!value||typeof value!=='object')throw bad();
  const raw=value as LocalApiCredentials;
  if(raw.version!==1||typeof raw.remember!=='boolean')throw bad();
  if(!raw.remember)return {version:1,remember:false,keys:{},confirmed:{}};
  const validId=(id:string)=>!!id&&id.length<=128&&!['__proto__','constructor','prototype'].includes(id);
  if(!raw.keys||typeof raw.keys!=='object'||Array.isArray(raw.keys)||Object.keys(raw.keys).length>30||!raw.confirmed||typeof raw.confirmed!=='object'||Array.isArray(raw.confirmed)||Object.keys(raw.confirmed).length>30)throw bad();
  const keys=Object.fromEntries(Object.entries(raw.keys).map(([id,key])=>{if(!validId(id)||typeof key!=='string'||key.length>8192)throw bad();return [id,key];}));
  const confirmed=Object.fromEntries(Object.entries(raw.confirmed).map(([id,p])=>{
    if(!validId(id)||!keys[id]||!p||typeof p.apiBaseUrl!=='string'||p.apiBaseUrl.length>2000||typeof p.model!=='string'||!p.model.trim()||p.model.length>150)throw bad();
    let url:URL;try{url=new URL(p.apiBaseUrl);}catch{throw bad();}
    if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw bad();
    return [id,{apiBaseUrl:apiAddress(p.apiBaseUrl),model:p.model}];
  }));
  return {version:1,remember:true,keys,confirmed};
}
