import type {Session} from './contracts';
export const terminalTaskPrefix='auto2:';
/** A downgrade must not interpret new stage identities as missing legacy jobs and generate twice. */
export function hasTerminalTaskContract(sessions:Session[]){return sessions.some(s=>s.terminal?.jobs?.some(j=>typeof j?.id==='string'&&j.id.startsWith(terminalTaskPrefix)||j?.target==='continuation-context'));}
