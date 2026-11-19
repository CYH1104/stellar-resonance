import {startLiarRound,validateLiarRound,type LiarRound} from './liarDice.ts';
import {validateGameDialogue,type GameDialogue} from './gameDialogue.ts';
import type {KingAfterparty} from './personalTerminal';
import type {TerminalAnchor} from './terminalLedger';

export type PartyKind='eleven'|'truth'|'liar';
export interface PartyReply {id:string;text:string}
interface RoundBase {number:number;anchor?:TerminalAnchor;archived?:boolean;replies?:PartyReply[];dialogueVersion?:1}
export interface ElevenWave {number:number;choices:Record<string,'hit'|'stand'>;speeches:PartyReply[];playerText?:string;status:'deciding'|'ready'|'dealt';dialogueVersion?:1}
export interface ElevenBatch {version:1;pending:boolean;wave:number;playerInput:string;finalReplies?:PartyReply[];dialogueVersion?:1}
export interface ElevenRound extends RoundBase {kind:'eleven';rulesVersion?:'eleven-v2'|'ten-half-v1';outcome?:'all-bust';banker:string;deck:string[];hands:Record<string,string[]>;stopped:string[];turn:string;phase:'playing'|'complete';winner?:string;flow?:'waves-v1';waves?:ElevenWave[];batch?:ElevenBatch}
export interface TruthCard {id:string;truth:string;dare:string}
export interface TruthRound extends RoundBase {kind:'truth';target:string;card:TruthCard;choice?:'truth'|'dare';text?:string;refused?:boolean;choiceDialogue?:GameDialogue;dialogue?:GameDialogue;phase:'choose'|'respond'|'complete'}
export type PartyRound=ElevenRound|TruthRound|LiarRound;
export interface PartyRoom {version:1;id:string;kind:PartyKind;name:string;style:string;members:string[];invitations:Record<string,'accepted'|'declined'|'pending'>;inviteReplies:Record<string,string>;inviteNotes?:Record<string,string>;rounds:PartyRound[];drunk:Record<string,number>;endedAt?:string;endReason?:'drunk'|'manual'|'round-limit'|'bankers-complete';endTriggers?:string[];afterparty?:KingAfterparty;bankerOrder?:string[];bankerIndex?:number}
export type PartyRandom=(n:number)=>number;
export const suits=['S','H','C','D'] as const;
export const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
export function cardCode(suit:string,rank:string){const value=suit+'-'+rank;if(!/^[SHCD]-(?:A|[2-9]|10|J|Q|K)$/.test(value))throw Error('扑克牌不正确');return value;}
export const code=cardCode;
export const cards=suits.flatMap(s=>ranks.map(r=>cardCode(s,r)));
export function cardLabel(code:string){const [s,r]=parseCard(code);return ({S:'♠',H:'♥',C:'♣',D:'♦'} as Record<string,string>)[s]+r;}
function parseCard(code:string){if(typeof code!=='string'||!cards.includes(code))throw Error('扑克牌不正确');return code.split('-');}
export interface HandRank {kind:'bust'|'ordinary'|'eleven'|'five'|'flowers';category:number;halfPoints:number}
export function handRank(hand:readonly string[],limitHalf=23):HandRank{
 if(!Array.isArray(hand)||hand.length<1||hand.length>5||new Set(hand).size!==hand.length)throw Error('手牌不正确');
 const parsed=hand.map(parseCard),halfPoints=parsed.reduce((n,[,r])=>n+(/[JQK]/.test(r)?1:r==='A'?2:Number(r)*2),0);
 const kind=halfPoints>limitHalf?'bust':hand.length===5&&parsed.every(([,r])=>/[JQK]/.test(r))?'flowers':hand.length===5?'five':halfPoints===limitHalf?'eleven':'ordinary';
 return {kind,category:{bust:0,ordinary:1,eleven:2,five:3,flowers:4}[kind],halfPoints};
}
/** Positive means a beats b. Version 2 first compares the highest single-card value for tied hand types/total points. */
export function compareHands(a:readonly string[],b:readonly string[],limitHalf=23){
 return compareHandsVersion(a,b,true,limitHalf);
}
function highestCardValue(hand:readonly string[]){return Math.max(...hand.map(card=>{const rank=parseCard(card)[1];return rank==='A'?2:/[JQK]/.test(rank)?1:Number(rank)*2;}));}
function compareHandsVersion(a:readonly string[],b:readonly string[],version2:boolean,limitHalf=23){
 const x=handRank(a,limitHalf),y=handRank(b,limitHalf);if(x.category!==y.category)return x.category-y.category;
 if(x.kind==='eleven'){
  if(version2){const high=highestCardValue(a)-highestCardValue(b);if(high)return high;}
  for(const suit of suits){const delta=a.filter(c=>c.startsWith(suit+'-')).length-b.filter(c=>c.startsWith(suit+'-')).length;if(delta)return delta;}return 0;
 }
 if(x.kind==='ordinary'||x.kind==='five'){
  const total=x.halfPoints-y.halfPoints;if(total)return total;
  if(version2)return highestCardValue(a)-highestCardValue(b);
 }
 return 0;
}
function compareHandsLegacy(a:readonly string[],b:readonly string[]){return compareHandsVersion(a,b,false);}
export function elevenLimitHalf(round:Pick<ElevenRound,'rulesVersion'>){return round.rulesVersion==='ten-half-v1'?21:23;}
export function elevenHandRank(round:Pick<ElevenRound,'rulesVersion'>,hand:readonly string[]){return handRank(hand,elevenLimitHalf(round));}
function compareForRound(round:ElevenRound){return (a:readonly string[],b:readonly string[])=>compareHandsVersion(a,b,round.rulesVersion!==undefined,elevenLimitHalf(round));}
function allBust(round:ElevenRound){return Object.values(round.hands).length>0&&Object.values(round.hands).every(hand=>elevenHandRank(round,hand).kind==='bust');}
export function isElevenAllBust(round:ElevenRound){return round.outcome==='all-bust';}
export function elevenHandVisible(round:ElevenRound,id:string){const hand=round.hands[id];return !!hand&&(id==='player'||round.phase==='complete'||elevenHandRank(round,hand).kind==='bust');}
/** Explain the already-settled result without choosing a different winner. */
export function elevenWinnerReason(round:ElevenRound):string{
 if(round.phase!=='complete')return '本局尚未结算。';
 if(isElevenAllBust(round))return '全员爆牌，本局无胜负，每位参与者各喝一杯，庄位保持不变。';
 const ids=Object.keys(round.hands),winner=round.winner;if(!winner||!ids.includes(winner)||!ids.includes(round.banker))return '结算信息不完整。';
 const v2=round.rulesVersion!==undefined,compare=compareForRound(round),rank=elevenHandRank(round,round.hands[winner]),others=ids.filter(id=>id!==winner);
 if(allBust(round))return '历史旧局按旧规则结算：全员爆牌均为最低牌型，原记录由庄家优先获胜。';
 let opponent=others[0];for(const id of others.slice(1))if(compare(round.hands[id],round.hands[opponent])>0)opponent=id;if(!opponent)return '本局只有一位参与者。';
 const other=elevenHandRank(round,round.hands[opponent]),high=highestCardValue(round.hands[winner]),otherHigh=highestCardValue(round.hands[opponent]);
 if(v2&&rank.kind===other.kind&&rank.halfPoints===other.halfPoints&&high!==otherHigh)return '同牌型、同总点数，比较最大单张：'+high/2+'点大于'+otherHigh/2+'点。';
 if(compare(round.hands[winner],round.hands[opponent])===0){const same=rank.kind==='eleven'?'同为'+elevenLimitHalf(round)/2+'点'+(v2?'且最大单张相同':'')+'，花色张数也相同':'同牌型、同点数'+(v2?'且最大单张相同':'');return same+(winner===round.banker?'，庄家优先。':'，庄家不在最高并列中，按庄家后座位顺序决定赢家。')+(v2?'':'（历史旧规则）');}
 if(rank.kind==='flowers')return '五花牌优先于五张不过、'+(elevenLimitHalf(round)===21?'十点半':'十一点半')+'和普通牌。';
 if(rank.kind==='five')return other.kind==='five'?'同为五张不过，比较总点数，'+rank.halfPoints/2+'点更大。':'五张不过优先于普通'+(elevenLimitHalf(round)===21?'十点半':'十一点半')+'、普通牌和爆牌。';
 if(rank.kind==='eleven'){if(other.kind!=='eleven')return elevenLimitHalf(round)/2+'点优先于未达到目标点数的普通牌和爆牌。';const symbols={S:'♠',H:'♥',C:'♣',D:'♦'};for(const suit of suits){const left=round.hands[winner].filter(c=>c.startsWith(suit+'-')).length,right=round.hands[opponent].filter(c=>c.startsWith(suit+'-')).length;if(left!==right)return '同为'+elevenLimitHalf(round)/2+'点'+(v2?'且最大单张相同':'')+'，依次比较♠、♥、♣、♦张数；赢家在'+symbols[suit]+'张数上占优（'+left+'对'+right+'）。';}}
 return other.kind==='bust'?'赢家为未爆牌的'+rank.halfPoints/2+'点，其余人均已爆牌。':'未爆牌的普通牌按总点数比较，'+rank.halfPoints/2+'点更大。';
}
function randomIndex(n:number){const bytes=new Uint32Array(1),limit=Math.floor(0x100000000/n)*n;do{crypto.getRandomValues(bytes);}while(bytes[0]>=limit);return bytes[0]%n;}
function pick(n:number,random:PartyRandom){const value=random(n);if(!Number.isInteger(value)||value<0||value>=n)throw Error('随机来源不正确');return value;}
function shuffled<T>(values:readonly T[],random:PartyRandom){const out=[...values];for(let i=out.length-1;i>0;i--){const j=pick(i+1,random);[out[i],out[j]]=[out[j],out[i]];}return out;}
const fail=():never=>{throw Error('终端聚会游戏格式不正确');};
const actorId=(v:unknown):v is string=>typeof v==='string'&&/^[^\s\u0000-\u001f]{1,128}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
export function createPartyRoom(kind:PartyKind,ids:string[],name:string,style:string,id:string):PartyRoom{
 if(!['eleven','truth','liar'].includes(kind)||!Array.isArray(ids)||ids.length<2||ids.length>7||ids.some(x=>!actorId(x)||x==='player')||new Set(ids).size!==ids.length||!actorId(id)||typeof name!=='string'||name.length>60||typeof style!=='string'||style.length>40)throw Error('请选择2～7位好友并填写有效房间资料');
 return {version:1,id,kind,name:name.trim()||(kind==='eleven'?'十点半':kind==='liar'?'大话骰':'真心话大冒险'),style,members:['player',...ids],invitations:Object.fromEntries(ids.map(x=>[x,'pending'])),inviteReplies:{},inviteNotes:{},rounds:[],drunk:Object.fromEntries(['player',...ids].map(x=>[x,0]))};
}
export function partyParticipants(room:PartyRoom){return room.members.filter(id=>id==='player'||room.invitations[id]==='accepted');}
function activeRounds(room:PartyRoom){return room.rounds.filter(r=>!r.archived);}
function current(room:PartyRoom){const r=activeRounds(room).at(-1);if(!r)throw Error('尚未开始游戏');return r;}
function seatsAfter(ids:string[],banker:string){const i=ids.indexOf(banker);return [...ids.slice(i+1),...ids.slice(0,i),banker];}
export const truthCards:readonly TruthCard[]=[
 ['t01','你对在场某人的第一印象是什么？现在变了吗？','向一位在场者发出邀请，请对方自愿与你对视十秒。'],
 ['t02','最近让你偷偷开心的一件小事是什么？','用三个词夸奖一位在场者。'],
 ['t03','你最想和谁一起看一次星海？为什么？','为自己和一位在场者构想一次轻松出游计划。'],
 ['t04','你收到过最难忘的关心是什么？','向一位在场者认真说一句谢谢。'],
 ['t05','如果今晚能许一个小愿望，你会许什么？','用播报星舰广播的语气介绍一位在场者。'],
 ['t06','你有没有一个不太愿意承认的小习惯？','模仿自己刚睡醒时的一句台词。'],
 ['t07','你觉得谁最会安慰人？','选择一位在场者，问他是否愿意为你起一个临时昵称。'],
 ['t08','你最喜欢别人如何称呼你？','用一个温柔的昵称称呼一位愿意接受的在场者。'],
 ['t09','你曾经因为什么事情吃过一点醋？不方便可以拒绝。','坦率称赞一位在场者身上你欣赏的特点。'],
 ['t10','如果可以交换一天生活，你会选谁？','即兴演一段三句以内的星际广告。'],
 ['t11','哪一种相处方式会让你觉得安心？','给一位在场者写一句不署名的鼓励，再由你自己揭晓。'],
 ['t12','有什么想尝试却一直没行动的小事？','用一句话邀请在场者参加你想象的冒险。'],
 ['t13','你记得某位在场者说过的一句话吗？','为一位在场者挑一个适合他的星座意象并解释。'],
 ['t14','你紧张的时候通常会做什么？','面向大家摆一个你认为最帅气的姿势。'],
 ['t15','你最珍惜的一段普通日常是什么？','讲一个你自己觉得好笑的短笑话。'],
 ['t16','你会如何表达对某人的在意？','邀请一位在场者自愿与你击掌；对方不愿意就向大家挥手致意。'],
 ['t17','你想收到怎样的一封信？','口头写一张只含两句话的明信片送给一位在场者。'],
 ['t18','有没有哪个瞬间让你重新认识一位在场者？','为这场聚会起一个名字并解释原因。'],
 ['t19','若明天休息，你最想做什么？','用不同于平常的语气说一句晚安。'],
 ['t20','你认为自己最不容易被别人发现的优点是什么？','请自愿者给你一个词，用它即兴编两句小故事。'],
 ['t21','你觉得自己和谁最有默契？','和一名自愿的在场者各自说一个词，拼成一句祝福。'],
 ['t22','哪一种邀请最容易让你心动？','向一位在场者发出一个他可以自由拒绝的约会或出游邀请。'],
].map(([id,truth,dare])=>({id,truth,dare}));
export function startPartyRound(room:PartyRoom,anchor?:TerminalAnchor,random:PartyRandom=randomIndex):PartyRound{
 const previous=activeRounds(room);if(room.endedAt||previous.at(-1)&&previous.at(-1)!.phase!=='complete')throw Error('请先完成当前轮，已结束房间不能继续');
 const prior=previous.at(-1);if(prior?.kind==='eleven'&&prior.batch?.pending)throw Error('请先补齐本轮角色回应');if(prior?.kind==='liar'&&prior.moves.at(-1)?.pending)throw Error('请先补齐本次桌上回应');
  const participants=partyParticipants(room);if(participants.length<3)throw Error('至少需要你和两位已接受邀请的好友');if(room.rounds.length>=500)throw Error('房间记录已达500轮上限');
 let round:PartyRound;
 if(room.kind==='liar'){const last=previous.at(-1);round=startLiarRound(participants,room.rounds.length+1,last?.kind==='liar'?(last.nextStarter||last.loser):undefined,anchor,random);room.rounds.push(round);return round;}
  if(room.kind==='truth'){
  if(previous.length>=10)throw Error('本局已完成10轮');
  const used=new Set(previous.filter((r):r is TruthRound=>r.kind==='truth').map(r=>r.card.id)),pool=truthCards.filter(c=>!used.has(c.id));
  const target=participants[pick(participants.length,random)],card={...pool[pick(pool.length,random)]};
  round={kind:'truth',number:room.rounds.length+1,target,card,phase:'choose'};
 }else{
  if(!room.bankerOrder){room.bankerOrder=shuffled(participants,random);room.bankerIndex=0;}
  if(room.bankerOrder.length!==participants.length||room.bankerOrder.some(id=>!participants.includes(id)))throw Error('本局坐庄开始后不能改变参与者');
  const banker=room.bankerOrder[room.bankerIndex||0];if(!banker||!participants.includes(banker))throw Error('坐庄顺序已结束或参与者变化');
  const deck=shuffled(cards,random),hands:Record<string,string[]>={};for(const id of participants)hands[id]=[deck.pop()!];
  round={kind:'eleven',rulesVersion:'ten-half-v1',number:room.rounds.length+1,banker,deck,hands,stopped:[],turn:'',phase:'playing',flow:'waves-v1',waves:[{number:1,choices:{},speeches:[],status:'deciding'}]};
 }
 if(anchor)round.anchor=structuredClone(anchor);room.rounds.push(round);return round;
}
function settleEleven(room:PartyRoom,round:ElevenRound){
 const ids=Object.keys(round.hands),v2=round.rulesVersion!==undefined;round.turn='';round.phase='complete';
 if(v2&&allBust(round)){round.outcome='all-bust';delete round.winner;for(const id of ids)room.drunk[id]=(room.drunk[id]||0)+1;return;}
 delete round.outcome;const priority=[round.banker,...seatsAfter(ids,round.banker).filter(id=>id!==round.banker)];let winner=priority[0];
 const compare=compareForRound(round);for(const id of priority.slice(1))if(compare(round.hands[id],round.hands[winner])>0)winner=id;
 round.winner=winner;for(const id of ids)if(id!==winner)room.drunk[id]=(room.drunk[id]||0)+1;
 if(winner!==round.banker)room.bankerIndex=(room.bankerIndex||0)+1;
 if((room.bankerIndex||0)>=(room.bankerOrder?.length||0)){room.endedAt=new Date().toISOString();room.endReason='bankers-complete';}
}

