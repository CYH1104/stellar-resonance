import {it,expect} from 'vitest';
import {createPartyRoom,startPartyRound,validatePartyRooms} from '../src/domain/partyGames';
import {applyLiarMove,canRerollLiar,confirmLiarRoll,isScatterDice,liarChallengeOptions,rerollLiar,startLiarRound,validateLiarRound,type LiarRound} from '../src/domain/liarDice';
const ids=['player','a','b'],baseDice={player:[2,2,3,4,5],a:[2,2,4,5,6],b:[3,3,4,5,6]};
function room(){const r=createPartyRoom('liar',['a','b'],'骰子','','room');r.invitations={a:'accepted',b:'accepted'};return r;}
function seq(values:number[]){let i=0;return (_n:number)=>values[i++%values.length];}
function prepared(dice=baseDice){const r=room(),round=startPartyRound(r,undefined,()=>0) as LiarRound;round.dice=structuredClone(dice);round.rolls={initial:structuredClone(dice),counts:{player:0,a:0,b:0},lastScatter:{},confirmed:true};return {r,round};}
function calls(r:ReturnType<typeof room>,a:{count:number;face:number;pure?:boolean},b:{count:number;face:number;pure?:boolean}){applyLiarMove(r,'player','bid',{count:3,face:1,pure:false},'',[],1);applyLiarMove(r,'a','bid',{pure:false,...a},'',[],1);applyLiarMove(r,'b','bid',{pure:false,...b},'',[],1);}
function scattered(){const r=room(),round=startLiarRound(ids,1,'player',undefined,seq([0,1,2,3,4,0,0,1,2,3,1,1,2,3,4]));r.rounds=[round];return {r,round};}
it('players can reroll repeatedly while scattered, preserving the first roll and sealing automatically on a pair',()=>{
 const {r,round}=scattered();expect(canRerollLiar(round)).toBe(true);validatePartyRooms([r]);const first=[...round.dice.player];for(let i=0;i<5;i++){rerollLiar(r,'player',seq([1,2,3,4,5]));expect(round.phase).toBe('rolling');expect(isScatterDice(round.dice.player)).toBe(true);validatePartyRooms([r]);}rerollLiar(r,'player',()=>0);expect(round.rolls!.counts.player).toBe(6);expect(round.rolls!.initial.player).toEqual(first);expect(round.rolls!.lastScatter.player).toEqual([2,3,4,5,6]);expect(round.phase).toBe('playing');expect(round.turn).toBe('player');validatePartyRooms([r]);const saved=JSON.stringify(r);expect(()=>rerollLiar(r)).toThrow();expect(JSON.stringify(r)).toBe(saved);
});
it('the player may keep scattered dice; reroll is never available after bidding or for a normal hand',()=>{
 const {r,round}=scattered();confirmLiarRoll(r);expect(round.dice.player).toEqual([1,2,3,4,5]);applyLiarMove(r,'player','bid',{count:3,face:6,pure:false},'',[],1);expect(()=>rerollLiar(r)).toThrow();validatePartyRooms([r]);const normal=prepared();expect(canRerollLiar(normal.round)).toBe(false);expect(()=>confirmLiarRoll(normal.r)).toThrow();
});
it('NPC starting scatter is rerolled locally and the original dice and count remain verifiable',()=>{
 const round=startLiarRound(ids,1,'player',undefined,seq([0,0,1,2,3,0,1,2,3,4,0,0,0,0,0,1,1,2,3,4]));expect(round.phase).toBe('playing');expect(round.rolls!.counts.a).toBe(1);expect(round.rolls!.initial.a).toEqual([1,2,3,4,5]);expect(round.dice.a).toEqual([1,1,1,1,1]);validateLiarRound(round,ids);
});
it('mixed ordinary open is per opponent: opener and the false bidder drink, the true bidder does not',()=>{
 const {r,round}=prepared();calls(r,{count:3,face:2},{count:4,face:3});applyLiarMove(r,'player','open',undefined,'',[],1,['a','b']);expect(round.challenge!.duels.map(d=>[d.target,d.actual,d.winner,d.loser,d.cups])).toEqual([['a',4,'a','player',1],['b',3,'player','b',1]]);expect(r.drunk).toEqual({player:1,a:0,b:1});expect(round.winner).toBeUndefined();expect(round.loser).toBeUndefined();expect(round.nextStarter).toBe('player');validatePartyRooms([r]);const saved=JSON.stringify(r);expect(()=>applyLiarMove(r,'player','open',undefined)).toThrow();expect(JSON.stringify(r)).toBe(saved);expect((startPartyRound(r,undefined,()=>0) as LiarRound).starter).toBe('player');
});
it('split doubles each loser penalty and multiple true calls accumulate on the opener',()=>{
 const mixed=prepared();calls(mixed.r,{count:3,face:2},{count:4,face:3});applyLiarMove(mixed.r,'player','split',undefined,'',[],1,['a','b']);expect(mixed.r.drunk).toEqual({player:2,a:0,b:2});validatePartyRooms([mixed.r]);
 const both=prepared();calls(both.r,{count:3,face:2},{count:3,face:3});applyLiarMove(both.r,'player','split',undefined,'',[],1,['a','b']);expect(both.r.drunk).toEqual({player:4,a:0,b:0});expect(both.round.nextStarter).toBe('player');validatePartyRooms([both.r]);
 const falseCalls=prepared();calls(falseCalls.r,{count:4,face:4},{count:4,face:5});applyLiarMove(falseCalls.r,'player','open',undefined,'',[],1,['a','b']);expect(falseCalls.r.drunk).toEqual({player:0,a:1,b:1});expect(falseCalls.round.nextStarter).toBe('a');validatePartyRooms([falseCalls.r]);
});
it('targets require an earlier call, are not self/duplicates, and failures do not mutate state',()=>{
 const empty=prepared();expect(()=>applyLiarMove(empty.r,'player','open',undefined,'',[],1,['a'])).toThrow();calls(empty.r,{count:3,face:2},{count:4,face:3});const saved=JSON.stringify(empty.r);for(const targets of [[],['player'],['a','a'],['missing']]){expect(()=>applyLiarMove(empty.r,'player','split',undefined,'',[],1,targets)).toThrow();expect(JSON.stringify(empty.r)).toBe(saved);}expect(()=>applyLiarMove(empty.r,'player','bid',{count:3,face:1,pure:false},'',[],1)).toThrow();expect(JSON.stringify(empty.r)).toBe(saved);
});
it('each target uses its latest call and a missing target list defaults to the most recent global bidder',()=>{
 const {r,round}=prepared();calls(r,{count:3,face:2},{count:4,face:3});applyLiarMove(r,'player','bid',{count:4,face:4,pure:false},'',[],1);expect(liarChallengeOptions(round,'a').find(o=>o.id==='player')!.bid).toEqual({count:4,face:4,pure:false});applyLiarMove(r,'a','open',undefined,'',[],1);expect(round.challenge!.duels[0].target).toBe('player');validatePartyRooms([r]);
});
it('v1 snapshots retain single open, original scatter acceptance, and no new settlement fields',()=>{
 const {r,round}=prepared();round.rulesVersion='liar-v1';delete round.rolls;delete round.seatOrder;round.dice.player=[1,2,3,4,5];applyLiarMove(r,'player','bid',{count:3,face:6,pure:false},'',[],1);expect(()=>applyLiarMove(r,'a','split',undefined,'',[],1,['player'])).toThrow();applyLiarMove(r,'a','open',undefined,'',[],1);expect(round.challenge).toBeUndefined();expect(round.nextStarter).toBeUndefined();validatePartyRooms([r]);
});
it('import rejects unknown versions and forged rolls, targets, results, penalties and next starter',()=>{
 const {r,round}=prepared();const starting:((x:any)=>void)[]=[x=>x.rulesVersion='liar-v3',x=>x.rolls.counts.a=-1,x=>x.rolls.confirmed=false,x=>x.dice.a[0]=7,x=>x.seatOrder.reverse()];for(const change of starting){const bad=structuredClone(round);change(bad);expect(()=>validateLiarRound(bad,ids)).toThrow();}
 calls(r,{count:3,face:2},{count:4,face:3});applyLiarMove(r,'player','split',undefined,'',[],1,['a','b']);const changes:((x:any)=>void)[]=[x=>x.challenge.duels[0].actual++,x=>x.challenge.duels[0].bid.count=99,x=>x.challenge.penalties.a++,x=>x.challenge.nextStarter='b',x=>x.nextStarter='b',x=>x.challenge.duels.push(x.challenge.duels[0]),x=>x.winner='a',x=>x.moves.at(-1).targets=['a','a']];for(const change of changes){const bad=structuredClone(round);change(bad);expect(()=>validateLiarRound(bad,ids)).toThrow();}
});
