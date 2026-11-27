import type {PartyRoom,PartyRound} from './partyGames';
import {partyParticipants,elevenHandRank} from './partyGames';
import {mahjongView,mahjongMeldTiles} from './mahjong';
import {terminalGameResult} from './terminalStoryContext';
import {partyDialogueLines} from './partyDialogueView';
import {landlordCardLabel} from './landlordCards';
import {liarBidLabel} from './liarDice';
/** UI DTO: deliberately contains no deck, wall, private hand, hidden dice or strategy. */
export function partySpectatorView(room:PartyRoom,round:PartyRound|undefined,name:(id:string)=>string){
 const people=partyParticipants(room).map(id=>({id,name:name(id),score:room.scores?.[id],count:0,cards:[] as string[],river:[] as string[],melds:[] as string[],label:''}));
 let log:string[]=[],turn='',result='',complete=false;
 if(round){complete=round.phase==='complete';result=complete?terminalGameResult(round,name):'';
  if(round.kind==='landlord'){
   turn=round.turn;for(const p of people){p.count=round.hands[p.id].length;p.score=round.openingScores[p.id]+(round.result?.deltas[p.id]||0);p.label=round.landlord?(round.landlord===p.id?'地主':'农民'):'等待叫分';const last=[...round.moves].reverse().find(m=>m.id===p.id);p.cards=last?.kind==='play'?last.cards:[];}
   log=round.moves.map(m=>name(m.id)+'：'+(m.kind==='bid'?'叫 '+m.score+' 分':m.kind==='pass'?'不出':m.cards.map(landlordCardLabel).join(' ')));
  }else if(round.kind==='mahjong'){
   const v=mahjongView(round);turn=v.actor;
   for(const p of people){const seat=v.seats.find(s=>s.id===p.id)!;p.score=seat.score;p.count=seat.count;p.label=seat.wind+(seat.riichi?' · 立直':'');p.river=[...seat.river];p.melds=seat.melds.flatMap(mahjongMeldTiles);p.cards=seat.revealed?seat.hand:[];}
   log=v.events.map((e:{id:string;text:string})=>name(e.id)+'：'+e.text);
  }else if(round.kind==='eleven'){
   turn=round.turn;for(const p of people){const hand=round.hands[p.id];p.count=hand.length;const bust=elevenHandRank(round,hand).kind==='bust';p.cards=complete||bust?[...hand]:[];p.label=(p.id===round.banker?'庄家 · ':'')+(bust?'爆牌':round.stopped.includes(p.id)?'停牌':'等待本波决定');}
   log=(round.waves||[]).map(w=>'第 '+w.number+' 波 · '+(w.status==='dealt'?'已发牌':w.status==='ready'?'已决定':'等待决定'));
  }else if(round.kind==='liar'){
   turn=round.turn;for(const p of people){p.count=5;p.label='骰盅保密';}log=round.moves.map(m=>name(m.id)+'：'+(m.bid?liarBidLabel(m.bid):m.action==='split'?'劈':'开骰'));
  }else{turn=round.target;log=[name(round.target)+'抽中题卡',round.choice==='dare'?round.card.dare:round.choice==='truth'?round.card.truth:'正在选择真心话或大冒险',...(round.text?[round.text]:[])];}
 }
 return {name:room.name,kind:room.kind,people,turn,complete,ended:!!room.endedAt,number:round?.number||0,log,result,dialogue:round?partyDialogueLines(round):[]};
}
export type PartySpectatorView=ReturnType<typeof partySpectatorView>;
