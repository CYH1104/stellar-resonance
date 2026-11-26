import {it,expect,vi,afterEach} from 'vitest';
import {effectScope,reactive,nextTick} from 'vue';
import {useWerewolf} from '../src/app/useWerewolf';
import {HttpGateway} from '../src/gateway/http';
import {newSession,defaults} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {terminalAnchor} from '../src/domain/terminalLedger';
import {actWerewolf,replayWerewolf,type WerewolfGame,type WolfRole} from '../src/domain/werewolf';
import type {ViewModel} from '../src/app/useWorkspace';
const scopes:ReturnType<typeof effectScope>[]=[];
afterEach(()=>{scopes.splice(0).forEach(s=>s.stop());vi.restoreAllMocks();});
function setup(roles:WolfRole[]=['villager','wolf','wolf','seer','witch','villager']){
 const s=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.terminal=emptyTerminal();s.initial.characters=['a','b','c','d','e'].map(id=>({id,name:id,present:true,identity:'学生'}));s.terminal.friends=s.initial.characters.map(a=>({id:a.id,status:'accepted',note:'',reply:''}));
 const g:WerewolfGame={version:1,id:'g',at:'2026-11-26T05:00:00Z',storyDate:'星历578',anchor:terminalAnchor(s),seats:['player','a','b','c','d','e'].map(id=>({id,name:id})),roles,actions:[]};s.terminal.werewolfGames=[g];
 const p=defaults();p.terminalEnabled=true;p.terminalProfile='main';p.profiles[0].model='test-model';p.profiles[0].apiBaseUrl='https://example.test/v1';
 const w=reactive({active:s,state:s.initial,preferences:p,credentials:{main:'test-key'},terminalEpoch:0,busy:false,terminalBusy:false,backupWorking:false,restoreInterrupted:false,storageStatus:'saved',saveTerminal:vi.fn(async()=>{}),save:vi.fn(async()=>{}),connectionReady:()=>true,connectProfile:async()=>true,indexTerminalNotes:vi.fn()}) as unknown as ViewModel;
 const scope=effectScope();scopes.push(scope);const u=scope.run(()=>useWerewolf(w))!;u.open('g');return {w,u};
}
function answer(input:any){const r=input.context.werewolf;
 if(input.task==='werewolf-council')return {opinions:r.actorIds.map((id:string)=>({id,target:'e',reason:'根据发言判断。'})),...(!r.humanWolf?{target:'e'}:{})};
 if(input.task==='werewolf-inspect')return {target:'a'};
 if(input.task==='werewolf-medicine')return {save:true,poison:null};
 if(input.task==='werewolf-speak')return {text:input.actorIds[0]+'公开发言'};
 return {target:null};
}
it('only three night calls for villager; wolf+seer share snapshot then witch; never sends raw game state',async()=>{
 const {w,u}=setup(),calls:any[]=[];vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async input=>{calls.push(input);return answer(input);});await u.resume();expect(calls.map(x=>x.task)).toEqual(['werewolf-council','werewolf-inspect','werewolf-medicine']);expect(u.view.value?.phase).toBe('speech');expect(u.humanAction.value).toBe('speak');for(const c of calls){const j=JSON.stringify(c);expect(j).not.toContain('"roles"');expect(j).not.toContain('"actions"');expect(c.persona).toBeUndefined();expect(c.context.memories).toBeUndefined();}expect(w.terminalBusy).toBe(false);
});
it('human wolf has one council request, can choose self, and no second arbitration call',async()=>{
 const {u}=setup(['wolf','wolf','villager','seer','witch','villager']);const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async input=>answer(input));await u.resume();expect(u.humanAction.value).toBe('knife');expect(spy.mock.calls.filter(c=>(c[0] as any).task==='werewolf-council')).toHaveLength(1);u.target.value='player';await u.submit('choose');expect(spy.mock.calls.filter(c=>(c[0] as any).task==='werewolf-council')).toHaveLength(1);expect(u.view.value?.players.find(p=>p.id==='player')?.alive).toBe(true);
});
it('human seer only uses two NPC night calls and retains the check result on reopening',async()=>{
 const {w,u}=setup(['seer','wolf','wolf','villager','witch','villager']);const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async input=>answer(input));await u.resume();expect(u.humanAction.value).toBe('inspect');u.target.value='d';await u.submit('choose');expect(spy).toHaveBeenCalledTimes(2);u.back();u.open('g');expect(u.view.value?.inspections).toEqual([{day:1,target:'d',result:'good'}]);expect(w.active!.terminal!.werewolfGames![0].roles[0]).toBe('seer');
});
it('failed parallel call keeps success and retries only missing action',async()=>{
 const {u}=setup();let fail=true;const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async input=>{if((input as any).task==='werewolf-inspect'&&fail){fail=false;throw Error('network');}return answer(input);});await u.resume();expect(u.error.value).toContain('成功的行动已保存');await u.resume();expect(spy.mock.calls.filter(c=>(c[0] as any).task==='werewolf-council')).toHaveLength(1);expect(spy.mock.calls.filter(c=>(c[0] as any).task==='werewolf-inspect')).toHaveLength(2);expect(u.view.value?.phase).toBe('speech');
});
it('save failure rolls back action and memory, never announces uncommitted deaths',async()=>{
 const {w,u}=setup();const before=JSON.stringify(w.active!.terminal),notes=JSON.stringify(w.active!.memories);vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async input=>answer(input));vi.mocked(w.saveTerminal).mockRejectedValue(Error('quota'));await u.resume();expect(JSON.stringify(w.active!.terminal)).toBe(before);expect(JSON.stringify(w.active!.memories)).toBe(notes);expect(u.error.value).toContain('quota');
});
it('API switch aborts inflight replies, and continue routes to the newly selected API',async()=>{
 const {w,u}=setup();let resolve!:()=>void;const gate=new Promise<void>(r=>resolve=r);const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async input=>{await gate;return answer(input);});const pending=u.resume();await vi.waitFor(()=>expect(spy).toHaveBeenCalledTimes(2));w.preferences.profiles[1].apiBaseUrl='https://new.test/v1';w.preferences.profiles[1].model='new-model';w.preferences.terminalProfile='aux';await nextTick();resolve();await pending;expect(w.active!.terminal!.werewolfGames![0].actions).toEqual([]);spy.mockImplementation(async input=>answer(input));await u.resume();expect(spy.mock.calls.at(-1)![1].id).toBe('aux');
});
it('navigation and a simultaneous game edit prevent late responses overwriting data',async()=>{
 const {w,u}=setup();let resolve!:()=>void;const gate=new Promise<void>(r=>resolve=r);const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async input=>{await gate;return answer(input);});const pending=u.resume();await vi.waitFor(()=>expect(spy).toHaveBeenCalledTimes(2));u.setActive(false);await nextTick();resolve();await pending;expect(w.active!.terminal!.werewolfGames![0].actions).toEqual([]);
});
it('sequential day speakers receive preceding speech; independent votes never see unannounced ballots',async()=>{
 const {w,u}=setup(),inputs:any[]=[];vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async input=>{inputs.push(input);return answer(input);});await u.resume();u.draft.value='玩家先发言';await u.submit('speak');const talk=inputs.filter(x=>x.task==='werewolf-speak');expect(talk.map(x=>x.actorIds[0])).toEqual(['a','b','c','d','e']);expect(JSON.stringify(talk[1])).toContain('a公开发言');expect(JSON.stringify(talk[0])).not.toContain('b公开发言');expect(u.humanAction.value).toBe('vote');await u.submit('abstain');const ballots=inputs.filter(x=>x.task==='werewolf-vote');expect(ballots).toHaveLength(5);for(const b of ballots){expect(JSON.stringify(b)).not.toContain('"votes"');expect(JSON.stringify(b)).not.toContain('投票结果：');}expect(replayWerewolf(w.active!.terminal!.werewolfGames![0]).day).toBe(2);
});
it('lone human wolf chooses without any council request',async()=>{
 const {w,u}=setup(['wolf','wolf','villager','seer','witch','villager']);let g=w.active!.terminal!.werewolfGames![0];g=actWerewolf(g,[{type:'council',opinions:[{id:'a',target:'e',reason:'建议'}]},{type:'knife',target:'a'},{type:'inspect',actor:'c',target:'e'},{type:'medicine',actor:'d',save:false,poison:null},{type:'dawn'}]);while(['speech','lastwords'].includes(replayWerewolf(g).phase)){const s=replayWerewolf(g);g=actWerewolf(g,[{type:'speak',actor:s.order[s.index],text:'发言'}]);}g=actWerewolf(g,[...replayWerewolf(g).order.map(actor=>({type:'vote' as const,actor,target:null})),{type:'tally'}]);w.active!.terminal!.werewolfGames![0]=g;const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async input=>answer(input));expect(u.humanAction.value).toBe('knife');u.target.value='e';await u.submit('choose');expect(spy.mock.calls.some(c=>(c[0] as any).task==='werewolf-council')).toBe(false);
});