export function elevenAct(room:PartyRoom,actor:string,action:'hit'|'stand'):ElevenRound{
 const round=current(room);if(room.endedAt||round.kind!=='eleven'||round.flow!==undefined||round.phase!=='playing'||round.turn!==actor||!['hit','stand'].includes(action))throw Error('不是该角色的行动阶段');
 if(action==='hit'&&(round.hands[actor].length>=5||!round.deck.length))throw Error('不能继续要牌');
  if(round.rulesVersion!==undefined&&!['eleven-v2','ten-half-v1'].includes(round.rulesVersion)||round.outcome!==undefined)fail();

  if(action==='hit'){if(round.hands[actor].length>=5||!round.deck.length)throw Error('不能继续要牌');round.hands[actor].push(round.deck.pop()!);const rank=elevenHandRank(round,round.hands[actor]);if(rank.halfPoints>=elevenLimitHalf(round)||round.hands[actor].length===5)round.stopped.push(actor);}
 else round.stopped.push(actor);
 if(round.stopped.includes(actor)){const next=seatsAfter(Object.keys(round.hands),round.banker).find(id=>!round.stopped.includes(id));if(next)round.turn=next;else settleEleven(room,round);}
 return round;
}
/** Adopt only unfinished legacy rounds without shuffling, dealing, replaying speech or settling. */
export function ensureElevenWaves(room:PartyRoom):ElevenRound{
 const round=current(room);if(round.kind!=='eleven')throw Error('不是十点半牌局');
 if(round.phase==='complete')return round;
  if(room.endedAt)throw Error('游戏已结束，只能回看');

  if(round.outcome!==undefined||round.rulesVersion!==undefined&&!['eleven-v2','ten-half-v1'].includes(round.rulesVersion))fail();
 if(round.flow===undefined){round.flow='waves-v1';round.turn='';round.waves=[{number:1,choices:{},speeches:[],status:'deciding'}];}
 return round;
}
function decidingWave(room:PartyRoom){const round=ensureElevenWaves(room),wave=round.waves?.at(-1);if(round.phase!=='playing'||round.flow!=='waves-v1'||!wave||wave.status!=='deciding')throw Error('当前波次不能修改');return {round,wave};}
function waveSpeechReady(wave:ElevenWave,npcs:string[]){
 if(wave.dialogueVersion===undefined)return npcs.every(id=>wave.speeches.some(line=>line.id===id));
 const npcLines=wave.speeches.filter(line=>line?.id!=='player');
 validateGameDialogue({version:wave.dialogueVersion,lines:npcLines},npcs);
 const playerLines=wave.speeches.filter(line=>line?.id==='player');
 if(wave.playerText?.trim()){
  const line=playerLines[0];
  if(playerLines.length!==1||line.text!==wave.playerText||Object.keys(line).some(k=>k!=='id'&&k!=='text'))fail();
 }else if(playerLines.length)fail();
 return true;
}
export function elevenWaveChoice(room:PartyRoom,actor:string,choice:'hit'|'stand'):ElevenRound{
 const {round,wave}=decidingWave(room);
 if(!Object.hasOwn(round.hands,actor)||round.stopped.includes(actor)||Object.hasOwn(wave.choices,actor)||!['hit','stand'].includes(choice)||round.hands[actor].length>=5||elevenHandRank(round,round.hands[actor]).halfPoints>=elevenLimitHalf(round))throw Error('该角色已锁定选择或无需继续选择');
 const speechReady=waveSpeechReady(wave,Object.keys(round.hands).filter(id=>id!=='player'));
 wave.choices[actor]=choice;
 if(speechReady&&Object.keys(round.hands).filter(id=>!round.stopped.includes(id)).every(id=>['hit','stand'].includes(wave.choices[id])))wave.status='ready';
 return round;
}
export function elevenWaveSpeech(room:PartyRoom,speeches:PartyReply[]):ElevenRound{
 const {round,wave}=decidingWave(room),participants=Object.keys(round.hands),npcs=participants.filter(id=>id!=='player');
 if(!Array.isArray(speeches)||speeches.length<npcs.length||speeches.length>participants.length||new Set(speeches.map(s=>s?.id)).size!==speeches.length||speeches.some(s=>!s||Object.keys(s).some(k=>k!=='id'&&k!=='text')||!participants.includes(s.id)||typeof s.text!=='string'||!s.text.trim()||s.text.length>3000)||npcs.some(id=>!speeches.some(s=>s.id===id)))throw Error('每位角色都需要本波公开发言');
 if(wave.playerText!==undefined&&((wave.playerText.trim()?speeches.find(s=>s.id==='player')?.text!==wave.playerText:speeches.some(s=>s.id==='player'))))throw Error('不能改写玩家已锁定的发言');
 if(wave.speeches.length&&JSON.stringify(wave.speeches)!==JSON.stringify(speeches))throw Error('本波公开发言已经锁定');
 wave.speeches=speeches.map(s=>({...s}));if(wave.playerText===undefined)wave.playerText=wave.speeches.find(s=>s.id==='player')?.text||'';
 if(participants.filter(id=>!round.stopped.includes(id)).every(id=>['hit','stand'].includes(wave.choices[id])))wave.status='ready';
 return round;
}
export function advanceElevenWave(room:PartyRoom):ElevenRound{
 const round=ensureElevenWaves(room),wave=round.waves?.at(-1);
 if(round.phase!=='playing'||round.batch?.pending||!wave||wave.status!=='ready')throw Error('本波尚未完成选择和公开发言');
 const participants=room.members.filter(id=>Object.hasOwn(round.hands,id)),active=participants.filter(id=>!round.stopped.includes(id));
 if(active.some(id=>!['hit','stand'].includes(wave.choices[id]))||!waveSpeechReady(wave,participants.filter(id=>id!=='player')))throw Error('本波选择或发言缺失');
 for(const id of active){if(wave.choices[id]==='stand')round.stopped.push(id);else{if(round.hands[id].length>=5||!round.deck.length)throw Error('不能继续发牌');round.hands[id].push(round.deck.pop()!);if(round.hands[id].length===5||elevenHandRank(round,round.hands[id]).halfPoints>=elevenLimitHalf(round))round.stopped.push(id);}}
 wave.status='dealt';
 if(participants.every(id=>round.stopped.includes(id)))settleEleven(room,round);
 else{if(round.waves!.length>=5)throw Error('波次数量已达上限');round.waves!.push({number:wave.number+1,choices:{},speeches:[],status:'deciding'});}
 return round;
}

