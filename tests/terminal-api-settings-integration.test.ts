import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {effectScope,reactive,nextTick} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {useConfigurationDraft} from '../src/app/useConfigurationDraft';
import {usePartyGames} from '../src/app/usePartyGames';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {defaults,newSession} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {notices,dismissNotice} from '../src/app/notices';

const scopes:ReturnType<typeof effectScope>[]=[];
const requests:any[]=[];
const service:any={runtime:'local-card',dataset:'test-world',name:'test',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[],capabilities:{continue:true,keyRequired:true,embeddings:true,terminal:true,channel:'test'}};
beforeEach(()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());requests.length=0;
 vi.spyOn(HttpGateway.prototype,'bootstrap').mockImplementation(async function(this:HttpGateway){this.capabilities=service.capabilities;return service;});
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{
  const body=JSON.parse(init?.body||'{}');
  if(url==='/api/connection')return Response.json({origin:new URL(body.apiBaseUrl).origin});
  if(url==='/api/personal-terminal'){
   requests.push(body);
   if(body.profile.id==='main')return Response.json({code:'UPSTREAM_FAILED',upstreamStatus:400,providerCode:'model_region_restricted',upstreamMessage:'Synthetic old model is unavailable'},{status:400});
   return Response.json({decisions:body.actorIds.map((id:string)=>({id,accepted:true,reply:'参加'}))});
  }
  throw Error('Unexpected request: '+url);
 }));
});
afterEach(()=>{[...notices].forEach(n=>dismissNotice(n.id));scopes.forEach(s=>s.stop());scopes.length=0;vi.restoreAllMocks();vi.unstubAllGlobals();});
async function fixture(){
 const p=defaults();p.mode='server';p.terminalEnabled=true;p.terminalProfile=p.mainProfile;
 const main=p.profiles.find(x=>x.id===p.mainProfile)!;Object.assign(main,{name:'A',apiBaseUrl:'https://old.example/v1',model:'old-model'});
 const aux=p.profiles.find(x=>x.id===p.auxiliaryProfiles![0])!;Object.assign(aux,{name:'B',apiBaseUrl:'https://new.example/v1',model:'new-model'});
 const s=newSession('routing-test',{name:'玩家',appearance:'',personality:'',background:''},'开场');
 s.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];s.terminal=emptyTerminal();s.terminal.friends=['a','b'].map(id=>({id,status:'accepted' as const,reply:'好',note:''}));
 const storage=new IndexedDbRepository();await storage.read();await storage.write({version:1,sessions:[s],preferences:p});
 await storage.writeConfiguration(p,{version:1,remember:true,keys:{[main.id]:'synthetic-a',[aux.id]:'synthetic-b'},confirmed:{[main.id]:{apiBaseUrl:main.apiBaseUrl!,model:main.model},[aux.id]:{apiBaseUrl:aux.apiBaseUrl!,model:aux.model}}});
 const scope=effectScope();scopes.push(scope);
 const w=scope.run(()=>reactive(useWorkspace()))!;
 await vi.waitFor(()=>expect(w.loading).toBe(false));w.sessionId=s.id;await nextTick();
 const draft=scope.run(()=>useConfigurationDraft(w))!,games=scope.run(()=>usePartyGames(w))!;
 games.picked.value=['a','b'];games.title.value='斗地主';return {w,draft,games,auxId:aux.id};
}
it('full settings save, reopen and landlord invitation use the persisted B URL/model/key',async()=>{
 const {w,draft,games,auxId}=await fixture();draft.view.preferences.terminalProfile=auxId;
 await draft.view.save();expect(draft.dirty.value).toBe(false);
 const stored=await new IndexedDbRepository().read();expect(stored!.preferences.terminalProfile).toBe(auxId);
 draft.reset();expect(draft.view.preferences.terminalProfile).toBe(auxId);
 await games.create('landlord');expect(games.error.value).toBe('');
 expect(requests).toHaveLength(1);expect(requests[0]).toMatchObject({task:'party-invite',profile:{id:auxId,apiBaseUrl:'https://new.example/v1',model:'new-model'},key:'synthetic-b'});
 expect(w.preferences.terminalProfile).toBe(auxId);
});
it('saving B after an A failure removes the obsolete A error and lets invitation retry use B',async()=>{
 const {w,draft,games,auxId}=await fixture();await games.create('landlord');expect(games.error.value).toContain('old.example');
 draft.view.preferences.terminalProfile=auxId;await draft.view.save();await nextTick();
 expect(games.error.value).not.toContain('old.example');
 await games.retryRequest();expect(requests).toHaveLength(2);expect(requests[1].profile.id).toBe(auxId);
 expect(games.room.value!.invitations).toEqual({a:'accepted',b:'accepted'});
});

