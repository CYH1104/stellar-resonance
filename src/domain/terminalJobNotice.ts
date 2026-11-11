import type {Session} from './contracts';
import {terminalAnchorActive,terminalJobTurnIndex,type TerminalJob} from './terminalLedger.ts';

/** The phone shows one current status, rather than a backlog of failed rounds.
 * A later successful stage supersedes older notices without changing their jobs or messages.
 * Order by the producing turn, because terminal-first anchors the preceding turn and an
 * explicit retry of an old round must not displace the current round's status.
 */
export function terminalJobNotice(session:Session):TerminalJob|undefined{
 let latest:TerminalJob|undefined,latestTurn=-1;
 for(const job of session.terminal?.jobs||[]){
  if(job.target!=='auto'||!terminalAnchorActive(session,job.anchor))continue;
  const index=terminalJobTurnIndex(session,job),turn=session.turns[index];
  if(!turn||job.variantId&&turn.variants[turn.selected]?.id!==job.variantId)continue;
  if(index>=latestTurn){latest=job;latestTurn=index;}
 }
 return latest?.status==='ready'?undefined:latest;
}
