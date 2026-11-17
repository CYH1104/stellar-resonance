import type {KingAfterparty} from './personalTerminal';
import type {TerminalAnchor} from './terminalLedger';

export type PartyKind='eleven'|'truth';
export interface PartyReply {id:string;text:string}
interface RoundBase {number:number;anchor?:TerminalAnchor;archived?:boolean;replies?:PartyReply[]}
export interface ElevenRound extends RoundBase {kind:'eleven';banker:string;deck:string[];hands:Record<string,string[]>;stopped:string[];turn:string;phase:'playing'|'complete';winner?:string}
export interface TruthCard {id:string;truth:string;dare:string}
export interface TruthRound extends RoundBase {kind:'truth';target:string;card:TruthCard;choice?:'truth'|'dare';text?:string;refused?:boolean;phase:'choose'|'respond'|'complete'}
export type PartyRound=ElevenRound|TruthRound;
export interface PartyRoom {version:1;id:string;kind:PartyKind;name:string;style:string;members:string[];invitations:Record<string,'accepted'|'declined'|'pending'>;inviteReplies:Record<string,string>;rounds:PartyRound[];drunk:Record<string,number>;endedAt?:string;endReason?:'drunk'|'manual'|'round-limit'|'bankers-complete';endTriggers?:string[];afterparty?:KingAfterparty;bankerOrder?:string[];bankerIndex?:number}
export type PartyRandom=(n:number)=>number;
export const suits=['S','H','C','D'] as const;
export const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
export function cardCode(suit:string,rank:string){const value=suit+'-'+rank;if(!/^[SHCD]-(?:A|[2-9]|10|J|Q|K)$/.test(value))throw Error('扑克牌不正确');return value;}
export const code=cardCode;
export const cards=suits.flatMap(s=>ranks.map(r=>cardCode(s,r)));
export function cardLabel(code:string){const [s,r]=parseCard(code);return ({S:'♠',H:'♥',C:'♣',D:'♦'} as Record<string,string>)[s]+r;}
function parseCard(code:string){if(typeof code!=='string'||!cards.includes(code))throw Error('扑克牌不正确');return code.split('-');}
export interface HandRank {kind:'bust'|'ordinary'|'eleven'|'five'|'flowers';category:number;halfPoints:number}
export function handRank(hand:readonly string[]):HandRank{
 if(!Array.isArray(hand)||hand.length<1||hand.length>5||new Set(hand).size!==hand.length)throw Error('手牌不正确');
 const parsed=hand.map(parseCard),halfPoints=parsed.reduce((n,[,r])=>n+(/[JQK]/.test(r)?1:r==='A'?2:Number(r)*2),0);
 const kind=halfPoints>23?'bust':hand.length===5&&parsed.every(([,r])=>/[JQK]/.test(r))?'flowers':hand.length===5?'five':halfPoints===23?'eleven':'ordinary';
 return {kind,category:{bust:0,ordinary:1,eleven:2,five:3,flowers:4}[kind],halfPoints};
}
/** Positive means a beats b. Ties are resolved by room seat/banker priority, never by suits except 11.5. */
export function compareHands(a:readonly string[],b:readonly string[]){
 const x=handRank(a),y=handRank(b);if(x.category!==y.category)return x.category-y.category;
 if(x.kind==='eleven'){for(const suit of suits){const delta=a.filter(c=>c.startsWith(suit+'-')).length-b.filter(c=>c.startsWith(suit+'-')).length;if(delta)return delta;}return 0;}
 return x.kind==='ordinary'||x.kind==='five'?x.halfPoints-y.halfPoints:0;
}
function randomIndex(n:number){const bytes=new Uint32Array(1),limit=Math.floor(0x100000000/n)*n;do{crypto.getRandomValues(bytes);}while(bytes[0]>=limit);return bytes[0]%n;}
function pick(n:number,random:PartyRandom){const value=random(n);if(!Number.isInteger(value)||value<0||value>=n)throw Error('随机来源不正确');return value;}
function shuffled<T>(values:readonly T[],random:PartyRandom){const out=[...values];for(let i=out.length-1;i>0;i--){const j=pick(i+1,random);[out[i],out[j]]=[out[j],out[i]];}return out;}
const fail=():never=>{throw Error('终端聚会游戏格式不正确');};
const actorId=(v:unknown):v is string=>typeof v==='string'&&/^[^\s\u0000-\u001f]{1,128}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
export function createPartyRoom(kind:PartyKind,ids:string[],name:string,style:string,id:string):PartyRoom{
 if(!['eleven','truth'].includes(kind)||!Array.isArray(ids)||ids.length<2||ids.length>7||ids.some(x=>!actorId(x)||x==='player')||new Set(ids).size!==ids.length||!actorId(id)||typeof name!=='string'||name.length>60||typeof style!=='string'||style.length>40)throw Error('请选择2～7位好友并填写有效房间资料');
 return {version:1,id,kind,name:name.trim()||(kind==='eleven'?'十一点半':'真心话大冒险'),style,members:['player',...ids],invitations:Object.fromEntries(ids.map(x=>[x,'pending'])),inviteReplies:{},rounds:[],drunk:Object.fromEntries(['player',...ids].map(x=>[x,0]))};
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
 const participants=partyParticipants(room);if(participants.length<3)throw Error('至少需要你和两位已接受邀请的好友');if(room.rounds.length>=500)throw Error('房间记录已达500轮上限');
 let round:PartyRound;
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
  round={kind:'eleven',number:room.rounds.length+1,banker,deck,hands,stopped:[],turn:seatsAfter(participants,banker)[0],phase:'playing'};
 }
 if(anchor)round.anchor=structuredClone(anchor);room.rounds.push(round);return round;
}
function settleEleven(room:PartyRoom,round:ElevenRound){
 const ids=Object.keys(round.hands),priority=[round.banker,...seatsAfter(ids,round.banker).filter(id=>id!==round.banker)];let winner=priority[0];
 for(const id of priority.slice(1))if(compareHands(round.hands[id],round.hands[winner])>0)winner=id;
 round.winner=winner;round.phase='complete';round.turn='';for(const id of ids)if(id!==winner)room.drunk[id]=(room.drunk[id]||0)+1;
 if(winner!==round.banker)room.bankerIndex=(room.bankerIndex||0)+1;
 if((room.bankerIndex||0)>=(room.bankerOrder?.length||0)){room.endedAt=new Date().toISOString();room.endReason='bankers-complete';}
}
export function elevenAct(room:PartyRoom,actor:string,action:'hit'|'stand'):ElevenRound{
 const round=current(room);if(room.endedAt||round.kind!=='eleven'||round.phase!=='playing'||round.turn!==actor||!['hit','stand'].includes(action))throw Error('不是该角色的行动阶段');
 if(action==='hit'){if(round.hands[actor].length>=5||!round.deck.length)throw Error('不能继续要牌');round.hands[actor].push(round.deck.pop()!);const rank=handRank(round.hands[actor]);if(rank.halfPoints>=23||round.hands[actor].length===5)round.stopped.push(actor);}
 else round.stopped.push(actor);
 if(round.stopped.includes(actor)){const next=seatsAfter(Object.keys(round.hands),round.banker).find(id=>!round.stopped.includes(id));if(next)round.turn=next;else settleEleven(room,round);}
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
export function validatePartyRooms(value:unknown,validateAfterpartyCallback?:(afterparty:KingAfterparty,room:PartyRoom)=>void):PartyRoom[]{
 if(!Array.isArray(value)||value.length>20||new Set(value.map(r=>r?.id)).size!==value.length)fail();
 for(const room of value as PartyRoom[]){
  keys(room,['version','id','kind','name','style','members','invitations','inviteReplies','rounds','drunk','endedAt','endReason','endTriggers','afterparty','bankerOrder','bankerIndex']);
  if(room.version!==1||!actorId(room.id)||!['eleven','truth'].includes(room.kind)||!text(room.name,60,false)||!text(room.style,40)||!ids(room.members,3,8)||room.members[0]!=='player'||!obj(room.invitations)||Object.keys(room.invitations).length!==room.members.length-1||room.members.slice(1).some(id=>!['accepted','declined','pending'].includes(room.invitations[id]))||Object.keys(room.invitations).some(id=>!room.members.includes(id)||id==='player')||!obj(room.inviteReplies)||Object.entries(room.inviteReplies).some(([id,t])=>!room.members.includes(id)||id==='player'||!text(t,3000))||!obj(room.drunk)||Object.entries(room.drunk).some(([id,n])=>!room.members.includes(id)||!Number.isInteger(n)||n<0||n>999)||!Array.isArray(room.rounds)||room.rounds.length>500||room.endedAt!==undefined&&!iso(room.endedAt)||room.endReason!==undefined&&!['drunk','manual','round-limit','bankers-complete'].includes(room.endReason)||!!room.endedAt!==!!room.endReason||room.endTriggers!==undefined&&(!ids(room.endTriggers,1,8)||room.endTriggers.some(id=>!partyParticipants(room).includes(id))))fail();
  const participants=partyParticipants(room),active=activeRounds(room);if(room.kind==='truth'&&active.length>10)fail();
  if(room.bankerOrder!==undefined&&(!ids(room.bankerOrder,3,8)||room.bankerOrder.some(id=>!participants.includes(id)))||room.bankerIndex!==undefined&&(!Number.isInteger(room.bankerIndex)||room.bankerIndex<0||room.bankerIndex>(room.bankerOrder?.length||0))||room.kind==='truth'&&(room.bankerOrder!==undefined||room.bankerIndex!==undefined)||room.kind==='eleven'&&active.length&&(!room.bankerOrder||room.bankerIndex===undefined))fail();
  if(active.length&&participants.length<3||room.endReason==='round-limit'&&(room.kind!=='truth'||active.length!==10)||room.endReason==='bankers-complete'&&(room.kind!=='eleven'||room.bankerIndex!==room.bankerOrder?.length)||room.endReason==='drunk'&&(!room.endTriggers?.length||!room.afterparty))fail();
  const usedTruth=new Set<string>();let lastNumber=0;
  for(const round of room.rounds){
   keys(round,round.kind==='eleven'?['kind','number','anchor','archived','replies','banker','deck','hands','stopped','turn','phase','winner']:['kind','number','anchor','archived','replies','target','card','choice','text','refused','phase']);
   if(round.kind!==room.kind||!Number.isInteger(round.number)||round.number<=lastNumber||round.number>500||round.archived!==undefined&&typeof round.archived!=='boolean')fail();lastNumber=round.number;if(round.anchor!==undefined)anchor(round.anchor);
   if(round.replies!==undefined&&(!Array.isArray(round.replies)||round.replies.length>8||new Set(round.replies.map(r=>r?.id)).size!==round.replies.length))fail();for(const reply of round.replies||[]){keys(reply,['id','text']);if(reply.id==='player'||!participants.includes(reply.id)||!text(reply.text,3000,false))fail();}
   if(round.kind==='truth'){
    keys(round.card,['id','truth','dare']);if(!participants.includes(round.target)||!actorId(round.card.id)||!text(round.card.truth,1000,false)||!text(round.card.dare,1000,false)||!['choose','respond','complete'].includes(round.phase)||round.choice!==undefined&&!['truth','dare'].includes(round.choice)||round.text!==undefined&&!text(round.text,3000,false)||round.refused!==undefined&&typeof round.refused!=='boolean'||round.phase==='choose'&&(round.choice!==undefined||round.text!==undefined||round.refused!==undefined)||round.phase==='respond'&&(round.choice===undefined||round.text!==undefined||round.refused!==undefined)||round.phase==='complete'&&(round.choice===undefined||round.text===undefined||round.refused===undefined))fail();if(!round.archived){if(usedTruth.has(round.card.id))fail();usedTruth.add(round.card.id);}
   }else{
    if(!participants.includes(round.banker)||!obj(round.hands)||!ids(Object.keys(round.hands),3,8)||Object.keys(round.hands).some(id=>!participants.includes(id))||!Array.isArray(round.deck)||!ids(round.stopped,0,8)||round.stopped.some(id=>!Object.hasOwn(round.hands,id))||!['playing','complete'].includes(round.phase)||!text(round.turn,128)||round.winner!==undefined&&!Object.hasOwn(round.hands,round.winner))fail();
    if(!Object.hasOwn(round.hands,round.banker)||round.phase==='playing'&&!room.endedAt&&Object.keys(round.hands).length!==participants.length)fail();
    const dealt=Object.values(round.hands);if(dealt.some(hand=>!Array.isArray(hand)||hand.length<1||hand.length>5))fail();const partition=[...round.deck,...dealt.flat()];if(partition.length!==52||new Set(partition).size!==52||partition.some(c=>!cards.includes(c)))fail();
    if(round.phase==='playing'&&(!Object.hasOwn(round.hands,round.turn)||round.stopped.includes(round.turn)||round.winner!==undefined)||round.phase==='complete'&&(round.turn!==''||!round.winner||round.stopped.length!==dealt.length))fail();
    if(round.phase==='playing'){const expected=seatsAfter(Object.keys(round.hands),round.banker).find(id=>!round.stopped.includes(id));if(round.turn!==expected)fail();for(const [id,hand]of Object.entries(round.hands))if((hand.length===5||handRank(hand).halfPoints>=23)&&!round.stopped.includes(id))fail();}
    if(round.phase==='complete'){const priority=[round.banker,...seatsAfter(Object.keys(round.hands),round.banker).filter(id=>id!==round.banker)];let winner=priority[0];for(const id of priority.slice(1))if(compareHands(round.hands[id],round.hands[winner])>0)winner=id;if(round.winner!==winner)fail();}
   }
  }
  if(active.slice(0,-1).some(r=>r.phase!=='complete'))fail();if(room.afterparty!==undefined){if(room.endReason!=='drunk')fail();afterparty(room.afterparty,room);validateAfterpartyCallback?.(room.afterparty,room);}
 }
 return value as PartyRoom[];
}
