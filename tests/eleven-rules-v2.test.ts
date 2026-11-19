import {it,expect} from 'vitest';
import {cards,createPartyRoom,startPartyRound,elevenAct,ensureElevenWaves,validatePartyRooms,settlePartyEnd,compareHands,elevenWinnerReason,isElevenAllBust,elevenHandVisible,type ElevenRound,type PartyRoom} from '../src/domain/partyGames';
function room(){const r=createPartyRoom('eleven',['a','b'],'十一点半','轻松','rules-v2');r.invitations={a:'accepted',b:'accepted'};return r;}
function prepare(hands:Record<string,string[]>,legacy=false){const r=room();r.bankerOrder=['player','a','b'];r.bankerIndex=0;const rr=startPartyRound(r,undefined,()=>0) as ElevenRound;rr.hands=Object.fromEntries(Object.entries(hands).map(([id,h])=>[id,[...h]]));rr.deck=cards.filter(c=>!Object.values(hands).flat().includes(c));rr.stopped=[];rr.rulesVersion='eleven-v2';delete rr.flow;delete rr.waves;delete rr.batch;rr.phase='playing';delete rr.winner;rr.turn='a';if(legacy)delete rr.rulesVersion;return {room:r,round:rr};}
function standAll(r:PartyRoom,rr:ElevenRound){let steps=0;while(rr.phase==='playing'&&steps++<10)elevenAct(r,rr.turn,'stand');if(steps>=10)throw Error('test did not settle');return rr;}
it('same ordinary type and total uses largest single-card point value, with A one and faces half',()=>{
 const {room:r,round}=prepare({player:['S-A','H-9'],a:['C-10'],b:['D-8','S-2']});expect(compareHands(round.hands.a,round.hands.player)).toBeGreaterThan(0);standAll(r,round);expect(round.rulesVersion).toBe('eleven-v2');expect(round.winner).toBe('a');expect(r.drunk).toEqual({player:1,a:0,b:1});expect(elevenWinnerReason(round)).toContain('最大单张');expect(elevenWinnerReason(round)).toContain('10点大于9点');expect(compareHands(['S-A'],['H-J'])).toBeGreaterThan(0);
});
it('equal total and equal largest single retains the banker/seat fallback',()=>{
 const {room:r,round}=prepare({player:['S-A','H-9'],a:['C-A','D-9'],b:['S-8','H-2']});expect(compareHands(round.hands.player,round.hands.a)).toBe(0);standAll(r,round);expect(round.winner).toBe('player');expect(elevenWinnerReason(round)).toContain('庄家优先');
});
it('11.5 ties use largest card before the original suit-count fallback',()=>{
 expect(compareHands(['S-10','H-A','C-J'],['S-9','H-2','C-Q'])).toBeGreaterThan(0);expect(compareHands(['S-10','S-A','H-J'],['H-10','H-A','S-J'])).toBeGreaterThan(0);
});
it('all-bust has no winner, charges each person once, retains banker and triggers each drunken scene',()=>{
 const {room:r,round}=prepare({player:['S-10','H-10'],a:['C-9','D-9'],b:['S-8','H-8']});r.bankerOrder=['a','player','b'];r.bankerIndex=1;standAll(r,round);expect(round.outcome).toBe('all-bust');expect(round.winner).toBeUndefined();expect(r.drunk).toEqual({player:1,a:1,b:1});expect(r.bankerIndex).toBe(1);expect(isElevenAllBust(round)).toBe(true);expect(elevenWinnerReason(round)).toContain('全员爆牌');validatePartyRooms([r]);const saved=JSON.stringify(r);expect(()=>elevenAct(r,'player','stand')).toThrow();expect(JSON.stringify(r)).toBe(saved);
 const resumed=JSON.parse(saved) as PartyRoom;expect((startPartyRound(resumed,undefined,()=>0) as ElevenRound).banker).toBe('player');settlePartyEnd(r,{player:1,a:1,b:1});expect(r.endReason).toBe('drunk');expect(r.endTriggers).toEqual(['player','a','b']);expect(r.afterparty?.scenes).toHaveLength(3);
});
it('legacy started and completed rounds remain frozen while new rounds use the latest rules',()=>{
 const current=prepare({player:['S-A','H-2'],a:['C-3'],b:['D-4']},true);const before=JSON.stringify({hands:current.round.hands,deck:current.round.deck,drunk:current.room.drunk});ensureElevenWaves(current.room);expect(current.round.rulesVersion).toBeUndefined();expect(JSON.stringify({hands:current.round.hands,deck:current.round.deck,drunk:current.room.drunk})).toBe(before);validatePartyRooms([current.room]);
 const old=prepare({player:['S-10','H-10'],a:['C-9','D-9'],b:['S-8','H-8']},true);old.round.phase='complete';old.round.turn='';old.round.stopped=Object.keys(old.round.hands);old.round.winner='player';old.room.drunk={player:0,a:1,b:1};validatePartyRooms([old.room]);const saved=JSON.stringify(old);ensureElevenWaves(old.room);expect(JSON.stringify(old)).toBe(saved);expect(isElevenAllBust(old.round)).toBe(false);expect(elevenWinnerReason(old.round)).toContain('旧规则');
});
it('only self, completed hands or actual busts are revealed before result',()=>{
 const {round}=prepare({player:['S-2'],a:['H-10','D-10'],b:['C-2']});expect(elevenHandVisible(round,'player')).toBe(true);expect(elevenHandVisible(round,'a')).toBe(true);expect(elevenHandVisible(round,'b')).toBe(false);expect(elevenHandVisible(round,'missing')).toBe(false);round.phase='complete';expect(elevenHandVisible(round,'b')).toBe(true);
});
it('strict import rejects unknown versions, forged outcomes/winners and missing minimum all-bust cups',()=>{
 const {room:r,round}=prepare({player:['S-10','H-10'],a:['C-9','D-9'],b:['S-8','H-8']});standAll(r,round);const changes:((rr:any,room:any)=>void)[]=[rr=>rr.rulesVersion='eleven-v3',rr=>{delete rr.rulesVersion;},rr=>{delete rr.outcome;},rr=>rr.winner='player',(_rr,room)=>room.drunk.a=0];for(const change of changes){const bad=JSON.parse(JSON.stringify(r)) as PartyRoom;change(bad.rounds[0],bad);expect(()=>validatePartyRooms([bad])).toThrow();}
});
