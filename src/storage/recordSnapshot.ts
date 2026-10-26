import type {Session,Snapshot} from '../domain/contracts';
import type {PersonalTerminal,TerminalConversation,KingRoom} from '../domain/personalTerminal';

export type SnapshotRows=Map<string,string>;
export const rowKey=(...parts:(string|number)[])=>JSON.stringify(parts);
export const recordFormat='workspace-records-v1';
const put=(rows:SnapshotRows,key:string,value:unknown)=>{if(rows.has(key))throw Error('存档记录身份重复，已停止写入');rows.set(key,JSON.stringify(value));return key;};
export function terminalRows(t:PersonalTerminal,sid:string,rows:SnapshotRows=new Map()):SnapshotRows{
 const {conversations,rooms,divinations,...value}=t;
 const chats=conversations.map(c=>{const {messages,...value}=c;const ids=messages.map((m,i)=>put(rows,rowKey('message',sid,c.id,m.id,i),m));return put(rows,rowKey('conversation',sid,c.id),{value,messages:ids});});
 const games=rooms.map(r=>{const {rounds,...value}=r;const ids=rounds.map((round,i)=>put(rows,rowKey('round',sid,r.id,round.number,i),round));return put(rows,rowKey('room',sid,r.id),{value,rounds:ids});});
 const draws=divinations?.map(d=>put(rows,rowKey('divination',sid,d.day,d.actorId),d));
 put(rows,rowKey('terminal',sid),{value,conversations:chats,rooms:games,...(draws?{divinations:draws}:{})});return rows;
}
export function sessionRows(s:Session,rows:SnapshotRows=new Map()):SnapshotRows{
 const {turns,memories,terminal,...value}=s;
 const turnIds=turns.map(t=>put(rows,rowKey('turn',s.id,t.id),t));
 const memoryIds=memories.map(m=>put(rows,rowKey('memory',s.id,m.id),m));
 if(terminal)terminalRows(terminal,s.id,rows);
 put(rows,rowKey('session',s.id),{value,turns:turnIds,memories:memoryIds,terminal:!!terminal});return rows;
}
export function snapshotRows(s:Snapshot):SnapshotRows{
 const rows=new Map<string,string>();
 for(const session of s.sessions)sessionRows(session,rows);
 put(rows,rowKey('preferences'),s.preferences);
 put(rows,rowKey('workspace'),{format:recordFormat,sessions:s.sessions.map(s=>rowKey('session',s.id)),...(s.archive?{archive:s.archive}:{})});return rows;
}
export function rowValue<T=any>(rows:SnapshotRows,key:string):T{const value=rows.get(key);if(value===undefined)throw Error('存档记录缺失，原始副本已保留');return JSON.parse(value);}
export function rowsSnapshot(rows:SnapshotRows):Snapshot|undefined{
 if(!rows.has(rowKey('workspace')))return;
 const root=rowValue(rows,rowKey('workspace'));if(root.format!==recordFormat||!Array.isArray(root.sessions))throw Error('存档记录格式过新或损坏');
 const sessions:Session[]=root.sessions.map((key:string)=>{const item=rowValue(rows,key);const s={...item.value,turns:item.turns.map((id:string)=>rowValue(rows,id)),memories:item.memories.map((id:string)=>rowValue(rows,id))};
  if(item.terminal){const t=rowValue(rows,rowKey('terminal',s.id));s.terminal={...t.value,conversations:t.conversations.map((id:string)=>{const c=rowValue(rows,id);return {...c.value,messages:c.messages.map((id:string)=>rowValue(rows,id))} as TerminalConversation;}),rooms:t.rooms.map((id:string)=>{const r=rowValue(rows,id);return {...r.value,rounds:r.rounds.map((id:string)=>rowValue(rows,id))} as KingRoom;}),...(t.divinations?{divinations:t.divinations.map((id:string)=>rowValue(rows,id))}:{})};}
  return s;
 });
 return {version:1,preferences:rowValue(rows,rowKey('preferences')),sessions,...(root.archive?{archive:root.archive}:{})};
}
export function validateRowKeys(rows:SnapshotRows){for(const key of rows.keys()){const parts=JSON.parse(key);if(!Array.isArray(parts)||!['workspace','preferences','session','turn','memory','terminal','conversation','message','room','round','divination'].includes(parts[0])||parts.some(p=>typeof p!=='string'&&typeof p!=='number'))throw Error('存在无法识别的记录类型，已停止读取');}}
