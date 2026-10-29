import type {Session} from './contracts';
export const terminalTaskPrefix='auto2:';
/** A downgrade must not interpret new stage identities as missing legacy jobs and generate twice. */
export function hasTerminalTaskContract(sessions:Session[]){return sessions.some(s=>s.terminal?.jobs?.some(j=>typeof j?.id==='string'&&j.id.startsWith(terminalTaskPrefix)||j?.target==='continuation-context'));}

/** The marker makes older readers stop before silently ignoring edit-aware provenance. */
export function hasVersionedTerminalContext(sessions:Session[]){
 let found=false;
 for(const s of sessions)for(const job of s.terminal?.jobs||[])if(job.contextVersion!==undefined){
  if(job.contextVersion!==1||job.target!=='continuation-context')throw Error('终端续写上下文版本不支持，请更新页面后再试。');
  found=true;
 }
 return found;
}
