import {resolveWorldbooks,type Worldbook,type LoreContext} from './worldbooks';
export function runWorldbooks(books:Worldbook[],context:LoreContext,signal?:AbortSignal):Promise<ReturnType<typeof resolveWorldbooks>>{
 if(signal?.aborted)return Promise.reject(new DOMException('已停止','AbortError'));
 // Plain keyword matching does not execute imported expressions and stays synchronous.
 if(!books.some(b=>b.entries.some(e=>e.enabled&&[...e.keys,...e.secondaryKeys].some(k=>/^\/[\s\S]*\/[a-z]*$/i.test(k)))))return Promise.resolve(resolveWorldbooks(books,context));
 return new Promise((resolve,reject)=>{
  let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,settled=false;
  const finish=(error?:Error,result?:ReturnType<typeof resolveWorldbooks>)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(result!);};
  const abort=()=>finish(new DOMException('已停止','AbortError'));
  try{
   worker=new Worker(new URL('./worldbooks.worker.ts',import.meta.url),{type:'module'});
   const timeout=()=>finish(Error('世界书正则扫描超时，输入和现有记录已保留，请检查关键词正则后重试。'));
   timer=setTimeout(timeout,10000);signal?.addEventListener('abort',abort,{once:true});
   worker.onerror=()=>finish(Error('世界书扫描失败，输入和现有记录已保留。'));
   worker.onmessage=event=>{
    if(event.data?.type==='ready'){
     if(timer)clearTimeout(timer);timer=setTimeout(timeout,3000);
     try{worker!.postMessage({books:JSON.parse(JSON.stringify(books)),context:JSON.parse(JSON.stringify(context))});}catch{finish(Error('世界书扫描资料无法读取，输入和现有记录已保留。'));}
    }else if(event.data?.type==='done')finish(undefined,event.data.result);
    else finish(Error('世界书扫描失败，输入和现有记录已保留。'));
   };
   if(signal?.aborted)abort();
  }catch{finish(Error('世界书正则扫描线程不可用，输入和现有记录已保留。'));}
 });
}
