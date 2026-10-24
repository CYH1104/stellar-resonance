import type {FormatErrorRecord} from '../storage/formatErrors';
import type {Session} from './contracts';
const timestamp=(at:unknown)=>typeof at==='string'&&Number.isFinite(Date.parse(at))?Date.parse(at):-Infinity;
const newest=(a:{at:string},b:{at:string})=>timestamp(a.at)===timestamp(b.at)?0:timestamp(a.at)>timestamp(b.at)?-1:1;
export function runLogGroups(entries:FormatErrorRecord[],sessions:Pick<Session,'id'|'name'|'turns'>[]){
 const groups=new Map<string,{id:string;sessionId:string;turnId:string;name:string;round?:number;at:string;entries:FormatErrorRecord[]}>();
 for(const entry of entries){
  const id=entry.sessionId&&entry.turnId?JSON.stringify([entry.sessionId,entry.turnId]):entry.id;
  let group=groups.get(id);
  if(!group){const session=sessions.find(s=>s.id===entry.sessionId),index=session?.turns.findIndex(t=>t.id===entry.turnId)??-1;
   group={id,sessionId:entry.sessionId,turnId:entry.turnId,name:session?.name||(entry.sessionId?'会话 '+entry.sessionId.slice(0,8):'独立运行记录'),round:index>=0?index+1:entry.round,at:entry.at,entries:[]};groups.set(id,group);
  }
  group.entries.push(entry);if(newest(entry,group)<0)group.at=entry.at;if(!group.round&&entry.round)group.round=entry.round;
 }
 return [...groups.values()].sort(newest).map(group=>({...group,entries:[...group.entries].sort(newest),errors:group.entries.filter(e=>e.sections?.some(s=>s.kind==='errors')||e.kind==='runtime'||e.kind==='format'&&e.code!=='STATE_COMPAT_RECOVERED'||e.code==='GENERATION_INCOMPLETE').length,generations:group.entries.filter(e=>e.kind==='generation').length}));
}
export function runLogLabel(entry:FormatErrorRecord){return entry.code==='STATE_COMPAT_RECOVERED'?'格式兼容记录':entry.kind==='generation'?'剧情生成':entry.kind==='terminal'?'终端操作':entry.kind==='runtime'?'运行情况 / 报错':'格式错误';}
export type RunLogGroup=ReturnType<typeof runLogGroups>[number];
export function runLogCalls(group:RunLogGroup){
 const calls=new Map<string,{id:string;callId?:string;at:string;entries:FormatErrorRecord[]}>();
 for(const entry of group.entries){const id=entry.callId||entry.id;let call=calls.get(id);if(!call){call={id,callId:entry.callId,at:entry.at,entries:[]};calls.set(id,call);}call.entries.push(entry);if(newest(entry,call)<0)call.at=entry.at;}
 return [...calls.values()].sort(newest);
}
export function copyableRunLog(group:ReturnType<typeof runLogGroups>[number]){
 return [group.name+' · '+(group.round?'第 '+group.round+' 轮':'历史运行记录'),`会话 ${group.sessionId||'未关联'} · 楼层 ${group.turnId||'未关联'}`,...group.entries.map(entry=>[
  `${entry.at} · ${runLogLabel(entry)} · ${entry.code}${entry.callId?' · 调用 '+entry.callId:''}`,entry.variantId?'稿件 '+entry.variantId:'',entry.raw,entry.sections?.map(section=>`【${section.title}】`+(section.text?'\n'+section.text:'')+(section.details?.length?'\n'+section.details.join('\n'):'')+(section.variables?'\n变量变化\n'+JSON.stringify(section.variables,null,2):'')).join('\n'),!entry.sections?.length&&entry.variables?'变量变化\n'+JSON.stringify(entry.variables,null,2):''
 ].filter(Boolean).join('\n'))].join('\n\n');
}
