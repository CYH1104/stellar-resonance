import {confirmGameInvite} from './helpers/confirm-game-invite';
import {it,expect,vi,afterEach} from 'vitest';
import {effectScope,reactive} from 'vue';
import {usePartyGames} from '../src/app/usePartyGames';
import {useStoryGameInvites} from '../src/app/useStoryGameInvites';
import {useWerewolf} from '../src/app/useWerewolf';
import type {ViewModel} from '../src/app/useWorkspace';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal,validateTerminal} from '../src/domain/personalTerminal';
import {terminalAnchor,terminalOrigin} from '../src/domain/terminalLedger';
import {applyStoryGameInvites,type StoryGameKind,storyGameNames} from '../src/domain/storyGameInvites';
import {HttpGateway} from '../src/gateway/http';
import {terminalGameFacts} from '../src/domain/terminalStoryContext';
// @ts-expect-error Server contract is JavaScript; exercised here through real controller payloads.
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const scopes:ReturnType<typeof effectScope>[]=[];
afterEach(()=>{scopes.splice(0).forEach(s=>s.stop());vi.restoreAllMocks();});
function fixture(kind:StoryGameKind='truth'){
 const s=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.terminal=emptyTerminal();
 s.initial.characters=['a','b','c','d','e','f'].map(id=>({id,name:id.toUpperCase(),present:true}));
 const quote='A想玩'+storyGameNames[kind]+'，邀请朋友开局。';s.turns.push({id:'t1',input:'休息',selected:0,variants:[{id:'v1',text:quote,status:'complete',outcome:{event:'休息'},createdAt:'now'}]});
 const members=['a','b','c','d','e','f'].slice(0,kind==='mahjong'?4:kind==='werewolf'?6:3);
 const i=applyStoryGameInvites(s,[{kind,hostId:'a',members,quote,message:'一起来玩或观战。'}],quote,terminalAnchor(s),terminalOrigin(s,0)!,s.initial.characters)[0];
 confirmGameInvite(i,members);
 s.terminal.tolerances=Object.fromEntries(['player',...members].map(id=>[id,10]));
 const preferences=defaults();preferences.terminalEnabled=true;preferences.terminalProfile='aux';
 const w=reactive({active:s,state:s.initial,preferences,credentials:{},terminalEpoch:0,busy:false,terminalBusy:false,backupWorking:false,storageStatus:'saved',save:vi.fn(async()=>{}),saveTerminal:vi.fn(async(s:any)=>validateTerminal(s.terminal)),connectionReady:()=>true,connectProfile:async()=>true,indexTerminalNotes:vi.fn()}) as unknown as ViewModel;
 const scope=effectScope();scopes.push(scope);const invites=scope.run(()=>useStoryGameInvites(w))!;return {w,scope,invites,i,members};
}
it('accepts a real seat or observer once; save failure rolls back and restored invitations still open the same table',async()=>{
 const {w,invites,i}=fixture();const before=JSON.stringify(w.active!.terminal);vi.mocked(w.saveTerminal!).mockRejectedValueOnce(Error('disk full'));
 expect(await invites.respond(i.id,'spectating')).toBeUndefined();expect(JSON.stringify(w.active!.terminal)).toBe(before);expect(invites.error.value).toContain('disk full');
 const accepted=await invites.respond(i.id,'joined');expect(accepted?.targetId).toBeTruthy();expect(w.active!.terminal!.partyRooms![0].members).toEqual(['player','a','b']);expect(await invites.respond(i.id,'spectating')).toBeUndefined();
 const restored=parseBackup(backup({version:1,sessions:[w.active!],preferences:w.preferences}));expect(restored.sessions[0].terminal!.gameInvitations![0].targetId).toBe(accepted!.targetId);
});
it('disabled/stale invitation cannot create games while restore is active or source was rewound',async()=>{
 const {w,invites,i}=fixture();w.backupWorking=true;expect(await invites.respond(i.id,'spectating')).toBeUndefined();w.backupWorking=false;w.active!.turns=[];expect(await invites.respond(i.id,'spectating')).toBeUndefined();expect(w.active!.terminal!.partyRooms||[]).toHaveLength(0);
});
for(const kind of ['truth','eleven','liar'] as const)it('drives a complete NPC-only '+kind+' round through the real controller and server contract',async()=>{
 const {w,scope,invites,i,members}=fixture(kind);const accepted=await invites.respond(i.id,'spectating');expect(accepted).toBeTruthy();
 const u=scope.run(()=>usePartyGames(w))!;u.open(accepted!.targetId!);
 const api=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{
  const p=terminalPlan({characters:w.state!.characters,world:{entries:[]}},data),party=data.context.party;
  let result:any;
  if(data.task==='party-truth')result=party.stage==='choose'?{choice:'truth',text:'说真心话。'}:{text:'今天和朋友玩得很开心。',refused:false};
  else if(data.task==='party-eleven-batch')result={characters:members.map(id=>({id,choice:party.phase==='complete'?null:'stand',text:'我先看看。'})),tolerances:[]};
  else if(data.task==='party-liar-turn')result={action:party.lastBid?'open':'bid',...(party.lastBid?{}:{bid:{count:3,face:6,pure:false}}),replies:members.map(id=>({id,text:'这把看看。'}))};
  else result={replies:data.actorIds.map((id:string)=>({id,text:'下局再来。'}))};
  return parseTerminalResult(JSON.stringify(result),p) as any;
 });
 await u.start();for(let n=0;u.round.value?.phase!=='complete'&&!u.error.value&&n<10;n++)await u.npcAction();
 expect(u.error.value).toBe('');expect(u.round.value?.phase).toBe('complete');expect(u.spectating.value).toBe(true);expect(api).toHaveBeenCalled();
 for(const [data] of api.mock.calls){expect((data as any).context.party.participants.map((p:any)=>p.id)).not.toContain('player');expect((data as any).context.audience).not.toContain('player');}
 validateTerminal(w.active!.terminal!);const fact=terminalGameFacts(w.active!).find(f=>f.text.includes('玩家仅观战'));expect(fact).toBeTruthy();expect(fact!.text).not.toContain('参与者：A、B、C、玩家');
 u.draft.value='我来操作';await u.reactions();expect(u.error.value).toContain('观战位');
});
it('NPC-only werewolf can advance its first night while the observer sees no private roles',async()=>{
 const {w,scope,invites,i}=fixture('werewolf');const invite=await invites.respond(i.id,'spectating');expect(invite).toBeTruthy();
 const u=scope.run(()=>useWerewolf(w))!;u.open(invite!.targetId!);expect(u.spectating.value).toBe(true);expect(u.humanAction.value).toBe('');expect(u.view.value).not.toHaveProperty('selfRole');
 w.active!.terminal!.werewolfGames![0].roles=['wolf','wolf','seer','witch','villager','villager'];
 const api=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{
  const p=terminalPlan({characters:w.state!.characters,world:{entries:[]}},data);
  const result=data.task==='werewolf-council'?{opinions:[{id:'a',target:'e',reason:'判断'},{id:'b',target:'e',reason:'同意'}],target:'e'}:data.task==='werewolf-inspect'?{target:'a'}:{save:false,poison:null};
  return parseTerminalResult(JSON.stringify(result),p) as any;
 });
 await u.resume();expect(u.error.value).toBe('');expect(api).toHaveBeenCalledTimes(3);expect(u.view.value!.phase).not.toBe('night');expect(u.view.value).not.toHaveProperty('wolfIds');validateTerminal(w.active!.terminal!);
});
