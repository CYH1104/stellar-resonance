import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {effectScope} from 'vue';
import {IDBFactory} from 'fake-indexeddb';
import {cleanNativeWorldbooks,projectNativeWorldScopes,nativeWorldbooksForRequest,mergeNativeWorldbooks,removeNativeWorldbook} from '../src/domain/nativeWorldbooks';
import {cleanNativePresetConfig} from '../src/domain/nativePreset';
import {backup,parseBackup,defaults,newSession} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {useWorkspace} from '../src/app/useWorkspace';
import {HttpGateway} from '../src/gateway/http';
import {IndexedDbRepository} from '../src/storage/repository';
const raw=(content='native lore')=>({entries:{'0':{uid:0,key:['keyword'],keysecondary:[],comment:'条目',content,constant:false,disable:false,order:100,position:0,future:{keep:42}}},futureRoot:{keep:true}});
const books=()=>cleanNativeWorldbooks({version:1,books:[{id:'one',name:'第一本',worldbook:raw()},{id:'two',name:'第二本',worldbook:raw('second lore')}],defaultIds:['one'],taskBooks:{memory:['two'],terminal:[]},sessionBooks:{}});
const config=()=>cleanNativePresetConfig({version:1,preset:{temperature:.2,prompts:[],prompt_order:[]},worldbooks:books()});
let scope:ReturnType<typeof effectScope>|undefined;
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('window',new EventTarget());const data=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});vi.stubGlobal('__ACADEMY_ACCOUNT__',{id:crypto.randomUUID()});vi.spyOn(HttpGateway.prototype,'bootstrap').mockResolvedValue(undefined);});
afterEach(()=>{scope?.stop();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function workspace(){scope=effectScope();const w=scope.run(()=>useWorkspace())!;await vi.waitFor(()=>expect(w.loading.value).toBe(false));const s=newSession('worldbooks',{name:'玩家',appearance:'',background:'',personality:''},'');w.sessions.value=[s];w.sessionId.value=s.id;await w.save();return w;}
it('preserves raw fields and validates book identities, credentials, unknown versions and references',()=>{
 expect(books().books[0].worldbook).toEqual(raw());for(const bad of [{...books(),version:2},{...books(),taskBooks:{story:['missing']}},{...books(),defaultIds:['one','one']},{...books(),books:[{id:'bad/path',name:'x',worldbook:raw()}]},{...books(),books:[{id:'one',name:'x',worldbook:{...raw(),api_key:'SYNTHETIC'}}]}])expect(()=>cleanNativeWorldbooks(bad)).toThrow();
 const a=books();expect(()=>removeNativeWorldbook(a,'one')).toThrow('已绑定');expect(()=>removeNativeWorldbook(a,'two')).toThrow('已绑定');a.taskBooks={};expect(removeNativeWorldbook(a,'two').books).toHaveLength(1);
});
it('uses explicit source-session bindings before task and defaults, including an empty choice and mixed-session rejection',async()=>{
 const b=books();b.sessionBooks={owner:['two'],other:[]};expect(nativeWorldbooksForRequest(b,'generate',{},'owner')[0].id).toBe('two');expect(nativeWorldbooksForRequest(b,'memory',{},'other')).toEqual([]);expect(nativeWorldbooksForRequest(b,'memory',{}).map(x=>x.id)).toEqual(['two']);expect(nativeWorldbooksForRequest(b,'personal-terminal',{})).toEqual([]);expect(nativeWorldbooksForRequest(b,'probe',{},'owner')).toEqual([]);
 const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({items:['ok']}));}));const gateway=new HttpGateway(()=>({...config(),worldbooks:b}));gateway.capabilities.native=true;await gateway.terminal({sessionId:'owner'},defaults().profiles[0],'synthetic',new AbortController().signal);expect(calls[0].nativeWorldbooks.map((x:any)=>x.id)).toEqual(['two']);expect(calls[0].nativePreset.worldbooks).toBeUndefined();await expect(gateway.memoryBatch([{sessionId:'owner'},{sessionId:'other'}] as any,defaults().profiles[0],'synthetic',new AbortController().signal)).rejects.toThrow('跨存档');expect(calls).toHaveLength(1);
});
it('keeps unsupported timed effects in storage but refuses execution explicitly instead of approximating them',()=>{
 const b=books();b.books[0].worldbook.entries[0].sticky=2;expect(cleanNativeWorldbooks(b).books[0].worldbook.entries[0].sticky).toBe(2);expect(()=>nativeWorldbooksForRequest(b,'generate',{})).toThrow('跨轮效果');b.books[0].worldbook.entries[0].disable=true;expect(nativeWorldbooksForRequest(b,'generate',{})).toHaveLength(1);
});
it('does not widen legacy character scopes or accept colliding native UIDs',()=>{
 const b=books();b.books[0].worldbook.extensions={academy_scope:{mode:'characters',characterIds:['npc']}};expect(cleanNativeWorldbooks(b)).toEqual(b);expect(nativeWorldbooksForRequest(b,'generate',{})).toHaveLength(1);expect(()=>projectNativeWorldScopes(b.books)).toThrow('未登记');expect(projectNativeWorldScopes(b.books,[{id:'npc',name:'NPC'}])[0].worldbook.entries[0].content).toContain('only to these NPCs');b.books[0].worldbook.entries[0].disable=true;expect(nativeWorldbooksForRequest(b,'generate',{})).toHaveLength(1);
 const duplicate=books();duplicate.books[0].worldbook.entries['00']={...duplicate.books[0].worldbook.entries[0]};expect(()=>cleanNativeWorldbooks(duplicate)).toThrow();
});
it.each([0,.5,1.5,10001,100000])('round trips native weight %s, raw books and bindings through workspace backup, import, overwrite and recovery',async weight=>{
 const w=await workspace(),a=config();a.worldbooks!.books[0].worldbook.entries[0].group='weighted';a.worldbooks!.books[0].worldbook.entries[0].groupWeight=weight;a.worldbooks!.sessionBooks={[w.sessionId.value]:['one']};await w.saveNativePreset(a);const local=backup({version:1,sessions:w.sessions.value,preferences:w.preferences,archive:{version:1,nativePreset:a}});expect(parseBackup(local).archive!.nativePreset).toEqual(a);const cloud=await w.createCloudWorkspaceBackup();expect(parseCloudSave(cloud).snapshot.archive!.nativePreset).toEqual(a);
 const b=config();b.worldbooks!.books[0].worldbook.entries[0].content='changed';await w.saveNativePreset(b);await w.restoreCloudSave(cloud);expect(w.nativePreset.value).toEqual(a);expect((await new IndexedDbRepository().readCloudRecovery('workspace'))!.archive!.nativePreset).toEqual(b);await w.undoCloudRestore();expect(w.nativePreset.value).toEqual(b);
 expect(await w.importBackup(local,true)).toBe(true);expect(w.nativePreset.value).toEqual(a);expect((await new IndexedDbRepository().read())!.archive!.nativePreset).toEqual(a);
});
it('preserves native worldbooks when replacing an older config without the new optional library',async()=>{
 const w=await workspace(),a=config();await w.saveNativePreset(a);const old={version:1 as const,preset:{...a.preset,temperature:.6}};expect(await w.importBackup(backup({version:1,sessions:w.sessions.value,preferences:w.preferences,archive:{version:1,nativePreset:old}}),true)).toBe(true);expect(w.nativePreset.value!.preset.temperature).toBe(.6);expect(w.nativePreset.value!.worldbooks!.books).toEqual(a.worldbooks!.books);
});
it('rebinds appended sessions and remaps conflicting native book IDs, then removes bindings atomically when deleting sessions',async()=>{
 const w=await workspace(),current=config();await w.saveNativePreset(current);const imported=newSession('imported',{name:'外来',appearance:'',background:'',personality:''},''),incoming=config();incoming.worldbooks!.books[0].worldbook.entries[0].content='different same id';incoming.worldbooks!.sessionBooks={[imported.id]:['one']};expect(await w.importBackup(backup({version:1,sessions:[imported],preferences:defaults(),archive:{version:1,nativePreset:incoming}}))).toBe(true);
 const added=w.sessions.value.find(s=>s.name.startsWith('imported'))!,lib=w.nativePreset.value!.worldbooks!;expect(added.id).not.toBe(imported.id);expect(lib.sessionBooks![added.id][0]).not.toBe('one');expect(lib.books.find(b=>b.id===lib.sessionBooks![added.id][0])!.worldbook.entries[0].content).toBe('different same id');expect(lib.books.find(b=>b.id==='one')!.worldbook.entries[0].content).toBe('native lore');expect(await w.deleteSession(added.id)).toBe(true);expect(w.nativePreset.value!.worldbooks!.sessionBooks![added.id]).toBeUndefined();expect((await new IndexedDbRepository().read())!.archive!.nativePreset!.worldbooks!.sessionBooks![added.id]).toBeUndefined();
});
it('retains image URLs, credentials exclusion, and blocks cloud transfer of local worldbook image bytes without altering local exports',()=>{
 const a=config();a.worldbooks!.books[0].worldbook.entries[0].content='<img src="https://example.test/image.png">';const snapshot={version:1 as const,sessions:[],preferences:defaults(),archive:{version:1 as const,nativePreset:a}};expect(parseCloudSave(createCloudSave(snapshot,defaults())).snapshot.archive!.nativePreset).toEqual(a);a.worldbooks!.books[0].worldbook.entries[0].content='<img src="data:image/png;base64,c3ludGhldGlj">';expect(backup(snapshot)).toContain('data:image/png');expect(()=>createCloudSave(snapshot,defaults())).toThrow('本机图片');
});
it('merges libraries without mutating originals and refuses to silently drop configuration on over-capacity merges',()=>{
 const a=books(),b=books();b.books[0].worldbook.entries[0].content='changed';b.sessionBooks={new:['one']};const merged=mergeNativeWorldbooks(a,b)!;expect(a.books[0].worldbook.entries[0].content).toBe('native lore');expect(merged.books).toHaveLength(3);expect(merged.sessionBooks!.new[0]).not.toBe('one');
 const full=books();full.books=Array.from({length:1000},(_,i)=>({id:'id'+i,name:'book',worldbook:raw()}));full.defaultIds=[];full.taskBooks={};expect(()=>mergeNativeWorldbooks(full,books())).toThrow();expect(full.books).toHaveLength(1000);
});
it('manual terminal requests share the saved native preset and worldbook snapshot instead of using an unconfigured gateway',async()=>{
 vi.mocked(HttpGateway.prototype.bootstrap).mockImplementation(async function(this:HttpGateway){this.capabilities.native=true;return undefined;});const w=await workspace(),a=config();a.worldbooks!.sessionBooks={[w.sessionId.value]:['two']};await w.saveNativePreset(a);const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{calls.push(JSON.parse(init.body));return new Response('{}');}));await w.terminalRequest({sessionId:w.sessionId.value,task:'synthetic'},defaults().profiles[0],'synthetic',new AbortController().signal);expect(calls[0].nativePreset.preset.temperature).toBe(.2);expect(calls[0].nativeWorldbooks.map((b:any)=>b.id)).toEqual(['two']);expect(calls[0].nativeWorldbooks[0].worldbook.entries[0].content).toBe('second lore');
});
it('failed restore retains the current raw worldbooks and complete pre-overwrite copy',async()=>{
 const w=await workspace(),a=config();await w.saveNativePreset(a);const incoming=config();incoming.worldbooks!.books[0].worldbook.entries[0].content='incoming';const source=newSession('FAIL_NATIVE_WORLDBOOK_RESTORE',{name:'new',appearance:'',background:'',personality:''},''),file=createCloudSave({version:1,sessions:[source],preferences:defaults(),archive:{version:1,nativePreset:incoming}},defaults()),write=IndexedDbRepository.prototype.write;vi.spyOn(IndexedDbRepository.prototype,'write').mockImplementation(async function(this:IndexedDbRepository,value,...args){if(value.sessions.some(s=>s.name==='FAIL_NATIVE_WORLDBOOK_RESTORE'))throw Error('simulated-disk-failure');return write.call(this,value,...args);});await expect(w.restoreCloudSave(file)).rejects.toThrow('simulated-disk-failure');expect(w.nativePreset.value).toEqual(a);expect((await new IndexedDbRepository().readCloudRecovery('workspace'))!.archive!.nativePreset).toEqual(a);
});

