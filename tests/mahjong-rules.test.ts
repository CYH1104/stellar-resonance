import {describe,it,expect} from 'vitest';
import Majiang from '../src/vendor/majiang/core.js';
import {mahjongOptions,mahjongView,type MahjongRound,type MahjongReply} from '../src/domain/mahjong';
import {rig,ids} from './helpers/mahjong';
function step(r:MahjongRound,id?:string,reply?:MahjongReply){const choices=ids.map(actor=>{const opts=mahjongOptions(r,actor);if(actor===id){expect(opts.some(o=>JSON.stringify(o.reply)===JSON.stringify(reply))).toBe(true);return reply!;}return opts.find(o=>o.kind==='pass')?.reply||opts.find(o=>o.kind==='discard'&&o.reply.dapai?.endsWith('_'))?.reply||opts.find(o=>o.kind==='discard')?.reply||{};});r.steps.push({choices});}
function discard(r:MahjongRound,id:string,p:string,riichi=false){const opt=mahjongOptions(r,id).find(o=>o.kind===(riichi?'riichi':'discard')&&o.reply.dapai?.startsWith(p));expect(opt,'legal '+id+' discard '+p).toBeTruthy();step(r,id,opt!.reply);}
const wait='m23467p234s234z11';
describe('riichi rule boundaries through the same adapter used by the table',()=>{
 it('rejects a structurally complete ron with no yaku, and allows chi only by the next seat',()=>{const r=rig({1:'m23467p456s678z11'},'m5');discard(r,'player','m5');expect(mahjongOptions(r,'a').some(o=>o.kind==='win')).toBe(false);expect(mahjongOptions(r,'a').some(o=>o.kind==='chi')).toBe(true);for(const id of ['b','c'])expect(mahjongOptions(r,id).some(o=>o.kind==='chi')).toBe(false);});
 it('own-discard furiten blocks every tile in the wait, not just the previously discarded tile',()=>{const r=rig({0:wait,1:'m88p678s678z55667'},'m5');discard(r,'player','m5');step(r);discard(r,'a','m8');expect(mahjongOptions(r).some(o=>o.kind==='win')).toBe(false);});
 it.each([false,true])('passing a legal ron blocks another ron before the next own draw (riichi=%s)',(riichi)=>{const r=rig({0:wait,1:'m55p678s678z55667',2:'m88p111s111z22334'},'z7');discard(r,'player','z7',riichi);step(r);discard(r,'a','m5');expect(mahjongOptions(r).some(o=>o.kind==='win')).toBe(true);step(r,'player',{});discard(r,'b','m8');expect(mahjongOptions(r).some(o=>o.kind==='win')).toBe(false);expect(mahjongView(r).seats.find(s=>s.id==='player')!.score).toBe(riichi?24000:25000);
  step(r);step(r);step(r); // finish B reaction, C discard and reaction -> player draws
  const own=mahjongOptions(r).filter(o=>o.kind==='discard');expect(own.length).toBeGreaterThan(0);if(riichi)expect(own).toHaveLength(1);step(r);step(r);discard(r,'a','m5');expect(mahjongOptions(r).some(o=>o.kind==='win')).toBe(!riichi);
 });
 it('concealed kan draws from the dead wall and reveals another indicator',()=>{const r=rig({0:'m1111p234s234z567'},'p8');const kan=mahjongOptions(r).find(o=>o.kind==='kan'&&o.reply.gang==='m1111');expect(kan).toBeTruthy();const before=mahjongView(r);step(r,'player',kan!.reply);step(r);const after=mahjongView(r);expect(after.status).toBe('gangzimo');expect(after.dora).toHaveLength(2);expect(after.remaining).toBe(before.remaining-1);expect(after.seats.find(s=>s.id==='player')!.melds).toContain('m1111');});
 it('ordinary seven-pairs honroutou tsumo is dealer mangan; no first-draw bonus is manufactured',()=>{const h=Majiang.Shoupai.fromString('m1199p1199s11z5577');const scored=Majiang.Util.hule(h,null,Majiang.Util.hule_param({menfeng:0,changbang:2,lizhibang:1}));expect(scored).toMatchObject({fanshu:5,fu:25,defen:12000,fenpei:[13600,-4200,-4200,-4200]});});
});
