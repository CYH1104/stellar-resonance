import {hybridRanks} from './hybrid';
import {rankMemories,type SearchItem} from './scoring';
self.onmessage=(event:MessageEvent<{id:number;candidate?:boolean;items:SearchItem[];query:string;vector?:number[]}> )=>{const {id,candidate,items,query,vector}=event.data;self.postMessage({id,ids:(candidate?hybridRanks:rankMemories)(items,query,vector)});};
