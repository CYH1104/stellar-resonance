import type {Memory} from '../domain/contracts';
import {memoryReady,vectorCurrent} from '../domain/memories';
import {rankMemories} from './scoring';
import {hybridRanks} from './hybrid';
let worker:Worker|undefined,serial=0;
const pending=new Map<number,{finish:(ids?:string[])=>void;timer:ReturnType<typeof setTimeout>}>();
function failWorker(){worker?.terminate();worker=undefined;for(const request of [...pending.values()])request.finish();}
function scorer(){if(worker)return worker;worker=new Worker(new URL('./scoring.worker.ts',import.meta.url),{type:'module'});worker.onmessage=e=>{const request=pending.get(e.data?.id);if(request)request.finish(Array.isArray(e.data.ids)?e.data.ids:undefined);};worker.onerror=failWorker;return worker;}
export function disposeRetrieval(){failWorker();}
export async function retrieve(items:Memory[],query:string,model?:string,vector?:number[],candidate=false):Promise<Memory[]>{
 const eligible=items.filter(memoryReady),data={candidate,query,vector:vector?[...vector]:undefined,items:eligible.map(m=>({id:m.id,text:m.text,vector:model&&vectorCurrent(m,model)?[...m.vector!.values]:undefined}))};
 const byId=new Map(eligible.map(m=>[m.id,m]));
 return new Promise(resolve=>{const id=++serial;let settled=false;const finish=(ids?:string[])=>{if(settled)return;settled=true;const request=pending.get(id);if(request)clearTimeout(request.timer);pending.delete(id);resolve((ids||(candidate?hybridRanks:rankMemories)(data.items,query,vector)).map(key=>byId.get(key)).filter((m):m is Memory=>!!m));};
 pending.set(id,{finish,timer:setTimeout(()=>{finish();if(!pending.size){worker?.terminate();worker=undefined;}},5000)});try{scorer().postMessage({id,...data});}catch{finish();}});
}
