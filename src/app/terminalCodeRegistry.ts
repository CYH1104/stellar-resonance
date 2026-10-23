import type {Session} from '../domain/contracts';
import {stateAt} from '../domain/story';
import {terminalCodeBindings,terminalCodeIds,terminalCodePath,validTerminalCode} from '../domain/terminalCodeVariables';
/** One allocation persisted in initial MVU, before any model call; preserve existing story codes. */
export function ensureTerminalCodes(session:Session,before=session.turns.length){const state=stateAt(session,before),current=terminalCodeBindings(state),used=new Set([...Object.values(current),...Object.values(session.initial.variables?.终端码||{}).filter(validTerminalCode)]),historic=new Set<string>();
 for(const turn of session.turns)for(const v of turn.variants)for(const op of [...v.outcome?.mvu||[],...v.mvuOverride||[]])if(op.path.startsWith('/custom/终端码/')&&validTerminalCode(op.value)){historic.add(op.path);used.add(op.value);}
 let changed=false;for(const id of terminalCodeIds(state)){if(current[id]||historic.has(terminalCodePath(id)))continue;const bytes=new Uint32Array(2);let code='',attempt=0;do{crypto.getRandomValues(bytes);code=(10000000000n+(BigInt(bytes[0])*4294967296n+BigInt(bytes[1])+BigInt(attempt++))%90000000000n).toString();}while(used.has(code));used.add(code);session.initial.variables||={};const map=(session.initial.variables.终端码||={}) as Record<string,string>;map[id]=code;changed=true;}return changed;}
