import { cosine, keywordScore } from '../domain/story';
self.onmessage = (event: MessageEvent<{items:{id:string;text:string;vector?:number[]}[];query:string;vector?:number[]}>) => {
  const {items,query,vector}=event.data;
  self.postMessage(items.map(m=>({id:m.id,score:keywordScore(m.text,query)+(vector&&m.vector?cosine(m.vector,vector)*5:0)})).sort((a,b)=>b.score-a.score).slice(0,8).map(m=>m.id));
};
