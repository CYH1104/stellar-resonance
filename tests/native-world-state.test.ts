import {it,expect,vi,beforeEach} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {nativeWorldSeed,nativeWorldCheckpoint,nativeWorldPath,cleanNativeWorldCheckpoint,emptyNativeEffects} from '../src/domain/nativeWorldState';
import {newSession,defaults,backup,parseBackup,copy} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {IndexedDbRepository} from '../src/storage/repository';
import type {Variant} from '../src/domain/contracts';
const effect=(hash=42)=>({sticky:{'PlayerRuntime-book.0':{hash,start:2,end:8,protected:false}},cooldown:{}});
function session(){const s=newSession('跨轮状态',{name:'合成玩家',appearance:'',background:'',personality:''},'合成开场');const v:Variant={id:'first-a',text:'合成正文',status:'complete',createdAt:'2026-10-29T00:00:00.000Z'};s.turns.push({id:'first',input:'合成输入',variants:[v],selected:0});v.nativeWorldInfo=nativeWorldCheckpoint(s,0,v,effect());return s;}
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()));
it('uses the selected variant checkpoint and invalidates descendants when inputs or replies change',()=>{
 const s=session();expect(nativeWorldSeed(s,1).effects).toEqual(effect());const alt:Variant={...s.turns[0].variants[0],id:'first-b',text:'另一个稿件',nativeWorldInfo:undefined};s.turns[0].variants.push(alt);s.turns[0].selected=1;alt.nativeWorldInfo=nativeWorldCheckpoint(s,0,alt,effect(84));expect(nativeWorldSeed(s,1).effects).toEqual(effect(84));s.turns[0].selected=0;expect(nativeWorldSeed(s,1).effects).toEqual(effect());s.turns[0].input+='编辑';expect(nativeWorldSeed(s,1).effects).toEqual(emptyNativeEffects());
 const t=session();t.turns[0].variants[0].text+='编辑';expect(nativeWorldSeed(t,1).effects).toEqual(emptyNativeEffects());
});
it('counts canonical messages beyond the 12-round prompt window and never advances by retries or partial drafts',()=>{
 const s=session();expect(nativeWorldSeed(s,0)).toEqual({version:1,messageCount:2,effects:emptyNativeEffects()});const v={...s.turns[0].variants[0],status:'incomplete' as const};expect(()=>nativeWorldCheckpoint(s,0,v,effect())).toThrow();expect(s.turns[0].variants[0].nativeWorldInfo!.effects).toEqual(effect());
 s.turns.push({id:'failed',input:'failed',variants:[v],selected:0});expect(nativeWorldSeed(s,2)).toEqual({version:1,messageCount:4,effects:effect()});s.turns.pop();for(let i=1;i<25;i++)s.turns.push({id:'turn'+i,input:'input',variants:[{id:'reply'+i,text:'completed',status:'complete',createdAt:v.createdAt}],selected:0});expect(nativeWorldSeed(s,25).messageCount).toBe(52);
});
it('preserves every variant checkpoint through local/cloud serialization with a fail-closed format marker',()=>{
 const s=session(),snapshot={version:1 as const,sessions:[s],preferences:defaults()};const local=backup(snapshot),round=parseBackup(local);expect(round.archive!.nativeWorldInfoVersion).toBe(1);expect(round.sessions[0]).toEqual(s);expect(parseCloudSave(createCloudSave(snapshot,defaults())).snapshot.sessions[0]).toEqual(s);
 const missing=JSON.parse(local);delete missing.archive.nativeWorldInfoVersion;expect(()=>parseBackup(JSON.stringify(missing))).toThrow('兼容标记');const future=JSON.parse(local);future.archive.nativeWorldInfoVersion=2;expect(()=>parseBackup(JSON.stringify(future))).toThrow();
});
it('preserves checkpoints in the actual repository and complete pre-overwrite recovery copy',async()=>{
 const s=session(),repo=new IndexedDbRepository('native-effects-'+crypto.randomUUID());await repo.read();const snapshot={version:1 as const,sessions:[s],preferences:defaults()};await repo.write(snapshot);expect((await repo.read())!.sessions[0]).toEqual(s);await repo.write({version:1,sessions:[],preferences:defaults()},'workspace');expect((await repo.readCloudRecovery('workspace'))!.sessions[0]).toEqual(s);
});
it('rejects private/unknown metadata and future checkpoint versions without changing persisted data',async()=>{
 const s=session(),repo=new IndexedDbRepository('native-effects-'+crypto.randomUUID()),snapshot={version:1 as const,sessions:[s],preferences:defaults()};await repo.read();await repo.write(snapshot);const before=await repo.read();const wrong=copy(snapshot);(wrong.sessions[0].turns[0].variants[0].nativeWorldInfo as any).version=2;await expect(repo.write(wrong)).rejects.toThrow();expect(await repo.read()).toEqual(before);
 expect(()=>cleanNativeWorldCheckpoint({...s.turns[0].variants[0].nativeWorldInfo,effects:{sticky:{'PrivateAcademyLore.0':{hash:1,start:0,end:3,protected:false}},cooldown:{}}})).toThrow();expect(()=>cleanNativeWorldCheckpoint({...s.turns[0].variants[0].nativeWorldInfo,api_key:'SYNTHETIC_NOT_A_KEY'})).toThrow();
});
it('anchors survive appending a new session id and rewind while old files without states remain valid',()=>{
 const s=session(),path=nativeWorldPath(s,0);s.id=crypto.randomUUID();expect(nativeWorldPath(s,0)).toBe(path);s.turns.push({id:'later',input:'later',variants:[],selected:0});s.turns.pop();expect(nativeWorldSeed(s,1).effects).toEqual(effect());const old=session();delete old.turns[0].variants[0].nativeWorldInfo;expect(parseBackup(backup({version:1,sessions:[old],preferences:defaults()})).sessions[0]).toEqual(old);
});
it('a stale page cannot overwrite a checkpoint committed by another page',async()=>{
 const name='native-concurrent-'+crypto.randomUUID(),a=new IndexedDbRepository(name),b=new IndexedDbRepository(name),snapshot={version:1 as const,sessions:[session()],preferences:defaults()};await a.read();await a.write(snapshot);await a.read();await b.read();const newer=copy(snapshot);newer.sessions[0].turns[0].variants[0].nativeWorldInfo!.effects=effect(84);await a.write(newer);await expect(b.write(snapshot)).rejects.toThrow('其他页面');expect((await new IndexedDbRepository(name).read())!.sessions[0].turns[0].variants[0].nativeWorldInfo!.effects).toEqual(effect(84));
});
