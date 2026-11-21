import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {effectScope} from 'vue';
import {PersonaLibrary} from '../src/storage/personaLibrary';
import {accountStorage} from '../src/storage/accountScope';
import {collectWorkspaceArchive,applyWorkspaceArchive} from '../src/storage/workspaceArchive';
import {refreshLocalCharacterImages} from '../src/app/localCharacterImages';
import {defaults,newSession,backup,parseBackup} from '../src/domain/story';
import {createCloudSave,parseCloudSave,parseWorkspaceBackup} from '../src/domain/cloudBackup';
import {cleanBackupArchive,remapBackupArchive,type BackupArchive} from '../src/domain/backupArchive';
import {blankPersona,personaLimits} from '../src/domain/persona';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {HttpGateway} from '../src/gateway/http';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';

let scope:ReturnType<typeof effectScope>|undefined;
beforeEach(()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,String(v));},removeItem:(k:string)=>{data.delete(k);}});
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('__ACADEMY_ACCOUNT__',{id:'backup-'+crypto.randomUUID()});refreshLocalCharacterImages();
});
afterEach(()=>{scope?.stop();scope=undefined;vi.restoreAllMocks();vi.unstubAllGlobals();});
const persona=()=>Object.fromEntries(Object.keys(personaLimits).map(k=>[k,'资料_'+k])) as unknown as ReturnType<typeof blankPersona>;
async function seed(){
 const library=new PersonaLibrary();await library.save({id:'archive-a',name:'独立人设',persona:persona(),updatedAt:'2026-10-25T01:00:00Z',memo:'未绑定的备忘录',useAsHomeImage:true,remark:'个人备注',sourceSessionIds:['session-source'],portrait:new Blob(['LOCAL_PORTRAIT'],{type:'image/png'}),avatar:new Blob(['LOCAL_AVATAR'],{type:'image/png'})});
 await library.saveDraft({id:'draft-a',name:'草稿',persona:{...blankPersona(),name:' 草稿 ',rawText:'  原始人设\n\n未整理内容  '},memo:'草稿备忘录',updatedAt:'2026-10-25T02:00:00Z'});
 accountStorage.setItem('academy:master-persona:v1',JSON.stringify({name:'独立人设',department:'学院',spiritLevel:'A',personaId:'archive-a'}));
 accountStorage.setItem('academy:master-image-file','archive-a');
 accountStorage.setItem('terminal-nickname-images',JSON.stringify({'角色甲':'https://example.org/a.png'}));
 return library;
}
it('round-trips all persona fields, metadata, draft, master selection and local media in a versioned local backup',async()=>{
 const library=await seed(),archive=await collectWorkspaceArchive({title:'未建立的会话',opening:'开场',wish:'人设愿望',persona:persona()});
 const snapshot={version:1 as const,preferences:defaults(),sessions:[],archive};const text=backup(snapshot);
 expect(JSON.parse(text).version).toBe(2);const parsed=parseBackup(text);expect(parsed.version).toBe(1);expect(parsed.archive).toEqual(archive);
 expect(parsed.archive!.personas![0].persona).toEqual(persona());expect(parsed.archive!.draft!.persona.rawText).toBe('  原始人设\n\n未整理内容  ');
 await library.remove('archive-a');await library.clearDraft();accountStorage.removeItem('academy:master-persona:v1');
 await applyWorkspaceArchive(parsed.archive!,'replace');const state=await library.readBackupState();
 expect(state.files[0].memo).toBe('未绑定的备忘录');expect(await state.files[0].portrait!.text()).toBe('LOCAL_PORTRAIT');expect(await state.files[0].avatar!.text()).toBe('LOCAL_AVATAR');expect(state.draft!.memo).toBe('草稿备忘录');
 expect(JSON.parse(accountStorage.getItem('academy:master-persona:v1')!).personaId).toBe('archive-a');expect(accountStorage.getItem('academy:master-image-file')).toBe('archive-a');
});
it('cloud v2 retains independent personas and complete terminal data, excludes only media/credentials/logs, and keeps local media on restore',async()=>{
 const library=await seed(),archive=await collectWorkspaceArchive(),s=newSession('终端',persona(),'开场');s.terminal=emptyTerminal();
 s.terminal.contacts=[{id:'contact-a',name:'好友',present:false}];s.terminal.friends=[{id:'contact-a',status:'accepted',reply:'同意',note:'备注'}];
 s.terminal.conversations=[{id:'dm',title:'好友',group:false,members:['contact-a'],announcement:'',unread:1,messages:[{id:'m',sender:'contact-a',text:'私聊记录',at:'12:00'}]}];
 s.terminal.rooms=[{id:'r',name:'国王游戏',style:'日常',members:['player','contact-a'],invitations:{'contact-a':'accepted'},inviteReplies:{'contact-a':'一起玩'},inviteNotes:{'contact-a':'邀请'},rounds:[{number:1,king:'player',numbers:{'contact-a':1},command:'打招呼',targets:[1],replies:[{id:'contact-a',text:'你好',refused:false,penalty:''}],phase:'complete',interactions:[{id:'i',kind:'chat',text:'继续聊',replies:[],status:'ready'}]}]}];
 const text=createCloudSave({version:1,sessions:[s],preferences:defaults(),archive},defaults(),archive.nicknameImages);
 expect(JSON.parse(text).schema).toBe('stellar-cloud-save-v2');expect(text).not.toContain('TE9DQUxf');expect(text).not.toContain('data:image');
 const cloud=parseCloudSave(text);expect(cloud.snapshot.archive!.personas![0].memo).toBe('未绑定的备忘录');expect(cloud.snapshot.sessions[0].terminal).toEqual({...s.terminal,conversations:s.terminal.conversations.map(c=>({...c,avatar:''}))});
 expect(cloud.snapshot.archive!.personas![0].portrait).toBeUndefined();await applyWorkspaceArchive(cloud.snapshot.archive!,'replace',true);
 expect(await (await library.list())[0].portrait!.text()).toBe('LOCAL_PORTRAIT');expect(parseWorkspaceBackup(text).cloud).toBe(true);
});
it('rejects unknown versions/sections before writing and remaps session links consistently',()=>{
 expect(()=>parseBackup(JSON.stringify({version:3}))).toThrow('版本');expect(()=>parseBackup(JSON.stringify({version:2,sessions:[],preferences:defaults()}))).toThrow('缺少');
 expect(()=>cleanBackupArchive({version:2,personas:[]})).toThrow('版本');expect(()=>cleanBackupArchive({version:1,newFeature:{}})).toThrow();
 const source:BackupArchive={version:1,personas:[{id:'file',name:'人设',persona:persona(),updatedAt:'',sourceSessionIds:['old']}],hiddenPersonaSessionIds:['old'],masterPersona:{name:'人设',department:'',spiritLevel:'',personaId:'session/old'}};
 const mapped=remapBackupArchive(source,new Map([['old','new']]));expect(mapped.personas![0].sourceSessionIds).toEqual(['new']);expect(mapped.hiddenPersonaSessionIds).toEqual(['new']);expect(mapped.masterPersona!.personaId).toBe('session/new');expect(source.personas![0].sourceSessionIds).toEqual(['old']);
});
it('rolls back a metadata write failure and rejects a library changed after the backup read',async()=>{
 const library=await seed(),before=await collectWorkspaceArchive();
 const incoming:BackupArchive={version:1,personas:[{id:'incoming',name:'新人设',persona:persona(),updatedAt:''}],nicknameImages:{'新头像':'https://example.org/new.png'}};
 const original=localStorage.setItem;let failed=false;vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k.endsWith('terminal-nickname-images')&&!failed){failed=true;throw Error('quota');}original(k,v);});
 await expect(applyWorkspaceArchive(incoming,'replace')).rejects.toThrow('quota');expect((await library.list())[0].id).toBe('archive-a');expect(accountStorage.getItem('terminal-nickname-images')).toContain('角色甲');
 await library.save({id:'other-tab',name:'其他页',persona:persona(),updatedAt:''});await expect(applyWorkspaceArchive(incoming,'replace',false,before)).rejects.toThrow('其他页面');expect((await library.list()).map(f=>f.id)).toContain('other-tab');
});
async function workspace(){
 vi.spyOn(HttpGateway.prototype,'bootstrap').mockResolvedValue(undefined);scope=effectScope();const w=scope.run(()=>useWorkspace())!;await vi.waitFor(()=>expect(w.loading.value).toBe(false));
 const s=newSession('本地会话',persona(),'开场');s.id='local-session';w.sessions.value.push(s);w.sessionId.value=s.id;await w.save();return w;
}
it('parser configuration round-trips through complete local/cloud restore and recovery, with failure and version protection',async()=>{
 await seed();const w=await workspace();const one={version:1 as const,enabled:true,tags:['foundation','ecot']},two={version:1 as const,enabled:false,tags:['other']};
 w.preferences.presetOutputParsing={legacy:one};await w.save();const cloud=await w.createCloudWorkspaceBackup();expect(parseCloudSave(cloud).snapshot.preferences.presetOutputParsing).toEqual({legacy:one});
 const local=backup((await new IndexedDbRepository().read())!);w.preferences.presetOutputParsing={legacy:two};await w.save();
 expect(await w.importBackup(local,true)).toBe(true);expect(w.preferences.presetOutputParsing).toEqual({legacy:one});await w.undoCloudRestore();expect(w.preferences.presetOutputParsing).toEqual({legacy:two});
 await w.restoreCloudSave(cloud);expect(w.preferences.presetOutputParsing).toEqual({legacy:one});await w.undoCloudRestore();expect(w.preferences.presetOutputParsing).toEqual({legacy:two});
 const newer=JSON.parse(cloud);newer.snapshot.preferences.presetOutputParsing.legacy.version=2;await expect(w.restoreCloudSave(JSON.stringify(newer))).rejects.toThrow();expect(w.preferences.presetOutputParsing).toEqual({legacy:two});
 const write=IndexedDbRepository.prototype.write;let failed=false;vi.spyOn(IndexedDbRepository.prototype,'write').mockImplementation(async function(this:IndexedDbRepository,value,recovery){if(!failed&&value.preferences.presetOutputParsing?.legacy.enabled){failed=true;throw Error('parser-write-failed');}return write.call(this,value,recovery);});
 await expect(w.restoreCloudSave(cloud)).rejects.toThrow('parser-write-failed');expect(w.preferences.presetOutputParsing).toEqual({legacy:two});expect((await new IndexedDbRepository().read())!.preferences.presetOutputParsing).toEqual({legacy:two});expect((await new PersonaLibrary().list())[0].id).toBe('archive-a');
});
it('uses the real export/import pipeline to merge colliding persona IDs, rebind session IDs, and undo the complete workspace',async()=>{
 const library=await seed(),w=await workspace(),archive=await collectWorkspaceArchive(),s=newSession('导入会话',persona(),'开场');s.id='session-source';
 const text=backup({version:1,sessions:[s],preferences:defaults(),archive});expect(await w.importBackup(text)).toBe(true);
 const imported=w.sessions.value.find(s=>s.name==='导入会话（导入）')!;expect(imported.id).not.toBe('session-source');
 const files=await library.list();expect(files).toHaveLength(2);expect(files.find(f=>f.id!=='archive-a')!.sourceSessionIds).toEqual([imported.id]);
 const repo=new IndexedDbRepository(),state=await repo.read(),recovery=await repo.readCloudRecovery('workspace');expect(state!.archive!.personas).toHaveLength(2);expect(recovery!.archive!.personas![0].memo).toBe('未绑定的备忘录');
 await w.undoCloudRestore();expect(w.sessions.value.map(s=>s.name)).toEqual(['本地会话']);expect((await library.list()).map(f=>f.id)).toEqual(['archive-a']);
 const cloud=parseCloudSave(await w.createCloudWorkspaceBackup());expect(cloud.snapshot.archive!.personas).toHaveLength(1);expect(cloud.snapshot.sessions[0].persona).toEqual(w.sessions.value[0].persona);
});
it('keeps local personas when importing an old v1 backup, and rolls back persona restore if the workspace write fails',async()=>{
 const library=await seed(),w=await workspace(),legacy=newSession('旧版文件',persona(),'开场');
 expect(await w.importBackup(backup({version:1,sessions:[legacy],preferences:defaults()}),true)).toBe(true);expect((await library.list())[0].id).toBe('archive-a');
 const incoming=newSession('FAIL_WRITE',persona(),'开场'),archive:BackupArchive={version:1,personas:[{id:'new-persona',name:'新档案',persona:persona(),updatedAt:''}]};
 const original=IndexedDbRepository.prototype.write;vi.spyOn(IndexedDbRepository.prototype,'write').mockImplementation(async function(this:IndexedDbRepository,value,recovery){if(value.sessions.some(s=>s.name==='FAIL_WRITE'))throw Error('simulated-write-failure');return original.call(this,value,recovery);});
 await expect(w.restoreCloudSave(createCloudSave({version:1,sessions:[incoming],preferences:defaults(),archive},defaults()))).rejects.toThrow('simulated-write-failure');
 expect((await library.list())[0].id).toBe('archive-a');expect(w.sessions.value[0].name).toBe('旧版文件');expect(w.backupWorking.value).toBe(false);
 const recovery=await new IndexedDbRepository().readCloudRecovery('workspace');expect(recovery!.archive!.personas![0].id).toBe('archive-a');
});
it('detects an interrupted restore on boot and recovers both the workspace and persona library',async()=>{
 const library=await seed(),w=await workspace(),repo=new IndexedDbRepository();await repo.read();
 const original={version:1 as const,sessions:JSON.parse(JSON.stringify(w.sessions.value)),preferences:defaults(),archive:await collectWorkspaceArchive()};
 await repo.prepareCloudRecovery(original);await library.save({id:'half-applied',name:'中断中的资料',persona:persona(),updatedAt:''});
 scope!.stop();scope=effectScope();const reopened=scope.run(()=>useWorkspace())!;await vi.waitFor(()=>expect(reopened.loading.value).toBe(false));
 expect(reopened.restoreInterrupted.value).toBe(true);await expect(reopened.createCloudWorkspaceBackup()).rejects.toThrow('中断');
 await reopened.undoCloudRestore();expect(reopened.restoreInterrupted.value).toBe(false);expect((await library.list()).map(f=>f.id)).toEqual(['archive-a']);expect(await new IndexedDbRepository().hasInterruptedRestore()).toBe(false);
});
it('serializes restore operations across pages and releases the lease after completion',async()=>{
 const first=new IndexedDbRepository(),second=new IndexedDbRepository();const release=await first.lockRestore();
 await expect(second.lockRestore()).rejects.toThrow('另一页面');await release();const next=await second.lockRestore();await next();
});
it('roundtrips independent long-text drafts through cloud, append import and overwrite recovery without activating them',async()=>{
 await seed();const w=await workspace(),s=newSession('草稿',{name:'已确认的人设',appearance:'',background:'',personality:''},'');w.sessions.value.push(s);w.sessionId.value=s.id;await w.save();
 await w.saveEditorDraft('session-persona:'+s.id,JSON.stringify({...s.persona,name:'尚未确认的人设'}));await w.saveEditorDraft('preset:prompt-a',JSON.stringify({content:'未确认预设'}));
 const cloud=await w.createCloudWorkspaceBackup(),value=parseCloudSave(cloud).snapshot;
 expect(value.archive!.editorDrafts!['session-persona:'+s.id]).toContain('尚未确认的人设');expect(value.sessions.find(next=>next.id===s.id)!.persona.name).toBe('已确认的人设');
 expect(await w.importBackup(cloud)).toBe(true);const appended=w.sessions.value.find(next=>next.id!==s.id&&next.name===s.name+'（导入）')!;
 expect(await w.readEditorDraft('session-persona:'+appended.id)).toContain('尚未确认的人设');
 await w.saveEditorDraft('preset:prompt-a','新的本地草稿');await w.restoreCloudSave(cloud);expect(await w.readEditorDraft('preset:prompt-a')).toContain('未确认预设');
 await w.undoCloudRestore();expect(await w.readEditorDraft('preset:prompt-a')).toBe('新的本地草稿');expect(w.sessions.value).toHaveLength(value.sessions.length*2);
});

