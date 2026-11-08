import {safeLogText} from '../domain/logText';
import {MODEL_REQUEST_TIMEOUT_MS} from '../domain/requestTimeout';
const tasks:Record<string,string>={generate:'剧情生成',persona:'人设生成',memory:'记忆整理',embeddings:'向量模型',utility:'辅助生成','forum-reply':'论坛回复','random-event':'随机事件',models:'获取模型',probe:'连接测试',connection:'接口配置'};
export const taskLabel=(path:string)=>tasks[path]||'本机后台请求';
/** A failure whose HTTP status is known exactly: either the local backend's, or the upstream model API's. */
export interface HttpFailure{status?:number;upstreamStatus?:number;code?:string;task:string;message:string;}
let httpFailureSink:((failure:HttpFailure)=>string|undefined)|undefined;
/** Registered by the workspace so gateway code never imports the UI layer. Returns the notice key it showed, if any. */
export function setHttpFailureSink(sink:(failure:HttpFailure)=>string|undefined){httpFailureSink=sink;return () => {if(httpFailureSink===sink)httpFailureSink=undefined;};}
/** Folds every channel that reports the same failure into one notice; `undefined` when nothing was shown. */
export function reportHttpFailure(failure:HttpFailure):string|undefined{try{return httpFailureSink?.(failure);}catch{return undefined;}}
/** Marks a thrown error as already reported so the UI text resolves to the same notice instead of a second toast. */
export function attachHttpNotice(error:unknown,key:string|undefined){
  if(!key||!error||typeof error!=='object')return error;
  try{(error as {httpNoticeKey?:string}).httpNoticeKey=key;}catch{}
  return error;
}
export function httpNoticeKeyOf(error:unknown){return error&&typeof error==='object'?(error as {httpNoticeKey?:string}).httpNoticeKey:undefined;}
/** Only values that really are HTTP statuses may be shown as such; nothing is guessed out of a response body. */
export function upstreamStatus(value:unknown):number|undefined{const n=typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number(value):NaN;return Number.isInteger(n)&&n>=100&&n<=599?n:undefined;}
/** Capture the selected endpoint before awaiting; later edits must not change the error's source. */
export function modelRequestContext(body:unknown,path:string){
 if(!body||typeof body!=='object')return '';
 const value=body as {profile?:{name?:unknown;model?:unknown;apiBaseUrl?:unknown;maxTokens?:unknown;temperature?:unknown;topP?:unknown;frequencyPenalty?:unknown;presencePenalty?:unknown};apiBaseUrl?:unknown;key?:unknown};
 const profile=value.profile,address=profile?.apiBaseUrl??value.apiBaseUrl;
 if(!profile&&typeof address!=='string')return '';
 let endpoint='未配置',port='未配置';
 try{const url=new URL(String(address));if(['http:','https:'].includes(url.protocol)){endpoint=url.origin;port=url.port||(url.protocol==='https:'?'443':'80');}}catch{}
 const secrets=typeof value.key==='string'?[value.key]:[];
 const clean=(text:unknown)=>safeLogText(typeof text==='string'?text:'',secrets).replace(/[\r\n\t]/g,' ').slice(0,256);
 const parameters=profile&&path==='generate'?([['maxTokens','请求最大输出'],['temperature','temperature'],['topP','top_p'],['frequencyPenalty','frequency_penalty'],['presencePenalty','presence_penalty']] as const).flatMap(([field,label])=>typeof profile[field]==='number'&&Number.isFinite(profile[field])?[label+'：'+profile[field]+(field==='maxTokens'?' tokens':'')]:[]):[];
 return [`任务：${tasks[path]||'模型请求'}`,`模型：${clean(profile?.model)||'未选择（模型列表请求不指定模型）'}`,`接口：${endpoint}`,`端口：${port}`,...parameters,`单次请求／重试上限：${MODEL_REQUEST_TIMEOUT_MS/60000} 分钟`].join('\n');
}
class ModelRequestFailure extends Error {}
export function modelRequestFailure(error:unknown,context:string,elapsedMs:number):unknown{
 if(!context||error instanceof ModelRequestFailure||error instanceof Error&&error.name==='AbortError')return error;
 const message=error instanceof Error?error.name==='TimeoutError'?'模型请求超时，请重试。':error.message:'模型请求失败，请重试。';
 return attachHttpNotice(new ModelRequestFailure(`${message}\n${context}\n已等待：${Math.max(0,elapsedMs/1000).toFixed(1)} 秒`),httpNoticeKeyOf(error));
}
