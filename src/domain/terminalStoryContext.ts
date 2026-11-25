import type {Session} from './contracts';
import {stateAt,visibleMemories} from './story.ts';
import {memoryReady} from './memories.ts';
import {factAudienceCovers} from './knowledge.ts';
import {isTerminalMemoryNote,terminalVisibility,terminalRecall,formatTerminalSegment} from './terminalLedger.ts';
import {terminalStoryClock} from './storyScene.ts';
import {factLabel} from './knowledge.ts';
import type {PartyRound} from './partyGames';

/** Retain the start and, especially, the latest actions of long confirmed prose. */
export function terminalStoryExcerpt(text:string,limit:number){
 if(text.length<=limit)return text;
 const marker='\n…[中段省略]…\n';
 if(limit<=marker.length)return text.slice(-limit);
 const head=Math.floor((limit-marker.length)/3);
 return text.slice(0,head)+marker+text.slice(-(limit-marker.length-head));
}

/** Recent scoped facts are context, not search hits: short inputs must not erase them.
 * Raw narrator prose and thoughts are never inferred to be public from presence alone. */
export function terminalStoryFacts(s:Session,before=s.turns.length,audience?:string[]){
 const state=stateAt(s,before),names=new Map<string,Set<string>>();
 for(const a of [state.player,...state.characters,...s.terminal?.contacts||[]]){
  if(!a?.name||!a.id)continue;
  const key=a.name.trim(),ids=names.get(key)||new Set<string>();ids.add(a.id);names.set(key,ids);
 }
 const resolve=(name:string)=>{const ids=names.get(name.trim());return ids?.size===1?[...ids][0]:undefined;};
 const out:{text:string;knownBy:string[]}[]=[],seen=new Set<string>();let used=0;
 const add=(text:string,knownBy?:string[])=>{
  if(!knownBy?.length||!text.trim()||audience&&!factAudienceCovers(knownBy,audience))return;
  const bounded=terminalStoryExcerpt(text.trim(),800),key=JSON.stringify([bounded,[...knownBy].sort()]);
  if(seen.has(key)||out.length>=8||used+bounded.length>3000)return;
  seen.add(key);out.push({text:bounded,knownBy:[...knownBy]});used+=bounded.length;
 };
 const ranks=new Map(s.turns.map((t,i)=>[t.id,i]));
 const memories=visibleMemories(s,before).slice().sort((a,b)=>(ranks.get(b.sourceTurn||'')??-1)-(ranks.get(a.sourceTurn||'')??-1));
 for(const m of memories){
  if(m.kind!=='event'||!memoryReady(m)||isTerminalMemoryNote(m)||!m.record)continue;
  for(const f of m.record.facts||[])add(f.text,f.knownBy);
  // Legacy structured memories still prove a character's own actions and commitments.
  // Unknown/ambiguous names never gain a wider audience.
  for(const c of m.record.charActions||[]){const id=resolve(c.name);if(id)for(const action of c.actions){if(action.length>=8&&m.record.facts?.some(f=>f.text.length>=2&&(f.text.includes(action)||action.includes(f.text))))continue;add(c.name+'的行动：'+action,[id]);}}
  for(const c of m.record.commitments||[]){if(c.status!=='open')continue;const ids=c.participants.map(resolve);if(ids.length&&ids.every((id):id is string=>!!id))add('约定（'+c.participants.join('、')+'）：'+c.content+'；期限：'+c.deadline,ids);}
  if(out.length>=8||used>=3000)break;
 }
 return out;
}

