import {safeLogText} from '../domain/logText';
import {MODEL_REQUEST_TIMEOUT_MS} from '../domain/requestTimeout';
const tasks:Record<string,string>={generate:'剧情生成',persona:'人设生成',memory:'记忆整理',embeddings:'向量模型',utility:'辅助生成','forum-reply':'论坛回复','random-event':'随机事件',models:'获取模型',probe:'连接测试',connection:'接口配置'};
export const taskLabel=(path:string)=>tasks[path]||'本机后台请求';
export interface HttpFailure{status?:number;upstreamStatus?:number;providerStatus?:number;code?:string;providerCode?:string;upstreamMessage?:string;task:string;message:string;}
let httpFailureSink:((failure:HttpFailure)=>string|undefined)|undefined;
export function setHttpFailureSink(sink:(failure:HttpFailure)=>string|undefined){httpFailureSink=sink;return () => {if(httpFailureSink===sink)httpFailureSink=undefined;};}
function cleanFailure(failure:HttpFailure):HttpFailure{const secrets:string[]=[];return {...failure,task:safeLogText(failure.task,secrets,4000),code:failure.code===undefined?undefined:safeLogText(failure.code,secrets,4000),providerCode:failure.providerCode===undefined?undefined:safeLogText(failure.providerCode,secrets,4000),upstreamMessage:failure.upstreamMessage===undefined?undefined:safeLogText(failure.upstreamMessage,secrets,4000),message:safeLogText(failure.message,secrets,4000)};}
export function reportHttpFailure(failure:HttpFailure):string|undefined{try{return httpFailureSink?.(cleanFailure(failure));}catch{return undefined;}}
export function attachHttpNotice(error:unknown,key:string|undefined){if(!key||!error||typeof error!=='object')return error;try{(error as {httpNoticeKey?:string}).httpNoticeKey=key;}catch{}return error;}
export function httpNoticeKeyOf(error:unknown){return error&&typeof error==='object'?(error as {httpNoticeKey?:string}).httpNoticeKey:undefined;}
export function upstreamStatus(value:unknown):number|undefined{const n=typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number(value):NaN;return Number.isInteger(n)&&n>=100&&n<=599?n:undefined;}
export function safeUpstreamMessage(value:unknown,secrets:string[]=[]):string|undefined{if(typeof value!=='string'||!value.trim())return;return safeLogText(value,secrets,4000);}
export function copyHttpFailureMetadata(target:unknown,source:unknown){if(!target||typeof target!=='object'||!source||typeof source!=='object')return target;const from=source as Record<string,unknown>,to=target as Record<string,unknown>;for(const key of ['upstreamStatus','providerStatus','providerCode','upstreamMessage'])if(from[key]!==undefined)to[key]=from[key];return target;}
export function modelRequestContext(body:unknown,path:string){
 if(!body||typeof body!=='object')return '';
 const value=body as {profile?:{name?:unknown;model?:unknown;apiBaseUrl?:unknown;maxTokens?:unknown;temperature?:unknown;topP?:unknown;frequencyPenalty?:unknown;presencePenalty?:unknown};apiBaseUrl?:unknown;key?:unknown};
 const profile=value.profile,address=profile?.apiBaseUrl??value.apiBaseUrl;if(!profile&&typeof address!=='string')return '';
 let endpoint='未配置';try{const url=new URL(String(address));if(['http:','https:'].includes(url.protocol))endpoint=url.origin;}catch{}
 const secrets=typeof value.key==='string'?[value.key]:[];const clean=(text:unknown)=>safeLogText(typeof text==='string'?text:'',secrets).replace(/[\r\n\t]/g,' ').slice(0,256);
 const parameters=profile&&path==='generate'?([['maxTokens','请求最大输出'],['temperature','temperature'],['topP','top_p'],['frequencyPenalty','frequency_penalty'],['presencePenalty','presence_penalty']] as const).flatMap(([field,label])=>typeof profile[field]==='number'&&Number.isFinite(profile[field])?[label+'：'+profile[field]+(field==='maxTokens'?' tokens':'')]:[]):[];
 return [`任务：${tasks[path]||'模型请求'}`,`模型：${clean(profile?.model)||'未选择（模型列表请求不指定模型）'}`,`接口：${endpoint}`,...parameters,`单次请求／重试上限：${MODEL_REQUEST_TIMEOUT_MS/60000} 分钟`].join('\n');
}
class ModelRequestFailure extends Error {}
export function modelRequestFailure(error:unknown,context:string,elapsedMs:number):unknown{if(!context||error instanceof ModelRequestFailure||error instanceof Error&&error.name==='AbortError')return error;const message=error instanceof Error?error.name==='TimeoutError'?'模型请求超时，请重试。':error.message:'模型请求失败，请重试。';const wrapped=new ModelRequestFailure(`${message}\n${context}\n已等待：${Math.max(0,elapsedMs/1000).toFixed(1)} 秒`);copyHttpFailureMetadata(wrapped,error);attachHttpNotice(wrapped,httpNoticeKeyOf(error));return wrapped;}
