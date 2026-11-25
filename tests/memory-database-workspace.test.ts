import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {effectScope} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {newSession,finishVariant,stateAt,defaults,backup,parseBackup} from '../src/domain/story';
import {normalizeMemoryResult,memorySignature,memoryText} from '../src/domain/memories';
import {sourceFor} from '../src/domain/memoryLedger';
import {storyMemoryInjection} from '../src/domain/memoryInjection';
let scope:ReturnType<typeof effectScope>;
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('window',new EventTarget());vi.stubGlobal('__ACADEMY_ACCOUNT__',{id:crypto.randomUUID()});const data=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});vi.spyOn(HttpGateway.prototype,'bootstrap').mockResolvedValue(undefined);scope=effectScope();});
afterEach(()=>{scope.stop();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function setup(){
 const w=scope.run(()=>useWorkspace())!;await vi.waitFor(()=>expect(w.loading.value).toBe(false));
 const s=newSession('编辑测试',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.memoryEngine='candidate';s.initial.characters=[{id:'a',name:'甲',present:true}];
 s.turns.push({id:'t',input:'借书',selected:0,variants:[{id:'v',text:'甲借走书本',status:'incomplete',createdAt:''}]});finishVariant(s,0,s.turns[0].variants[0],{event:'借书'});
 const input={turnId:'t',variantId:'v',input:'借书',story:'甲借走书本',event:'借书',before:stateAt(s,0),after:stateAt(s,1),priorCommitments:[]};const m=s.memories[0];m.record=normalizeMemoryResult({participants:['玩家','甲'],time:'下午',location:'教室',userActions:['借书'],charActions:[],gains:[],losses:[],commitments:[{id:'new',participants:['玩家','甲'],content:'明天归还书本',deadline:'明天',status:'open'}],affinityChanges:[],facts:[{text:'甲的秘密',knownBy:['a']}]},input);m.status='ready';m.source=sourceFor(s,input);m.sourceFingerprint=memorySignature(input);m.text=memoryText(m);
 w.sessions.value.push(s);w.sessionId.value=s.id;await w.save();return {w,s:w.active.value!,m:w.active.value!.memories[0]};
}
it('saves field edits as revisions and reuses the production context assembler in the preview',async()=>{
 const {w,s,m}=await setup(),original=JSON.parse(JSON.stringify(m.record)),raw={...original,location:'阅览室'};
 expect(await w.reviseMemoryRecord(m.id,JSON.stringify(raw),{sessionId:s.id,revision:1,record:JSON.stringify(original)})).toBe(true);expect(m.revision).toBe(2);expect(m.revisions![0].record).toEqual(original);expect(m.record!.commitments[0].id).toBe(original.commitments[0].id);
 const restored=await new IndexedDbRepository().read();expect(restored!.sessions[0].memories[0].record!.location).toBe('阅览室');
 expect((await w.previewMemoryInjection(''))!.blocks).toEqual(storyMemoryInjection(s,s.turns.length,[],w.terminalCapability.value));
 expect((await w.previewMemoryInjection('',['a']))!.blocks.join('\n')).toContain('甲的秘密');expect((await w.previewMemoryInjection('',['player']))!.blocks.join('\n')).not.toContain('甲的秘密');
 await w.restoreMemoryRevision(m.id,1);expect(m.record).toEqual(original);
});
it('rejects stale editor revisions, invalid records and failed storage writes without changing the memory',async()=>{
 const {w,s,m}=await setup(),before=JSON.parse(JSON.stringify(m)),next=JSON.stringify({...m.record,location:'新版'});
 expect(await w.reviseMemoryRecord(m.id,next,{sessionId:s.id,revision:9})).toBe(false);expect(m).toEqual(before);
 expect(await w.reviseMemoryRecord(m.id,JSON.stringify({...m.record,time:''}))).toBe(false);expect(m).toEqual(before);
 vi.spyOn(IndexedDbRepository.prototype,'write').mockRejectedValueOnce(Error('disk full'));
 expect(await w.reviseMemoryRecord(m.id,next,{sessionId:s.id,revision:1})).toBe(false);expect(m).toEqual(before);expect(w.problem.value).toContain('disk full');
});
it('detects a second browser writer instead of overwriting its saved archive',async()=>{
 const {w,s,m}=await setup(),before=JSON.parse(JSON.stringify(m));const other=new IndexedDbRepository(),snapshot=(await other.read())!;snapshot.sessions[0].name='第二个页面修改';await other.write(snapshot);
 expect(await w.reviseMemoryRecord(m.id,JSON.stringify({...m.record,location:'冲突编辑'}),{sessionId:s.id,revision:1})).toBe(false);expect(m).toEqual(before);
 expect((await new IndexedDbRepository().read())!.sessions[0].name).toBe('第二个页面修改');
});
