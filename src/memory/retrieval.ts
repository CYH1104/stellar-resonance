import type {Memory} from '../domain/contracts';
import {memoryReady,vectorCurrent} from '../domain/memories';
import {rankMemories} from './scoring';
export function retrieve(items:Memory[],query:string,model?:string,vector?:number[]):Promise<Memory[]>{
 const eligible=items.filter(memoryReady),data={query,vector:vector?[...vector]:undefined,items:eligible.map(m=>({id:m.id,text:m.text,vector:model&&vectorCurrent(m,model)?[...m.vector!.values]:undefined}))};
 const resolveIds=(ids:string[])=>ids.map(id=>eligible.find(m=>m.id===id)).filter((m):m is Memory=>!!m);
 return new Promise(resolve=>{let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined;let settled=false;const done=(ids?:string[])=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();resolve(resolveIds(ids||rankMemories(data.items,query,vector)));};
 try{worker=new Worker(new URL('./scoring.worker.ts',import.meta.url),{type:'module'});timer=setTimeout(()=>done(),5000);worker.onmessage=e=>done(Array.isArray(e.data)?e.data:undefined);worker.onerror=()=>done();worker.postMessage(data);}catch{done();}
 });
}
