import {rankMemories,type SearchItem} from './scoring';
self.onmessage=(event:MessageEvent<{items:SearchItem[];query:string;vector?:number[]}> )=>{const {items,query,vector}=event.data;self.postMessage(rankMemories(items,query,vector));};
