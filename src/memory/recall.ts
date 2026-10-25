import type {Memory} from '../domain/contracts';
import {memoryReady} from '../domain/memories.ts';
import {factAudienceCovers,factId,factLabel} from '../domain/knowledge.ts';
import {isTerminalMemoryNote} from '../domain/terminalLedger.ts';
import {retrieve} from './retrieval.ts';

/** Conservative candidates derived from the record itself: the actor of a charAction and
 * the participants of an open commitment, but only when the name maps to exactly one
 * stable id. Runs even when facts exist, so a facts list that does not mention an action
 * cannot make its actor forget their own deed — derived scope stays actor-only (never
 * broadened to public) and actions already quoted verbatim by a fact are skipped per
 * action, so one covered action never hides the character's other uncovered ones. Ambiguous names stay narrator-only prose. */
export function derivedFacts(m:Memory,resolveName?:(name:string)=>string|undefined):{id:string;text:string;knownBy:string[]}[]{
 if(m.kind!=='event'||!m.record||!resolveName)return [];
 const facts=m.record.facts||[];
 const covered=(t:string)=>t.length>=8&&facts.some(f=>f.text.length>=2&&(f.text.includes(t)||t.includes(f.text)));
 const out:{id:string;text:string;knownBy:string[]}[]=[];
 m.record.charActions.forEach((c,i)=>{const rest=c.actions.filter(a=>!covered(a));if(!rest.length)return;const id=resolveName(c.name);if(id)out.push({id:factId(m.id,'legacy-ca-'+i),text:c.name+'的行动：'+rest.join('；'),knownBy:[id]});});
 m.record.commitments.forEach((c,i)=>{if(c.status!=='open'||covered(c.content))return;const ids=c.participants.map(resolveName);if(ids.every(x=>x!==undefined))out.push({id:factId(m.id,'legacy-cm-'+i),text:'约定（'+c.participants.join('、')+'）：'+c.content+'；期限：'+c.deadline,knownBy:ids as string[]});});
 return out;
}
function factVectorOf(m:Memory,id:string,text:string,model?:string){
 const v=model?m.factVectors?.find(v=>v.id===id&&v.model===model):m.factVectors?.find(v=>v.id===id);
 return v&&v.text===text&&v.values.length&&v.values.every(Number.isFinite)?{model:v.model,values:v.values,text:v.text}:undefined;
}
export function projectScoped(items:Memory[],audience:string[],noteCandidates?:(m:Memory)=>Memory[],resolveName?:(name:string)=>string|undefined,model?:string):Memory[]{
 if(!audience.length){
  // Narrator: parents plus every fact (the narrator saw the prose that produced them).
  // Fact text stays plain here; labels are attached at prompt assembly so vectors
  // keep matching the stored candidate text.
  const out:Memory[]=[];
  for(const m of items){
   if(!memoryReady(m))continue;
   if(isTerminalMemoryNote(m)){out.push(...(noteCandidates?noteCandidates(m):[m]));continue;}
   out.push(m);
   const facts=m.kind==='event'?m.record?.facts:undefined;
   facts?.forEach((f,i)=>{const id=factId(m.id,i),vector=factVectorOf(m,id,f.text,model);out.push({id,text:f.text,kind:'note',createdAt:m.createdAt,source:m.source,revision:m.revision,revisions:m.revisions,...(vector?{vector}:{})});});
  }
  return out;
 }
 const out:Memory[]=[];
 for(const m of items){
  if(!memoryReady(m))continue;
  if(isTerminalMemoryNote(m)){out.push(...(noteCandidates?noteCandidates(m):[]));continue;}
  if(m.kind!=='event'||!m.record)continue;
  const facts=m.record.facts;
  const derived=derivedFacts(m,resolveName);
  const emit=(id:string,text:string,knownBy:string[]|undefined)=>{
   if(!factAudienceCovers(knownBy,audience))return;
   const vector=factVectorOf(m,id,text,model);
   out.push({id,text,kind:'note',createdAt:m.createdAt,source:m.source,revision:m.revision,revisions:m.revisions,...(vector?{vector}:{})});
  };
  facts?.forEach((f,i)=>emit(factId(m.id,i),f.text,f.knownBy));
  derived.forEach(d=>emit(d.id,d.text,d.knownBy));
 }
 return out;
}
export interface ScopedRecallOptions{
 items:Memory[];
 query:string;
 /** Empty/undefined = narrator (prose): unrestricted, parent events included. */
 audience?:string[];
 model?:string;
 vector?:number[];
 candidate?:boolean;
 /** Expands a terminal note into pre-filtered scoped segment candidates. */
 noteCandidates?:(m:Memory)=>Memory[];
 /** Resolves a character name to its unique stable id for legacy archives. */
 resolveName?:(name:string)=>string|undefined;
 /** Optional single query-embedding call; invoked at most once, after projection. */
 embed?:(q:string)=>Promise<number[]|undefined>;
}
export async function recallScoped(options:ScopedRecallOptions):Promise<Memory[]>{
 const {items,query,model,candidate,noteCandidates,resolveName,embed}=options,audience=options.audience||[];
 const projected=projectScoped(items,audience,noteCandidates,resolveName,model);
 if(!projected.length)return [];
 let vector=options.vector;
 if(!vector&&embed){try{vector=await embed(query);}catch{vector=undefined;}}
 // Newer revisions win stable ties; the projection keeps one entry per stable id.
 const ordered=[...projected].sort((a,b)=>(b.revision||0)-(a.revision||0));
 return await retrieve(ordered,query,model,vector,!!candidate);
}
/** Narrator-facing labeling: every fact hit states its audience or "unknown" in the prose.
 * Terminal segment hits are labeled by the caller-provided resolver (the segment's
 * write-time audience); plain text keeps matching the stored vector until the label. */
export function labelNarratorFacts(hits:Memory[],items:Memory[],segmentLabel?:(hit:Memory)=>string|undefined):Memory[]{
 return hits.map(m=>{
  const seg=segmentLabel?.(m);
  if(seg!==undefined)return m.text.endsWith(seg)?m:{...m,text:m.text+seg};
  const at=m.id.indexOf(':fact:');
  if(at<0||m.kind!=='note')return m;
  const parent=items.find(x=>x.id===m.id.slice(0,at)),index=m.id.slice(at+':fact:'.length);
  const fact=parent?.record?.facts?.[Number(index)];
  if(!fact)return m;
  const label=factLabel(fact.knownBy);
  return m.text.endsWith(label)?m:{...m,text:m.text+label};
 });
}
