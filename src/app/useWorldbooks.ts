import {computed,ref,type ComputedRef} from 'vue';
import type {Preferences,Session} from '../domain/contracts';
import {cleanWorldbooks,cleanWorldbookIds,importWorldbook,exportWorldbook,newWorldbook,resolveWorldbooks,worldbookImportReview,type Worldbook,type WorldEntry} from '../domain/worldbooks';
export function useWorldbooks(p:Preferences,active:ComputedRef<Session|undefined>,sessions:()=>Session[],locked:()=>boolean,save:()=>Promise<void>,problem:(s:string)=>void,notice:(s:string)=>void,download:(name:string,text:string)=>void){
  const selectedWorldbookId=ref('');
  const worldbookImportQueue=ref<{book:Worldbook;rows:ReturnType<typeof worldbookImportReview>;disabled:string[]}[]>([]);
  const worldbookImportPending=computed(()=>worldbookImportQueue.value[0]);
  function cancelWorldbookImport(){if(!locked())worldbookImportQueue.value.shift();}
  function confirmWorldbookImport(){attempt(()=>{const pending=worldbookImportPending.value;if(!pending)return;const disabled=new Set(pending.disabled);const book={...pending.book,entries:pending.book.entries.map(e=>({...e,enabled:pending.rows.some(r=>r.entry.id===e.id)?!disabled.has(e.id):e.enabled}))};attach(book);worldbookImportQueue.value.shift();notice(`已导入世界书「${book.name}」，共 ${book.entries.length} 条`);});}
  const worldbooks=computed(()=>p.worldbooks||[]);
  const currentWorldbook=computed(()=>worldbooks.value.find(b=>b.id===selectedWorldbookId.value)||worldbooks.value[0]);
  const boundWorldbookIds=computed(()=>active.value?.worldbookIds||(!active.value?p.defaultWorldbookIds||[]:[]));
  function attempt(fn:()=>void){if(locked())return;try{fn();problem('');void save();}catch(e){problem(e instanceof Error?e.message:'世界书操作失败');}}
  function bindWorldbook(id:string,enabled:boolean){attempt(()=>{const ids=boundWorldbookIds.value.filter(x=>x!==id);if(enabled)ids.push(id);if(active.value){active.value.worldbookIds=cleanWorldbookIds(ids);active.value.updatedAt=new Date().toISOString();}else p.defaultWorldbookIds=cleanWorldbookIds(ids);});}
  function attach(book:Worldbook){p.worldbooks=cleanWorldbooks([...worldbooks.value,book]);selectedWorldbookId.value=book.id;const ids=[...boundWorldbookIds.value,book.id];if(active.value)active.value.worldbookIds=ids;else p.defaultWorldbookIds=ids;}
  function importUserWorldbook(text:string,name:string){attempt(()=>{const book=importWorldbook(text,name),rows=worldbookImportReview(book);if(rows.length){worldbookImportQueue.value.push({book,rows,disabled:rows.map(r=>r.entry.id)});notice('请确认世界书条目开关后再导入');return;}attach(book);notice(`已导入世界书「${book.name}」，共 ${book.entries.length} 条`);});}
  function addWorldbook(){attempt(()=>attach(newWorldbook()));}
  function duplicateWorldbook(){attempt(()=>{const book=currentWorldbook.value;if(!book)return;attach({...JSON.parse(JSON.stringify(book)),id:crypto.randomUUID(),name:book.name+'（副本）'});});}
  function removeWorldbook(id:string){attempt(()=>{p.worldbooks=worldbooks.value.filter(b=>b.id!==id);p.defaultWorldbookIds=(p.defaultWorldbookIds||[]).filter(x=>x!==id);for(const s of sessions())s.worldbookIds=(s.worldbookIds||[]).filter(x=>x!==id);notice('世界书已删除');});}
  function updateWorldbook(value:Worldbook){attempt(()=>{p.worldbooks=cleanWorldbooks(worldbooks.value.map(b=>b.id===value.id?value:b));});}
  function saveWorldEntry(bookId:string,entry:WorldEntry){attempt(()=>{const book=worldbooks.value.find(b=>b.id===bookId);if(!book)return;const exists=book.entries.some(e=>e.id===entry.id);const updated={...book,entries:exists?book.entries.map(e=>e.id===entry.id?entry:e):[...book.entries,entry]};p.worldbooks=cleanWorldbooks(worldbooks.value.map(b=>b.id===bookId?updated:b));});}
  function removeWorldEntry(bookId:string,id:string){attempt(()=>{p.worldbooks=cleanWorldbooks(worldbooks.value.map(b=>b.id===bookId?{...b,entries:b.entries.filter(e=>e.id!==id)}:b));});}
  function exportUserWorldbook(){attempt(()=>{const b=currentWorldbook.value;if(b)download(b.name+'.json',exportWorldbook(b));});}
  return {worldbookImportPending,confirmWorldbookImport,cancelWorldbookImport,worldbooks,currentWorldbook,selectedWorldbookId,boundWorldbookIds,bindWorldbook,importUserWorldbook,addWorldbook,duplicateWorldbook,removeWorldbook,updateWorldbook,saveWorldEntry,removeWorldEntry,exportUserWorldbook};
}
export function mergeWorldbookBackup(p:Preferences,incoming:Preferences,sessions:Session[]){
  const mapping=new Map<string,string>(),books=cleanWorldbooks(incoming.worldbooks).map(book=>{const id=crypto.randomUUID();mapping.set(book.id,id);return {...book,id};});
  const merged=cleanWorldbooks([...(p.worldbooks||[]),...books]);
  for(const s of sessions)s.worldbookIds=(s.worldbookIds||[]).flatMap(id=>mapping.has(id)?[mapping.get(id)!]:[]);
  p.worldbooks=merged;
}
export function sessionLore(p:Preferences,s:Session,index:number,input:string,seed:string,charName:string){
  const messages=[s.opening,...s.turns.slice(Math.max(0,index-500),index).flatMap(t=>{const v=t.variants[t.selected];return v?.status==='complete'?[t.input,v.text]:[];}),input];
  return resolveWorldbooks((p.worldbooks||[]).filter(b=>(s.worldbookIds||[]).includes(b.id)),{messages,userName:s.persona.name,charName,persona:Object.values(s.persona).filter(v=>typeof v==='string').join('\n'),seed});
}
