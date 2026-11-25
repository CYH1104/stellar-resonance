import type {Session} from './contracts';
import {stateAt} from './story.ts';
import {terminalStoryClock} from './storyScene.ts';
import {orderedMemoryRecords,latestCommitmentEntries,commitmentStatus} from './memoryCommitments.ts';
import {terminalVisibility,formatTerminalSegment,isTerminalMemoryNote} from './terminalLedger.ts';
export type MemoryTableId='state'|'people'|'events'|'facts'|'promises'|'games';
export interface DatabaseRow {id:string;cells:string[];memoryId?:string;sourceTurn?:string;detail?:string}
export interface MemoryTable {id:MemoryTableId;name:string;columns:string[];rows:DatabaseRow[]}
/** A disposable view of the existing archive. No second database, migration or copied facts. */
export function memoryDatabase(s:Session):MemoryTable[]{
 const ordered=orderedMemoryRecords(s),events=ordered.filter(m=>m.kind==='event'&&m.record&&!isTerminalMemoryNote(m));
 const state=stateAt(s),last=s.turns.at(-1),clock=terminalStoryClock(state,last?.variants[last.selected]?.text||s.opening);
 const name=(id:string)=>[state.player,...state.characters,...s.terminal?.contacts||[]].find(a=>a.id===id)?.name||id;
 const source=(m:typeof events[number])=>({memoryId:m.id,sourceTurn:m.sourceTurn});
 const tables:MemoryTable[]=[
  {id:'state',name:'当前状态',columns:['字段','已确认内容','依据'],rows:[
   {id:'time',cells:['剧情日期 / 时间',clock.label+' '+clock.time,'当前剧情场景']},
   {id:'location',cells:['地点',clock.location||'未明确','当前剧情场景']},
   {id:'present',cells:['在场人物',[state.player,...state.characters.filter(a=>a.present)].map(a=>a.name).join('、'),'已提交人物状态']},
   {id:'count',cells:['有效事件 / 待办约定',events.length+' / '+latestCommitmentEntries(ordered).filter(e=>e.commitment.status==='open').length,'当前剧情路径']}
  ]},
  {id:'people',name:'人物状态',columns:['人物','身份','异能 / 等级','好感 / 体力 / 专注','在场'],rows:[state.player,...state.characters].map(a=>({id:a.id,cells:[a.name,a.identity||'未明确',[a.ability,a.mentalPowerLevel].filter(Boolean).join(' / ')||'未明确',[a.affinity,a.energy,a.focus].map(v=>v===undefined?'—':String(v)).join(' / '),a.id===state.player.id||a.present?'是':'否']}))},
  {id:'events',name:'事件纪要',columns:['时间 / 地点','人物','事件概览'],rows:events.slice().reverse().map(m=>({id:m.id,...source(m),cells:[m.record!.time+' / '+m.record!.location,m.record!.participants.join('、'),[...m.record!.userActions,...m.record!.charActions.map(c=>c.name+'：'+c.actions.join('；'))].join('；')],detail:m.text}))},
  {id:'facts',name:'知情事实',columns:['时间','事实','知情角色'],rows:events.slice().reverse().flatMap(m=>(m.record!.facts||[]).map((f,i)=>({id:m.id+':'+i,...source(m),detail:f.text,cells:[m.record!.time,f.text,f.knownBy?.length?f.knownBy.map(name).join('、'):'未知（不注入角色请求）']})))},
  {id:'promises',name:'约定追踪',columns:['状态','参与者','内容','期限'],rows:latestCommitmentEntries(ordered).reverse().map(({commitment:c,memory:m})=>({id:c.id,...source(m),detail:[c.participants.join('、'),c.content,c.deadline,commitmentStatus(c.status)].join('；'),cells:[commitmentStatus(c.status),c.participants.join('、'),c.content,c.deadline]}))},
  {id:'games',name:'小游戏记录',columns:['剧情轮次','参与者','已确认经过 / 结果'],rows:[]}
 ];
 const visibility=terminalVisibility(s),rank=new Map(s.turns.map((t,i)=>[t.id,i+1])),seen=new Set<string>();
 const archived=new Set((s.terminal?.partyRooms||[]).flatMap(room=>room.rounds.filter(r=>r.archived||r.anchor&&!visibility.anchor(r.anchor)).map(r=>room.id+':'+r.number)));
 for(const b of [...s.terminal?.memories||[]].reverse())if(visibility.anchor(b.anchor))for(const g of [...b.games].reverse()){
  if(seen.has(g.id)||archived.has(g.id)||!visibility.origin(g.origin))continue;seen.add(g.id);
  tables[5].rows.push({id:g.id,detail:formatTerminalSegment(g),sourceTurn:b.anchor.turnId||undefined,cells:[rank.has(b.anchor.turnId)?'第'+rank.get(b.anchor.turnId)+'轮':'开场',g.knownBy?.map(name).join('、')||'未知',formatTerminalSegment(g)]});
 }
 return tables;
}
export function databasePage(table:MemoryTable,query:string,page:number,size=20){
 const q=query.trim().toLocaleLowerCase(),rows=q?table.rows.filter(r=>[...r.cells,r.detail||'',r.sourceTurn||''].some(t=>t.toLocaleLowerCase().includes(q))):table.rows;
 const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(Math.max(1,page),pages);
 return {rows:rows.slice((current-1)*size,current*size),total:rows.length,pages,current};
}
