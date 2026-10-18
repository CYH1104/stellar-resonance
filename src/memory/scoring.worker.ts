import {hybridRanks} from './hybrid';
import {rankMemories,type SearchItem} from './scoring';
self.onmessage=(event:MessageEvent<{candidate?:boolean;items:SearchItem[];query:string;vector?:number[]}> )=>{const {candidate,items,query,vector}=event.data;self.postMessage((candidate?hybridRanks:rankMemories)(items,query,vector));};