export function chooseTruth(room:PartyRoom,actor:string,choice:'truth'|'dare'):TruthRound{
 const round=current(room);if(room.endedAt||round.kind!=='truth'||round.phase!=='choose'||round.target!==actor||!['truth','dare'].includes(choice))throw Error('不能改写已选题目');round.choice=choice;round.phase='respond';return round;
}
export function finishTruth(room:PartyRoom,actor:string,text:string,refused:boolean):TruthRound{
 const round=current(room);if(room.endedAt||round.kind!=='truth'||round.phase!=='respond'||round.target!==actor||typeof text!=='string'||!text.trim()||text.length>3000||typeof refused!=='boolean')throw Error('请完成本轮回应');round.text=text.trim();round.refused=refused;round.phase='complete';if(refused)room.drunk[actor]=(room.drunk[actor]||0)+1;
 if(activeRounds(room).length>=10){room.endedAt=new Date().toISOString();room.endReason='round-limit';}return round;
}
export function settlePartyEnd(room:PartyRoom,tolerances:Record<string,number>){
 if(room.endReason==='manual')return room;
 const participants=partyParticipants(room),triggers=participants.filter(id=>Number.isInteger(tolerances[id])&&tolerances[id]>=1&&tolerances[id]<=10&&(room.drunk[id]||0)>=tolerances[id]);
 if(!triggers.length)return room;
 if(room.endReason==='drunk')return room;
 room.endedAt||=new Date().toISOString();room.endReason='drunk';room.endTriggers=triggers;
 room.afterparty={status:'pending',triggers:[...triggers],at:room.endedAt,participants:[...participants],scenes:triggers.map(actorId=>({actorId,status:'pending',participants:actorId==='player'?['player',participants.find(id=>id!=='player')!]:['player',actorId]}))};return room;
}
export function endPartyRoom(room:PartyRoom){if(!room.endedAt){room.endedAt=new Date().toISOString();room.endReason='manual';}return room;}

