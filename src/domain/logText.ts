import {stripReasoning} from './reasoning';
export function safeLogText(text:string,secrets:string[]=[]){
 let value=stripReasoning(text);
 for(const secret of [...secrets].filter(Boolean).sort((a,b)=>b.length-a.length))value=value.split(secret).join('[已隐藏]');
 return value.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [已隐藏]').replace(/(["']?(?:api[_-]?key|token|authorization|password|secret)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,}<&]+)/gi,'$1[已隐藏]').replace(/https?:\/\/[^\s<>"']+/gi,url=>{try{const u=new URL(url);u.username='';u.password='';u.search='';u.hash='';return u.toString();}catch{return '[地址已隐藏]';}}).slice(0,400000);
}
