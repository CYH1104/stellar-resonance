import type {FormatErrorRecord} from '../storage/formatErrors';
import type {Session} from './contracts';
export function runLogGroups(entries:FormatErrorRecord[],sessions:Pick<Session,'id'|'name'|'turns'>[]){
 const groups=new Map<string,{id:string;sessionId:string;turnId:string;name:string;round?:number;at:string;entries:FormatErrorRecord[]}>();
 for(const entry of entries){
  const id=entry.sessionId&&entry.turnId?JSON.stringify([entry.sessionId,entry.turnId]):entry.id;
  let group=groups.get(id);
  if(!group){const session=sessions.find(s=>s.id===entry.sessionId),index=session?.turns.findIndex(t=>t.id===entry.turnId)??-1;
   group={id,sessionId:entry.sessionId,turnId:entry.turnId,name:session?.name||(entry.sessionId?'会话 '+entry.sessionId.slice(0,8):'独立运行记录'),round:index>=0?index+1:entry.round,at:entry.at,entries:[]};groups.set(id,group);
  }
  group.entries.push(entry);if(entry.at>group.at)group.at=entry.at;if(!group.round&&entry.round)group.round=entry.round;
 }
 return [...groups.values()].sort((a,b)=>b.at.localeCompare(a.at)).map(group=>({...group,entries:group.entries.sort((a,b)=>a.at.localeCompare(b.at)),errors:group.entries.filter(e=>e.kind==='runtime'||e.kind==='format'&&e.code!=='STATE_COMPAT_RECOVERED'||e.code==='GENERATION_INCOMPLETE').length,generations:group.entries.filter(e=>e.kind==='generation').length}));
}
export function runLogLabel(entry:FormatErrorRecord){return entry.code==='STATE_COMPAT_RECOVERED'?'格式兼容记录':entry.kind==='generation'?'剧情生成':entry.kind==='runtime'?'运行情况 / 报错':'格式错误';}
