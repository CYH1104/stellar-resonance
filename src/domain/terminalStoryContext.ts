import type {Session} from './contracts';
import {stateAt,visibleMemories} from './story.ts';
import {memoryReady} from './memories.ts';
import {factAudienceCovers} from './knowledge.ts';
import {isTerminalMemoryNote} from './terminalLedger.ts';

/** Retain the start and, especially, the latest actions of long confirmed prose. */
export function terminalStoryExcerpt(text:string,limit:number){
 if(text.length<=limit)return text;
 const marker='\n…[中段省略]…\n';
 if(limit<=marker.length)return text.slice(-limit);
 const head=Math.floor((limit-marker.length)/3);
 return text.slice(0,head)+marker+text.slice(-(limit-marker.length-head));
}

/** Recent scoped facts are context, not search hits: short inputs must not erase them.
 * Raw narrator prose and thoughts are never inferred to be public from presence alone. */
export function terminalStoryFacts(s:Session,before=s.turns.length,audience?:string[]){
 const state=stateAt(s,before),names=new Map<string,Set<string>>();
 for(const a of [state.player,...state.characters,...s.terminal?.contacts||[]]){
  if(!a?.name||!a.id)continue;
  const key=a.name.trim(),ids=names.get(key)||new Set<string>();ids.add(a.id);names.set(key,ids);
 }
 const resolve=(name:string)=>{const ids=names.get(name.trim());return ids?.size===1?[...ids][0]:undefined;};
 const out:{text:string;knownBy:string[]}[]=[],seen=new Set<string>();let used=0;
 const add=(text:string,knownBy?:string[])=>{
  if(!knownBy?.length||!text.trim()||audience&&!factAudienceCovers(knownBy,audience))return;
  const bounded=terminalStoryExcerpt(text.trim(),800),key=JSON.stringify([bounded,[...knownBy].sort()]);
  if(seen.has(key)||out.length>=8||used+bounded.length>3000)return;
  seen.add(key);out.push({text:bounded,knownBy:[...knownBy]});used+=bounded.length;
 };
 const ranks=new Map(s.turns.map((t,i)=>[t.id,i]));
 const memories=visibleMemories(s,before).slice().sort((a,b)=>(ranks.get(b.sourceTurn||'')??-1)-(ranks.get(a.sourceTurn||'')??-1));
 for(const m of memories){
  if(m.kind!=='event'||!memoryReady(m)||isTerminalMemoryNote(m)||!m.record)continue;
  for(const f of m.record.facts||[])add(f.text,f.knownBy);
  // Legacy structured memories still prove a character's own actions and commitments.
  // Unknown/ambiguous names never gain a wider audience.
  for(const c of m.record.charActions||[]){const id=resolve(c.name);if(id)for(const action of c.actions){if(action.length>=8&&m.record.facts?.some(f=>f.text.length>=2&&(f.text.includes(action)||action.includes(f.text))))continue;add(c.name+'的行动：'+action,[id]);}}
  for(const c of m.record.commitments||[]){if(c.status!=='open')continue;const ids=c.participants.map(resolve);if(ids.length&&ids.every((id):id is string=>!!id))add('约定（'+c.participants.join('、')+'）：'+c.content+'；期限：'+c.deadline,ids);}
  if(out.length>=8||used>=3000)break;
 }
 return out;
}
