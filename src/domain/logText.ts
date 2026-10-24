import {stripReasoning} from './reasoning';
/** A single text block is capped, and the cut is explicit rather than silently dropped. */
export const logTextLimit=400000;
const secretKey=/^(?:api[_-]?key|token|authorization|password|secret|access[_-]?token|refresh[_-]?token|credential|client[_-]?secret)$/i;
function truncate(text:string,max:number){return text.length<=max?text:text.slice(0,max)+`\n…[已截断，原长度 ${text.length} 字符]`;}
export function safeLogText(text:string,secrets:string[]=[],max=logTextLimit){
 let value=stripReasoning(text);
 for(const secret of [...secrets].filter(Boolean).sort((a,b)=>b.length-a.length))value=value.split(secret).join('[已隐藏]');
 value=value.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [已隐藏]').replace(/(["']?(?:api[_-]?key|token|authorization|password|secret)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,}<&]+)/gi,'$1[已隐藏]').replace(/\b(?:(?:sk|glpat)-|(?:ghp|gho|ghs|github_pat)_)[A-Za-z0-9_-]{8,}/g,'[已隐藏]').replace(/https?:\/\/[^\s<>"']+/gi,url=>{try{const u=new URL(url);u.username='';u.password='';u.search='';u.hash='';return u.toString();}catch{return '[地址已隐藏]';}});
 return truncate(value,max);
}
/** Recursively redacts every string, secret-named key and oversized collection before a record is stored. */
export function sanitizeLogValue(value:unknown,secrets:string[]=[],max=logTextLimit,depth=0):unknown{
 if(depth>12)return '[层级过深已省略]';
 if(typeof value==='string')return safeLogText(value,secrets,max);
 if(value===null||typeof value!=='object')return value;
 if(Array.isArray(value))return value.slice(0,500).map(item=>sanitizeLogValue(item,secrets,max,depth+1));
 const result:Record<string,unknown>={};
 for(const [key,item] of Object.entries(value as Record<string,unknown>).slice(0,300)){
  if(['__proto__','constructor','prototype'].includes(key))continue;
  result[key]=secretKey.test(key)?'[已隐藏]':sanitizeLogValue(item,secrets,max,depth+1);
 }
 return result;
}
