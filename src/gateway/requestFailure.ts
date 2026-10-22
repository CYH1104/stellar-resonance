import {safeLogText} from '../domain/logText';
import {MODEL_REQUEST_TIMEOUT_MS} from '../domain/requestTimeout';
const tasks:Record<string,string>={generate:'剧情生成',persona:'人设生成',memory:'记忆整理',embeddings:'向量模型',utility:'辅助生成','forum-reply':'论坛回复','random-event':'随机事件',models:'获取模型',probe:'连接测试',connection:'接口配置'};
/** Capture the selected endpoint before awaiting; later edits must not change the error's source. */
export function modelRequestContext(body:unknown,path:string){
 if(!body||typeof body!=='object')return '';
 const value=body as {profile?:{name?:unknown;model?:unknown;apiBaseUrl?:unknown};apiBaseUrl?:unknown;key?:unknown};
 const profile=value.profile,address=profile?.apiBaseUrl??value.apiBaseUrl;
 if(!profile&&typeof address!=='string')return '';
 let endpoint='未配置',port='未配置';
 try{const url=new URL(String(address));if(['http:','https:'].includes(url.protocol)){endpoint=url.origin;port=url.port||(url.protocol==='https:'?'443':'80');}}catch{}
 const secrets=typeof value.key==='string'?[value.key]:[];
 const clean=(text:unknown)=>safeLogText(typeof text==='string'?text:'',secrets).replace(/[\r\n\t]/g,' ').slice(0,256);
 return [`任务：${tasks[path]||'模型请求'}`,`模型：${clean(profile?.model)||'未选择（模型列表请求不指定模型）'}`,`接口：${endpoint}`,`端口：${port}`,`单次请求／重试上限：${MODEL_REQUEST_TIMEOUT_MS/60000} 分钟`].join('\n');
}
class ModelRequestFailure extends Error {}
export function modelRequestFailure(error:unknown,context:string,elapsedMs:number):unknown{
 if(!context||error instanceof ModelRequestFailure||error instanceof Error&&error.name==='AbortError')return error;
 const message=error instanceof Error?error.name==='TimeoutError'?'模型请求超时，请重试。':error.message:'模型请求失败，请重试。';
 return new ModelRequestFailure(`${message}\n${context}\n已等待：${Math.max(0,elapsedMs/1000).toFixed(1)} 秒`);
}