/** Public result first, without replaying the game or exposing unrevealed hands. */
export function terminalGameResult(round:PartyRound,name:(id:string)=>string):string{
 if(round.kind==='landlord'&&round.result){const r=round.result;return (r.winner==='landlord'?'地主胜':r.winner==='farmers'?'农民胜':'无人叫分，本局不计分')+'；'+round.participants.map(id=>name(id)+' '+(r.deltas[id]>=0?'+':'')+r.deltas[id]+'分，现有'+(round.openingScores[id]+r.deltas[id])+'分').join('；');}
 if(round.kind==='mahjong'&&round.result){const r=round.result;return r.reason+'；'+round.participants.map(id=>name(id)+' '+(r.deltas[id]>=0?'+':'')+r.deltas[id]+'点，现有'+r.scores[id]+'点').join('；')+'；'+r.wins.map(win=>name(win.id)+(win.from?'荣和，'+name(win.from)+'放铳':'自摸')+'，'+win.fu+'符'+win.han+'番，'+win.points+'点').join('；');}
 if(round.phase==='complete'&&round.kind==='eleven')return round.outcome==='all-bust'?'全员爆牌，无胜负，全员各喝一杯':round.winner?'赢家：'+name(round.winner):'本局已完成';
 if(round.phase==='complete'&&round.kind==='liar')return round.challenge?round.challenge.duels.map(d=>name(d.winner)+'胜，'+name(d.loser)+'罚酒'+d.cups+'杯；实际'+d.actual+'个').join('；'):round.winner&&round.loser?name(round.winner)+'胜，'+name(round.loser)+'罚酒':'';
 if(round.phase==='complete'&&round.kind==='truth')return name(round.target)+(round.refused?'拒绝并罚酒一次':'已完成'+(round.choice==='truth'?'真心话':'大冒险'))+'；题目：'+(round.choice==='truth'?round.card.truth:round.card.dare)+'；回应：'+(round.text||'已记录');
 return '';
}
/** Recent games have their own small budget, independent of keyword/vector recall.
 * The anchor supplies the confirmed story clock, never the device's wall clock.
 * Existing archives need no schema migration or newly invented timestamps. */
export function terminalGameFacts(s:Session,before=s.turns.length,audience?:string[]){
 const visible=terminalVisibility(s,before),ranks=new Map(s.turns.map((t,i)=>[t.id,i]));
 const buckets=[...(s.terminal?.memories||[])].filter(b=>visible.anchor(b.anchor)).sort((a,b)=>(ranks.get(b.anchor.turnId)??-1)-(ranks.get(a.anchor.turnId)??-1));
 const rounds=new Map((s.terminal?.partyRooms||[]).flatMap(room=>room.rounds.map(round=>[room.id+':'+round.number,{round,ended:!!room.endedAt}] as const)));
 const kings=new Map((s.terminal?.rooms||[]).flatMap(room=>room.rounds.map(round=>[room.id+':'+round.number,round] as const)));
 const out:{text:string;knownBy:string[]}[]=[],seen=new Set<string>();
 for(const b of buckets){
  const games=[...b.games].reverse().filter(game=>{
   if(seen.has(game.id)||!visible.origin(game.origin)||!game.knownBy?.length||audience&&!factAudienceCovers(game.knownBy,audience))return false;
   const round=rounds.get(game.id)?.round||kings.get(game.id);return !round||!round.archived&&(!round.anchor||visible.anchor(round.anchor));
  });
  if(!games.length)continue;
  const index=b.anchor.turnId?(ranks.get(b.anchor.turnId)??-1)+1:0,state=stateAt(s,index);
  const names=new Map([state.player,...state.characters,...s.terminal?.contacts||[]].map(a=>[a.id,a.name]));names.set('player',s.persona.name);
  const name=(id:string)=>names.get(id)||id,turn=s.turns[index-1],prose=turn?.variants[turn.selected]?.text||s.opening,clock=terminalStoryClock(state,prose);
  const when='剧情时间（所在回合）：'+clock.label+' '+clock.time+(clock.location?'，'+clock.location:'');
  for(const game of games){
   seen.add(game.id);const saved=rounds.get(game.id);
   const king=kings.get(game.id);
   const result=saved?terminalGameResult(saved.round,name):king?[king.command,...king.replies.map(r=>name(r.id)+'：'+(r.refused?'拒绝，罚酒：'+r.penalty:r.text).slice(0,180))].join('；'):'';
   const entry=result?{...game,command:result,complete:(saved?.round||king)!.phase==='complete'}:game;
   const text=when+'；参与者：'+game.knownBy!.map(name).join('、')+'；'+formatTerminalSegment(entry)+(game.endedAt||saved?.ended?'；整场游戏已结束':'');
   out.push({text:terminalStoryExcerpt(text,800),knownBy:[...game.knownBy!]});if(out.length===3)return out;
  }
 }
 return out;
}
/** Narration must retain recent game results even if a later chat creates another bucket. */
export function terminalNarrativeRecall(s:Session,before=s.turns.length){
 const games=terminalGameFacts(s,before);
 return [...(games.length?['近期小游戏（已确认的公开经过；仅知情者知道各条内容）\n'+games.map(g=>g.text+factLabel(g.knownBy)).join('\n')]:[]),...terminalRecall(s,before)];
}
