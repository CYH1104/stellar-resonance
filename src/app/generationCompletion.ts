import {reactive} from 'vue';

export interface CompletionSignal {id:string;at:number;pending:number}
export const generationCompletion=reactive<CompletionSignal>({id:'',at:0,pending:0});
const pending=new Set<string>();
export function startGeneration(id:string){pending.add(id);generationCompletion.pending=pending.size;}
export function finishGeneration(id:string){pending.delete(id);generationCompletion.pending=pending.size;}
const seen:string[]=[];

export function markGenerationComplete(callId:string):boolean{
 if(!callId||seen.includes(callId))return false;
 seen.push(callId);
 if(seen.length>200)seen.splice(0,seen.length-200);
 generationCompletion.id=callId;
 generationCompletion.at=Date.now();
 return true;
}
export function clearCompletionHistory():void{seen.length=0;}