it.each([false,true])('forum orchestration preserves source identity and rejects a late persona change: %s',async changePersona=>{
 vi.mocked(HttpGateway.prototype.bootstrap).mockResolvedValue({runtime:'local-card',dataset:'test-world',name:'test',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[],capabilities:{continue:true,keyRequired:true,embeddings:true,native:true}});
 vi.spyOn(HttpGateway.prototype,'configure').mockResolvedValue({origin:'https://synthetic.example'});
 const w=await workspace(),s=w.active.value!;s.sourceDataset='test-world';s.turns.push({id:'source-turn',input:'行动',selected:0,variants:[{id:'source-variant',text:'正文',status:'complete',createdAt:'2026-10-30T00:00:00.000Z',outcome:{event:'公开动态',forum:[{id:'post',authorName:'楼主',content:'公开帖子'}]}}]});
 for(const p of w.preferences.profiles){p.apiBaseUrl='https://synthetic.example/v1';p.model='synthetic';w.credentials[p.id]='synthetic';}await w.confirmAllApis();w.preferences.forumReplyEnabled=true;w.preferences.forumReplyProfile='main';
 let finish!:(value:any)=>void;const reply=vi.spyOn(HttpGateway.prototype,'forumReply').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const {visibleForum}=await import('../src/domain/story');const pending=w.replyToForum(visibleForum(s)[0].key,'公开评论');await vi.waitFor(()=>expect(reply).toHaveBeenCalledTimes(1));expect(reply.mock.calls[0][0]).toMatchObject({sessionId:s.id,turnId:'source-turn',variantId:'source-variant',state:{player:{name:s.persona.name}}});
 if(changePersona)s.persona.background='在途修改后的人设';finish(Array.from({length:5},(_,i)=>({authorId:'npc'+i,authorName:'发言人'+i,content:'回复'+i})));await pending;
 expect(JSON.stringify(s).includes('回复0')).toBe(!changePersona);if(changePersona)expect(w.forumReplyError.value).toContain('人设');
});

