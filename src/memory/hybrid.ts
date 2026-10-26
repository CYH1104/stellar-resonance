import type {SearchItem} from './scoring';
import {cosine} from '../domain/story';
/** Local BM25 + reciprocal-rank fusion. Chinese bigrams avoid a network tokenizer. */
export function tokens(text:string){const lower=text.toLowerCase(),words=lower.match(/[a-z0-9_-]+|[\p{Script=Han}]+/gu)||[];return words.flatMap(w=>/^\p{Script=Han}+$/u.test(w)&&w.length>1?Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2)):[w]);}
let cached:{sources:{id:string;text:string}[];docs:string[][];frequencies:Map<string,number>[];df:Map<string,number>;avg:number}|undefined;
function index(items:SearchItem[]){
 if(cached&&cached.sources.length===items.length&&items.every((item,i)=>item.id===cached!.sources[i].id&&item.text===cached!.sources[i].text))return cached;
 const docs=items.map(m=>tokens(m.text)),df=new Map<string,number>(),frequencies=docs.map(d=>{const map=new Map<string,number>();for(const t of d)map.set(t,(map.get(t)||0)+1);for(const t of map.keys())df.set(t,(df.get(t)||0)+1);return map;});
 const next={sources:items.map(({id,text})=>({id,text})),docs,frequencies,df,avg:docs.reduce((n,d)=>n+d.length,0)/items.length||1};
 cached=items.reduce((n,m)=>n+m.text.length,0)<=3000000?next:undefined;return next;
}
export function hybridRanks(items:SearchItem[],query:string,vector?:number[]){
 if(!items.length)return [];
 const {docs,frequencies,df,avg}=index(items),terms=[...new Set(tokens(query))];
 const lexical=items.map((item,i)=>({id:item.id,i,score:terms.reduce((score,t)=>{const f=frequencies[i].get(t)||0;if(!f)return score;const idf=Math.log(1+(items.length-(df.get(t)||0)+.5)/((df.get(t)||0)+.5));return score+idf*f*2.2/(f+1.2*(.25+.75*docs[i].length/avg));},0)})).sort((a,b)=>b.score-a.score||a.i-b.i);
 const scores=new Map<string,number>();lexical.filter(x=>x.score>0).forEach((x,i)=>scores.set(x.id,1/(60+i+1)));
 if(vector?.length)items.filter(m=>m.vector?.length===vector.length).map(m=>({id:m.id,score:cosine(m.vector!,vector)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).forEach((x,i)=>scores.set(x.id,(scores.get(x.id)||0)+1/(60+i+1)));
 // Recent records are a bounded fallback only when no query term matches.
 return scores.size?[...scores].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id])=>id):[];
}
