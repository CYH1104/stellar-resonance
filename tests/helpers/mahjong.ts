import {mahjongDeck,mahjongTiles,startMahjongRound,mahjongOpeningScores} from '../../src/domain/mahjong';
export const ids=['player','a','b','c'],scores=mahjongOpeningScores(ids),meta={hand:0,honba:0,sticks:0};
export const styles=Object.fromEntries(ids.map(id=>[id,{skill:3,aggression:3,caption:'稳健'}]));
export function random(seed=29){return(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};}
export function rig(hands:Record<number,string>,draw:string,opening=meta,points=scores){
 const round=startMahjongRound(ids,1,points,opening,random());const pool=[...mahjongDeck],take=(p:string)=>{const at=pool.indexOf(p);if(at<0)throw Error('test tile exhausted '+p);pool.splice(at,1);return p;};
 const dealt:string[][]=[[],[],[],[]];for(const [seat,hand]of Object.entries(hands))dealt[Number(seat)]=mahjongTiles(hand).map(take);take(draw);take('m2');
 for(let l=0;l<4;l++){if(dealt[l].length&&dealt[l].length!==13)throw Error('test hand must have13 tiles');while(dealt[l].length<13)dealt[l].push(pool.shift()!);}
 const live=[...dealt.flat(),draw].reverse();pool.splice(4,0,'m2');round.wall=[...pool,...live];round.turn='player';return round;
}
