import {reactive} from 'vue';

export interface CompletionSignal {id:string;at:number}
export const generationCompletion=reactive<CompletionSignal>({id:'',at:0});
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
