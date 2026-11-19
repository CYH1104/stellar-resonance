import {stripReasoning} from '../src/domain/reasoning.ts';
const contexts=new WeakMap();
export function rememberCompletionErrorContext(response,context){contexts.set(response,context);}
function numericStatus(value){const n=typeof value==='number'||typeof value==='string'&&/^\d{3}$/.test(value.trim())?Number(value):NaN;return Number.isInteger(n)&&n>=400&&n<=599?n:undefined;}
/** Provider error messages are data, not an entire response/request dump. Credentials and known request echoes are removed. */
export function redactProviderMessage(message,{secrets=[],requestTexts=[]}={}){
 if(typeof message!=='string')return undefined;let text=stripReasoning(message).replace(/\u0000/g,'');
 for(const secret of [...secrets].filter(v=>typeof v==='string'&&v).sort((a,b)=>b.length-a.length))text=text.split(secret).join('[已隐藏凭据]');
 for(const value of requestTexts){if(typeof value!=='string'||value.length<8)continue;for(const part of [value,JSON.stringify(value).slice(1,-1)]){if(text.includes(part))text=text.split(part).join('[已隐藏回显的请求内容]');else if(part.length>120){const index=text.indexOf(part.slice(0,120));if(index>=0)text=text.slice(0,index)+'[已隐藏回显的请求内容]';}}}
 text=text.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [已隐藏凭据]').replace(/((?:authorization|set-cookie|cookie)\s*[:=]\s*)[^\r\n]*/gi,'$1[已隐藏凭据]').replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|credential)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,}<&]+)/gi,'$1[已隐藏凭据]').replace(/\b(?:(?:sk|glpat)-|(?:ghp|gho|ghs|github_pat)_)[A-Za-z0-9_-]{8,}/g,'[已隐藏凭据]');
 text=text.replace(/https?:\/\/[^\s<>"']+/gi,raw=>{try{const url=new URL(raw);if(url.username||url.password){url.username='';url.password='';}for(const key of [...url.searchParams.keys()])if(/key|token|secret|password|credential|auth/i.test(key))url.searchParams.set(key,'[已隐藏凭据]');return url.toString();}catch{return raw;}});
 const dump=/(?:["']?(?:messages|prompt|request_body|requestBody|request_payload|payload)["']?\s*[:=]\s*[\[{]|["']role["']\s*:\s*["']system["'])/i.exec(text);if(dump)text=text.slice(0,dump.index)+'[已隐藏回显的请求内容]';
 if(/<(?:!doctype|html|head|body)\b/i.test(text))text=text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/[ \t]+/g,' ').trim();
 text=text.trim();if(!text)return undefined;return text.length<=4000?text:text.slice(0,4000)+'\n…[上游错误过长，已截断]';
}
export function upstreamErrorDetail(payload,contextOrResponse={}){
 const context=contexts.get(contextOrResponse)||contextOrResponse||{};let root=payload;if(typeof root==='string'){try{root=JSON.parse(root);}catch{if(/^\s*[\[{]/.test(root))return {};return { ...(redactProviderMessage(root,context)?{upstreamMessage:redactProviderMessage(root,context)}:{})};}}
 const queue=[{node:root?.error??root,depth:0}];if(root?.error)queue.push({node:root,depth:0});let visited=0,providerStatus,providerCode,selected,selectedDepth=-1;
 while(queue.length&&visited++<64){const {node,depth}=queue.shift();if(depth>6||node==null)continue;
  if(typeof node==='string'){try{queue.push({node:JSON.parse(node),depth:depth+1});}catch{if(depth>=selectedDepth){selected=node;selectedDepth=depth;}}continue;}
  if(typeof node!=='object'||Array.isArray(node))continue;
  if(providerStatus===undefined)for(const key of ['status','status_code','statusCode','http_status','httpStatus','code']){const n=numericStatus(node[key]);if(n!==undefined){providerStatus=n;break;}}
  if(providerCode===undefined){const code=node.code??node.type;if((typeof code==='string'||typeof code==='number')&&String(code).trim())providerCode=redactProviderMessage(String(code),context)?.replace(/[\r\n]/g,' ').slice(0,120);}
  if(typeof node.message==='string'&&node.message.trim()){try{queue.push({node:JSON.parse(node.message),depth:depth+1});}catch{if(depth>=selectedDepth){selected=node.message;selectedDepth=depth;}}}
  for(const key of ['error','details','cause','response','data'])if(node[key]!==undefined)queue.push({node:node[key],depth:depth+1});
 }
 const upstreamMessage=redactProviderMessage(selected,context);return {...(providerStatus!==undefined?{providerStatus}:{}),...(providerCode?{providerCode}:{}),...(upstreamMessage?{upstreamMessage}:{})};
}
