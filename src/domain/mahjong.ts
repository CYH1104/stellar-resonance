import Majiang from '../vendor/majiang/core.js';
import {mahjongSoundEvents} from './tableSoundEvents.ts';
import type {TerminalAnchor} from './terminalLedger';
import {pendingSettlementTalk,validateSettlementTalk,type ScoredRoundBase} from './settlementTalk.ts';

export const MAHJONG_START_SCORE=25000;
export type MahjongReply={dapai?:string;fulou?:string;gang?:string;hule?:'-';daopai?:'-'};
export interface MahjongStep {choices:MahjongReply[]}
export interface MahjongMeta {hand:number;honba:number;sticks:number}
export interface MahjongWin {id:string;from?:string;hand:string;fu:number;han:number;yakuman:number;points:number;yaku:{name:string;han:string|number}[];ura:string[]}
export interface MahjongResult {reason:string;wins:MahjongWin[];deltas:Record<string,number>;scores:Record<string,number>;revealed:Record<string,string>;next:MahjongMeta}
export interface MahjongRound extends ScoredRoundBase {
 kind:'mahjong';rulesVersion:1;participants:string[];openingScores:Record<string,number>;opening:MahjongMeta;
 wall:string[];steps:MahjongStep[];phase:'playing'|'complete';turn:string;result?:MahjongResult;
}
export interface MahjongStyle {skill:number;aggression:number;caption:string}
export interface MahjongPhrases {waiting:string[];weak:string[];riichi:string[];win:string[];lose:string[]}
export interface MahjongOption {key:string;label:string;reply:MahjongReply;kind:'discard'|'riichi'|'chi'|'pon'|'kan'|'win'|'draw'|'pass'}
const fail=()=>{throw Error('日麻牌局或操作不合法');};
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,allowed:string[])=>{if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();};
export const mahjongTileTypes=['m','p','s','z'].flatMap(s=>Array.from({length:s==='z'?7:9},(_,i)=>s+(i+1)));
export const mahjongDeck=mahjongTileTypes.flatMap(p=>Array.from({length:4},(_,i)=>p[0]!=='z'&&p[1]==='5'&&i===0?p[0]+'0':p));
const tile=(p:string)=>p.slice(0,2);
const normal=(p:string)=>tile(p).replace('0','5');
export function mahjongOwnShanten(hand:string):number{return Majiang.Util.xiangting(Majiang.Shoupai.fromString(hand));}
export function mahjongTileLabel(p:string){if(!p)return '';const n=Number(p[1])||5;return p[0]==='z'?['','东','南','西','北','白','发','中'][n]||'?':(p[1]==='0'?'赤':'')+n+({m:'万',p:'筒',s:'索'}[p[0]]||'');}
export function mahjongTiles(hand:string){const base=hand.split(',')[0].replace(/\*/g,'');return [...base.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));}
export function mahjongMeldTiles(meld:string){return [...meld.slice(1).matchAll(/\d/g)].map(m=>meld[0]+m[0]);}
export function mahjongRoundLabel(meta:MahjongMeta){return ['东','南','西','北'][Math.floor(meta.hand/4)%4]+String(meta.hand%4+1)+'局 · '+meta.honba+'本场';}
export function mahjongOpeningScores(ids:string[]){return Object.fromEntries(ids.map(id=>[id,MAHJONG_START_SCORE]));}
export function validMahjongStyle(v:unknown):v is MahjongStyle{return object(v)&&Object.keys(v).every(k=>['skill','aggression','caption'].includes(k))&&['skill','aggression'].every(k=>Number.isInteger(v[k])&&v[k]>=1&&v[k]<=5)&&typeof v.caption==='string'&&!!v.caption.trim()&&v.caption.length<=40;}
export const fallbackMahjongPhrases=():MahjongPhrases=>({waiting:['慢慢想，我等你。','这张牌还没决定吗？'],weak:['这手得耐心整理。','先稳着打吧。'],riichi:['立直，接下来交给运气。','就等这一张了。'],win:['这一局收下了。','总算等到了。'],lose:['下一局再来。','这次是我没算好。']});
export function validMahjongPhrases(v:unknown):v is MahjongPhrases{return object(v)&&Object.keys(v).length===5&&['waiting','weak','riichi','win','lose'].every(k=>Array.isArray(v[k])&&v[k].length>=1&&v[k].length<=3&&v[k].every((s:unknown)=>typeof s==='string'&&!!s.trim()&&s.length<=48&&!/[<>\u0000-\u001f]/.test(s)));}
// All hand legality and score transfers use the pinned upstream engine. This adapter
// pauses at each decision and persists its wall and choices, not a mutable engine.
const rule=()=>Majiang.rule({'場数':4,'最大同時和了数':2,'トビ終了あり':true,'オーラス止めあり':false});
class HandEngine extends Majiang.Game {
 done=false;
 constructor(round:MahjongRound){
  super([],undefined,rule(),'星际日麻');this._sync=true;
  this._model.qijia=0;this._model.jushu=round.opening.hand%4;this._model.zhuangfeng=Math.floor(round.opening.hand/4)%4;
  this._model.changbang=round.opening.honba;this._model.lizhibang=round.opening.sticks;
  this._model.defen=round.participants.map(id=>round.openingScores[id]);
  this._paipu={title:'星际日麻',player:[...round.participants],qijia:0,log:[],defen:[],point:[],rank:[]};
  // Avoid a random shuffle while replaying. Shan methods only need these fields.
  const shan=Object.create(Majiang.Shan.prototype);
  Object.assign(shan,{_rule:this._rule,_pai:[...round.wall],_baopai:[round.wall[4]],_fubaopai:[round.wall[9]],_weikaigang:false,_closed:false});
  this.qipai(shan);this.reply_qipai();
 }
 delay(callback:()=>void){callback();}
 call_players(type:string){this._status=type;this._reply=[];}
 notify_players(){}
 last(){this.done=true;}
 settle(){for(let i=0;i<5&&!this.done;i++){if(this._status==='hule')this.reply_hule();else if(this._status==='pingju')this.reply_pingju();else break;}}
}
const option=(kind:MahjongOption['kind'],label:string,reply:MahjongReply):MahjongOption=>({key:JSON.stringify(reply),kind,label,reply});
function optionsAt(g:HandEngine,index:number):MahjongOption[]{
 if(g.done)return [];const m=g._model,l=m.player_id.indexOf(index),turn=l===m.lunban,status=g._status;
 const options:MahjongOption[]=[];
 if(['zimo','gangzimo','fulou'].includes(status)&&turn){
  if(status==='fulou'&&g._gang)return [];
  if(status!=='fulou'){
   if(g.allow_hule())options.push(option('win','自摸',{hule:'-'}));
   if(g.allow_pingju())options.push(option('draw','九种九牌流局',{daopai:'-'}));
   for(const meld of g.get_gang_mianzi()||[])options.push(option('kan',/^[mpsz]\d{4}$/.test(meld)?'暗杠':'加杠',{gang:meld}));
  }
  for(const p of g.get_dapai()){
   options.push(option('discard','打 '+mahjongTileLabel(p),{dapai:p}));
   if(status!=='fulou'&&g.allow_lizhi(p))options.push(option('riichi','立直 · '+mahjongTileLabel(p),{dapai:p+'*'}));
  }
 }else if(['dapai','gang'].includes(status)&&!turn){
  if(status==='gang'&&/^[mpsz]\d{4}$/.test(g._gang))return [];
  if(g.allow_hule(l))options.push(option('win',status==='gang'?'抢杠和':'荣和',{hule:'-'}));
  if(status==='dapai'){
   for(const meld of g.get_gang_mianzi(l)||[])options.push(option('kan','明杠',{fulou:meld}));
   for(const meld of g.get_peng_mianzi(l)||[])options.push(option('pon','碰',{fulou:meld}));
   for(const meld of g.get_chi_mianzi(l)||[])options.push(option('chi','吃',{fulou:meld}));
  }
  if(options.length)options.push(option('pass','过',{}));
 }
 return options;
}
function advance(g:HandEngine,choices:MahjongReply[]){
 if(g.done||!Array.isArray(choices)||choices.length!==4)fail();
 choices.forEach((choice,i)=>{keys(choice,['dapai','fulou','gang','hule','daopai']);const options=optionsAt(g,i);if(options.length?!options.some(o=>JSON.stringify(o.reply)===JSON.stringify(choice)):Object.keys(choice).length!==0)fail();});
 g._reply=clone(choices);
 if(['zimo','gangzimo'].includes(g._status))g.reply_zimo();else if(g._status==='dapai')g.reply_dapai();else if(g._status==='fulou')g.reply_fulou();else if(g._status==='gang')g.reply_gang();else fail();
 g.settle();
}
// Bounded exact-content cache survives immutable terminal copies. Only fully replayed,
// legal choices enter it. Derived results, phase and schema are still checked on each save.
const replayCache=new Map<string,HandEngine>();let replayBytes=0;
function replayKey(r:MahjongRound){return JSON.stringify([r.rulesVersion,r.participants,r.openingScores,r.opening,r.wall,r.steps]);}
function dropReplay(key:string){if(replayCache.delete(key))replayBytes-=key.length;}
function rememberReplay(key:string,g:HandEngine){
 dropReplay(key);if(key.length>100000)return;replayCache.set(key,g);replayBytes+=key.length;
 while(replayCache.size>64||replayBytes>1000000)dropReplay(replayCache.keys().next().value!);
}
function engine(round:MahjongRound,consume=false){
 const key=replayKey(round);let g=replayCache.get(key);
 if(g){dropReplay(key);if(!consume)rememberReplay(key,g);return g;}
 g=new HandEngine(round);for(const step of round.steps)advance(g,step.choices);
 if(!consume)rememberReplay(key,g);return g;
}
function resultOf(g:HandEngine,round:MahjongRound):MahjongResult|undefined{
 if(!g.done)return;const m=g._model,log=g._paipu.log[0],seat=(l:number)=>round.participants[m.player_id[l]],scores=Object.fromEntries(round.participants.map((id,i)=>[id,m.defen[i]]));
 const wins:MahjongWin[]=log.filter((e:any)=>e.hule).map(({hule:h}:any)=>({id:seat(h.l),...(h.baojia===null?{}:{from:seat(h.baojia)}),hand:h.shoupai,fu:h.fu||0,han:h.fanshu||0,yakuman:h.damanguan||0,points:h.defen,yaku:h.hupai.map((y:any)=>({name:y.name,han:y.fanshu})),ura:[...h.fubaopai||[]]}));
 const draw=log.find((e:any)=>e.pingju)?.pingju;
 const revealed=Object.fromEntries(wins.map(w=>[w.id,w.hand]));if(draw)draw.shoupai.forEach((h:string,l:number)=>{if(h)revealed[seat(l)]=h;});
 return {reason:draw?.name||wins.map(w=>w.from?'荣和':'自摸').join(' / '),wins,deltas:Object.fromEntries(round.participants.map(id=>[id,scores[id]-round.openingScores[id]])),scores,revealed,next:{hand:round.opening.hand+(g._lianzhuang?0:1),honba:m.changbang,sticks:m.lizhibang}};
}
function updateRound(round:MahjongRound,g:HandEngine){round.phase=g.done?'complete':'playing';const playerOptions=round.participants.includes('player')?optionsAt(g,round.participants.indexOf('player')):[];round.turn=g.done?'':playerOptions.length?'player':round.participants[g._model.player_id[g._model.lunban]];const result=resultOf(g,round);if(result)round.result=result;else delete round.result;}
export function startMahjongRound(ids:string[],number:number,scores:Record<string,number>,meta:MahjongMeta,random:(n:number)=>number,anchor?:TerminalAnchor):MahjongRound{
 if(ids.length!==4||(ids.includes('player')&&ids[0]!=='player')||new Set(ids).size!==4||ids.some(id=>!Number.isSafeInteger(scores[id])||scores[id]<0))fail();
 const wall=[...mahjongDeck];for(let i=wall.length-1;i>0;i--){const j=random(i+1);if(!Number.isInteger(j)||j<0||j>i)fail();[wall[i],wall[j]]=[wall[j],wall[i]];}
 const round:MahjongRound={kind:'mahjong',rulesVersion:1,number,participants:[...ids],openingScores:{...scores},opening:{...meta},wall,steps:[],phase:'playing',turn:'player',...(anchor?{anchor:clone(anchor)}:{})};updateRound(round,engine(round));return round;
}
export function mahjongScores(round:MahjongRound){const g=engine(round);return Object.fromEntries(round.participants.map((id,i)=>[id,g._model.defen[i]]));}
export function mahjongOptions(round:MahjongRound,id='player'){return round.participants.includes(id)?optionsAt(engine(round),round.participants.indexOf(id)):[];}
export function mahjongView(round:MahjongRound){
 const g=engine(round),m=g._model,seat=(l:number)=>round.participants[m.player_id[l]],log=g._paipu.log[0];
 return {soundEvents:mahjongSoundEvents(log),phase:round.phase,label:mahjongRoundLabel(round.opening),remaining:m.shan.paishu,sticks:m.lizhibang,dora:[...m.shan.baopai],status:g._status,actor:seat(m.lunban),lastDiscard:g._dapai?tile(g._dapai):undefined,options:round.participants.includes('player')?optionsAt(g,0):[],
  seats:[0,1,2,3].map(l=>{const id=seat(l),h=m.shoupai[l],exposed=round.result?.revealed[id];return {id,wind:['东','南','西','北'][l],score:m.defen[m.player_id[l]],count:mahjongTiles(h.toString()).length,hand:id==='player'?mahjongTiles(h.toString()):exposed?mahjongTiles(exposed):[],melds:[...h._fulou],river:[...m.he[l]._pai] as string[],riichi:!!h.lizhi,draw:id==='player'&&h._zimo?.length===2?h._zimo:undefined,revealed:!!exposed};}),
  events:log.slice(1).flatMap((event:any)=>event.dapai?[{id:seat(event.dapai.l),text:'打出 '+mahjongTileLabel(event.dapai.p)+(event.dapai.p.includes('*')?'（立直）':'')}]:event.fulou?[{id:seat(event.fulou.l),text:'副露 '+mahjongMeldTiles(event.fulou.m).map(mahjongTileLabel).join(' ')}]:event.gang?[{id:seat(event.gang.l),text:'杠 '+mahjongMeldTiles(event.gang.m).map(mahjongTileLabel).join(' ')}]:[]).slice(-12),result:round.result};
}
// NPC strategy receives only its own hand, public rivers/melds/riichi and legal options.
// It never receives opponents' hands or the hidden wall, even when choosing a discard.
export function mahjongPublicContext(round:MahjongRound,id:string){
 return publicContextAt(engine(round),round,id);
}
function publicContextAt(g:HandEngine,round:MahjongRound,id:string){
 const m=g._model,index=round.participants.indexOf(id),l=m.player_id.indexOf(index);if(l<0)fail();
 return {id,own:m.shoupai[l].toString(),wind:l,roundWind:m.zhuangfeng,options:optionsAt(g,index),dora:[...m.shan.baopai] as string[],discard:g._dapai?tile(g._dapai):undefined,
  table:[0,1,2,3].map(i=>({id:round.participants[m.player_id[i]],riichi:!!m.shoupai[i].lizhi,river:[...m.he[i]._pai] as string[],melds:[...m.shoupai[i]._fulou] as string[]}))};
}
export function chooseMahjongReply(ctx:ReturnType<typeof mahjongPublicContext>,style:MahjongStyle):MahjongReply{
 const options=ctx.options;if(!options.length)return {};const win=options.find(o=>o.kind==='win');if(win)return win.reply;
 const own=Majiang.Shoupai.fromString(ctx.own),discards=options.filter(o=>o.kind==='discard');
 const visible=[...mahjongTiles(ctx.own),...ctx.dora,...ctx.table.flatMap(s=>[...s.river.filter(p=>!/[+=-]/.test(p)).map(tile),...s.melds.flatMap(mahjongMeldTiles)])];
 const counts=(p:string)=>visible.filter(x=>normal(x)===normal(p)).length;
 const threats=ctx.table.filter(s=>s.id!==ctx.id&&s.riichi);
 const danger=(p:string)=>threats.reduce((n,s)=>n+(s.river.some(v=>normal(v)===normal(p))?0:p[0]==='z'?Math.max(0,3-counts(p))*0.45:1),0);
 const ranked=discards.map(o=>{const hand=own.clone().dapai(o.reply.dapai),shanten=Majiang.Util.xiangting(hand),effective=Majiang.Util.tingpai(hand).reduce((n:number,p:string)=>n+Math.max(0,4-counts(p)),0);return {o,score:shanten*100-effective+(style.skill>=3?danger(o.reply.dapai!)*(style.aggression<=2?130:style.aggression>=4?15:65):0)+(o.reply.dapai![1]==='0'?4:0)};}).sort((a,b)=>a.score-b.score||a.o.key.localeCompare(b.o.key));
 if(ranked.length){const best=ranked[0].o,riichi=options.find(o=>o.kind==='riichi'&&o.reply.dapai===best.reply.dapai+'*');if(riichi&&(!threats.length||style.aggression>=3))return riichi.reply;
  const kan=options.find(o=>o.kind==='kan');if(kan&&!threats.length&&style.aggression>=3)return kan.reply;return best.reply;}
 const abort=options.find(o=>o.kind==='draw');if(abort&&Majiang.Util.xiangting(own)>=4)return abort.reply;
 // Call only for an obvious open-hand yaku (value honours or all simples).
 const shanten=Majiang.Util.xiangting(own);
 if(!threats.length||style.aggression>=4)for(const o of options.filter(o=>['pon','chi','kan'].includes(o.kind))){
  if(!o.reply.fulou)continue;const h=own.clone().fulou(o.reply.fulou),all=[...mahjongTiles(h.toString()),...h._fulou.flatMap(mahjongMeldTiles)],hasValue=h._fulou.some((meld:string)=>new RegExp('^z(['+(ctx.wind+1)+(ctx.roundWind+1)+'567])\\1\\1').test(meld));
  const hasYaku=hasValue||all.every((p:string)=>p[0]!=='z'&&!/[19]/.test(p[1]));
  if(hasYaku&&Majiang.Util.xiangting(h)<shanten)return o.reply;
 }
 return {};
}
export function applyMahjongStep(round:MahjongRound,player:MahjongReply|undefined,styles:Record<string,MahjongStyle>){
 if(round.phase!=='playing')fail();const g=engine(round,true),required=round.participants.includes('player')?optionsAt(g,0):[];if(required.length&&!player||!required.length&&player&&Object.keys(player).length)fail();
 const choices=round.participants.map(id=>id==='player'?(player||{}):chooseMahjongReply(publicContextAt(g,round,id),styles[id]||{skill:3,aggression:3,caption:'稳健'}));
 advance(g,choices);round.steps.push({choices});updateRound(round,g);rememberReplay(replayKey(round),g);if(round.phase==='complete')round.settlementTalk=pendingSettlementTalk();return round;
}
export function validateMahjongRound(round:MahjongRound,ids:string[],scores:Record<string,number>,meta:MahjongMeta){
 keys(round,['kind','rulesVersion','number','anchor','archived','replies','dialogueVersion','settlementTalk','participants','openingScores','opening','wall','steps','phase','turn','result']);
 if(round.kind!=='mahjong'||round.rulesVersion!==1||!Number.isInteger(round.number)||round.number<1||round.number>500||!Array.isArray(round.participants)||JSON.stringify(round.participants)!==JSON.stringify(ids)||ids.length!==4||(ids.includes('player')&&ids[0]!=='player'))fail();
 keys(round.opening,['hand','honba','sticks']);if(['hand','honba','sticks'].some(k=>!Number.isInteger(round.opening[k as keyof MahjongMeta])||round.opening[k as keyof MahjongMeta]<0||round.opening[k as keyof MahjongMeta]>2000)||JSON.stringify(round.opening)!==JSON.stringify(meta))fail();
 if(!object(round.openingScores)||Object.keys(round.openingScores).length!==4||ids.some(id=>!Number.isSafeInteger(round.openingScores[id])||round.openingScores[id]!==scores[id]||scores[id]<0))fail();
 if(!Array.isArray(round.wall)||round.wall.length!==136||[...round.wall].sort().join(',')!==[...mahjongDeck].sort().join(',')||!Array.isArray(round.steps)||round.steps.length>600)fail();
 for(const step of round.steps){keys(step,['choices']);if(!Array.isArray(step.choices)||step.choices.length!==4)fail();for(const choice of step.choices)keys(choice,['dapai','fulou','gang','hule','daopai']);}
 const g=engine(round),expected=clone(round);updateRound(expected,g);
 if(round.phase!==expected.phase||round.turn!==expected.turn||JSON.stringify(round.result)!==JSON.stringify(expected.result)||round.archived!==undefined&&typeof round.archived!=='boolean'||round.dialogueVersion!==undefined&&round.dialogueVersion!==1)fail();
 if(Array.isArray(round.replies))for(const line of round.replies)keys(line,['id','text']);
 if(round.replies!==undefined&&(!Array.isArray(round.replies)||round.replies.length>120||round.replies.some(l=>!l||!ids.includes(l.id)||typeof l.text!=='string'||l.text.length>3000)))fail();
 validateSettlementTalk(round.settlementTalk,ids,round.phase==='complete');return round;
}
