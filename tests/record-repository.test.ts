import {it,expect,vi,afterEach} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {IndexedDbRepository} from '../src/storage/repository';
import {newSession,defaults,backup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {rowKey} from '../src/storage/recordSnapshot';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const fixture=()=>{vi.stubGlobal('indexedDB',new IDBFactory());const s=newSession('旧档',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.terminal=emptyTerminal();s.turns.push({id:'turn',input:'输入',selected:0,variants:[{id:'variant',text:'已落盘正文',status:'incomplete',createdAt:'now'}]});return {s,value:{version:1 as const,sessions:[s],preferences:defaults()}};};
async function oldDatabase(name:string,text:string){return new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('workspace');q.onsuccess=()=>{const db=q.result,t=db.transaction('workspace','readwrite');t.objectStore('workspace').put(text,'snapshot');t.oncomplete=()=>resolve(db);};q.onerror=()=>reject(q.error);});}
async function inspect(name:string){return new Promise<any>((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>{const db=q.result,t=db.transaction(['workspace','records']),rows=t.objectStore('records').getAllKeys(),old=t.objectStore('workspace').get('snapshot'),prior=t.objectStore('workspace').get('legacy-snapshot-before-records');t.oncomplete=()=>{db.close();resolve({version:db.version,keys:rows.result,old:old.result,prior:prior.result});};};q.onerror=()=>reject(q.error);});}
it('migrates an old snapshot atomically, keeps the original, and writes a draft without rewriting story records',async()=>{
 const {value}=fixture(),name='records-'+crypto.randomUUID(),text=backup(value);(await oldDatabase(name,text)).close();const repo=new IndexedDbRepository(name);expect((await repo.read())!.sessions[0].turns[0].variants[0].text).toBe('已落盘正文');
 const puts:any[]=[];const put=IDBObjectStore.prototype.put;vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,value,key){puts.push({store:this.name,key});return put.call(this,value,key);});
 await repo.writeInputDraft(value.sessions[0].id,'只保存输入草稿');expect(puts.filter(x=>x.store==='records').map(x=>x.key)).toEqual([rowKey('session',value.sessions[0].id)]);
 const info=await inspect(name);expect(info.version).toBe(2);expect(info.old).toBe(text);expect(info.prior).toBe(text);expect((await new IndexedDbRepository(name).read())!.sessions[0].draftInput).toBe('只保存输入草稿');
});
it('terminal writes never capture an unrelated in-flight prose fragment and stale pages cannot overwrite records',async()=>{
 const {s,value}=fixture(),name='records-'+crypto.randomUUID(),repo=new IndexedDbRepository(name);await repo.write(value);const stale=new IndexedDbRepository(name);await stale.read();s.turns[0].variants[0].text='正在生成，不能顺带落盘';s.terminal!.bio='已确认的终端修改';await repo.writeTerminalSession(s);
 const latest=(await new IndexedDbRepository(name).read())!;expect(latest.sessions[0].turns[0].variants[0].text).toBe('已落盘正文');expect(latest.sessions[0].terminal!.bio).toBe('已确认的终端修改');await expect(stale.writeInputDraft(s.id,'旧页覆盖')).rejects.toThrow('其他页面');
});
it('an old page blocks the upgrade and no schema switch occurs until its connection is released',async()=>{
 const {value}=fixture(),name='records-'+crypto.randomUUID(),text=backup(value),old=await oldDatabase(name,text),repo=new IndexedDbRepository(name);
 await expect(repo.read()).rejects.toThrow('关闭旧版本');old.close();await new Promise(resolve=>setTimeout(resolve,0));const restored=await repo.read();expect(restored!.sessions[0].name).toBe('旧档');expect((await inspect(name)).prior).toBe(text);
});
it('configuration and credentials roll back together if a transaction fails',async()=>{
 const {value}=fixture(),name='records-'+crypto.randomUUID(),repo=new IndexedDbRepository(name);await repo.write(value);const original=IDBObjectStore.prototype.put;
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,v,key){if(key==='api-credentials')throw Error('模拟空间不足');return original.call(this,v,key);});
 const next=defaults();next.shortcuts=['未提交的设置'];await expect(repo.writeConfiguration(next,{version:1,remember:true,keys:{},confirmed:{}})).rejects.toThrow('空间不足');expect((await new IndexedDbRepository(name).read())!.preferences.shortcuts).toEqual(value.preferences.shortcuts);
});
it('keeps independent editor drafts out of story records, migrates old archive drafts and preserves them across legacy imports',async()=>{
 const {s,value}=fixture(),name='drafts-'+crypto.randomUUID();
 const editorKey='session-persona:'+s.id;
 const archived={...value,archive:{version:1 as const,editorDrafts:{[editorKey]:'旧人设草稿'}}};(await oldDatabase(name,backup(archived))).close();const repo=new IndexedDbRepository(name);await repo.read();expect((await repo.readEditorDrafts())[editorKey]).toBe('旧人设草稿');
 await repo.writeEditorDraft(editorKey,'新的独立人设草稿');await repo.writeInputDraft(s.id,'输入草稿');await repo.write({...value,archive:undefined});expect((await repo.readEditorDrafts())[editorKey]).toBe('新的独立人设草稿');
 const original=IDBObjectStore.prototype.put;vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,v,key){if(key==='editor-drafts')throw Error('空间不足');return original.call(this,v,key);});await expect(repo.writeEditorDraft(editorKey,'不能覆盖')).rejects.toThrow('空间不足');expect((await repo.readEditorDrafts())[editorKey]).toBe('新的独立人设草稿');
});
