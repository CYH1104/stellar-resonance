import type { Memory } from '../domain/contracts';
export function retrieve(items: Memory[], query: string, model?: string, vector?: number[]): Promise<Memory[]> {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./scoring.worker.ts',import.meta.url),{type:'module'});
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('本地检索超时'));},5000);
    worker.onmessage=e=>{clearTimeout(timer);worker.terminate();const ids=e.data as string[];resolve(ids.map(id=>items.find(x=>x.id===id)!).filter(Boolean));};
    worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('本地检索暂不可用'));};
    try {
      worker.postMessage({query,vector:vector?[...vector]:undefined,items:items.map(m=>({id:m.id,text:m.text,vector:m.vector&&m.vector.model===model&&m.vector.text===m.text?[...m.vector.values]:undefined}))});
    } catch {clearTimeout(timer);worker.terminate();reject(new Error('记忆数据无法提交本地检索'));}
  });
}
