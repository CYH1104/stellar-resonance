import {onScopeDispose} from 'vue';
const flushers=new Map<()=>Promise<unknown>,number>();
/** Media/crop edits flush before the enclosing persona editor saves its draft. */
export function registerBackupFlusher(flush:()=>Promise<unknown>,priority=10){flushers.set(flush,priority);onScopeDispose(()=>flushers.delete(flush));}
export async function flushBackupEditors(){for(const [flush] of [...flushers].sort((a,b)=>a[1]-b[1]))await flush();}