it('editing the same profile and key replaces the failed invitation route without duplicating the room',async()=>{
 const {w,draft,games}=await fixture();await games.create('landlord');const roomId=games.room.value!.id;
 const old=draft.view.preferences.profiles.find(p=>p.id==='main')!;old.apiBaseUrl='https://replacement.example/v1';old.model='replacement-model';draft.view.credentials.main='synthetic-replacement';
 await draft.view.save();await nextTick();await games.retryRequest();
 expect(requests).toHaveLength(2);expect(requests[1]).toMatchObject({profile:{apiBaseUrl:'https://replacement.example/v1',model:'replacement-model'},key:'synthetic-replacement'});
 expect(w.active!.terminal!.partyRooms).toHaveLength(1);expect(games.room.value!.id).toBe(roomId);
});
it('failed saving B keeps A active and preserves the draft instead of claiming that B is applied',async()=>{
 const {w,draft,games,auxId}=await fixture();await games.create('landlord');draft.view.preferences.terminalProfile=auxId;
 vi.spyOn(IndexedDbRepository.prototype,'writeConfiguration').mockRejectedValueOnce(Error('synthetic storage full'));
 expect(await draft.save()).toBe(false);expect(draft.dirty.value).toBe(true);expect(w.terminalProfile!.id).toBe('main');
 expect((await new IndexedDbRepository().read())!.preferences.terminalProfile).toBe('main');
 await games.retryRequest();expect(requests).toHaveLength(2);expect(requests[1].profile.id).toBe('main');
});
it.each(['room','stop','disable','branch'])('an API switch cannot revive an invitation after %s invalidates it',async(changed)=>{
 const {w,draft,games,auxId}=await fixture();await games.create('landlord');
 draft.view.preferences.terminalProfile=auxId;await draft.view.save();await nextTick();
 if(changed==='room')games.room.value!.name='another room state';
 else if(changed==='stop')w.stopTerminal();
 else if(changed==='disable'){await w.setTerminalEnabled(false);await w.setTerminalEnabled(true);}
 else w.active!.opening='different branch';
 await nextTick();const before=JSON.stringify(w.active!.terminal);
 await games.retryRequest();await games.retryRequest();
 expect(requests).toHaveLength(1);expect(games.retryActionLabel.value).toBe('');expect(JSON.stringify(w.active!.terminal)).toBe(before);
 draft.view.preferences.terminalProfile='main';await draft.view.save();await nextTick();
 expect(games.error.value).not.toContain('可重试邀请请求');
});
it('a late A rejection after B is saved never restores the obsolete provider error',async()=>{
 const {draft,games,auxId}=await fixture();let rejectOld!:(reason:Error)=>void;
 const oldFetch=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation((url,init)=>url==='/api/personal-terminal'?new Promise((_resolve,reject)=>{rejectOld=reject;}):oldFetch(url,init));
 const pending=games.create('landlord');await vi.waitFor(()=>expect(rejectOld).toBeTypeOf('function'));
 draft.view.preferences.terminalProfile=auxId;await draft.view.save();await nextTick();rejectOld(Error('old.example failure'));
 await pending;expect(games.error.value).not.toContain('old.example');expect(games.error.value).toContain('终端 API 已改变');
 expect(games.room.value!.invitations).toEqual({a:'pending',b:'pending'});
});

it.each(['resolve','abort'])('a late A HTTP error body (%s) cannot publish an obsolete global notice after saving B',async(outcome)=>{
 const {draft,games,auxId}=await fixture();let finishBody!:()=>void;
 const oldFetch=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(url,init)=>{
  if(url!=='/api/personal-terminal')return oldFetch(url,init);
  const response=Response.json({},{status:400});
  response.json=()=>new Promise((resolve,reject)=>{finishBody=()=>outcome==='abort'?reject(new DOMException('Aborted','AbortError')):resolve({code:'UPSTREAM_FAILED',upstreamStatus:400,upstreamMessage:'old.example failure'});});
  return response;
 });
 const pending=games.create('landlord');await vi.waitFor(()=>expect(finishBody).toBeTypeOf('function'));
 draft.view.preferences.terminalProfile=auxId;await draft.view.save();await nextTick();finishBody();await pending;
 expect(games.error.value).toContain('终端 API 已改变');
 expect(notices.filter(n=>n.error)).toEqual([]);
 expect(games.room.value!.invitations).toEqual({a:'pending',b:'pending'});
});