const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function keys(v:unknown,allowed:string[]){if(!obj(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();}
function text(v:unknown,max:number,empty=true){return typeof v==='string'&&v.length<=max&&(empty||!!v.trim());}
function ids(v:unknown,min:number,max:number):v is string[]{return Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(actorId)&&new Set(v).size===v.length;}
function iso(v:unknown){return typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;}
function anchor(v:unknown){keys(v,['key','turnId','variantId','path']);const a=v as TerminalAnchor;if(!text(a.key,500,false)||!text(a.turnId,128)||!text(a.variantId,128)||!Array.isArray(a.path)||a.path.length>10000||a.path.some(p=>!text(p,500,false)))fail();}
function afterparty(value:unknown,room:PartyRoom){
 keys(value,['scenes','status','text','summary','error','triggers','at','participants','draft']);const a=value as KingAfterparty,participants=partyParticipants(room);
 if(!['pending','ready','failed'].includes(a.status)||a.at!==undefined&&!iso(a.at)||a.text!==undefined&&!text(a.text,8000)||a.draft!==undefined&&!text(a.draft,8000)||a.summary!==undefined&&!text(a.summary,400)||a.error!==undefined&&!text(a.error,2000)||a.triggers!==undefined&&(!ids(a.triggers,1,8)||a.triggers.some(id=>!participants.includes(id)))||a.participants!==undefined&&(!ids(a.participants,1,8)||!a.participants.includes('player')||a.participants.some(id=>!participants.includes(id))))fail();
 if(a.scenes!==undefined){if(!Array.isArray(a.scenes)||!a.scenes.length||a.scenes.length>8||new Set(a.scenes.map(s=>s?.actorId)).size!==a.scenes.length)fail();for(const s of a.scenes){keys(s,['actorId','status','participants','text','summary','error','draft']);if(!participants.includes(s.actorId)||!['pending','ready','failed'].includes(s.status)||!ids(s.participants,1,2)||!s.participants.includes('player')||s.participants.some(id=>!participants.includes(id))||s.actorId!=='player'&&!s.participants.includes(s.actorId)||s.text!==undefined&&!text(s.text,8000)||s.draft!==undefined&&!text(s.draft,8000)||s.summary!==undefined&&!text(s.summary,400)||s.error!==undefined&&!text(s.error,2000)||s.status==='ready'&&(!s.text||s.text.replace(/\s/gu,'').length<1200))fail();}if(a.status==='ready'&&a.scenes.some(s=>s.status!=='ready'))fail();}
 else if(a.status==='ready'&&(!a.text||a.text.replace(/\s/gu,'').length<1200))fail();
}
function validateElevenResult(round:ElevenRound){
 if(round.rulesVersion!==undefined&&!['eleven-v2','ten-half-v1'].includes(round.rulesVersion))fail();
 if(round.phase==='playing'){if(round.winner!==undefined||round.outcome!==undefined)fail();return;}
 if(round.rulesVersion!==undefined&&allBust(round)){if(round.outcome!=='all-bust'||round.winner!==undefined)fail();return;}
 if(round.outcome!==undefined||!round.winner)fail();
 const ids=Object.keys(round.hands),priority=[round.banker,...seatsAfter(ids,round.banker).filter(id=>id!==round.banker)],compare=compareForRound(round);let winner=priority[0];for(const id of priority.slice(1))if(compare(round.hands[id],round.hands[winner])>0)winner=id;if(round.winner!==winner)fail();
}
function validateElevenWaves(round:ElevenRound){
 if(round.flow!=='waves-v1'||round.turn!==''||!Array.isArray(round.waves)||!round.waves.length||round.waves.length>5)fail();
 const participants=Object.keys(round.hands),npcs=participants.filter(id=>id!=='player'),waves=round.waves!;
 for(const [i,wave]of waves.entries()){
  keys(wave,['number','choices','speeches','playerText','status','dialogueVersion']);
  if(wave.playerText!==undefined&&!text(wave.playerText,500))fail();
  if(wave.number!==i+1||!obj(wave.choices)||Object.entries(wave.choices).some(([id,choice])=>!participants.includes(id)||!['hit','stand'].includes(choice))||!Array.isArray(wave.speeches)||!['deciding','ready','dealt'].includes(wave.status))fail();
   if(wave.dialogueVersion!==undefined){waveSpeechReady(wave,npcs);}
   else{
    if(wave.speeches.length>participants.length||new Set(wave.speeches.map(s=>s?.id)).size!==wave.speeches.length)fail();
    for(const speech of wave.speeches){keys(speech,['id','text']);if(!participants.includes(speech.id)||!text(speech.text,3000,false))fail();}
    if((wave.status!=='deciding'||wave.speeches.length>0)&&!waveSpeechReady(wave,npcs))fail();
    if(wave.speeches.length&&wave.playerText!==undefined&&(wave.playerText.trim()?wave.speeches.find(s=>s.id==='player')?.text!==wave.playerText:wave.speeches.some(s=>s.id==='player')))fail();
   }
   if(i<waves.length-1&&wave.status!=='dealt'||i===waves.length-1&&(round.phase==='complete'?wave.status!=='dealt':wave.status==='dealt'))fail();
 }
 // Replay only known wave draws from the existing hand prefixes. A migrated legacy hand may
 // start with several cards or already-stopped people; it is never presumed to start at one.
 const counts=new Map(participants.map(id=>[id,waves.filter(w=>w.status==='dealt'&&w.choices[id]==='hit').length]));
 const hands=Object.fromEntries(participants.map(id=>[id,round.hands[id].slice(0,round.hands[id].length-counts.get(id)!)]));
 if(participants.some(id=>hands[id].length<1))fail();
 const stopped=new Set(round.stopped.filter(id=>!waves.some(w=>Object.hasOwn(w.choices,id))));
 for(const wave of waves){
  const active=participants.filter(id=>!stopped.has(id));
  if(Object.keys(wave.choices).some(id=>stopped.has(id))||active.some(id=>(hands[id].length>=5||elevenHandRank(round,hands[id]).halfPoints>=elevenLimitHalf(round))))fail();
  if(wave.status!=='deciding'&&active.some(id=>!['hit','stand'].includes(wave.choices[id])))fail();

  if(wave.status==='dealt')for(const id of active){if(wave.choices[id]==='stand')stopped.add(id);else{hands[id].push(round.hands[id][hands[id].length]);if(hands[id].length>5)fail();if(hands[id].length===5||elevenHandRank(round,hands[id]).halfPoints>=elevenLimitHalf(round))stopped.add(id);}}
 }
 if(participants.some(id=>hands[id].length!==round.hands[id].length)||stopped.size!==round.stopped.length||round.stopped.some(id=>!stopped.has(id)))fail();
 if(round.phase==='playing'&&(round.winner!==undefined||stopped.size===participants.length)||round.phase==='complete'&&(!round.winner&&!isElevenAllBust(round)||stopped.size!==participants.length))fail();
}

export function markElevenBatch(room:PartyRoom,playerInput=''){
 const round=current(room);if(round.kind!=='eleven'||!text(playerInput,500))throw Error('批量回应状态不正确');
 if(round.flow===undefined&&round.phase==='playing')ensureElevenWaves(room);
 const wave=round.waves?.at(-1);if(!wave)throw Error('没有等待回应的发牌轮次');
 round.batch={version:1,pending:true,wave:wave.number,playerInput};return round;
}
export function elevenBatchPrepared(round:ElevenRound){
 if(round.batch?.pending)return false;const wave=round.waves?.at(-1),npcs=Object.keys(round.hands).filter(id=>id!=='player');
 return round.phase==='playing'&&!!wave&&waveSpeechReady(wave,npcs)&&npcs.filter(id=>!round.stopped.includes(id)).every(id=>['hit','stand'].includes(wave.choices[id]));
}
export function applyElevenBatchResult(room:PartyRoom,rows:{id:string;choice:'hit'|'stand'|null;text?:string}[],dialogue?:GameDialogue){
 const round=current(room);if(round.kind!=='eleven'||!round.batch?.pending)throw Error('本轮回应已经保存');
 const npcs=Object.keys(round.hands).filter(id=>id!=='player'),wave=round.waves?.at(-1);
 if(!wave||round.batch.wave!==wave.number||!Array.isArray(rows)||rows.length!==npcs.length||new Set(rows.map(r=>r?.id)).size!==npcs.length)throw Error('角色批量回应不完整');
 if(dialogue!==undefined)validateGameDialogue(dialogue,npcs);
 for(const row of rows){
  if(!row||!npcs.includes(row.id)||(dialogue===undefined?!text(row.text,200,false):row.text!==undefined&&!text(row.text,500)))throw Error('角色批量回应格式不正确');
  const hand=round.hands[row.id],active=round.phase==='playing'&&!round.stopped.includes(row.id)&&hand.length<5&&elevenHandRank(round,hand).halfPoints<elevenLimitHalf(round);
  if(active?!['hit','stand'].includes(row.choice||''):row.choice!==null)throw Error('角色要牌决定不正确');
  if(active&&Object.hasOwn(wave.choices,row.id)&&wave.choices[row.id]!==row.choice)throw Error('不能改写已保存的要牌决定');
 }
 const speeches=dialogue?dialogue.lines.map(line=>({...line})):rows.map(row=>({id:row.id,text:row.text!}));
 if(round.phase==='complete'){round.batch.finalReplies=speeches;if(dialogue)round.batch.dialogueVersion=1;}
 else{
  for(const row of rows)if(row.choice!==null)wave.choices[row.id]=row.choice;
  if(!wave.speeches.length&&wave.dialogueVersion===undefined){wave.speeches=[...speeches,...(wave.playerText?.trim()?[{id:'player',text:wave.playerText}]:[])];if(dialogue)wave.dialogueVersion=1;}
  wave.status=waveSpeechReady(wave,npcs)&&Object.keys(round.hands).filter(id=>!round.stopped.includes(id)).every(id=>['hit','stand'].includes(wave.choices[id]))?'ready':'deciding';
 }
 round.batch.pending=false;return round;
}
function validateElevenBatch(round:ElevenRound){
 if(round.batch===undefined)return;const batch=round.batch;keys(batch,['version','pending','wave','playerInput','finalReplies','dialogueVersion']);
 const wave=round.waves?.at(-1),npcs=Object.keys(round.hands).filter(id=>id!=='player');
 if(batch.version!==1||typeof batch.pending!=='boolean'||!wave||batch.wave!==wave.number||!text(batch.playerInput,500))fail();
 if(batch.dialogueVersion!==undefined&&(round.phase!=='complete'||batch.pending||batch.finalReplies===undefined))fail();
 if(batch.finalReplies!==undefined){
  if(round.phase!=='complete'||batch.pending)fail();
  if(batch.dialogueVersion!==undefined)validateGameDialogue({version:batch.dialogueVersion,lines:batch.finalReplies},npcs);
  else{if(!Array.isArray(batch.finalReplies)||batch.finalReplies.length!==npcs.length||new Set(batch.finalReplies.map(r=>r?.id)).size!==npcs.length)fail();for(const r of batch.finalReplies){keys(r,['id','text']);if(!npcs.includes(r.id)||!text(r.text,200,false))fail();}}
 }
 if(!batch.pending){if(round.phase==='complete'&&!batch.finalReplies||round.phase==='playing'&&!elevenBatchPrepared(round))fail();}
}
function validateRoundReplies(round:PartyRound,participants:string[]){
 if(round.dialogueVersion===undefined){
  if(round.replies!==undefined&&(!Array.isArray(round.replies)||round.replies.length>8||new Set(round.replies.map(r=>r?.id)).size!==round.replies.length))fail();
  for(const reply of round.replies||[]){keys(reply,['id','text']);if(reply.id==='player'||!participants.includes(reply.id)||!text(reply.text,3000,false))fail();}return;
 }
 if(round.dialogueVersion!==1||!Array.isArray(round.replies)||round.replies.length>256)fail();
 for(const reply of round.replies||[]){keys(reply,['id','text']);if(!participants.includes(reply.id)||!text(reply.text,reply.id==='player'?2000:3000,false))fail();}
}
export function validatePartyRooms(value:unknown,validateAfterpartyCallback?:(afterparty:KingAfterparty,room:PartyRoom)=>void):PartyRoom[]{
 if(!Array.isArray(value)||value.length>20||new Set(value.map(r=>r?.id)).size!==value.length)fail();
 for(const room of value as PartyRoom[]){
  keys(room,['version','id','kind','name','style','members','invitations','inviteReplies','inviteNotes','rounds','drunk','endedAt','endReason','endTriggers','afterparty','bankerOrder','bankerIndex']);
  if(room.version!==1||!actorId(room.id)||!['eleven','truth','liar'].includes(room.kind)||!text(room.name,60,false)||!text(room.style,40)||!ids(room.members,3,8)||room.members[0]!=='player'||!obj(room.invitations)||Object.keys(room.invitations).length!==room.members.length-1||room.members.slice(1).some(id=>!['accepted','declined','pending'].includes(room.invitations[id]))||Object.keys(room.invitations).some(id=>!room.members.includes(id)||id==='player')||!obj(room.inviteReplies)||Object.entries(room.inviteReplies).some(([id,t])=>!room.members.includes(id)||id==='player'||!text(t,3000))||room.inviteNotes!==undefined&&(!obj(room.inviteNotes)||Object.entries(room.inviteNotes).some(([id,note])=>!room.members.includes(id)||id==='player'||!text(note,2000)))||!obj(room.drunk)||Object.entries(room.drunk).some(([id,n])=>!room.members.includes(id)||!Number.isInteger(n)||n<0||n>999)||!Array.isArray(room.rounds)||room.rounds.length>500||room.endedAt!==undefined&&!iso(room.endedAt)||room.endReason!==undefined&&!['drunk','manual','round-limit','bankers-complete'].includes(room.endReason)||!!room.endedAt!==!!room.endReason||room.endTriggers!==undefined&&(!ids(room.endTriggers,1,8)||room.endTriggers.some(id=>!partyParticipants(room).includes(id))))fail();
  const participants=partyParticipants(room),active=activeRounds(room);if(room.kind==='truth'&&active.length>10)fail();
  if(room.bankerOrder!==undefined&&(!ids(room.bankerOrder,3,8)||room.bankerOrder.some(id=>!participants.includes(id)))||room.bankerIndex!==undefined&&(!Number.isInteger(room.bankerIndex)||room.bankerIndex<0||room.bankerIndex>(room.bankerOrder?.length||0))||room.kind!=='eleven'&&(room.bankerOrder!==undefined||room.bankerIndex!==undefined)||room.kind==='eleven'&&active.length&&(!room.bankerOrder||room.bankerIndex===undefined))fail();
  if(active.length&&participants.length<3||room.endReason==='round-limit'&&(room.kind!=='truth'||active.length!==10)||room.endReason==='bankers-complete'&&(room.kind!=='eleven'||room.bankerIndex!==room.bankerOrder?.length)||room.endReason==='drunk'&&(!room.endTriggers?.length||!room.afterparty))fail();
  const usedTruth=new Set<string>();let lastNumber=0;
  for(const round of room.rounds){
    if(round.kind==='liar'){if(room.kind!=='liar'||round.number<=lastNumber)fail();lastNumber=round.number;if(round.anchor)anchor(round.anchor);validateLiarRound(round,participants);if(round.dialogueVersion!==undefined)validateRoundReplies(round,participants);continue;}
   keys(round,round.kind==='eleven'?['kind','number','anchor','archived','replies','dialogueVersion','banker','deck','hands','stopped','turn','phase','winner','flow','waves','batch','rulesVersion','outcome']:['kind','number','anchor','archived','replies','dialogueVersion','dialogue','choiceDialogue','target','card','choice','text','refused','phase']);
   if(round.kind!==room.kind||!Number.isInteger(round.number)||round.number<=lastNumber||round.number>500||round.archived!==undefined&&typeof round.archived!=='boolean')fail();lastNumber=round.number;if(round.anchor!==undefined)anchor(round.anchor);
   validateRoundReplies(round,participants);
   if(round.kind==='truth'){
     if(round.choiceDialogue!==undefined){if(round.phase==='choose')fail();validateGameDialogue(round.choiceDialogue,participants.filter(id=>id!=='player'));}
     if(round.dialogue!==undefined){if(round.phase!=='complete')fail();validateGameDialogue(round.dialogue,participants.filter(id=>id!=='player'));}
    keys(round.card,['id','truth','dare']);if(!participants.includes(round.target)||!actorId(round.card.id)||!text(round.card.truth,1000,false)||!text(round.card.dare,1000,false)||!['choose','respond','complete'].includes(round.phase)||round.choice!==undefined&&!['truth','dare'].includes(round.choice)||round.text!==undefined&&!text(round.text,3000,false)||round.refused!==undefined&&typeof round.refused!=='boolean'||round.phase==='choose'&&(round.choice!==undefined||round.text!==undefined||round.refused!==undefined)||round.phase==='respond'&&(round.choice===undefined||round.text!==undefined||round.refused!==undefined)||round.phase==='complete'&&(round.choice===undefined||round.text===undefined||round.refused===undefined))fail();if(!round.archived){if(usedTruth.has(round.card.id))fail();usedTruth.add(round.card.id);}
   }else{
    if(!participants.includes(round.banker)||!obj(round.hands)||!ids(Object.keys(round.hands),3,8)||Object.keys(round.hands).some(id=>!participants.includes(id))||!Array.isArray(round.deck)||!ids(round.stopped,0,8)||round.stopped.some(id=>!Object.hasOwn(round.hands,id))||!['playing','complete'].includes(round.phase)||!text(round.turn,128)||round.winner!==undefined&&!Object.hasOwn(round.hands,round.winner))fail();
    if(!Object.hasOwn(round.hands,round.banker)||round.phase==='playing'&&!room.endedAt&&Object.keys(round.hands).length!==participants.length)fail();
    const dealt=Object.values(round.hands);if(dealt.some(hand=>!Array.isArray(hand)||hand.length<1||hand.length>5))fail();const partition=[...round.deck,...dealt.flat()];if(partition.length!==52||new Set(partition).size!==52||partition.some(c=>!cards.includes(c)))fail();
    if(round.flow!==undefined||round.waves!==undefined)validateElevenWaves(round);
     else if(round.phase==='playing'&&(!Object.hasOwn(round.hands,round.turn)||round.stopped.includes(round.turn)||round.winner!==undefined)||round.phase==='complete'&&(round.turn!==''||!round.winner&&!isElevenAllBust(round)||round.stopped.length!==dealt.length))fail();
    if(round.flow===undefined&&round.phase==='playing'){const expected=seatsAfter(Object.keys(round.hands),round.banker).find(id=>!round.stopped.includes(id));if(round.turn!==expected)fail();for(const [id,hand]of Object.entries(round.hands))if((hand.length===5||elevenHandRank(round,hand).halfPoints>=elevenLimitHalf(round))&&!round.stopped.includes(id))fail();}
    validateElevenBatch(round);
     validateElevenResult(round);
   }
  }
  for(const id of participants){const voidCups=active.filter(r=>r.kind==='eleven'&&r.rulesVersion!==undefined&&r.phase==='complete'&&r.outcome==='all-bust'&&Object.hasOwn(r.hands,id)).length;if((room.drunk[id]||0)<voidCups)fail();}
   if(active.slice(0,-1).some(r=>r.phase!=='complete'))fail();if(room.afterparty!==undefined){if(room.endReason!=='drunk')fail();afterparty(room.afterparty,room);validateAfterpartyCallback?.(room.afterparty,room);}
 }
 return value as PartyRoom[];
}
