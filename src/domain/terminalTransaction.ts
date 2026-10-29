import type {Memory,Session} from './contracts';

/** Undo only the synchronous memory changes made by one terminal apply. Other edits may
 * arrive while its storage transaction waits; even a concurrent edit of a touched note wins. */
export function rollbackTerminalMemories(session:Session,before:Memory[],applied:Memory[]){
 const old=new Map(before.map(m=>[m.id,m])),after=new Map(applied.map(m=>[m.id,m]));
 for(const id of new Set([...old.keys(),...after.keys()])){
  const previous=old.get(id),written=after.get(id);
  if(JSON.stringify(previous)===JSON.stringify(written))continue;
  const index=session.memories.findIndex(m=>m.id===id),live=index<0?undefined:session.memories[index];
  if(JSON.stringify(live)!==JSON.stringify(written))continue;
  if(previous){if(index<0)session.memories.push(structuredClone(previous));else session.memories[index]=structuredClone(previous);}
  else if(index>=0)session.memories.splice(index,1);
 }
}
