import {it,expect} from 'vitest';
import {isLegalLiarBid,legalLiarBids,countLiarDice,applyLiarMove,completeLiarMove,validateLiarRound,type LiarRound} from '../src/domain/liarDice';
import {createPartyRoom,startPartyRound,validatePartyRooms,settlePartyEnd} from '../src/domain/partyGames';
const lines=[{id:'a',text:'我先看看。'},{id:'b',text:'别急。'}];
function room(){const r=createPartyRoom('liar',['a','b'],'','','liar');r.invitations={a:'accepted',b:'accepted'};return r;}
function bid(count:number,face=2,pure=false){return {count,face,pure};}
it('enforces opening floor, same-mode order and confirmed 斋/非 transitions',()=>{
 expect(isLegalLiarBid(undefined,bid(4),5)).toBe(false);expect(isLegalLiarBid(undefined,bid(5,1,true),5)).toBe(true);
 expect(isLegalLiarBid(bid(5,2),bid(5,6),5)).toBe(true);expect(isLegalLiarBid(bid(5,6),bid(5,5),5)).toBe(false);expect(isLegalLiarBid(bid(5,6),bid(6,1),5)).toBe(true);
 expect(isLegalLiarBid(bid(5,6),bid(5,1,true),5)).toBe(true);expect(isLegalLiarBid(bid(5,1,true),bid(6,6),5)).toBe(false);expect(isLegalLiarBid(bid(5,1,true),bid(7,1),5)).toBe(true);
 expect(isLegalLiarBid(bid(5),bid(26),5)).toBe(false);expect(legalLiarBids(bid(25,6,true),5)).toEqual([]);
});
it('counts wild ones only in non-斋 calls and never double counts face one',()=>{
 const dice={player:[1,1,2,3,6],a:[1,2,2,4,5],b:[2,2,4,5,6]};expect(countLiarDice(dice,bid(3,2))).toBe(8);expect(countLiarDice(dice,bid(3,2,true))).toBe(5);expect(countLiarDice(dice,bid(3,1))).toBe(3);
});
it('locks all five dice before actions, rejects out-of-turn and pays exactly once on an exact challenge',()=>{
 const r=room(),first=startPartyRound(r,undefined,()=>0) as LiarRound;expect(first.starter).toBe('player');expect(Object.values(first.dice).map(a=>a.length)).toEqual([5,5,5]);first.dice={player:[2,2,2,3,4],a:[3,3,4,4,5],b:[3,3,4,4,5]};
 expect(()=>applyLiarMove(r,'b','bid',bid(3))).toThrow();applyLiarMove(r,'player','bid',bid(3,2,true),'我叫三斋二。');expect(first.turn).toBe('a');expect(()=>applyLiarMove(r,'a','open',undefined)).toThrow();completeLiarMove(r,lines);
 applyLiarMove(r,'a','open',undefined,'',lines);expect(first.actual).toBe(3);expect(first.winner).toBe('player');expect(first.loser).toBe('a');expect(r.drunk.a).toBe(1);const saved=JSON.stringify(r);expect(()=>applyLiarMove(r,'a','open',undefined)).toThrow();expect(JSON.stringify(r)).toBe(saved);expect(validatePartyRooms([r])).toEqual([r]);
 const next=startPartyRound(r,undefined,()=>5) as LiarRound;expect(next.starter).toBe('a');expect(Object.values(next.dice).flat()).toEqual(Array(15).fill(6));expect(first.dice.player).toEqual([2,2,2,3,4]);
});
it('a false bid pays only its caller, pending reply does not allow another roll, and drunkenness ends the room',()=>{
 const r=room(),rr=startPartyRound(r,undefined,()=>0) as LiarRound;applyLiarMove(r,'player','bid',bid(3,6,true),'',lines);applyLiarMove(r,'a','open',undefined);expect(rr.loser).toBe('player');expect(r.drunk).toEqual({player:1,a:0,b:0});expect(()=>startPartyRound(r)).toThrow();completeLiarMove(r,lines);settlePartyEnd(r,{player:1,a:5,b:5});expect(r.endReason).toBe('drunk');expect(r.afterparty?.scenes?.[0].actorId).toBe('player');validatePartyRooms([r]);
});
it('validates roll counts, actor identities, unknown schema and forged outcomes before import',()=>{
 const r=room(),rr=startPartyRound(r,undefined,()=>0) as LiarRound;validatePartyRooms([r]);for(const mutate of [(x:any)=>x.rulesVersion='liar-v2',(x:any)=>x.dice.a[0]=7,(x:any)=>x.dice.b.pop(),(x:any)=>x.dice.extra=[1,1,1,1,1],(x:any)=>x.turn='a',(x:any)=>x.secret=true,(x:any)=>x.winner='player']){const value=JSON.parse(JSON.stringify(rr));mutate(value);expect(()=>validateLiarRound(value,['player','a','b'])).toThrow();}
 applyLiarMove(r,'player','bid',bid(3,6,true),'',lines);applyLiarMove(r,'a','open',undefined,'',lines);const forged=JSON.parse(JSON.stringify(rr));forged.actual=5;expect(()=>validateLiarRound(forged,['player','a','b'])).toThrow();
});
