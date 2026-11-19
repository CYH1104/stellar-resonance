import {safeLogText} from '../domain/logText';
import {stripReasoning} from '../domain/reasoning.ts';
import {upstreamStatus,safeUpstreamMessage} from './requestFailure';
function object(v:unknown):v is Record<string,any>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function errorStatus(v:unknown){const n=upstreamStatus(v);return n!==undefined&&n>=400&&n<=599?n:undefined;}
export interface UpstreamErrorDetails{upstreamStatus?:number;providerStatus?:number;providerCode?:string;upstreamMessage?:string;}
export function upstreamErrorDetails(value:unknown,secrets:string[]=[]):UpstreamErrorDetails{
 if(!object(value))return {};const nested=object(value.error)?value.error:undefined;
 const providerStatus=[value.providerStatus,nested?.status,nested?.status_code,nested?.code,value.status_code,value.status,value.code].map(errorStatus).find(status=>status!==undefined),upstream=errorStatus(value.upstreamStatus);
 const code=value.providerCode??nested?.code??nested?.type??((typeof value.code==='number'||typeof value.code==='string'&&!/^(?:UPSTREAM_|MODEL_|INVALID_|STATE_|PLAYER_|CHARACTER_|AUTO_)/.test(value.code))?value.code:undefined);
 const message=value.upstreamMessage??nested?.message??(typeof value.error==='string'?value.error:undefined)??value.message;
 const providerCode=typeof code==='string'||typeof code==='number'?safeLogText(String(code),secrets,200):undefined;
 const upstreamMessage=safeUpstreamMessage(message,secrets);
 return {...(upstream!==undefined?{upstreamStatus:upstream}:{}),...(providerStatus!==undefined?{providerStatus}:{}),...(providerCode?{providerCode}:{}),...(upstreamMessage?{upstreamMessage}:{})};
}
/** Safe transport diagnostics: never expose response bodies, redirect locations or header parameters. */
export function responseMetadata(response:Response){const raw=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();const known=['text/event-stream','application/json','text/html','text/plain','application/octet-stream'];return `HTTP ${response.status}；响应类型：${known.includes(raw)?raw:raw?'其他类型':'未提供'}`;}
export async function openGenerationStream(response:Response,messageForCode:(code:string)=>string|undefined,secrets:string[]=[]){
 const sseFields=['data:','event:','id:','retry:',':'],meta=responseMetadata(response),mime=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
 if(!response.body)throw Object.assign(Error(`生成接口返回空响应，未收到正文。${meta}`),{upstreamStatus:response.status});
 const reader=response.body.getReader(),decoder=new TextDecoder();if(mime==='text/event-stream')return {reader,prefix:'',decoder};let prefix='';
 try{
  while(prefix.length<8192){const part=await reader.read();prefix+=decoder.decode(part.value,{stream:!part.done});const text=prefix.trimStart();
   if(sseFields.some(field=>text.startsWith(field)))return {reader,prefix:text,decoder};
   if(mime==='text/html'||text.startsWith('<'))throw Object.assign(Error(`生成接口返回了网页，可能是登录页或代理错误页，请检查会话和服务器路由。${meta}`),{upstreamStatus:response.status});
   if(prefix.length>8192)throw Object.assign(Error(`生成接口的非流式响应超过诊断读取上限。${meta}`),{upstreamStatus:response.status});
   if(text.startsWith('{')){let body:unknown;try{body=JSON.parse(text);}catch{body=undefined;}if(body!==undefined){const details=upstreamErrorDetails(body,secrets),root=object(body)?body:undefined,code=details.providerCode||(typeof root?.code==='string'?root.code:undefined),fallback=code?messageForCode(code):undefined;if(Object.keys(details).length||fallback){const msg=details.upstreamMessage||fallback||'生成接口返回错误，但未提供错误消息。';const status=details.upstreamStatus!==undefined?'上游 HTTP '+details.upstreamStatus:details.providerStatus!==undefined?'模型返回状态：'+details.providerStatus:'';const label=details.providerCode&&details.providerCode!==String(details.upstreamStatus??details.providerStatus)?'模型错误码：'+details.providerCode:'';throw Object.assign(Error([status,label,msg,details.upstreamMessage?'':meta].filter(Boolean).join(' · ')),details);}throw Object.assign(Error(`生成接口返回了非流式 JSON，未收到应用剧情数据流，请检查后台接口或代理配置。 ${meta}`),{upstreamStatus:response.status});}}
   else if(text&&!sseFields.some(token=>token.startsWith(text)))throw Object.assign(Error(`生成接口未返回可识别的剧情数据流，请检查后台接口或代理配置。${meta}`),{upstreamStatus:response.status});
   if(part.done)break;
  }
  throw Object.assign(Error(`${prefix.trim()?'生成接口响应不是有效的剧情数据流，请检查后台接口或代理配置。':'生成接口返回空响应，未收到正文。'} ${meta}`),{upstreamStatus:response.status});
 }catch(error){await reader.cancel().catch(()=>{});reader.releaseLock();throw error;}
}
export function generationEventFailure(event:Record<string,unknown>,fallback:(code:string)=>string|undefined,secrets:string[]=[]){const details=upstreamErrorDetails(event,secrets),code=details.providerCode||(typeof event.code==='string'?event.code:undefined),message=details.upstreamMessage||(code?fallback(code):undefined)||'上游服务报告失败，但未提供错误消息。';return {message,...details};}
export function extractSseErrorEvent(data:string):Record<string,unknown>|undefined{let value:unknown;try{value=JSON.parse(stripReasoning(data).trim());}catch{return;}if(object(value)&&(value.type==='error'||object(value.error)))return value;return;}
