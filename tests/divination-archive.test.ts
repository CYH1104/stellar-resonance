// Directed coverage: the daily-divination records must survive the REAL backup and
// cloud entries (collectWorkspaceArchive / createCloudSave full v2), the real import
// pipeline (session re-id on merge) and the pre-overwrite recovery copy — not just a
// bare backup({sessions}) roundtrip.
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {effectScope} from 'vue';
import {accountStorage} from '../src/storage/accountScope';
import {collectWorkspaceArchive} from '../src/storage/workspaceArchive';
import {defaults,newSession,backup,parseBackup} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {drawThreeCards,cardsFingerprint,type TerminalDivination,type DrawnCard} from '../src/domain/divination';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';

let scope:ReturnType<typeof effectScope>|undefined;
beforeEach(()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,String(v));},removeItem:(k:string)=>{data.delete(k);}});
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('__ACADEMY_ACCOUNT__',{id:'divbackup-'+crypto.randomUUID()});
});
afterEach(()=>{scope?.stop();scope=undefined;vi.restoreAllMocks();vi.unstubAllGlobals();});

const seqRandom=(seq:number[])=>{let i=0;return (n:number)=>seq[i++]%n;};
const persona={name:'玩家',appearance:'',personality:'',background:''} as const;
function divinationSession(){
 const s=newSession('占卜完整备份',persona,'开场');
 s.initial.characters=[{id:'a',name:'阿一',present:true}];
 s.terminal=emptyTerminal();
 s.terminal.friends=[{id:'a',status:'accepted' as const,reply:'好',note:''}];
 const cards=drawThreeCards(seqRandom([0,1,0,2,3,1,4,5,0]));
 s.terminal.divinations=[
  {day:'2026-10-25',actorId:'player',cards:cards.map(c=>({...c,reversed:!c.reversed})),reading:{status:'ready',overall:'基调。'.repeat(10),love:'感情。'.repeat(10),career:'事业。'.repeat(10),caution:'注意。'.repeat(10),at:'2026-10-25T10:00:00.000Z'},at:''},
  {day:'2026-10-25',actorId:'a',cards,reading:{status:'ready',overall:'角色基调。'.repeat(10),love:'角色感情。'.repeat(10),career:'角色事业。'.repeat(10),caution:'角色注意。'.repeat(10),reaction:'哼，逆位？我才不在意。'},at:''},
  {day:'2026-10-26',actorId:'player',cards,reading:{status:'failed',error:'断网失败',draft:'断网前保留的草稿。'},at:''},
  {day:'2026-10-26',actorId:'a',cards,reading:{status:'pending'},at:''}];
 return s;
}
const shapeOf=(t:typeof emptyTerminal.prototype)=>t.divinations!.map((d:TerminalDivination)=>({day:d.day,actorId:d.actorId,status:d.reading.status,reaction:d.reading.reaction,draft:d.reading.draft,error:d.reading.error,fingerprint:cardsFingerprint(d.cards),reversed:d.cards.map((c:DrawnCard)=>c.reversed)}));

it('full local v2 and cloud v2 via the real archive entry keep every divination shape intact',async()=>{
 const s=divinationSession(),archive=await collectWorkspaceArchive();
 const text=backup({version:1,sessions:[s],preferences:defaults(),archive});
 expect(JSON.parse(text).version).toBe(2);// real full local archive, not a bare v1
 const parsed=parseBackup(text);
 expect(shapeOf((parsed.sessions[0] as typeof s).terminal!)).toEqual(shapeOf(s.terminal!));
 const cloud=parseCloudSave(createCloudSave({version:1,sessions:[s],preferences:defaults(),archive},defaults(),{}));
 expect(cloud.schema).toBe('stellar-cloud-save-v2');// real full cloud capture
 expect(shapeOf((cloud.snapshot.sessions[0] as typeof s).terminal!)).toEqual(shapeOf(s.terminal!));
 // legacy saves without the field still load
 const legacy=parseBackup(backup({version:1,sessions:[newSession('旧',persona,'')],preferences:defaults()}));
 expect((legacy.sessions[0] as typeof s).terminal?.divinations).toBeUndefined();
});

async function workspace(){
 scope=effectScope();const w=scope.run(()=>useWorkspace())!;
 await vi.waitFor(()=>expect(w.loading.value).toBe(false));
 const s=divinationSession();s.id='local-session';
 w.sessions.value.push(s);w.sessionId.value=s.id;await w.save();return w;
}
it('real import merge re-ids the session but keeps divinations, and the pre-overwrite recovery copy holds them',async()=>{
 const w=await workspace(),incoming=divinationSession();incoming.id='local-session';// colliding id forces re-id
 const archive=await collectWorkspaceArchive();
 expect(await w.importBackup(backup({version:1,sessions:[incoming],preferences:defaults(),archive}))).toBe(true);
 const imported=w.sessions.value.find(s=>s.name==='占卜完整备份（导入）')!;
 expect(imported.id).not.toBe('local-session');
 expect(shapeOf(imported.terminal!)).toEqual(shapeOf(incoming.terminal!));
 // the recovery copy written before the import overwrote the workspace keeps the records too
 const recovery=await new IndexedDbRepository().readCloudRecovery('workspace');
 expect(recovery).toBeTruthy();
 expect(shapeOf((recovery!.sessions.find((s:typeof incoming)=>s.id==='local-session') as typeof incoming).terminal!)).toEqual(shapeOf(incoming.terminal!));
});

it('same-key two-page save: the stale page is rejected, disk keeps one winning draw and the loser recovers by re-reading',async()=>{
 const cardsA=drawThreeCards(seqRandom([0,1,0,2,3,1,4,5,0]));
 const cardsB=drawThreeCards(seqRandom([10,11,0,12,13,1,14,15,0]));
 expect(cardsFingerprint(cardsA)).not.toBe(cardsFingerprint(cardsB));
 const pageA=new IndexedDbRepository();await pageA.read();
 const sA=divinationSession();sA.id='shared';sA.terminal!.divinations=[{day:'2026-10-26',actorId:'player',cards:cardsA,reading:{status:'pending'},at:''}];
 // page B reads its baseline BEFORE page A writes, so A's commit makes B stale
 const pageB=new IndexedDbRepository();await pageB.read();
 await pageA.write({version:1,sessions:[sA],preferences:defaults()});
 const sB=divinationSession();sB.id='shared';sB.terminal!.divinations=[{day:'2026-10-26',actorId:'player',cards:cardsB,reading:{status:'pending'},at:''}];
 await expect(pageB.write({version:1,sessions:[sB],preferences:defaults()})).rejects.toThrow('其他页面');
 // the rejected write never persisted: the loser's draw stays private, zero API calls
 // follow (persistedDivination only reaches the API after a proven persisted commit)
 const disk=await new IndexedDbRepository().read();
 const records=(disk!.sessions.find((x:typeof sA)=>x.id==='shared') as typeof sA).terminal!.divinations!;
 expect(records).toHaveLength(1);
 expect(cardsFingerprint(records[0].cards)).toBe(cardsFingerprint(cardsA));
 // safe path: the loser re-reads and recovers the winner instead of overwriting
 const recovered=await pageB.read();
 const winner=(recovered!.sessions.find((x:typeof sA)=>x.id==='shared') as typeof sA).terminal!.divinations!;
 expect(cardsFingerprint(winner[0].cards)).toBe(cardsFingerprint(cardsA));
});
