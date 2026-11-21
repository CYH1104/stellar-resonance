import {it,expect,vi,afterEach} from 'vitest';
import {effectScope,reactive} from 'vue';
import {usePartyGames} from '../src/app/usePartyGames';
import {HttpGateway} from '../src/gateway/http';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {partyDialogueLines} from '../src/domain/partyDialogueView';
import {createPartyRoom,startPartyRound,chooseTruth,finishTruth,validatePartyRooms,partyParticipants,cards,handRank,compareHands,elevenWaveChoice,elevenWaveSpeech,advanceElevenWave,markElevenBatch,applyElevenBatchResult,settlePartyEnd} from '../src/domain/partyGames';
import {applyLiarMove,applyLiarTurn,completeLiarMove,liarChallengeOptions,isLegalLiarBid,countLiarDice,startLiarRound,rerollLiar,confirmLiarRoll} from '../src/domain/liarDice';
// @ts-expect-error Server contract module is JavaScript; exercised through the real parser.
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const scopes:any[]=[];
afterEach(()=>{for(const s of scopes)s.stop();scopes.length=0;vi.restoreAllMocks();vi.unstubAllGlobals();});
function room(kind='truth',n=3){const ids=Array.from({length:n-1},(_,i)=>String.fromCharCode(97+i));const r=createPartyRoom(kind as any,ids,'专项审计','轻松','audit-room');for(const id of ids)r.invitations[id]='accepted';return r;}
function setup(kind='truth',n=3){
 const s=newSession('审计',{name:'玩家',appearance:'',personality:'',background:''},'');s.terminal=emptyTerminal();
 const r=room(kind,n);s.terminal.partyRooms=[r];s.initial.characters=r.members.slice(1).map(id=>({id,name:id,present:true}));
 s.terminal.friends=r.members.slice(1).map(id=>({id,status:'accepted' as const,reply:'好',note:''}));s.terminal.tolerances=Object.fromEntries(r.members.map(id=>[id,10]));
 const p=defaults();p.terminalEnabled=true;p.terminalProfile='main';p.profiles[0].apiBaseUrl='https://synthetic.invalid/v1';p.profiles[0].model='audit-mock';
 const w=reactive({active:s,state:s.initial,preferences:p,credentials:{main:'synthetic-only'},terminalEpoch:0,terminalBusy:false,busy:false,backupWorking:false,storageStatus:'saved',connectionReady:()=>true,connectProfile:async()=>true,saveTerminal:vi.fn(async(ss:any)=>validatePartyRooms(ss.terminal.partyRooms)),scopedRecall:vi.fn(async()=>[]),indexTerminalNotes:()=>{}}) as any;
 const scope=effectScope();scopes.push(scope);const u=scope.run(()=>usePartyGames(w))!;u.open(r.id);
 vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Network forbidden: use synthetic terminal adapter');}));
 return {u,w,card:{characters:s.initial.characters.map(c=>({...c,intro:'审计用合成角色'}))}};
}
function rig(r:any,hands:Record<string,string[]>){const rr=startPartyRound(r,undefined,()=>0) as any;rr.hands=hands;rr.deck=cards.filter(c=>!Object.values(hands).flat().includes(c));return rr;}
function resolveStand(r:any){for(const id of partyParticipants(r))elevenWaveChoice(r,id,'stand');elevenWaveSpeech(r,partyParticipants(r).filter(x=>x!=='player').map(id=>({id,text:'停牌。'})));return advanceElevenWave(r);}
function modernBid(r:any,actor:string,bid:any){return applyLiarMove(r,actor,'bid',bid,'',[],1);}
// Independent tabulated card examples, with expected categories/values fixed by the written rules.
it.each([
 [['S-A'],2,'ordinary'],[['S-10'],20,'ordinary'],[['S-K'],1,'ordinary'],[['S-10','H-J'],21,'eleven'],
 [['S-10','H-A'],22,'bust'],[['S-J','H-Q','C-K','D-J','S-Q'],5,'flowers'],
 [['S-A','H-A','C-A','D-A','S-2'],12,'five'],[['S-2','H-2','C-2','D-2','S-3'],22,'bust'],
])('ten-half example %j has fixed rank %i/%s',(hand,points,kind)=>expect(handRank(hand as string[],21)).toMatchObject({halfPoints:points,kind}));
it('ten-half special ranks and ties use written priority, including banker fallback',()=>{
 expect(compareHands(['S-J','H-Q','C-K','D-J','S-Q'],['S-A','H-A','C-A','D-A','S-2'],21)).toBeGreaterThan(0);
 expect(compareHands(['S-A','H-A','C-A','D-A','S-2'],['H-10','C-J'],21)).toBeGreaterThan(0);
 expect(compareHands(['S-10'],['H-A','C-9'],21)).toBeGreaterThan(0);
 const r=room('eleven');r.bankerOrder=['player','a','b'];r.bankerIndex=0;rig(r,{player:['S-8'],a:['H-8'],b:['C-2']});
 expect(resolveStand(r).winner).toBe('player');expect(r.drunk).toEqual({player:0,a:1,b:1});expect(r.bankerIndex).toBe(0);validatePartyRooms([r]);
});
it.each([3,4,5,6,7,8])('all %i participants bust: one cup each, unchanged banker and idempotent recovery',(n)=>{
 const r=room('eleven',n);const rr=startPartyRound(r,undefined,()=>0) as any;const ids=partyParticipants(r);
 const pairs=[['S-10','S-2'],['H-10','H-2'],['C-10','C-2'],['D-10','D-2'],['S-9','S-3'],['H-9','H-3'],['C-9','C-3'],['D-9','D-3']];
 rr.hands=Object.fromEntries(ids.map((id,i)=>[id,[pairs[i][0]]]));const draws=ids.map((_,i)=>pairs[i][1]);rr.deck=[...cards.filter(c=>!pairs.slice(0,n).flat().includes(c)),...draws.reverse()];
 const bankerBefore=r.bankerIndex;for(const id of ids)elevenWaveChoice(r,id,'hit');elevenWaveSpeech(r,ids.slice(1).map(id=>({id,text:'继续。'})));advanceElevenWave(r);
 expect(rr.outcome).toBe('all-bust');expect(rr.winner).toBeUndefined();expect(r.bankerIndex).toBe(bankerBefore);expect(Object.values(r.drunk)).toEqual(Array(n).fill(1));
 markElevenBatch(r);const saved=JSON.parse(JSON.stringify(r));applyElevenBatchResult(saved,ids.slice(1).map(id=>({id,choice:null})),{version:1,lines:[]});
 expect(()=>applyElevenBatchResult(saved,ids.slice(1).map(id=>({id,choice:null})),{version:1,lines:[]})).toThrow();expect(Object.values(saved.drunk)).toEqual(Array(n).fill(1));validatePartyRooms([saved]);
});
it.each([undefined,'eleven-v2','ten-half-v1'])('round version %s freezes the 11 / 10.5 threshold',(version)=>{
 const r=room('eleven');const rr=rig(r,{player:['S-10'],a:['H-2'],b:['C-2']});if(version)rr.rulesVersion=version;else delete rr.rulesVersion;
 rr.deck=[...rr.deck.filter((c:string)=>c!=='D-A'),'D-A'];elevenWaveChoice(r,'player','hit');elevenWaveChoice(r,'a','stand');elevenWaveChoice(r,'b','stand');elevenWaveSpeech(r,[{id:'a',text:'停。'},{id:'b',text:'停。'}]);advanceElevenWave(r);
 expect(rr.hands.player).toEqual(['S-10','D-A']);expect(rr.stopped.includes('player')).toBe(version==='ten-half-v1');validatePartyRooms([r]);
});
it.each([3,4,5,6,7,8])('valid total player count %i preserves all seats and excludes declined invitees',(n)=>{
 for(const kind of ['eleven','truth','liar']){const r=room(kind,n);expect(partyParticipants(r)).toHaveLength(n);startPartyRound(r,undefined,()=>0);validatePartyRooms([r]);}
});
it.each([0,1,8,9])('friend count %i is rejected before a round exists',(n)=>expect(()=>createPartyRoom('truth',Array.from({length:n},(_,i)=>'npc'+i),'','','r')).toThrow());
it('partial invitation acceptance permits exactly player plus two accepted friends',()=>{const r=room('truth',5);r.invitations.c='declined';r.invitations.d='pending';expect(partyParticipants(r)).toEqual(['player','a','b']);expect((startPartyRound(r,undefined,n=>n-1) as any).target).toBe('b');validatePartyRooms([r]);});
it.each([
 [undefined,{count:3,face:6,pure:false},true], [undefined,{count:2,face:6,pure:false},false],
 [{count:3,face:6,pure:false},{count:4,face:1,pure:false},true], [{count:3,face:3,pure:false},{count:3,face:4,pure:false},true],
 [{count:3,face:3,pure:false},{count:3,face:3,pure:false},false], [{count:3,face:6,pure:false},{count:3,face:1,pure:true},true],
 [{count:5,face:1,pure:true},{count:6,face:6,pure:false},false], [{count:5,face:6,pure:true},{count:7,face:1,pure:false},true],
 [{count:15,face:6,pure:true},{count:16,face:1,pure:true},false], [undefined,{count:3.5,face:1,pure:false},false],
 [undefined,{count:3,face:7,pure:false},false], [undefined,{count:3,face:1,pure:'false'},false]
])('liar legal transition %j -> %j is %s',(previous,next,expected)=>expect(isLegalLiarBid(previous as any,next,3)).toBe(expected));
it('wild ones count once when face is one; pure excludes wildcard ones',()=>{
 const dice={player:[1,1,2,2,3],a:[1,4,4,5,6],b:[2,2,2,6,6]};
 expect(countLiarDice(dice,{count:3,face:1,pure:false})).toBe(3);expect(countLiarDice(dice,{count:3,face:2,pure:false})).toBe(8);expect(countLiarDice(dice,{count:3,face:2,pure:true})).toBe(5);
});
it.each(['open','split'])('mixed multi-target %s settles independently and chooses original-seat tie winner',(action)=>{
 const r=room('liar');const rr=startLiarRound(r.members,1,'a',undefined,()=>0);r.rounds.push(rr);
 rr.dice={player:[1,1,1,1,1],a:[2,2,2,2,2],b:[3,3,3,3,3]};rr.rolls!.initial=JSON.parse(JSON.stringify(rr.dice));
 modernBid(r,'a',{count:5,face:2,pure:true});modernBid(r,'b',{count:6,face:3,pure:true});applyLiarMove(r,'player',action as any,undefined,'',[],1,['a','b']);
 const cups=action==='split'?2:1;expect(rr.challenge!.duels.map(d=>[d.actual,d.winner,d.loser])).toEqual([[5,'a','player'],[5,'player','b']]);expect(r.drunk).toEqual({player:cups,a:0,b:cups});expect(rr.nextStarter).toBe('player');expect(rr.winner).toBeUndefined();validatePartyRooms([r]);
 const copy=JSON.stringify(r);expect(()=>applyLiarMove(r,'player',action as any,undefined,'',[],1,['a','b'])).toThrow();expect(JSON.stringify(r)).toBe(copy);
});
it('all seven targets hold: split sums fourteen cups before drunken end',()=>{
 const r=room('liar',8);const rr=startLiarRound(r.members,1,'a',undefined,()=>0);r.rounds.push(rr);
 for(const [i,id] of r.members.slice(1).entries())modernBid(r,id,{count:8+i,face:1,pure:false});
 applyLiarMove(r,'player','split',undefined,'',[],1,r.members.slice(1));expect(r.drunk.player).toBe(14);expect(r.members.slice(1).map(id=>r.drunk[id])).toEqual(Array(7).fill(0));
 settlePartyEnd(r,Object.fromEntries(r.members.map(id=>[id,10])));expect(r.endReason).toBe('drunk');expect(r.endTriggers).toEqual(['player']);const before=JSON.stringify(r);settlePartyEnd(r,Object.fromEntries(r.members.map(id=>[id,10])));expect(JSON.stringify(r)).toBe(before);validatePartyRooms([r]);
});
it.each([[['player']],[['a','a']],[['unknown']]])('invalid multi-target %j never changes dice, ledger or moves',(targets)=>{
 const r=room('liar');const rr=startLiarRound(r.members,1,'a',undefined,()=>0);r.rounds.push(rr);modernBid(r,'a',{count:3,face:1,pure:false});modernBid(r,'b',{count:3,face:2,pure:false});const before=JSON.stringify(r);expect(()=>applyLiarMove(r,'player','open',undefined,'',[],1,targets as any)).toThrow();expect(JSON.stringify(r)).toBe(before);
});
it('challenge uses each target latest bid, even when it is not the immediately previous caller',()=>{
 const r=room('liar');const rr=startLiarRound(r.members,1,'a',undefined,()=>0);r.rounds.push(rr);modernBid(r,'a',{count:3,face:1,pure:false});modernBid(r,'b',{count:3,face:2,pure:false});modernBid(r,'player',{count:3,face:3,pure:false});modernBid(r,'a',{count:3,face:4,pure:false});modernBid(r,'b',{count:3,face:5,pure:false});
 expect(liarChallengeOptions(rr)).toEqual([{id:'a',bid:{count:3,face:4,pure:false}},{id:'b',bid:{count:3,face:5,pure:false}}]);applyLiarMove(r,'player','open',undefined,'',[],1,['a']);expect(rr.challenge!.duels[0].bid.face).toBe(4);validatePartyRooms([r]);
});
it('restored scatter may be rerolled, pair seals automatically and bids forbid further rerolls',()=>{
 const r=room('liar');let i=0;const rr=startLiarRound(r.members,1,'player',undefined,()=>i++<5?(i-1)%5:0);r.rounds.push(rr);expect(rr.phase).toBe('rolling');const restored=JSON.parse(JSON.stringify(r));rerollLiar(restored,'player',()=>5);expect(restored.rounds[0].dice.player).toEqual([6,6,6,6,6]);expect(restored.rounds[0].phase).toBe('playing');modernBid(restored,'player',{count:3,face:1,pure:false});const before=JSON.stringify(restored);expect(()=>rerollLiar(restored)).toThrow();expect(JSON.stringify(restored)).toBe(before);validatePartyRooms([restored]);
});
it('truth refuses blank completion; valid answer survives backup and cannot penalize twice',async()=>{
 const {u,w}=setup();startPartyRound(u.room.value!,undefined,()=>0);await u.choose('truth');await u.answer();expect(u.round.value!.phase).toBe('respond');u.draft.value='我说的确实是自己的回答。';await u.answer();expect(u.error.value).toBe('');expect((u.round.value as any).text).toBe('我说的确实是自己的回答。');expect(u.room.value!.drunk.player).toBe(0);
 const restored=parseBackup(backup({version:1,sessions:[w.active],preferences:defaults()}));expect(restored.sessions[0].terminal!.partyRooms![0].rounds[0]).toEqual(JSON.parse(JSON.stringify(u.round.value)));
 await u.answer(true);expect(u.room.value!.drunk.player).toBe(0);expect(u.round.value!.phase).toBe('complete');
});
it('truth NPC choose/respond runs the real server parser with synthetic output, and retry keeps the same question',async()=>{
 const {u,card}=setup();startPartyRound(u.room.value!,undefined,n=>n===3?1:0);const rr=JSON.stringify(u.round.value);let fail=true;
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{if(fail){fail=false;throw Error('synthetic timeout');}const plan=terminalPlan(card,data);return parseTerminalResult(JSON.stringify(data.context.party.stage==='choose'?{choice:'truth',text:'我选真心话。'}:{text:'我拒绝这次问题。',refused:true}),plan);});
 await u.npcAction();expect(JSON.stringify(u.round.value)).toBe(rr);await u.retryRequest();expect(u.error.value).toBe('');expect(u.round.value!.phase).toBe('respond');await u.npcAction();expect(u.round.value!.phase).toBe('complete');expect(u.room.value!.drunk.a).toBe(1);expect(spy).toHaveBeenCalledTimes(3);
});
// Regression: current UI permits interactions before answering. The spec demands actual saved chronology.
it('F-TRUTH-ORDER: interaction sent BEFORE answer must remain before it in displayed chat after reload',async()=>{
 const {u,w}=setup();startPartyRound(u.room.value!,undefined,()=>0);await u.choose('truth');
 vi.spyOn(HttpGateway.prototype,'terminal').mockResolvedValue({replies:[{id:'a',text:'可以，慢慢想。'},{id:'b',text:'我们等着。'}]});
 u.draft.value='先等我想一想。';await u.reactions();expect(u.error.value).toBe('');u.draft.value='想好了，我的答案是一起旅行。';await u.answer();expect(u.error.value).toBe('');
 const restored=parseBackup(backup({version:1,sessions:[w.active],preferences:defaults()}));
 expect(partyDialogueLines(restored.sessions[0].terminal!.partyRooms![0].rounds[0]).map(x=>x.text)).toEqual(['先等我想一想。','可以，慢慢想。','我们等着。','想好了，我的答案是一起旅行。']);
});

