import type {Memory,Session} from './contracts';
import {memorySignature,memoryState,memoryReady,type MemoryRequest} from './memories.ts';
import {stateAt} from './story.ts';
export interface MemorySource {sessionId:string;sourceTurnId:string;sourceVariantId:string;sourceTextHash:string;sourceStateRevision:string}
export interface MemoryRevision {revision:number;at:string;text:string;annotation?:string;record?:Memory['record']}
export interface MemoryTask {id:string;source:MemorySource;status:'pending'|'running'|'ready'|'failed'|'stale';attempts:number;error?:string;updatedAt:string;extractorVersion:'ledger-v1'}
export interface MemoryMigration {version:1;at:string;legacy:Memory[];mapping:Record<string,string>;unconfirmed:string[]}
export function textHash(text:string){let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}return `${text.length}:${a>>>0}:${b>>>0}`;}
export function sourceFor(session:Session,request:MemoryRequest):MemorySource{return {sessionId:session.id,sourceTurnId:request.turnId,sourceVariantId:request.variantId,sourceTextHash:textHash(JSON.stringify([request.input,request.story])),sourceStateRevision:memorySignature(request)};}
export function taskFor(session:Session,request:MemoryRequest):MemoryTask{
 const source=sourceFor(session,request),id=[source.sessionId,source.sourceTurnId,source.sourceVariantId,source.sourceStateRevision].join('|');
 const tasks=session.memoryTasks||=([]);let task=tasks.find(t=>t.id===id);
 if(!task){task={id,source,status:'pending',attempts:0,updatedAt:new Date().toISOString(),extractorVersion:'ledger-v1'};tasks.push(task);}return task;
}
export function captureRevision(m:Memory){
 const revisions=m.revisions||=([]),revision=m.revision||1;
 if(!revisions.some(r=>r.revision===revision))revisions.push(JSON.parse(JSON.stringify({revision,at:new Date().toISOString(),text:m.text,annotation:m.annotation,record:m.record})));
 m.revision=revision+1;delete m.vector;delete m.factVectors;delete m.indexError;
}
export function sourceActive(session:Session,source:MemorySource,before=session.turns.length){
 if(source.sessionId!==session.id)return false;
 const t=session.turns.slice(0,before).find(t=>t.id===source.sourceTurnId),v=t?.variants[t.selected];
 if(!t||v?.id!==source.sourceVariantId||v.status!=='complete'||!v.outcome||source.sourceTextHash!==textHash(JSON.stringify([t.input,v.text])))return false;
 const index=session.turns.indexOf(t);
 return source.sourceStateRevision===memorySignature({input:t.input,story:v.text,before:stateAt(session,index),after:stateAt(session,index+1),event:v.outcome.event,diceEvent:v.outcome.diceEvent});
}
export function migrateMemoryLedger(session:Session,requestAt:(index:number)=>MemoryRequest){
 if(session.memoryMigration){session.memoryEngine='candidate';return;}
 const legacy=JSON.parse(JSON.stringify(session.memories)) as Memory[],mapping:Record<string,string>={},unconfirmed:string[]=[];
 for(const m of session.memories){
  if(m.kind!=='event'){mapping[m.id]=m.id;continue;}
  const index=session.turns.findIndex(t=>t.id===m.sourceTurn),v=index>=0?session.turns[index].variants.find(v=>v.id===m.sourceVariant):undefined;
  if(index<0||v?.status!=='complete'||v.id!==session.turns[index].variants[session.turns[index].selected]?.id){unconfirmed.push(m.id);continue;}
  const request=requestAt(index);
  if(m.sourceFingerprint!==memorySignature(request)){unconfirmed.push(m.id);continue;}
  m.source=sourceFor(session,request);m.revision||=1;mapping[m.id]=m.id;delete m.vector;delete m.factVectors;
 }
 session.memoryMigration={version:1,at:new Date().toISOString(),legacy,mapping,unconfirmed};session.memoryEngine='candidate';
}
/** Old records remain available; only proven active records enter candidate retrieval. */
export function ledgerEligible(session:Session,m:Memory,before=session.turns.length){
 return memoryReady(m)&&(m.kind!=='event'||!!m.source&&sourceActive(session,m.source,before));
}
export function safeMemoryStateRevision(request:MemoryRequest){return memorySignature({...request,before:memoryState(request.before),after:memoryState(request.after)});}
export function rebindMemorySources(session:Session){
 for(const m of [...session.memories,...session.memoryArchive||[],...session.memoryMigration?.legacy||[]])if(m.source)m.source.sessionId=session.id;
 for(const task of session.memoryTasks||[]){task.source.sessionId=session.id;task.id=[session.id,task.source.sourceTurnId,task.source.sourceVariantId,task.source.sourceStateRevision].join('|');}
}
export function validateLedgerMetadata(session:Session){
 const fail=()=>{throw Error('记忆来源账本格式不正确');};
 const source=(s:MemorySource)=>{if(!s||Object.keys(s).some(k=>!['sessionId','sourceTurnId','sourceVariantId','sourceTextHash','sourceStateRevision'].includes(k))||[s.sessionId,s.sourceTurnId,s.sourceVariantId,s.sourceTextHash,s.sourceStateRevision].some(v=>typeof v!=='string'||!v||v.length>1000)||s.sessionId!==session.id)fail();};
 if(session.memoryEngine!==undefined&&!['legacy','candidate'].includes(session.memoryEngine))fail();
 if(session.memoryTasks!==undefined){if(!Array.isArray(session.memoryTasks)||session.memoryTasks.length>50000)fail();const ids=new Set();for(const t of session.memoryTasks){if(!t||typeof t.id!=='string'||t.id.length>5000||ids.has(t.id)||!['pending','running','ready','failed','stale'].includes(t.status)||!Number.isInteger(t.attempts)||t.attempts<0||t.extractorVersion!=='ledger-v1'||typeof t.updatedAt!=='string'||t.error!==undefined&&(typeof t.error!=='string'||t.error.length>2000))fail();source(t.source);ids.add(t.id);}}
 for(const m of session.memories){if(m.source)source(m.source);if(m.revision!==undefined&&(!Number.isInteger(m.revision)||m.revision<1))fail();if(m.revisions!==undefined){if(!Array.isArray(m.revisions)||m.revisions.length>10000)fail();for(const r of m.revisions)if(!Number.isInteger(r.revision)||r.revision<1||typeof r.at!=='string'||typeof r.text!=='string'||r.text.length>10000)fail();}}
 if(session.memoryArchive!==undefined&&(!Array.isArray(session.memoryArchive)||session.memoryArchive.length>50000))fail();
 const migration=session.memoryMigration;if(migration&&(migration.version!==1||typeof migration.at!=='string'||!Array.isArray(migration.legacy)||migration.legacy.length>50000||!Array.isArray(migration.unconfirmed)||migration.unconfirmed.some(id=>typeof id!=='string')||!migration.mapping||typeof migration.mapping!=='object'||Array.isArray(migration.mapping)||Object.entries(migration.mapping).some(([key,value])=>['__proto__','constructor','prototype'].includes(key)||typeof value!=='string')))fail();
}
