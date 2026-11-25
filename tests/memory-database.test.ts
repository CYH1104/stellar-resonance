import {expect,it} from 'vitest';
import {newSession,finishVariant,stateAt,visibleMemories,selectVariant,backup,parseBackup,defaults} from '../src/domain/story';
import {normalizeMemoryResult,activeCommitments,memorySignature,memoryText,type MemoryRequest} from '../src/domain/memories';
import {sourceFor,captureRevision} from '../src/domain/memoryLedger';
import {orderedMemoryRecords,latestCommitmentEntries,currentCommitmentProjection} from '../src/domain/memoryCommitments';
import {memoryDatabase,databasePage} from '../src/domain/memoryDatabase';
import {storyMemoryInjection,terminalMemoryInjection} from '../src/domain/memoryInjection';
import {terminalStoryFacts} from '../src/domain/terminalStoryContext';
import {projectScoped} from '../src/memory/recall';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import type {Session} from '../src/domain/contracts';
export function fixture(){const s=newSession('数据库',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.memoryEngine='candidate';s.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];return s;}
export function append(s:Session,status:'open'|'fulfilled'|'cancelled'='open'){
 const i=s.turns.length,t={id:'t'+i,input:'查阅计划',selected:0,variants:[{id:'v'+i,text:'第'+i+'次会面',status:'incomplete' as const,createdAt:''}]};s.turns.push(t);finishVariant(s,i,t.variants[0],{event:'会面'});
 const input:MemoryRequest={turnId:t.id,variantId:t.variants[0].id,input:t.input,story:t.variants[0].text,event:'会面',before:stateAt(s,i),after:stateAt(s,i+1),priorCommitments:activeCommitments(visibleMemories(s,i))};
 const m=s.memories.find(m=>m.sourceTurn===t.id)!;
 m.record=normalizeMemoryResult({participants:['玩家','甲'],time:'星历578年9月1日 14:00',location:'图书馆',userActions:['查阅计划'],charActions:[],gains:[],losses:[],commitments:[{id:'v0/promise-0',participants:['玩家','甲'],content:'归还星图',deadline:'明天',status}],affinityChanges:[],facts:[{text:'私人暗号是松树',knownBy:['a']}]},input);
 m.status='ready';m.source=sourceFor(s,input);m.sourceFingerprint=memorySignature(input);m.text=memoryText(m);return {m,input};
}
it('projects latest statuses in story order and preserves historical records, not completion timestamp order',()=>{
 const s=fixture();const old=append(s).m,done=append(s,'fulfilled').m;old.createdAt='2099';done.createdAt='1900';s.memories.reverse();
 const entries=latestCommitmentEntries(orderedMemoryRecords(s));expect(entries[0].commitment.status).toBe('fulfilled');
 const view=memoryDatabase(s);expect(view.find(t=>t.id==='promises')!.rows[0].cells[0]).toBe('已履行');
 const projected=currentCommitmentProjection([old,done],entries);expect(projected[0].record!.commitments).toEqual([]);expect(old.record!.commitments[0].status).toBe('open');
 const narrator=storyMemoryInjection(s,s.turns.length,[old],false).join('\n');expect(narrator).toContain('已履行');expect(narrator).not.toContain('未履行');
 const hits=projectScoped(projected,['a'],undefined,n=>({甲:'a',玩家:'player'}[n]));expect(hits.some(m=>m.text.includes('约定'))).toBe(false);
 expect(terminalStoryFacts(s,2,['a']).map(f=>f.text).join('\n')).toContain('已履行');
 expect(terminalMemoryInjection(s,['b'],hits.filter(m=>false)).join('\n')).not.toContain('归还星图');
 s.turns[1].variants.push({id:'alt',text:'没有归还',status:'complete',createdAt:'',outcome:{event:'离开'}});selectVariant(s,1,1);
 expect(memoryDatabase(s).find(t=>t.id==='promises')!.rows[0].cells[0]).toBe('未履行');
});
it('reserves an old outstanding promise when recent facts fill the budget, and enforces audience privacy',()=>{
 const s=fixture();append(s);for(let i=0;i<12;i++){const {m}=append(s);m.record!.commitments=[];m.record!.facts=[{text:'最新会面的已知事项'+i,knownBy:['a']}];m.text=memoryText(m);}
 const own=terminalMemoryInjection(s,['a'],[]).join('\n');expect(own).toContain('归还星图');expect(own).toContain('最新会面');expect(own.length).toBeLessThanOrEqual(3000);
 expect(terminalMemoryInjection(s,['a','b'],[])).toEqual([]);
 s.memories[0].status='pending';expect(terminalStoryFacts(s,13,['a']).some(f=>f.text.includes('归还星图'))).toBe(false);
});
it('keeps stable promise IDs across manual edits including deletion plus insertion and archive round trips',async()=>{
 const s=fixture(),{m,input}=append(s);m.record!.commitments.push({...m.record!.commitments[0],id:'v0/promise-1',content:'带伞'});
 const raw=structuredClone(m.record!);raw.commitments.shift();raw.commitments.push({...raw.commitments[0],id:'manual:new',content:'新的约定'});
 const updated=normalizeMemoryResult(raw,{...input,priorCommitments:m.record!.commitments});
 expect(updated.commitments[0].id).toBe('v0/promise-1');expect(new Set(updated.commitments.map(c=>c.id)).size).toBe(2);
 m.vector={model:'x',text:m.text,values:[1]};captureRevision(m);m.record=updated;m.text=memoryText(m);expect(m.vector).toBeUndefined();
 const snapshot={version:1 as const,sessions:[s],preferences:defaults()};
 const local=parseBackup(backup(snapshot));expect(local.sessions[0].memories[0].record).toEqual(updated);expect(local.sessions[0].memories[0].revisions).toHaveLength(1);
 const cloud=await createCloudSave(snapshot,snapshot.preferences);const restored=await parseCloudSave(cloud);expect(restored.snapshot.sessions[0].memories[0].record).toEqual(updated);
});
it('bounds the database page and searches details and source IDs without changing stored records',()=>{
 const s=fixture();for(let i=0;i<23;i++)append(s);const table=memoryDatabase(s).find(t=>t.id==='events')!;
 expect(databasePage(table,'',1).rows).toHaveLength(20);expect(databasePage(table,'',99).rows).toHaveLength(3);expect(databasePage(table,'t22',1).rows).toHaveLength(1);
});

it('prioritizes a recently updated old promise by its latest story occurrence',()=>{
 const s=fixture();append(s);
 for(let i=1;i<=5;i++){const {m}=append(s);m.record!.commitments[0].id='other-'+i;m.record!.commitments[0].content='较早约定'+i;m.text=memoryText(m);}
 const {m}=append(s);m.record!.commitments[0].content='归还星图的新安排';m.text=memoryText(m);
 const text=terminalMemoryInjection(s,['a'],[]).join('\n');
 expect(text).toContain('归还星图的新安排');
 expect(latestCommitmentEntries(orderedMemoryRecords(s)).at(-1)!.memory.id).toBe(m.id);
});
