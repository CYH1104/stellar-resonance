import type {Memory,Session} from './contracts';
import {memoryContext} from './memories.ts';
import {orderedMemoryRecords,latestCommitmentEntries,commitmentLine,currentCommitmentProjection} from './memoryCommitments.ts';
import {terminalNarrativeRecall,terminalRecruitmentFacts,terminalStoryFacts,terminalGameFacts,terminalStoryExcerpt} from './terminalStoryContext.ts';
import {isTerminalMemoryNote,terminalLatestBucket,terminalNoteKey,memoryChunks} from './terminalLedger.ts';

/** The preview and production prompt share this assembler and the same eight-block budget. */
export function storyMemoryInjection(s:Session,before:number,recalled:Memory[],phone:boolean){
 const entries=latestCommitmentEntries(orderedMemoryRecords(s,before));
 const recent=entries.slice().reverse(),prioritized=[...recent.filter(e=>e.commitment.status==='open'),...recent.filter(e=>e.commitment.status!=='open').slice(0,10)];
 const lines:string[]=[];let used=0;
 for(const e of prioritized){const line=terminalStoryExcerpt(commitmentLine(e.commitment),700);if(lines.length===30||used+line.length>2400)break;lines.push(line);used+=line.length;}
 const chunks=lines.length?['当前约定状态（以此为准；旧事件只代表当时情况）\n'+lines.join('\n')]:[];
 if(phone)chunks.push(...terminalNarrativeRecall(s,before));
 const latestKey=phone?terminalLatestBucket(s,before)?.anchor.key:'';
 for(const m of recalled)if(phone&&isTerminalMemoryNote(m)&&terminalNoteKey(m)!==latestKey)chunks.push(...memoryChunks(m.text));
 return [...chunks,...memoryContext(currentCommitmentProjection(recalled,entries).filter(m=>!isTerminalMemoryNote(m)),[])].slice(0,8);
}
export function terminalMemoryInjection(s:Session,audience:string[],retrieved:Memory[]){
 const recent=[...terminalGameFacts(s,s.turns.length,audience),...terminalRecruitmentFacts(s,s.turns.length,audience),...terminalStoryFacts(s,s.turns.length,audience)].map(f=>f.text);
 return [...new Set([...recent,...retrieved.map(m=>terminalStoryExcerpt(m.text,700))])].slice(0,16);
}