it.each([3,8])('real client/server contracts complete ten-half at %i seats and keep saved results across network retry',async(n)=>{
 const {u,w,card}=setup('eleven',n);let failOnSettlement=true;
 vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{
  const plan=terminalPlan(card,data),p=plan.party;
  if(p.phase==='complete'&&failOnSettlement){failOnSettlement=false;throw Error('synthetic settlement timeout');}
  return parseTerminalResult(JSON.stringify({characters:p.privateHands.map((x:any)=>({id:x.id,choice:x.canChoose?'stand':null})),dialogue:plan.dialoguePlan.slots.map((id:string)=>({id,text:'听到了，我先看看。'})),tolerances:[]}),plan);
 });
 await u.start();expect(u.error.value).toBe('');expect(u.round.value?.kind).toBe('eleven');expect((u.round.value as any).rulesVersion).toBe('ten-half-v1');
 await u.stand();expect(u.error.value).toBe('synthetic settlement timeout');expect(u.round.value!.phase).toBe('complete');const r=JSON.parse(JSON.stringify(u.room.value));
 expect(Object.values(r.drunk).reduce((a:any,b:any)=>a+b,0)).toBe(n-1);await u.retryRequest();expect(u.error.value).toBe('');expect(u.room.value!.drunk).toEqual(r.drunk);expect((u.round.value as any).hands).toEqual(r.rounds[0].hands);expect(u.room.value!.bankerIndex).toBe(r.bankerIndex);
 parseBackup(backup({version:1,sessions:[w.active],preferences:defaults()}));
});
it.each([3,8])('real liar contracts wrap past twelve moves at %i seats, resume one failed NPC and settle multi-open once',async(n)=>{
 vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array:any)=>{array.fill(0);return array;});
 const {u,w,card}=setup('liar',n);await u.start();let failAtFour=true;let pendingState:any;
 vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{
  const plan=terminalPlan(card,data);const last=data.context.party.lastBid;
  if(data.task==='party-liar-turn'&&u.round.value?.kind==='liar'&&u.round.value.moves.length===4&&failAtFour){failAtFour=false;pendingState=JSON.parse(JSON.stringify(u.round.value));throw Error('synthetic NPC timeout');}
  const dialogue=plan.dialoguePlan.slots.map((id:string)=>({id,text:'你这么说，我就再看看。'}));
  const next=last.face===6?{count:last.count+1,face:1,pure:false}:{count:last.count,face:last.face+1,pure:false};
  return parseTerminalResult(JSON.stringify(data.task==='party-liar-turn'?{action:'bid',bid:next,dialogue}:{dialogue}),plan);
 });
 for(let turn=0;turn<Math.ceil(13/n);turn++){
  const rr=u.round.value as any;const last=rr.moves.filter((m:any)=>m.action==='bid').at(-1)?.bid;
  const next=last?last.face===6?{count:last.count+1,face:1,pure:false}:{count:last.count,face:last.face+1,pure:false}:{count:n,face:1,pure:false};
  await u.liarBid(next);if(u.error.value){expect(u.error.value).toBe('synthetic NPC timeout');const count=(u.round.value as any).moves.length;await u.retryRequest();const resumed=(u.round.value as any).moves.slice(0,count);for(let i=0;i<count;i++){if(pendingState.moves[i].id==='player'&&pendingState.moves[i].pending){expect(resumed[i]).toMatchObject({...pendingState.moves[i],pending:false,replyWithNext:true});}else expect(resumed[i]).toEqual(pendingState.moves[i]);}}
  expect(u.error.value).toBe('');expect((u.round.value as any).turn).toBe('player');
 }
 expect((u.round.value as any).moves.length).toBeGreaterThan(12);const dice=JSON.parse(JSON.stringify((u.round.value as any).dice));await u.liarOpen(['a','b']);expect(u.error.value).toBe('');expect(u.round.value!.phase).toBe('complete');expect((u.round.value as any).dice).toEqual(dice);expect(u.room.value!.drunk).toEqual(Object.fromEntries(u.room.value!.members.map(id=>[id,id==='player'?2:0])));parseBackup(backup({version:1,sessions:[w.active],preferences:defaults()}));
});
it.each(['truth','eleven','liar'])('C-LEDGER-%s: unchanged backup retains fixed cups; changing only drunk is accepted as an inconsistent import',(kind)=>{
 const r=room(kind);
 if(kind==='truth'){const rr=startPartyRound(r,undefined,()=>0) as any;chooseTruth(r,rr.target,'truth');finishTruth(r,rr.target,'我选择拒绝。',true);}
 if(kind==='eleven'){rig(r,{player:['S-10'],a:['H-2'],b:['C-3']});resolveStand(r);}
 if(kind==='liar'){const rr=startLiarRound(r.members,1,'a',undefined,()=>0);r.rounds.push(rr);modernBid(r,'a',{count:3,face:1,pure:false});modernBid(r,'b',{count:3,face:2,pure:false});applyLiarMove(r,'player','open',undefined,'',[],1,['a']);}
 validatePartyRooms([r]);expect(r.drunk).toEqual(kind==='eleven'?{player:0,a:1,b:1}:{player:1,a:0,b:0});
 const s=newSession('损坏备份',{name:'玩家',appearance:'',personality:'',background:''},'');s.terminal=emptyTerminal();s.terminal.partyRooms=[r];const snapshot={version:1 as const,sessions:[s],preferences:defaults()};const valid=JSON.parse(backup(snapshot));for(const id of r.members)valid.sessions[0].terminal.partyRooms[0].drunk[id]=0;
  const expected=kind==='eleven'?{player:0,a:1,b:1}:{player:1,a:0,b:0};
 const original=JSON.parse(backup(snapshot));const originalRestored=parseBackup(JSON.stringify(original)).sessions[0].terminal!.partyRooms![0];expect(originalRestored.drunk).toEqual(expected);
 const modifiedRestored=parseBackup(JSON.stringify(valid)).sessions[0].terminal!.partyRooms![0];expect(modifiedRestored.drunk).toEqual({player:0,a:0,b:0});expect(modifiedRestored.rounds).toEqual(originalRestored.rounds);
 const rr:any=originalRestored.rounds[0];const evidence=kind==='truth'?{phase:rr.phase,target:rr.target,choice:rr.choice,text:rr.text,refused:rr.refused}:kind==='eleven'?{phase:rr.phase,rulesVersion:rr.rulesVersion,hands:rr.hands,winner:rr.winner}:{phase:rr.phase,rulesVersion:rr.rulesVersion,dice:rr.dice,moves:rr.moves,challenge:rr.challenge};
});

