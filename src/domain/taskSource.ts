/** Transient task provenance; the source save remains the sole business-data authority. */
export interface TaskSource {sessionId?:string;turnId?:string;variantId?:string}
const fail=()=>Object.assign(Error('任务来源存档不一致或标识不正确，已停止请求；原记录保留。'),{code:'NATIVE_TASK_SOURCE_INVALID',status:400});
function sourceId(value:unknown){if(value===undefined)return undefined;if(typeof value!=='string'||!value.trim()||value.length>200)throw fail();return value;}
export function sourceSessionForRequest(path:string,body:any):string|undefined{
 const supplied=sourceId(body?.sessionId);
 if(path!=='memory'||!Array.isArray(body?.rounds)||!body.rounds.length)return supplied;
 const ids=body.rounds.map((round:any)=>sourceId(round?.sessionId)),first=ids[0];
 if(ids.some((id:string|undefined)=>id!==first)||supplied!==undefined&&first!==undefined&&supplied!==first)throw fail();
 return supplied??first;
}

export function taskPersonaSignature(value:unknown){return JSON.stringify(Object.entries(value&&typeof value==='object'?value:{}).sort(([a],[b])=>a<b?-1:a>b?1:0));}
