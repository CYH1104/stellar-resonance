import type {RegexRule,RegexContext} from './regex';
export function runRegex(text:string,rules:RegexRule[],context:RegexContext,signal?:AbortSignal):Promise<{text:string;errors:string[]}>{
  if(signal?.aborted)return Promise.reject(new DOMException('已停止','AbortError'));
  if(!rules.some(r=>!r.disabled&&r.placement.includes(context.placement)))return Promise.resolve({text,errors:[]});
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./regex.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(new DOMException('已停止','AbortError'));};
    let latest={text,errors:[] as string[]},ruleName='';
    let timer= setTimeout(()=>{cleanup();resolve({text,errors:['正则渲染线程启动超时，已保留原文']});},10000);
    const executionTimer=()=>{clearTimeout(timer);timer=setTimeout(()=>{cleanup();resolve({text:latest.text,errors:[...latest.errors,(ruleName?ruleName+'：':'')+'正则处理超时，已保留已完成的渲染']});},1500);};
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=e=>{if(e.data.type==='progress'){latest={text:e.data.text,errors:e.data.errors};ruleName=e.data.ruleName;executionTimer();return;}cleanup();resolve(e.data);};worker.onerror=()=>{cleanup();resolve({text:latest.text,errors:[...latest.errors,'正则处理失败，已保留已完成的渲染']});};
    worker.postMessage({text,rules:JSON.parse(JSON.stringify(rules)),context});
  });
}
