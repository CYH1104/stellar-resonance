import type {RegexRule,RegexContext} from './regex';
let worker:Worker|undefined, ready:Promise<boolean>|undefined;
let queue:Promise<unknown>=Promise.resolve();
let finishActive:((message:string)=>void)|undefined;
export function disposeRegexWorker(){finishActive?.('正则线程已重置，已保留原文');worker?.terminate();worker=undefined;ready=undefined;}
export function preloadRegexWorker():Promise<boolean>{
 if(ready)return ready;
 let settle!:(value:boolean)=>void;
 const pending=new Promise<boolean>(resolve=>{settle=resolve;});ready=pending;
 try{
  const current=new Worker(new URL('./regex.worker.ts',import.meta.url),{type:'module'});worker=current;
  const fail=()=>{clearTimeout(timer);if(worker===current){finishActive?.('正则处理失败，已保留原文');current.terminate();worker=undefined;ready=undefined;}settle(false);};
  const timer=setTimeout(fail,10000);
  current.onerror=fail;
  current.onmessage=event=>{if(event.data.type==='ready'){clearTimeout(timer);settle(true);}};
 }catch{worker=undefined;ready=undefined;settle(false);}
 return pending;
}
export function runRegex(text:string,rules:RegexRule[],context:RegexContext,signal?:AbortSignal):Promise<{text:string;errors:string[]}>{
 if(signal?.aborted)return Promise.reject(new DOMException('已停止','AbortError'));
 if(!rules.some(r=>!r.disabled&&r.placement.includes(context.placement)))return Promise.resolve({text,errors:[]});
 const task=queue.then(async()=>{
  if(signal?.aborted)throw new DOMException('已停止','AbortError');
  if(!await preloadRegexWorker()||!worker)return {text,errors:['正则渲染线程启动失败或超时，已保留原文']};
  if(signal?.aborted)throw new DOMException('已停止','AbortError');
  const current=worker;
  return new Promise<{text:string;errors:string[]}>((resolve,reject)=>{
   let latest={text,errors:[] as string[]},ruleName='';
   const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);finishActive=undefined;current.onmessage=null;};
   const finish=(message:string)=>{cleanup();resolve({text:latest.text,errors:[...latest.errors,message]});};
   const timeout=()=>{finish((ruleName?ruleName+'：':'')+'正则处理超时，已保留已完成的渲染');disposeRegexWorker();};
   const abort=()=>{cleanup();disposeRegexWorker();reject(new DOMException('已停止','AbortError'));};
   let timer=setTimeout(timeout,1500);finishActive=finish;
   signal?.addEventListener('abort',abort,{once:true});
   current.onmessage=event=>{
    if(event.data.type==='progress'){latest={text:event.data.text,errors:event.data.errors};ruleName=event.data.ruleName;clearTimeout(timer);timer=setTimeout(timeout,1500);return;}
    cleanup();resolve(event.data);
   };
   try{current.postMessage({text,rules:JSON.parse(JSON.stringify(rules)),context});}
   catch{finish('正则处理失败，已保留原文');disposeRegexWorker();}
  });
 });
 queue=task.catch(()=>{});return task;
}