it('truth storage rejection rolls back the answer and cup; explicit retry charges exactly once',async()=>{
 const {u,w}=setup();startPartyRound(u.room.value!,undefined,()=>0);await u.choose('truth');u.draft.value='这次不回答。';
 const before=JSON.stringify(w.active.terminal);const model=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValue(Error('unexpected model call'));
 w.saveTerminal.mockRejectedValueOnce(Error('synthetic disk full'));await u.answer(true);
 expect(u.error.value).toBe('synthetic disk full');expect(JSON.stringify(w.active.terminal)).toBe(before);expect(u.draft.value).toBe('这次不回答。');expect(model).not.toHaveBeenCalled();
 await u.retryRequest();expect(u.error.value).toBe('');expect(u.room.value!.drunk).toEqual({player:1,a:0,b:0});expect(u.round.value).toMatchObject({phase:'complete',text:'这次不回答。',refused:true});
 await u.answer(true);expect(u.room.value!.drunk).toEqual({player:1,a:0,b:0});
});
it.each(['open','split'])('F-LIAR-WRITE-RETRY-%s: failed player save rolls back, then explicit retry must perform the unsaved action once',async(action)=>{
 const {u,w,card}=setup('liar');u.page.value='play';const r=u.room.value!;const rr=startLiarRound(r.members,1,'a',undefined,()=>0);r.rounds.push(rr);modernBid(r,'a',{count:3,face:1,pure:false});modernBid(r,'b',{count:3,face:2,pure:false});
 const before=JSON.stringify(w.active.terminal);const model=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{const plan=terminalPlan(card,data);return parseTerminalResult(JSON.stringify({dialogue:plan.dialoguePlan.slots.map((id:string)=>({id,text:'这局就这样，下一局再看。'}))}),plan);});
 w.saveTerminal.mockRejectedValueOnce(Error('synthetic disk full'));await (action==='open'?u.liarOpen(['a','b']):u.liarSplit(['a','b']));expect(u.error.value).toBe('synthetic disk full');expect(JSON.stringify(w.active.terminal)).toBe(before);expect(model).not.toHaveBeenCalled();
 u.back();expect(u.page.value).toBe('room');expect(u.retryActionLabel.value).toBe('重试本次开劈回应');await u.retryRequest();expect(u.error.value).toBe('');expect(u.room.value!.drunk).toEqual({player:action==='open'?2:4,a:0,b:0});expect(u.round.value!.phase).toBe('complete');expect((u.round.value as any).dice).toEqual(rr.dice);expect(model).toHaveBeenCalledTimes(1);
});
it('exported liar pending bid resumes in a fresh controller without replaying the player action',async()=>{
 vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array:any)=>{array.fill(0);return array;});
 const {u,w,card}=setup('liar');await u.start();const model=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValueOnce(Error('synthetic offline'));
 await u.liarBid({count:3,face:1,pure:false});expect(u.error.value).toBe('synthetic offline');expect((u.round.value as any).moves).toHaveLength(1);expect((u.round.value as any).moves[0].pending).toBe(true);
 const restored=parseBackup(backup({version:1,sessions:[w.active],preferences:defaults()}));const oldDice=JSON.parse(JSON.stringify((u.round.value as any).dice));for(const scope of scopes)scope.stop();scopes.length=0;w.active=restored.sessions[0];w.state=w.active.initial;
 const newScope=effectScope();scopes.push(newScope);const resumed=newScope.run(()=>usePartyGames(w))!;resumed.open('audit-room');
 model.mockImplementation(async(data:any)=>{const plan=terminalPlan(card,data);return parseTerminalResult(JSON.stringify({action:'bid',bid:{count:3,face:data.context.party.lastBid.face+1,pure:false},dialogue:plan.dialoguePlan.slots.map((id:string)=>({id,text:'接着来。'}))}),plan);});
 await resumed.resumeLiar();expect(resumed.error.value).toBe('');expect((resumed.round.value as any).moves.map((m:any)=>m.id)).toEqual(['player','a','b']);expect((resumed.round.value as any).turn).toBe('player');expect((resumed.round.value as any).dice).toEqual(oldDice);expect(resumed.room.value!.drunk).toEqual({player:0,a:0,b:0});expect(model).toHaveBeenCalledTimes(3);validatePartyRooms([resumed.room.value!]);
});
it('F-LIAR-WRITE-RETRY-bid: retry after a rejected player bid save must persist that bid and resume the NPCs',async()=>{
 const {u,w,card}=setup('liar');u.page.value='play';const r=u.room.value!;r.rounds.push(startLiarRound(r.members,1,'player',undefined,()=>0));u.draft.value='我先叫。';const before=JSON.stringify(w.active.terminal);
 const model=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{const plan=terminalPlan(card,data);return parseTerminalResult(JSON.stringify({action:'bid',bid:{count:3,face:data.context.party.lastBid.face+1,pure:false},dialogue:plan.dialoguePlan.slots.map((id:string)=>({id,text:'那我再加。'}))}),plan);});
 w.saveTerminal.mockRejectedValueOnce(Error('synthetic disk full'));await u.liarBid({count:3,face:1,pure:false});expect(u.error.value).toBe('synthetic disk full');expect(JSON.stringify(w.active.terminal)).toBe(before);expect(model).not.toHaveBeenCalled();expect(u.draft.value).toBe('我先叫。');
 u.back();expect(u.page.value).toBe('room');expect(u.retryActionLabel.value).toBe('重试本轮角色行动');await u.retryRequest();expect(u.error.value).toBe('');expect((u.round.value as any).moves.map((m:any)=>m.id)).toEqual(['player','a','b']);expect((u.round.value as any).moves[0]).toMatchObject({action:'bid',bid:{count:3,face:1,pure:false},text:'我先叫。',pending:false});expect(u.room.value!.drunk).toEqual({player:0,a:0,b:0});expect(model).toHaveBeenCalledTimes(2);
});

it.each(['api','room','epoch'])('invalidated %s binding cannot be rebound by clicking retry twice',async(changed)=>{
 const {u,w}=setup();startPartyRound(u.room.value!,undefined,n=>n===3?1:0);
 const model=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValue(Error('synthetic timeout'));
 await u.npcAction();expect(model).toHaveBeenCalledTimes(1);expect(u.retryActionLabel.value).not.toBe('');
 const saved=w.saveTerminal.mock.calls.length;
 if(changed==='api')w.preferences.profiles[0].model='changed-model';else if(changed==='room')u.room.value!.name='changed-room';else w.terminalEpoch++;
 const before=JSON.stringify(w.active.terminal);await Promise.resolve();await u.retryRequest();expect(u.error.value).toContain('房间或接口已改变');expect(u.retryActionLabel.value).toBe('');
 await u.retryRequest();expect(model).toHaveBeenCalledTimes(1);expect(w.saveTerminal).toHaveBeenCalledTimes(saved);expect(JSON.stringify(w.active.terminal)).toBe(before);
});