it.each([false,true])('spent witch potions skip the API and human prompt (human=%s)',async human=>{
 const {w,u}=setup(human?['witch','wolf','wolf','seer','villager','villager']:undefined),witch=human?'player':'d';
 let g=w.active!.terminal!.werewolfGames![0];
 for(let day=1;day<=2;day++){
  g=actWerewolf(g,[{type:'council',opinions:['a','b'].map(id=>({id,target:'e',reason:'推理'})),target:'e'},{type:'inspect',actor:'c',target:'a'},{type:'medicine',actor:witch,save:day===1,poison:day===2?'e':null},{type:'dawn'}]);
  const s=replayWerewolf(g);g=actWerewolf(g,[...s.order.map(actor=>({type:'speak' as const,actor,text:'发言'})),...s.alive.map(actor=>({type:'vote' as const,actor,target:null})),{type:'tally'}]);
 }
 w.active!.terminal!.werewolfGames=[g];
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async (input:any)=>{
  const a:any=answer(input);if(input.task==='werewolf-council'){a.target='a';a.opinions.forEach((o:any)=>o.target='a');}return a;
 });
 await u.resume();expect(u.error.value).toBe('');expect(spy.mock.calls.map(c=>(c[0] as any).task)).toEqual(['werewolf-council','werewolf-inspect']);expect(u.view.value?.phase).toBe('speech');
});
