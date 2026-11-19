import {it,expect,vi,afterEach} from 'vitest';
import {effectScope,reactive} from 'vue';
import {usePartyGames} from '../src/app/usePartyGames';
import {HttpGateway} from '../src/gateway/http';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {createPartyRoom,startPartyRound,chooseTruth,partyParticipants,cards,elevenWaveChoice,elevenWaveSpeech} from '../src/domain/partyGames';
import {snapshotRows,rowsSnapshot} from '../src/storage/recordSnapshot';
import {createCloudSave,parseCloudSave,mergeCloudSession} from '../src/domain/cloudBackup';
import type {ViewModel} from '../src/app/useWorkspace';
const scopes:ReturnType<typeof effectScope>[]=[];afterEach(()=>{scopes.forEach(s=>s.stop());scopes.length=0;vi.restoreAllMocks();});
function fixture(kind:'eleven'|'truth'|'liar'='truth'){
 const session=newSession('聚会',{name:'玩家',appearance:'',personality:'',background:''},'开场');session.terminal=emptyTerminal();session.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];
 session.terminal.friends=['a','b'].map(id=>({id,status:'accepted' as const,reply:'好',note:''}));session.terminal.tolerances={player:2,a:2,b:2};
 const room=createPartyRoom(kind,['a','b'],'聚会','轻松','party-room');room.invitations={a:'accepted',b:'accepted'};session.terminal.partyRooms=[room];
 const p=defaults();p.mainProfile='main';p.terminalProfile='main';p.terminalEnabled=true;p.profiles=p.profiles.map(x=>x.id==='main'?{...x,apiBaseUrl:'https://example.test/v1',model:'model'}:x);const w=reactive({active:session,state:session.initial,preferences:p,credentials:{main:'key'},terminalEnabled:true,terminalEpoch:0,authorized:true,loading:false,busy:false,terminalBusy:false,backupWorking:false,storageStatus:'saved',save:vi.fn(async()=>{}),saveTerminal:vi.fn(async()=>{}),connectionReady:()=>true,connectProfile:async()=>true,scopedRecall:vi.fn(async()=>[]),indexTerminalNotes:vi.fn()}) as unknown as ViewModel;
 const scope=effectScope();scopes.push(scope);const u=scope.run(()=>usePartyGames(w))!;u.open(room.id);return {w,u};
}
it('retries failed initial invitations without creating another room and preserves accepted decisions',async()=>{
 const {u,w}=fixture();u.picked.value=['a','b'];u.title.value='新房';
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValueOnce(Error('超时')).mockResolvedValueOnce({decisions:[{id:'a',accepted:true,reply:'我来'},{id:'b',accepted:false,reply:'现在没空'}]});
 await u.create('eleven');expect(u.error.value).toBe('超时');const id=u.room.value!.id;expect(u.retryActionLabel.value).toBe('重试邀请请求');expect(w.active!.terminal!.partyRooms).toHaveLength(2);
 await u.retryRequest();expect(u.room.value!.id).toBe(id);expect(w.active!.terminal!.partyRooms).toHaveLength(2);expect(u.pendingInvites.value).toEqual([]);expect(u.declinedInvites.value).toEqual(['b']);expect(spy).toHaveBeenCalledTimes(2);
});
it('sends immediately, clears the composer and saves a room-scoped pending reply until the API resolves',async()=>{
 const {w,u}=fixture();u.room.value!.invitations.b='declined';u.beginInvite('b');u.inviteNote.value='我带你去看比赛。';let resolve!:(value:any)=>void;
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(()=>new Promise(r=>{resolve=r;}));
 (w as any).connectProfile=async()=>true;const pendingPromise=u.sendInvite();expect(u.inviteTarget.value).toBeNull();expect(u.inviteNote.value).toBe('');await vi.waitFor(()=>expect(spy).toHaveBeenCalledTimes(1));expect(u.pendingInvite.value).toMatchObject({roomId:'party-room',ids:['b'],names:['乙']});expect(w.active!.terminal!.partyRooms![0].inviteNotes!.b).toBe('我带你去看比赛。');expect(spy).toHaveBeenCalledTimes(1);
 u.page.value='list';expect(u.pendingInvite.value?.roomId).toBe('party-room');resolve({decisions:[{id:'b',accepted:true,reply:'好，我参加。'}]});await pendingPromise;expect(u.pendingInvite.value).toBeUndefined();expect(u.room.value!.invitations.b).toBe('accepted');expect(u.room.value!.inviteReplies.b).toBe('好，我参加。');
});
it('persuasion targets only declined invitees, keeps the note on failure and roundtrips it in backups',async()=>{
 const {w,u}=fixture();u.room.value!.invitations.b='declined';u.room.value!.inviteReplies.b='现在没空';
 u.beginInvite('a');expect(u.inviteTarget.value).toBeNull();u.beginInvite('b');u.inviteNote.value='只玩一会儿，结束后我陪你去训练。';
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValueOnce(Error('超时')).mockResolvedValueOnce({decisions:[{id:'b',accepted:true,reply:'那我参加'}]});
 await u.sendInvite();expect(u.inviteTarget.value).toBeNull();expect(u.inviteNote.value).toBe('');expect(u.room.value!.invitations.b).toBe('declined');expect(u.room.value!.inviteNotes!.b).toContain('训练');
 u.page.value='list';await u.retryRequest();expect(u.inviteTarget.value).toBeNull();expect(u.page.value).toBe('list');expect(u.room.value!.invitations.b).toBe('accepted');expect(spy.mock.calls[1][0]).toMatchObject({actorIds:['b'],input:expect.stringContaining('只玩一会儿')});
 const snapshot={version:1 as const,sessions:[w.active!],preferences:defaults()};expect(parseBackup(backup(snapshot)).sessions[0].terminal!.partyRooms![0].inviteNotes!.b).toContain('训练');expect(parseCloudSave(createCloudSave(snapshot,snapshot.preferences)).snapshot.sessions[0].terminal!.partyRooms![0].inviteNotes!.b).toContain('训练');
});
it('commits bottle/card before NPC calls and failed requests never spin again',async()=>{
 const {u}=fixture();await u.start();const before=JSON.stringify(u.round.value);const rr=u.round.value!;if(rr.kind!=='truth')throw Error();rr.target='a';
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValueOnce(Error('断线')).mockResolvedValueOnce({choice:'truth',text:'我选真心话。'});
 const draw=JSON.stringify(u.round.value);await u.npcAction();expect(u.error.value).toBe('断线');expect(JSON.stringify(u.round.value)).toBe(draw);await u.npcAction();expect(u.round.value?.phase).toBe('respond');expect(spy).toHaveBeenCalledTimes(2);expect(before).toContain('card');
});
it('player refusal settles once and drunken end is saved before a failed afterparty; retries do not add cups',async()=>{
 const {w,u}=fixture();await u.start();const r=u.round.value!;if(r.kind!=='truth')throw Error();r.target='player';chooseTruth(u.room.value!,'player','truth');u.room.value!.drunk.player=1;
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValue(Error('小剧场断线'));u.draft.value='我拒绝';await u.answer(true);
 expect(u.room.value!.endedAt).toBeTruthy();expect(u.room.value!.endReason).toBe('drunk');expect(u.room.value!.drunk.player).toBe(2);expect(u.room.value!.afterparty!.scenes![0].status).toBe('failed');
 expect(w.saveTerminal).toHaveBeenCalled();await u.retryAfterparty('player');expect(u.room.value!.drunk.player).toBe(2);expect(spy).toHaveBeenCalledTimes(2);
});
it('wave choices and public speeches persist without revealing private points',()=>{
 const {w,u}=fixture('eleven');const r=u.room.value!;startPartyRound(r);const rr=r.rounds[0];if(rr.kind!=='eleven')throw Error();const wave=rr.waves![0];elevenWaveChoice(r,'player','hit');elevenWaveChoice(r,'a','stand');elevenWaveChoice(r,'b','hit');elevenWaveSpeech(r,[{id:'a',text:'我牌很小。'},{id:'b',text:'我先观望。'},{id:'player',text:'我继续看看。'}]);expect(wave.choices).toEqual({player:'hit',a:'stand',b:'hit'});expect(wave.speeches.map(x=>x.id)).toEqual(['a','b','player']);expect(JSON.stringify(wave)).not.toMatch(/score|points|deck/i);
});
it('failed game write restores the locked round and drunk values',async()=>{
 const {w,u}=fixture('eleven');const r=startPartyRound(u.room.value!);u.page.value='play';if(r.kind!=='eleven')throw Error();const old=JSON.stringify(w.active!.terminal);vi.mocked(w.saveTerminal).mockRejectedValueOnce(Error('磁盘满'));await u.stand();expect(u.error.value).toBe('磁盘满');expect(JSON.stringify(w.active!.terminal)).toBe(old);
});
it('batch NPC responses omit private point claims without inventing a line and keep every decision',async()=>{
 const {u}=fixture('eleven');const rr=startPartyRound(u.room.value!);if(rr.kind!=='eleven')throw Error();u.page.value='play';rr.hands={player:['S-2'],a:['H-3'],b:['C-4']};rr.deck=cards.filter(c=>!Object.values(rr.hands).flat().includes(c));
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockResolvedValue({characters:[{id:'a',choice:'stand',text:'我的点数是3'},{id:'b',choice:'hit',text:'我还想赌一把。'}],tolerances:[]});await u.npcAction();expect(u.error.value).toBe('');expect(spy).toHaveBeenCalledTimes(1);expect(u.wave.value!.speeches.find(x=>x.id==='a')).toBeUndefined();expect(u.wave.value!.speeches.find(x=>x.id==='b')).toBeTruthy();expect(u.wave.value!.choices).toEqual({a:'stand',b:'hit'});expect(Object.values((u.round.value as any).hands).map((h:any)=>h.length)).toEqual([1,1,1]);
});
it('legacy accepted decisions remain locked when adopting the one-call protocol',async()=>{
 const {u}=fixture('eleven');const rr=startPartyRound(u.room.value!);if(rr.kind!=='eleven')throw Error();elevenWaveChoice(u.room.value!,'a','stand');const hands=JSON.stringify(rr.hands);const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockResolvedValue({characters:[{id:'a',choice:'stand',text:'等你。'},{id:'b',choice:'stand',text:'我不急。'}],tolerances:[]});await u.npcAction();expect(u.error.value).toBe('');expect(spy).toHaveBeenCalledTimes(1);expect((spy.mock.calls[0][0] as any).context.party.privateHands[0].lockedChoice).toBe('stand');expect(JSON.stringify((u.round.value as any).hands)).toBe(hands);expect(u.elevenPrepared.value).toBe(true);
});
it('player bid immediately requests the next NPC with all voices and safely retries without a separate player-reply call',async()=>{
 vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array:any)=>{array.fill(0);return array;});
 const {w,u}=fixture('liar');await u.start();const rr=u.round.value!;if(rr.kind!=='liar')throw Error();rr.dice={player:[2,2,2,3,4],a:[3,3,4,4,5],b:[3,3,4,4,5]};if(rr.rolls)rr.rolls.initial=JSON.parse(JSON.stringify(rr.dice));const initial=JSON.stringify(rr.dice),lines=[{id:'a',text:'我不太信。'},{id:'b',text:'再看看。'}];let first=true;
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{if(first){first=false;throw Error('断线');}if(data.context.party.round===1)return {action:'open',replies:lines};return {action:'bid',bid:{count:3,face:data.actorIds[0]==='a'?1:2,pure:false},replies:lines};});
 u.draft.value='三个斋二。';await u.liarBid({count:3,face:2,pure:true});expect(u.error.value).toBe('断线');expect((u.round.value as any).moves).toHaveLength(1);expect((u.round.value as any).moves[0].pending).toBe(true);expect(JSON.stringify((u.round.value as any).dice)).toBe(initial);
 await u.retryRequest();expect(u.error.value).toBe('');expect((u.round.value as any).moves).toHaveLength(2);expect((u.round.value as any).moves[0]).toMatchObject({pending:false,replyWithNext:true,replies:[]});expect((u.round.value as any).moves[1].replies).toHaveLength(2);expect(spy).toHaveBeenCalledTimes(2);expect(spy.mock.calls[0][0]).toMatchObject({task:'party-liar-turn',actorIds:['a'],context:{party:{ownDice:[3,3,4,4,5],playerInput:'三个斋二。'}}});expect((u.round.value as any).winner).toBe('player');expect(u.room.value!.drunk.a).toBe(1);expect(w.scopedRecall).not.toHaveBeenCalled();
 const snapshot={version:1 as const,sessions:[w.active!],preferences:defaults()};for(const v of [parseBackup(backup(snapshot)),parseCloudSave(createCloudSave(snapshot,snapshot.preferences)).snapshot,rowsSnapshot(snapshotRows(snapshot))!])expect(v.sessions[0].terminal!.partyRooms).toEqual(w.active!.terminal!.partyRooms);await u.start();expect(u.error.value).toBe('');expect((u.round.value as any).starter).toBe('a');expect((u.round.value as any).dice.player).toHaveLength(5);expect((u.round.value as any).turn).toBe('player');
});
it('automatically advances every NPC to the player and carries the player message into each table response',async()=>{
 vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array:any)=>{array.fill(0);return array;});const {u}=fixture('liar');await u.start();const replies=[{id:'a',text:'那就走着瞧。'},{id:'b',text:'我可不急。'}];const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>({action:'bid',bid:{count:3,face:data.actorIds[0]==='a'?3:4,pure:false},replies}));u.draft.value='别被我吓到了。';await u.liarBid({count:3,face:2,pure:false});expect(u.error.value).toBe('');expect(spy).toHaveBeenCalledTimes(2);expect(spy.mock.calls.map(([d])=>(d as any).actorIds)).toEqual([['a'],['b']]);expect(spy.mock.calls.every(([d])=>(d as any).task==='party-liar-turn'&&(d as any).context.party.playerInput==='别被我吓到了。')).toBe(true);expect((u.round.value as any).turn).toBe('player');expect((u.round.value as any).moves.map((m:any)=>m.id)).toEqual(['player','a','b']);
});
it('stopping an in-flight next-player request halts the chain and retry never repeats the player bid',async()=>{
 vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array:any)=>{array.fill(0);return array;});const {u}=fixture('liar');await u.start();const replies=[{id:'a',text:'开了看看。'},{id:'b',text:'别急。'}];let resolve!:(value:any)=>void;const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({action:'open',replies});const before=JSON.stringify((u.round.value as any).dice),pending=u.liarBid({count:3,face:1,pure:true});await vi.waitFor(()=>expect(spy).toHaveBeenCalledTimes(1));u.stop();resolve({action:'bid',bid:{count:3,face:2,pure:true},replies});await pending;expect((u.round.value as any).moves).toHaveLength(1);expect((u.round.value as any).turn).toBe('a');expect((u.round.value as any).moves[0].pending).toBe(true);await u.resumeLiar();expect((u.round.value as any).moves).toHaveLength(2);expect((u.round.value as any).phase).toBe('complete');expect(spy).toHaveBeenCalledTimes(2);expect(JSON.stringify((u.round.value as any).dice)).toBe(before);
});
it('modern multiple messages and a silent NPC still auto-advance without a missing-speaker deadlock',async()=>{
 vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array:any)=>{array.fill(0);return array;});const {u,w}=fixture('liar');await u.start();const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>({action:'bid',bid:{count:3,face:data.actorIds[0]==='a'?3:4,pure:false},replies:data.actorIds[0]==='a'?[{id:'a',text:'我先看看。'},{id:'a',text:'你别急。'}]:[],dialogueVersion:1}));await u.liarBid({count:3,face:2,pure:false});expect(u.error.value).toBe('');expect(spy).toHaveBeenCalledTimes(2);const rr=u.round.value;if(rr?.kind!=='liar')throw Error();expect(rr.turn).toBe('player');expect(rr.moves[1].replies.map(r=>r.id)).toEqual(['a','a']);expect(rr.moves[2]).toMatchObject({pending:false,dialogueVersion:1,replies:[]});const snapshot={version:1 as const,sessions:[w.active!],preferences:defaults()};expect(parseBackup(backup(snapshot)).sessions[0].terminal!.partyRooms).toEqual(w.active!.terminal!.partyRooms);
});
it('free game chat appends one actual player message and preserves repeated NPC order',async()=>{
 const {u,w}=fixture('truth');await u.start();const rr=u.round.value;if(rr?.kind!=='truth')throw Error();rr.target='player';chooseTruth(u.room.value!,'player','truth');u.draft.value='我完成回答。';await u.answer(false);vi.spyOn(HttpGateway.prototype,'terminal').mockResolvedValue({dialogue:{version:1,lines:[{id:'b',text:'先听我说。'},{id:'b',text:'我还没说完呢。'}]},replies:[{id:'b',text:'先听我说。'},{id:'b',text:'我还没说完呢。'}],dialogueVersion:1});u.draft.value='你们怎么看？';await u.reactions();expect(u.error.value).toBe('');expect(u.round.value!.replies).toEqual([{id:'player',text:'你们怎么看？'},{id:'b',text:'先听我说。'},{id:'b',text:'我还没说完呢。'}]);const snapshot={version:1 as const,sessions:[w.active!],preferences:defaults()};expect(parseBackup(backup(snapshot)).sessions[0].terminal!.partyRooms).toEqual(w.active!.terminal!.partyRooms);
});
it('automatically plays NPC starters, and an invalid player count never calls the model',async()=>{
 vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array:any)=>{array.fill(1);return array;});const {u}=fixture('liar');const replies=[{id:'a',text:'我先来。'},{id:'b',text:'那我跟上。'}];const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>({action:'bid',bid:{count:3,face:data.actorIds[0]==='a'?1:2,pure:false},replies}));await u.start();expect(u.error.value).toBe('');expect(spy).toHaveBeenCalledTimes(2);expect((u.round.value as any).turn).toBe('player');const before=JSON.stringify(u.round.value);await u.liarBid({count:2,face:6,pure:true});expect(spy).toHaveBeenCalledTimes(2);expect(JSON.stringify(u.round.value)).toBe(before);
});
it('retries table speech after a drunken dice ending without another open, roll or penalty',async()=>{
 vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array:any)=>{array.fill(0);return array;});
 const {w,u}=fixture('liar');await u.start();const rr=u.round.value!;if(rr.kind!=='liar')throw Error();rr.starter='a';rr.turn='a';rr.dice={player:[1,2,3,4,5],a:[1,2,3,4,5],b:[1,2,3,4,5]};rr.rulesVersion='liar-v1';delete rr.rolls;delete rr.seatOrder;u.room.value!.drunk.b=1;
 const replies=[{id:'a',text:'你还真敢开。'},{id:'b',text:'下一局见。'}];let responseFails=true;const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async(data:any)=>{if(data.task==='party-liar-turn')return {action:'bid',bid:{count:data.actorIds[0]==='a'?3:4,face:6,pure:true},replies};if(data.task==='party-liar-reply'){if(responseFails){responseFails=false;throw Error('接话断线');}return {replies};}throw Error('醉后生成失败');});
 await u.npcAction();await u.npcAction();expect((u.round.value as any).turn).toBe('player');await u.liarOpen();expect(u.room.value!.endReason).toBe('drunk');expect(u.room.value!.drunk.b).toBe(2);expect((u.round.value as any).moves.at(-1).pending).toBe(true);const before=JSON.stringify((u.round.value as any).dice);
 await u.npcAction();expect((u.round.value as any).moves.at(-1).pending).toBe(false);expect(u.room.value!.drunk.b).toBe(2);expect(JSON.stringify((u.round.value as any).dice)).toBe(before);expect(u.room.value!.afterparty?.status).toBe('failed');expect(spy.mock.calls.filter(([d])=>(d as any).task==='party-liar-reply')).toHaveLength(2);expect(w.saveTerminal).toHaveBeenCalled();
});
it('both party game records survive local/cloud/record and overwrite recovery snapshots including anchors',()=>{
 const {w}=fixture('eleven'),s=w.active!,r=s.terminal!.partyRooms![0];startPartyRound(r, {key:'opening:123',turnId:'',variantId:'',path:[]});
 const other=createPartyRoom('truth',['a','b'],'转瓶','轻松','truth-room');other.invitations={a:'accepted',b:'accepted'};startPartyRound(other);s.terminal!.partyRooms!.push(other);
 const snapshot={version:1 as const,sessions:[s],preferences:defaults()},local=backup(snapshot),cloud=createCloudSave(snapshot,snapshot.preferences);
 const restored=[parseBackup(local),parseCloudSave(cloud).snapshot,parseBackup(backup(rowsSnapshot(snapshotRows(snapshot))!))];for(const item of restored)expect(item.sessions[0].terminal!.partyRooms).toEqual(s.terminal!.partyRooms);
 const merged=mergeCloudSession(s,parseCloudSave(cloud).snapshot.sessions[0]);expect(merged.terminal!.partyRooms).toEqual(s.terminal!.partyRooms);expect(parseBackup(local).sessions[0].terminal!.partyRooms).toEqual(s.terminal!.partyRooms);
 expect(partyParticipants(r)).toEqual(['player','a','b']);
});
