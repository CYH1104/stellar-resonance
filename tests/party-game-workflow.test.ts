import {it,expect,vi,afterEach} from 'vitest';
import {effectScope,reactive} from 'vue';
import {usePartyGames} from '../src/app/usePartyGames';
import {HttpGateway} from '../src/gateway/http';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {createPartyRoom,startPartyRound,chooseTruth,partyParticipants} from '../src/domain/partyGames';
import {snapshotRows,rowsSnapshot} from '../src/storage/recordSnapshot';
import {createCloudSave,parseCloudSave,mergeCloudSession} from '../src/domain/cloudBackup';
import type {ViewModel} from '../src/app/useWorkspace';
const scopes:ReturnType<typeof effectScope>[]=[];afterEach(()=>{scopes.forEach(s=>s.stop());scopes.length=0;vi.restoreAllMocks();});
function fixture(kind:'eleven'|'truth'='truth'){
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
it('persuasion targets only declined invitees, keeps the note on failure and roundtrips it in backups',async()=>{
 const {w,u}=fixture();u.room.value!.invitations.b='declined';u.room.value!.inviteReplies.b='现在没空';
 u.beginInvite('a');expect(u.inviteTarget.value).toBeNull();u.beginInvite('b');u.inviteNote.value='只玩一会儿，结束后我陪你去训练。';
 const spy=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValueOnce(Error('超时')).mockResolvedValueOnce({decisions:[{id:'b',accepted:true,reply:'那我参加'}]});
 await u.sendInvite();expect(u.inviteTarget.value).toBe('b');expect(u.inviteNote.value).toContain('训练');expect(u.room.value!.invitations.b).toBe('declined');expect(u.room.value!.inviteNotes!.b).toContain('训练');
 await u.sendInvite();expect(u.inviteTarget.value).toBeNull();expect(u.room.value!.invitations.b).toBe('accepted');expect(spy.mock.calls[1][0]).toMatchObject({actorIds:['b'],input:expect.stringContaining('只玩一会儿')});
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
it('failed game write restores the locked round and drunk values',async()=>{
 const {w,u}=fixture('eleven');await u.start();const r=u.round.value!;if(r.kind!=='eleven')throw Error();r.turn='player';const old=JSON.stringify(w.active!.terminal);vi.mocked(w.saveTerminal).mockRejectedValueOnce(Error('磁盘满'));await u.stand();expect(u.error.value).toBe('磁盘满');expect(JSON.stringify(w.active!.terminal)).toBe(old);
});
it('both party game records survive local/cloud/record and overwrite recovery snapshots including anchors',()=>{
 const {w}=fixture('eleven'),s=w.active!,r=s.terminal!.partyRooms![0];startPartyRound(r, {key:'opening:123',turnId:'',variantId:'',path:[]});
 const other=createPartyRoom('truth',['a','b'],'转瓶','轻松','truth-room');other.invitations={a:'accepted',b:'accepted'};startPartyRound(other);s.terminal!.partyRooms!.push(other);
 const snapshot={version:1 as const,sessions:[s],preferences:defaults()},local=backup(snapshot),cloud=createCloudSave(snapshot,snapshot.preferences);
 const restored=[parseBackup(local),parseCloudSave(cloud).snapshot,parseBackup(backup(rowsSnapshot(snapshotRows(snapshot))!))];for(const item of restored)expect(item.sessions[0].terminal!.partyRooms).toEqual(s.terminal!.partyRooms);
 const merged=mergeCloudSession(s,parseCloudSave(cloud).snapshot.sessions[0]);expect(merged.terminal!.partyRooms).toEqual(s.terminal!.partyRooms);expect(parseBackup(local).sessions[0].terminal!.partyRooms).toEqual(s.terminal!.partyRooms);
 expect(partyParticipants(r)).toEqual(['player','a','b']);
});
