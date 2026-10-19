import type {Session,Turn,Variant} from './contracts';
export interface ReplayIssue {turnId:string;variantId:string;round:number;stage:string;message:string;characters:number;present:number;fieldPath?:string;actorId?:string}
const issuesKey=Symbol('state-replay-issues');
type TracedSession=Session&{[issuesKey]?:Readonly<{entries:ReplayIssue[]}>};
export function replayIssues(session:Session):ReplayIssue[]{
  const entries=(session as TracedSession)[issuesKey]?.entries||[];
  return entries.filter(e=>session.turns.some(t=>t.id===e.turnId&&t.variants[t.selected]?.id===e.variantId));
}
export function recordReplayIssue(session:Session,turn:Turn,variant:Variant,stage:string,error:unknown){
  const owner=session as TracedSession;
  if(!owner[issuesKey])Object.defineProperty(owner,issuesKey,{value:Object.freeze({entries:[]}),enumerable:false,configurable:true});
  const entries=owner[issuesKey]!.entries;
  // Only known local validation messages are retained, never arbitrary upstream output.
  const message=error instanceof Error&&/^(?:MVU|状态|变量|人物|角色|好感|旧版|事件|骰|论坛|日记|精神体|新角色)/u.test(error.message)?error.message.replace(/[\r\n]/g,' ').slice(0,180):'本轮数据未通过校验';
  const context=error as {fieldPath?:unknown;actorId?:unknown}|undefined;
  const fieldPath=typeof context?.fieldPath==='string'&&/^\/(?:player|characters)\/[\p{L}\p{N}_.:\/~\-]{1,200}$/u.test(context.fieldPath)?context.fieldPath:undefined;
  const actorId=typeof context?.actorId==='string'&&/^[\p{L}\p{N}_.:\-]{1,128}$/u.test(context.actorId)?context.actorId:undefined;
  const entry={turnId:turn.id,variantId:variant.id,round:session.turns.indexOf(turn)+1,stage,message,characters:variant.outcome?.characters?.length||0,present:variant.outcome?.characters?.filter(c=>c.present===true).length||0,...(fieldPath?{fieldPath}:{}),...(actorId?{actorId}:{})};
  if(entries.some(e=>e.turnId===entry.turnId&&e.variantId===entry.variantId&&e.stage===stage&&e.message===message))return;
  entries.unshift(entry);entries.splice(40);
}
export function clearReplayIssues(session:Session,turnId:string,variantId:string){
  const entries=(session as TracedSession)[issuesKey]?.entries;if(!entries)return;
  for(let i=entries.length-1;i>=0;i--)if(entries[i].turnId===turnId&&entries[i].variantId===variantId)entries.splice(i,1);
}