it('truth chronology survives full local/cloud replace, import remapping and recovery; legacy rounds still load',async()=>{
 const {createPartyRoom,startPartyRound,chooseTruth,finishTruth}=await import('../src/domain/partyGames');const {partyDialogueLines}=await import('../src/domain/partyDialogueView');
 await seed();const w=await workspace(),s=w.sessions.value[0];s.terminal=emptyTerminal();s.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];const room=createPartyRoom('truth',['a','b'],'顺序','轻松','chronology');room.invitations={a:'accepted',b:'accepted'};s.terminal.partyRooms=[room];
 const rr=startPartyRound(room,undefined,()=>0);if(rr.kind!=='truth')throw Error();chooseTruth(room,'player','truth');rr.dialogueVersion=1;rr.replies=[{id:'player',text:'先想想'},{id:'a',text:'等你'}];finishTruth(room,'player','答案',false);rr.replies.push({id:'b',text:'明白了'});await w.save();
 const expected=['先想想','等你','答案','明白了'],local=backup((await new IndexedDbRepository().read())!),cloud=await w.createCloudWorkspaceBackup();
 const order=()=>partyDialogueLines(w.sessions.value.find(s=>s.terminal?.partyRooms?.length)!.terminal!.partyRooms![0].rounds[0]).map(x=>x.text);
 for(const file of [local,cloud]){expect(partyDialogueLines(parseWorkspaceBackup(file).snapshot.sessions[0].terminal!.partyRooms![0].rounds[0]).map(x=>x.text)).toEqual(expected);}
 w.sessions.value[0].terminal=emptyTerminal();await w.save();expect(await w.importBackup(local,true)).toBe(true);expect(order()).toEqual(expected);await w.undoCloudRestore();expect(w.sessions.value[0].terminal!.partyRooms||[]).toEqual([]);
 await w.restoreCloudSave(cloud);expect(order()).toEqual(expected);await w.undoCloudRestore();expect(w.sessions.value[0].terminal!.partyRooms||[]).toEqual([]);
 expect(await w.importBackup(local)).toBe(true);expect(order()).toEqual(expected);await w.undoCloudRestore();
 const legacy=JSON.parse(local);delete legacy.sessions[0].terminal.partyRooms[0].rounds[0].choiceReplyOffset;delete legacy.sessions[0].terminal.partyRooms[0].rounds[0].answerReplyOffset;expect(()=>parseBackup(JSON.stringify(legacy))).not.toThrow();
 const broken=JSON.parse(local);broken.sessions[0].terminal.partyRooms[0].rounds[0].answerReplyOffset=999;expect(()=>parseBackup(JSON.stringify(broken))).toThrow();
});
it('landlord presets survive complete local/cloud overwrite, recovery and failed writes',async()=>{
 const {createPartyRoom}=await import('../src/domain/partyGames'),{fallbackLandlordPhrases}=await import('../src/domain/landlordSpeech');await seed();const w=await workspace(),s=w.sessions.value.find(s=>s.id==='local-session')!;
 s.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];const room=createPartyRoom('landlord',['a','b'],'台词备份','休闲','phrases-room');room.landlordPhrases={a:fallbackLandlordPhrases(),b:fallbackLandlordPhrases()};s.terminal={...emptyTerminal(),partyRooms:[room]};await w.save();const cloud=await w.createCloudWorkspaceBackup();let downloaded:Blob|undefined;vi.spyOn(URL,'createObjectURL').mockImplementation(blob=>{downloaded=blob as Blob;return 'blob:synthetic-download';});vi.stubGlobal('document',{createElement:()=>({click(){}})});expect(await w.exportBackup()).toBe(true);const local=await downloaded!.text();
 const current=()=>w.sessions.value.find(s=>s.id==='local-session')!.terminal!.partyRooms![0];const saved=JSON.parse(JSON.stringify(current()));expect(parseCloudSave(cloud).snapshot.archive!.personas).toHaveLength(1);expect(parseBackup(local).archive!.personas).toHaveLength(1);
 current().landlordPhrases!.a.waiting=['本地修改的台词'];await w.save();expect(await w.importBackup(local,true)).toBe(true);expect(current()).toEqual(saved);await w.undoCloudRestore();expect(current().landlordPhrases!.a.waiting).toEqual(['本地修改的台词']);
 await w.restoreCloudSave(cloud);expect(current()).toEqual(saved);await w.undoCloudRestore();expect(current().landlordPhrases!.a.waiting).toEqual(['本地修改的台词']);
 const write=IndexedDbRepository.prototype.write;let failed=false;vi.spyOn(IndexedDbRepository.prototype,'write').mockImplementation(async function(this:IndexedDbRepository,value,recovery){const restored=value.sessions.find(s=>s.id==='local-session')?.terminal?.partyRooms?.[0];if(!failed&&restored?.landlordPhrases?.a.waiting[0]===saved.landlordPhrases.a.waiting[0]){failed=true;throw Error('phrase-write-failed');}return write.call(this,value,recovery);});
 await expect(w.restoreCloudSave(cloud)).rejects.toThrow('phrase-write-failed');expect(current().landlordPhrases!.a.waiting).toEqual(['本地修改的台词']);expect((await new IndexedDbRepository().readCloudRecovery('workspace'))!.sessions.find(s=>s.id==='local-session')!.terminal!.partyRooms![0].landlordPhrases!.a.waiting).toEqual(['本地修改的台词']);
});
