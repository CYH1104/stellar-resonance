import type {RegexRule,RegexContext} from './regex';
export function runRegex(text:string,rules:RegexRule[],context:RegexContext,signal?:AbortSignal):Promise<{text:string;errors:string[]}>{
  if(signal?.aborted)return Promise.reject(new DOMException('已停止','AbortError'));
  if(!rules.some(r=>!r.disabled&&r.placement.includes(context.placement)))return Promise.resolve({text,errors:[]});
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./regex.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(new DOMException('已停止','AbortError'));};
    const timer=setTimeout(()=>{cleanup();resolve({text,errors:['正则处理超时，已保留原文']});},1500);
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=e=>{cleanup();resolve(e.data);};worker.onerror=()=>{cleanup();resolve({text,errors:['正则处理失败，已保留原文']});};
    worker.postMessage({text,rules:JSON.parse(JSON.stringify(rules)),context});
  });
}
