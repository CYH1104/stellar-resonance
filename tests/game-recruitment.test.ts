import {it,expect,vi,afterEach} from 'vitest';
import {effectScope,reactive,nextTick} from 'vue';
import {useStoryGameInvites} from '../src/app/useStoryGameInvites';
import type {ViewModel} from '../src/app/useWorkspace';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal,validateTerminal} from '../src/domain/personalTerminal';
import {terminalAnchor,terminalOrigin} from '../src/domain/terminalLedger';
import {terminalRecruitmentFacts} from '../src/domain/terminalStoryContext';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {applyStoryGameInvites,visibleStoryGameInvites,type StoryGameKind} from '../src/domain/storyGameInvites';
import {requiredGameNpcs} from '../src/domain/gameRecruitment';
import {HttpGateway} from '../src/gateway/http';
// @ts-expect-error Real server planner is intentionally exercised from controller tests.
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const scopes:ReturnType<typeof effectScope>[]=[];
afterEach(()=>{scopes.splice(0).forEach(s=>s.stop());vi.restoreAllMocks();});
const ids=['a','b','c','d','e','f'];
const card={world:{entries:[]},characters:ids.map(id=>({id,name:id.toUpperCase(),description:'PRIVATE-PROFILE-'+id}))};
function fixture(){
 const s=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.terminal=emptyTerminal();s.initial.characters=ids.map(id=>({id,name:id.toUpperCase(),present:true,identity:'学生',relationship:'OWN-RELATION-'+id,innerThought:'SECRET-THOUGHT-'+id}));
 s.terminal.friends=[{id:'a',code:'12345678901',status:'accepted',direction:'outgoing',requestReason:'测试',reply:'朋友',note:''}];
 const preferences=defaults();preferences.terminalEnabled=true;preferences.terminalProfile='aux';
 const w=reactive({active:s,state:s.initial,preferences,credentials:{},terminalEpoch:0,busy:false,terminalBusy:false,backupWorking:false,storageStatus:'saved',save:vi.fn(async()=>{}),saveTerminal:vi.fn(async(s:any)=>validateTerminal(s.terminal)),connectionReady:()=>true,connectProfile:async()=>true}) as unknown as ViewModel;
 const scope=effectScope();scopes.push(scope);const u=scope.run(()=>useStoryGameInvites(w))!;return {w,u};
}
function model(options:{hostRefuses?:boolean;guestRefuses?:string;few?:boolean}={}){
 return vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{
  const plan=terminalPlan(card,data),n=requiredGameNpcs(data.context.recruitment.kind,data.context.recruitment.mode)-1,selected=options.few?[]:ids.slice(1,n+1);
  const raw=data.task==='game-friends-host'?{accepted:!options.hostRefuses,reply:options.hostRefuses?'今天不想组局。':'好，我问问熟悉的人。',friendEstimate:2+selected.length,candidates:selected.map(id=>({id,basis:'inference',reason:'从已有资料推测可能熟悉'})),selectedIds:options.hostRefuses?[]:selected}:{id:data.actorIds[0],accepted:data.actorIds[0]!==options.guestRefuses,reply:data.actorIds[0]===options.guestRefuses?'今天有安排，不参加。':'好，我来。'};
  raw.friendEstimate=raw.friendEstimate===undefined?undefined:Math.min(5,raw.friendEstimate);
  return parseTerminalResult(JSON.stringify(raw),plan);
 });
}
it('host refusal is persisted, creates no guest calls or room, and is not re-rolled on retry',async()=>{
 const {w,u}=fixture(),m=model({hostRefuses:true});await u.requestFriends('a','landlord','请邀请你的朋友','joined');expect(u.error.value).toBe('');
 const i=u.invitations.value[0];expect(i.status).toBe('refused');expect(m).toHaveBeenCalledTimes(1);await u.continueRecruitment(i.id);expect(m).toHaveBeenCalledTimes(1);expect(w.active!.terminal!.partyRooms||[]).toHaveLength(0);
});
it('does not assume known characters or player friends are friends of the host; too few choices stays unfilled',async()=>{
 const {u}=fixture(),m=model({few:true});await u.requestFriends('a','landlord','请约朋友','spectating');const i=u.invitations.value[0];expect(u.error.value).toBe('');expect(i.status).toBe('unfilled');expect(i.members).toEqual(['a']);expect(m).toHaveBeenCalledTimes(1);expect(await u.respond(i.id,'spectating')).toBeUndefined();
});
it('guest refusal cannot occupy a seat, and is not re-requested or turned into established friendship',async()=>{
 const {w,u}=fixture(),m=model({guestRefuses:'c'});await u.requestFriends('a','landlord','请约朋友','spectating');const i=u.invitations.value[0];expect(u.error.value).toBe('');expect(m).toHaveBeenCalledTimes(3);expect(i.status).toBe('unfilled');expect(i.members).toEqual(['a','b']);await u.continueRecruitment(i.id);expect(m).toHaveBeenCalledTimes(3);expect(w.active!.terminal!.friends.map(f=>f.id)).toEqual(['a']);
 const publicFacts=terminalRecruitmentFacts(w.active!,0,['player']).map(f=>f.text).join('');expect(publicFacts).toContain('拒绝');expect(publicFacts).not.toContain('inference');expect(terminalRecruitmentFacts(w.active!,0,['d'])).toEqual([]);expect(terminalRecruitmentFacts(w.active!,0,['b']).map(f=>f.text).join('')).not.toContain('今天有安排');
});
for(const kind of ['landlord','mahjong','werewolf','eleven','liar','truth'] as StoryGameKind[])it('creates '+kind+' only with sufficient individual consent and respects the reserved player seat',async()=>{
 const {w,u}=fixture(),m=model();await u.requestFriends('a',kind,'请邀请最熟悉的朋友','joined');expect(u.error.value).toBe('');const i=u.invitations.value[0],count=requiredGameNpcs(kind,'joined');expect(i.status).toBe('pending');expect(i.members).toHaveLength(count);expect(m).toHaveBeenCalledTimes(count);expect(await u.respond(i.id,'spectating')).toBeUndefined();expect(u.error.value).toContain('席位');const opened=await u.respond(i.id,'joined');expect(opened?.targetId).toBeTruthy();const seats=kind==='werewolf'?w.active!.terminal!.werewolfGames![0].seats.map(s=>s.id):w.active!.terminal!.partyRooms![0].members;expect(seats).toEqual(['player',...i.members]);validateTerminal(w.active!.terminal!);
});
it('guest requests only contain own acting references and public invitation, never another guest reply or host relationship',async()=>{
 const {u}=fixture(),m=model();await u.requestFriends('a','landlord','HOST-REQUEST','spectating');expect(u.error.value).toBe('');
 for(const call of m.mock.calls.slice(1)){const data=call[0] as any,prompt=JSON.stringify(terminalPlan(card,data).messages);expect(prompt).not.toContain('HOST-REQUEST');expect(prompt).not.toContain('OWN-RELATION-a');expect(prompt).not.toContain('PRIVATE-PROFILE-a');expect(prompt).not.toContain('SECRET-THOUGHT');expect(prompt).not.toContain('selectedIds');expect(prompt).not.toContain('possiblePeople');expect(prompt).toContain('PRIVATE-PROFILE-'+data.actorIds[0]);}
});
it('continues only unanswered guests after a network failure and retains the saved host assessment',async()=>{
 const {u}=fixture(),m=model();const good=m.getMockImplementation()!;let failed=false;m.mockImplementation(async(...args)=>{const data=args[0] as any;if(data.actorIds[0]==='c'&&!failed){failed=true;throw Error('network');}return good(...args);});
 await u.requestFriends('a','landlord','约朋友','spectating');const i=u.invitations.value[0];expect(u.error.value).toContain('network');expect(i.status).toBe('negotiating');expect(i.recruitment!.guests).toHaveLength(1);await u.continueRecruitment(i.id);expect(u.error.value).toBe('');expect(u.invitations.value[0].status).toBe('pending');expect(m.mock.calls.map(c=>(c[0] as any).actorIds[0])).toEqual(['a','b','c','c']);
});
it('write failure rolls back that step without losing saved guest replies, and initial write failure makes no API call',async()=>{
 const {w,u}=fixture(),m=model();vi.mocked(w.saveTerminal!).mockRejectedValueOnce(Error('disk full'));await u.requestFriends('a','landlord','约朋友','spectating');expect(u.invitations.value).toHaveLength(0);expect(m).not.toHaveBeenCalled();
 let writes=0;vi.mocked(w.saveTerminal!).mockImplementation(async()=>{if(++writes===4)throw Error('guest write failed');});await u.requestFriends('a','landlord','约朋友','spectating');expect(u.error.value).toContain('guest write failed');expect(u.invitations.value[0].recruitment!.guests.map(g=>g.id)).toEqual(['b']);validateTerminal(w.active!.terminal!);
});
it('changing terminal API cancels a late response and leaves a resumable request',async()=>{
 const {w,u}=fixture();let finish:(v:any)=>void=()=>{};vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(()=>new Promise(r=>{finish=r;}));
 const waiting=u.requestFriends('a','landlord','约朋友','joined');await vi.waitFor(()=>expect(u.progress.value).toContain('正在请'));await new Promise(r=>setTimeout(r,0));w.preferences.profiles.find(p=>p.id==='aux')!.model='changed';await nextTick();finish({accepted:false,reply:'不去',friendEstimate:0,candidates:[],selectedIds:[]});await waiting;expect(u.invitations.value[0].recruitment!.host).toBeUndefined();expect(u.error.value).toContain('已停止');
});
it('concurrent terminal edits reject the response instead of overwriting them',async()=>{
 const {w,u}=fixture();let finish:(v:any)=>void=()=>{};vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(()=>new Promise(r=>{finish=r;}));const waiting=u.requestFriends('a','landlord','约朋友','joined');await vi.waitFor(()=>expect(u.progress.value).toContain('正在请'));await new Promise(r=>setTimeout(r,0));w.active!.terminal!.bio='other-page';finish({accepted:false,reply:'不去',friendEstimate:0,candidates:[],selectedIds:[]});await waiting;expect(w.active!.terminal!.bio).toBe('other-page');expect(u.invitations.value[0].recruitment!.host).toBeUndefined();expect(u.error.value).toContain('已改变');
});
it('auto story proposals also require host and individual guest consent; no full-roster shortcut',async()=>{
 const {w,u}=fixture(),m=model();const s=w.active!,quote='A想玩斗地主，邀请朋友开局。';s.turns.push({id:'t',input:'休息',selected:0,variants:[{id:'v',text:quote,status:'complete',outcome:{event:'休息'},createdAt:'now'}]});const i=applyStoryGameInvites(s,[{kind:'landlord',hostId:'a',members:['a'],quote,message:'想一起玩吗？'}],quote,terminalAnchor(s),terminalOrigin(s,0)!,s.initial.characters)[0];expect(i.status).toBe('negotiating');expect(i.members).toEqual(['a']);expect(await u.respond(i.id,'spectating')).toBeUndefined();expect(m).not.toHaveBeenCalled();await u.continueRecruitment(i.id);expect(u.error.value).toBe('');expect(u.invitations.value[0].status).toBe('pending');s.turns[0].input='改写';expect(visibleStoryGameInvites(s)).toEqual([]);
});
it('keeps version 1 readable, version 2 decisions round trip locally/cloud, and invalid future schemas fail',async()=>{
 const {w,u}=fixture();model({guestRefuses:'c'});await u.requestFriends('a','landlord','请约朋友','spectating');expect(u.error.value).toBe('');const snap={version:1 as const,sessions:[w.active!],preferences:w.preferences};const local=parseBackup(backup(snap));expect(local.sessions[0].terminal!.gameInvitations).toEqual(w.active!.terminal!.gameInvitations);const cloud=parseCloudSave(createCloudSave(snap,snap.preferences));expect(cloud.snapshot.sessions[0].terminal!.gameInvitations).toEqual(w.active!.terminal!.gameInvitations);
 const i=local.sessions[0].terminal!.gameInvitations![0];i.version=3 as any;expect(()=>validateTerminal(local.sessions[0].terminal!)).toThrow();i.version=2;(i.recruitment as any).secretFlag=true;expect(()=>validateTerminal(local.sessions[0].terminal!)).toThrow();
 const legacy={...w.active!.terminal!.gameInvitations![0],version:1 as const,recruitment:undefined,status:'pending' as const,members:['a','b','c'],origin:{turnId:'old',input:'hash'}};w.active!.terminal!.gameInvitations=[legacy];validateTerminal(w.active!.terminal!);
});
