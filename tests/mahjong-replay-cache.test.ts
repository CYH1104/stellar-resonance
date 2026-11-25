import {expect,it} from 'vitest';
import {mahjongView,mahjongScores,mahjongOptions,mahjongPublicContext,applyMahjongStep,validateMahjongRound,startMahjongRound} from '../src/domain/mahjong';
import {ids,scores,meta,random,styles} from './helpers/mahjong';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
it('repeated readers and cloned saves do not retain changes made to a returned view or participant array',()=>{
 const round=startMahjongRound(ids,1,scores,meta,random());const original=copy(round),view=mahjongView(round),expected=copy(view);
 view.dora.push('z9');view.seats[0].hand.length=0;view.options[0].reply.dapai='bad';
 expect(mahjongView(copy(original))).toEqual(expected);
 round.participants[1]='mutated';expect(mahjongView(original)).toEqual(expected);
});
it('advancing a warmed round never advances a historical copy and changed choices/walls/results remain validated',()=>{
 const round=startMahjongRound(ids,1,scores,meta,random()),old=copy(round),view=mahjongView(old);
 const option=mahjongOptions(round).find(o=>o.kind==='discard')!;
 applyMahjongStep(round,option.reply,styles);const next=copy(round);const expected=mahjongView(round);
 expect(mahjongView(old)).toEqual(view);expect(mahjongView(next)).toEqual(expected);
 expect(mahjongScores(next)).toEqual(scores);expect(mahjongPublicContext(next,'a').id).toBe('a');
 expect(()=>validateMahjongRound(next,ids,scores,meta)).not.toThrow();
 const bad=copy(next);bad.steps[0].choices[0]={dapai:'z9'};expect(()=>validateMahjongRound(bad,ids,scores,meta)).toThrow();
 const tampered=copy(next);tampered.turn='invented';expect(()=>validateMahjongRound(tampered,ids,scores,meta)).toThrow();
 const wall=copy(next);wall.wall[0]='z9';expect(()=>validateMahjongRound(wall,ids,scores,meta)).toThrow();
 expect(mahjongView(next)).toEqual(expected);
});
