import type {Memory,Session} from './contracts';
import {memoryReady,formatMemory,type Commitment} from './memories.ts';
import {visibleMemories} from './story.ts';

/** Story order, never extraction time: summaries can finish out of order. */
export function orderedMemoryRecords(s:Session,before=s.turns.length){
 const rank=new Map(s.turns.map((t,i)=>[t.id,i]));
 return visibleMemories(s,before).filter(memoryReady).slice().sort((a,b)=>(rank.get(a.sourceTurn||'')??-1)-(rank.get(b.sourceTurn||'')??-1));
}
export interface CommitmentEntry {commitment:Commitment;memory:Memory}
export function latestCommitmentEntries(ordered:Memory[]):CommitmentEntry[]{
 const values=new Map<string,CommitmentEntry>();
 for(const memory of ordered)if(memory.kind==='event'&&memoryReady(memory)&&memory.record)for(const commitment of memory.record.commitments){
  // An updated old promise is recent too; Map.set alone preserves its first position.
  values.delete(commitment.id);values.set(commitment.id,{commitment,memory});
 }
 return [...values.values()];
}
export const commitmentStatus=(s:Commitment['status'])=>({open:'未履行',fulfilled:'已履行',cancelled:'已取消'}[s]);
export function commitmentLine(c:Commitment){return '约定（'+commitmentStatus(c.status)+'；'+c.participants.join('、')+'）：'+c.content+'；期限：'+c.deadline;}
/** Retrieval copies omit superseded structured promises; the saved history is untouched. */
export function currentCommitmentProjection(items:Memory[],entries:CommitmentEntry[]):Memory[]{
 const owners=new Map(entries.map(e=>[e.commitment.id,e.memory.id]));
 return items.map(m=>{
  if(!m.record||!m.record.commitments.some(c=>owners.has(c.id)&&owners.get(c.id)!==m.id))return m;
  const record={...m.record,commitments:m.record.commitments.filter(c=>!owners.has(c.id)||owners.get(c.id)===m.id)};
  return {...m,record,text:formatMemory(record)+(m.annotation?'\n补充：'+m.annotation:''),vector:undefined};
 });
}
