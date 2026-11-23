import {it,expect,vi,afterEach} from 'vitest';
import {effectScope,reactive,nextTick} from 'vue';
import {usePartyGames} from '../src/app/usePartyGames';
import type {ViewModel} from '../src/app/useWorkspace';
import {defaults,newSession} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {createPartyRoom,startPartyRound,applyPartyLandlordAction,validatePartyRooms,settlePartyEnd} from '../src/domain/partyGames';
import {mahjongOptions,applyMahjongStep,mahjongScores,type MahjongRound} from '../src/domain/mahjong';
import {HttpGateway} from '../src/gateway/http';
import {rig,styles} from './helpers/mahjong';
const scopes:ReturnType<typeof effectScope>[]=[];
afterEach(()=>{scopes.splice(0).forEach(s=>s.stop());vi.restoreAllMocks();vi.useRealTimers();});
function fixture(kind:'landlord'|'mahjong'='landlord'){
 const session=newSession('积分游戏',{name:'玩家',appearance:'',personality:'',background:''},'开场');session.terminal=emptyTerminal();
 const ids=kind==='mahjong'?['a','b','c']:['a','b'];const room=createPartyRoom(kind,ids,'测试','轻松','room');room.invitations=Object.fromEntries(ids.map(id=>[id,'accepted']));
 if(kind==='landlord')room.landlordStyles=Object.fromEntries(ids.map(id=>[id,{skill:3,aggression:3,cooperation:3,caption:'稳健'}]));else room.mahjongStyles=Object.fromEntries(ids.map(id=>[id,styles[id]]));
 session.terminal.partyRooms=[room];session.initial.characters=ids.map(id=>({id,name:id.toUpperCase(),present:true}));
 const preferences=defaults();preferences.terminalEnabled=true;preferences.terminalProfile='aux';preferences.profiles=preferences.profiles.map(p=>({...p,apiBaseUrl:'https://'+p.id+'.example.test/v1',model:'model-'+p.id}));
 const w=reactive({active:session,state:session.initial,preferences,credentials:{main:'main-key',aux:'new-key'},terminalEpoch:0,busy:false,terminalBusy:false,backupWorking:false,storageStatus:'saved',save:vi.fn(async()=>{}),saveTerminal:vi.fn(async(s:any)=>validatePartyRooms(s.terminal.partyRooms)),connectionReady:()=>true,connectProfile:async()=>true,indexTerminalNotes:vi.fn()}) as unknown as ViewModel;
 const scope=effectScope();scopes.push(scope);const u=scope.run(()=>usePartyGames(w))!;u.open('room');u.page.value='play';return {w,u};
}
const lines=(ids=['a','b'])=>({lines:ids.map(id=>({id,text:id+'：下局再来。'}))});
function redeal(u:ReturnType<typeof usePartyGames>){startPartyRound(u.room.value!,undefined,()=>0);const r=u.round.value!;if(r.kind!=='landlord')throw Error('fixture');while(r.phase==='bidding')applyPartyLandlordAction(u.room.value!,r.turn,{kind:'bid',score:0});}
it('each landlord hand requests one combined reaction from the selected terminal API with actual public facts',async()=>{
 const {w,u}=fixture();redeal(u);const api=vi.spyOn(HttpGateway.prototype,'terminal').mockResolvedValue(lines() as any);
 await u.resumeLandlord();expect(api).toHaveBeenCalledTimes(1);expect(api.mock.calls[0][0]).toMatchObject({task:'party-settlement',actorIds:['a','b'],context:{party:{round:1,kind:'landlord'}}});expect(((api.mock.calls[0][0] as any).context).party.facts).toContain('无人叫分');expect(api.mock.calls[0][1]?.id).toBe('aux');expect(api.mock.calls[0][2]).toBe('new-key');
 expect(u.round.value).toMatchObject({settlementTalk:{status:'ready',lines:lines().lines}});await u.resumeLandlord();await u.retrySettlement();expect(api).toHaveBeenCalledTimes(1);
 redeal(u);await u.resumeLandlord();expect(api).toHaveBeenCalledTimes(2);expect(u.room.value!.scores).toEqual({player:10000,a:10000,b:10000});expect(w.saveTerminal).toHaveBeenCalled();
});
it('failure keeps scores and actions; no automatic retry, and an explicit retry only fills speech',async()=>{
 const {u}=fixture();redeal(u);const before=JSON.stringify(u.room.value!.scores),moves=JSON.stringify((u.round.value as any).moves);const api=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValueOnce(Error('unavailable')).mockResolvedValue(lines() as any);
 await u.resumeLandlord();expect(u.round.value).toMatchObject({settlementTalk:{status:'failed'}});await u.resumeLandlord();expect(api).toHaveBeenCalledTimes(1);await u.retrySettlement();expect(api).toHaveBeenCalledTimes(2);expect(u.round.value).toMatchObject({settlementTalk:{status:'ready'}});expect(JSON.stringify(u.room.value!.scores)).toBe(before);expect(JSON.stringify((u.round.value as any).moves)).toBe(moves);
});
it('a successful reply followed by failed storage is cached for retry, without a second paid request',async()=>{
 const {w,u}=fixture();redeal(u);const api=vi.spyOn(HttpGateway.prototype,'terminal').mockResolvedValue(lines() as any);vi.mocked(w.saveTerminal!).mockRejectedValueOnce(Error('disk full'));
 await u.resumeLandlord();expect(u.error.value).toContain('disk full');expect(u.round.value).toMatchObject({settlementTalk:{status:'pending'}});await u.retryRequest();expect(api).toHaveBeenCalledTimes(1);expect(u.round.value).toMatchObject({settlementTalk:{status:'ready'}});
});
it('API changes discard an old in-flight reaction and use the new route on explicit retry',async()=>{
 const {w,u}=fixture();redeal(u);let resolve!:(v:any)=>void;const api=vi.spyOn(HttpGateway.prototype,'terminal').mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const pending=u.resumeLandlord();await nextTick();w.preferences.terminalProfile='main';await nextTick();resolve(lines());await pending;expect(u.round.value).toMatchObject({settlementTalk:{status:'pending'}});expect(u.error.value).toContain('API');api.mockResolvedValue(lines() as any);await u.retrySettlement();expect(api.mock.calls[1][1]?.id).toBe('main');expect(u.round.value).toMatchObject({settlementTalk:{status:'ready'}});
});
it('final mahjong hand commits negative scores once and makes only one failed commentary request',async()=>{
 const {u}=fixture('mahjong');const room=u.room.value!;for(let i=0;i<2;i++){const r=rig({0:'m1199p1199s11z557'},'z7',{hand:0,honba:i,sticks:0},room.scores!);r.number=i+1;applyMahjongStep(r,{hule:'-'},styles);room.rounds.push(r);room.scores=mahjongScores(r);settlePartyEnd(room,{});}validatePartyRooms([room]);expect(room.endedAt).toBeTruthy();const before=JSON.stringify(room.scores);const api=vi.spyOn(HttpGateway.prototype,'terminal').mockRejectedValue(Error('unavailable'));
 await u.resumeMahjong();expect(api).toHaveBeenCalledTimes(1);expect(u.page.value).toBe('history');expect(u.round.value).toMatchObject({settlementTalk:{status:'failed'}});expect(JSON.stringify(u.room.value!.scores)).toBe(before);await u.resumeMahjong();expect(api).toHaveBeenCalledTimes(1);
});
it('mahjong pauses when hidden and a failed player move save restores the entire hand',async()=>{
 const {w,u}=fixture('mahjong');startPartyRound(u.room.value!,undefined,()=>0);const r=u.round.value as MahjongRound,before=JSON.stringify(r),option=mahjongOptions(r).find(o=>o.kind==='discard')!;vi.mocked(w.saveTerminal!).mockRejectedValueOnce(Error('storage full'));await u.mahjongStep(option.reply);expect(JSON.stringify(u.round.value)).toBe(before);expect(u.error.value).toContain('storage full');
 u.setLandlordActive(false);await u.resumeMahjong();expect(JSON.stringify(u.round.value)).toBe(before);
});
it('mahjong generates the three persona profiles once, then uses saved profiles after a completed hand',async()=>{
 const {u}=fixture('mahjong');delete u.room.value!.mahjongStyles;const api=vi.spyOn(HttpGateway.prototype,'terminal').mockResolvedValue({styles:['a','b','c'].map(id=>({id,...styles[id]}))} as any);await u.start();expect(u.error.value).toBe('');expect(api).toHaveBeenCalledTimes(1);expect(api.mock.calls[0][0]).toMatchObject({task:'party-mahjong-style',actorIds:['a','b','c']});expect(u.room.value!.mahjongPhrases?.a.waiting.length).toBeGreaterThan(0);
 const r=rig({0:'m1199p1199s11z557'},'z7');applyMahjongStep(r,{hule:'-'},styles);r.settlementTalk={version:1,status:'ready',lines:lines(['a','b','c']).lines};u.room.value!.rounds=[r];u.room.value!.scores=mahjongScores(r);await u.start();expect(u.error.value).toBe('');expect(u.room.value!.rounds).toHaveLength(2);expect(api).toHaveBeenCalledTimes(1);
});