it('a pending round summary cannot overwrite memories after its source persona changes',async()=>{
 vi.mocked(HttpGateway.prototype.bootstrap).mockResolvedValue({runtime:'local-card',dataset:'test-world',name:'test',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[],capabilities:{continue:true,keyRequired:true,embeddings:true,native:true}});
 vi.spyOn(HttpGateway.prototype,'configure').mockResolvedValue({origin:'https://synthetic.example'});
 const w=await workspace(),s=w.active.value!;w.preferences.vectorEnabled=false;
 for(const p of w.preferences.profiles){p.apiBaseUrl='https://synthetic.example/v1';p.model='synthetic';w.credentials[p.id]='synthetic';}await w.confirmAllApis();
 s.turns.push({id:'memory-turn',input:'行动',selected:0,variants:[{id:'memory-variant',text:'正文',status:'complete',createdAt:'2026-10-30T00:00:00.000Z',outcome:{event:'事件'}}]});
 let finish!:(value:any)=>void;const memory=vi.spyOn(HttpGateway.prototype,'memory').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=w.retryMemory();await vi.waitFor(()=>expect(memory).toHaveBeenCalledTimes(1));expect(memory.mock.calls[0][0].persona).toEqual(s.persona);s.persona.background='在途修改后的人设';
 finish({participants:['玩家'],time:'未明确',location:'未明确',userActions:['SUMMARY_SHOULD_NOT_COMMIT'],charActions:[],gains:[],losses:[],commitments:[],affinityChanges:[]});await pending;
 expect(JSON.stringify(s.memories)).not.toContain('SUMMARY_SHOULD_NOT_COMMIT');expect(s.memories.some(m=>m.status==='ready')).toBe(false);expect(w.problem.value).toContain('改变');
});
