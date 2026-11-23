import {describe,it,expect} from 'vitest';
import {startMahjongRound,mahjongOpeningScores,mahjongDeck,mahjongTiles,mahjongOptions,mahjongView,mahjongScores,mahjongPublicContext,chooseMahjongReply,applyMahjongStep,validateMahjongRound,type MahjongRound} from '../src/domain/mahjong';
import {createPartyRoom,startPartyRound,settlePartyEnd,validatePartyRooms} from '../src/domain/partyGames';
const ids=['player','a','b','c'],scores=mahjongOpeningScores(ids),meta={hand:0,honba:0,sticks:0};
const styles=Object.fromEntries(ids.map(id=>[id,{skill:3,aggression:3,caption:'稳健'}]));
function random(seed=29){return(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};}
function rig(hands:Record<number,string>,draw:string,opening=meta,points=scores){
 const round=startMahjongRound(ids,1,points,opening,random());const pool=[...mahjongDeck],take=(p:string)=>{const at=pool.indexOf(p);if(at<0)throw Error('test tile exhausted '+p);pool.splice(at,1);return p;};
 const dealt:string[][]=[[],[],[],[]];for(const [seat,hand]of Object.entries(hands))dealt[Number(seat)]=mahjongTiles(hand).map(take);take(draw);take('m2');
 for(let l=0;l<4;l++){if(dealt[l].length&&dealt[l].length!==13)throw Error('test hand must have13 tiles');while(dealt[l].length<13)dealt[l].push(pool.shift()!);}
 const live=[...dealt.flat(),draw].reverse();pool.splice(4,0,'m2');round.wall=[...pool,...live];round.turn='player';return round;
}
const decision=(round:MahjongRound)=>{const options=mahjongOptions(round);return options.length?chooseMahjongReply(mahjongPublicContext(round,'player'),styles.player):undefined;};
describe('four-player riichi adapter',()=>{
 it('deals136 exact tiles, masks opponents, offers only legal decisions, rejects a fifth copy',()=>{const r=startMahjongRound(ids,1,scores,meta,random());validateMahjongRound(r,ids,scores,meta);const view=mahjongView(r);expect(view.seats.find(s=>s.id==='player')!.hand).toHaveLength(14);expect(view.seats.filter(s=>s.id!=='player').every(s=>!s.hand.length&&s.count===13)).toBe(true);expect(view.remaining).toBe(69);const before=JSON.stringify(r);expect(()=>applyMahjongStep(r,{dapai:'z9'},styles)).toThrow();expect(JSON.stringify(r)).toBe(before);const bad=structuredClone(r);bad.wall[0]='z9';expect(()=>validateMahjongRound(bad,ids,scores,meta)).toThrow();});
 it('scores a first-draw dealer heavenly hand as yakuman, including honba and deposits',()=>{const opening={hand:0,honba:2,sticks:1},points={...scores,player:24000};const r=rig({0:'m1199p1199s11z557'},'z7',opening,points);expect(mahjongOptions(r).some(o=>o.kind==='win')).toBe(true);applyMahjongStep(r,{hule:'-'},styles);expect(r.result?.wins[0]).toMatchObject({id:'player',yakuman:1,points:48000});expect(r.result?.deltas).toEqual({player:49600,a:-16200,b:-16200,c:-16200});expect(r.result?.next).toEqual({hand:0,honba:3,sticks:0});validateMahjongRound(r,ids,points,opening);});
 it('honours ron is awarded to the winning NPC; the discarder pays and game advances',()=>{const r=rig({1:'m1199p1199s11z557'},'z7');const discard=mahjongOptions(r).find(o=>o.reply.dapai?.startsWith('z7'))!;applyMahjongStep(r,discard.reply,styles);expect(r.phase).toBe('playing');applyMahjongStep(r,decision(r),styles);expect(r.result?.wins[0]).toMatchObject({id:'a',from:'player',han:4,fu:25,points:6400});expect(r.result?.scores).toEqual({player:18600,a:31400,b:25000,c:25000});expect(r.result?.next.hand).toBe(1);validateMahjongRound(r,ids,scores,meta);});
 it('replay rejects invented results, illegal reactions, altered order and unknown persistent fields',()=>{const r=rig({0:'m1199p1199s11z557'},'z7');applyMahjongStep(r,{hule:'-'},styles);for(const mutate of [(r:any)=>r.result.scores.a++,(r:any)=>r.steps[0].choices[2]={hule:'-'},(r:any)=>r.opening.hand=1,(r:any)=>r.secret='ignored']){const bad=structuredClone(r);mutate(bad);expect(()=>validateMahjongRound(bad,ids,scores,meta)).toThrow();}});
 it('keeps completed and midhand resumes deterministic through12 seeded hands, all score transfers conserve totals with sticks',()=>{for(let seed=1;seed<=12;seed++){
  let r=startMahjongRound(ids,1,scores,meta,random(seed));let resumed=false;
  for(let n=0;r.phase!=='complete'&&n<600;n++){if(n===30){const view=mahjongView(r);r=JSON.parse(JSON.stringify(r));validateMahjongRound(r,ids,scores,meta);expect(mahjongView(r)).toEqual(view);resumed=true;}
   const actor=ids[n%4],ctx=mahjongPublicContext(r,actor);expect(ctx).not.toHaveProperty('wall');expect(ctx).not.toHaveProperty('hands');expect(ctx.table.every(s=>!('hand'in s))).toBe(true);
   applyMahjongStep(r,decision(r),styles);const view=mahjongView(r);expect(Object.values(mahjongScores(r)).reduce((a,b)=>a+b,0)+1000*view.sticks).toBe(100000);
  }
  expect(r.phase).toBe('complete');expect(r.steps.length).toBeLessThan(600);validateMahjongRound(r,ids,scores,meta);expect(resumed||r.steps.length<=30).toBe(true);
 }},60000);
 it('four participants and continuous score records persist; zero continues and negative ends in portrait summary state',()=>{
  expect(()=>createPartyRoom('mahjong',['a','b'],'','','bad')).toThrow();const room=createPartyRoom('mahjong',['a','b','c'],'日麻','休闲','mj');room.invitations={a:'accepted',b:'accepted',c:'accepted'};room.mahjongStyles={a:styles.a,b:styles.b,c:styles.c};startPartyRound(room,undefined,random());validatePartyRooms([room]);
  const r=room.rounds[0] as MahjongRound;for(let n=0;r.phase!=='complete'&&n<600;n++)applyMahjongStep(r,decision(r),styles);room.scores=mahjongScores(r);settlePartyEnd(room,{});validatePartyRooms([room]);const next=startPartyRound(room,undefined,random(9)) as MahjongRound;expect(next.opening).toEqual(r.result?.next);expect(next.openingScores).toEqual(r.result?.scores);validatePartyRooms([room]);
  const fake=structuredClone(room);fake.rounds=[structuredClone(r)];fake.scores={player:0,a:40000,b:30000,c:30000};settlePartyEnd(fake,{});expect(fake.endedAt).toBeUndefined();fake.scores.player=-100;settlePartyEnd(fake,{});expect(fake.endReason).toBe('bankrupt');expect(fake.afterparty).toBeUndefined();
 },20000);
});
