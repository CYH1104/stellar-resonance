import type {PersonalTerminal} from './personalTerminal.ts';

/** Daily tarot divination. One record per (session, Beijing day, actor); cards are
 * drawn once by the program and locked, AI only writes the interpretation. Records
 * are deliberately not tied to story branches: a rewind must never allow re-drawing
 * the same day, and old signs stay readable across branches. */

export type TarotSuit='major'|'wands'|'cups'|'swords'|'pentacles';
export interface TarotCard {id:string;name:string;suit:TarotSuit;number:number}
export interface DrawnCard {id:string;name:string;suit:TarotSuit;number:number;reversed:boolean}
export interface DivinationReading {status:'pending'|'ready'|'failed';overall?:string;love?:string;career?:string;caution?:string;reaction?:string;error?:string;draft?:string;at?:string}
/** actorId 'player' is the player's own sign; NPC signs are lazy-created on first peek. */
export interface TerminalDivination {day:string;actorId:string;cards:DrawnCard[];reading:DivinationReading;at:string}
export const divinationPositions=['今日基调','关系','行动'] as const;
const majors=['愚者','魔术师','女祭司','皇后','皇帝','教皇','恋人','战车','力量','隐者','命运之轮','正义','倒吊人','死神','节制','恶魔','高塔','星星','月亮','太阳','审判','世界'];
const suits:Record<Exclude<TarotSuit,'major'>,{name:string;glyph:string;court:string[]}>={
 wands:{name:'权杖',glyph:'杖',court:['侍从','骑士','王后','国王']},
 cups:{name:'圣杯',glyph:'杯',court:['侍从','骑士','王后','国王']},
 swords:{name:'宝剑',glyph:'剑',court:['侍从','骑士','王后','国王']},
 pentacles:{name:'星币',glyph:'币',court:['侍从','骑士','王后','国王']}};
const rankName=(n:number,court:string[])=>n<=10?String(n):court[n-11];
const fullDeck:TarotCard[]=[
 ...majors.map((name,number)=>({id:'major-'+number,name,suit:'major' as const,number})),
 ...(Object.keys(suits) as Exclude<TarotSuit,'major'>[]).flatMap(suit=>Array.from({length:14},(_,i)=>({id:`${suit}-${i+1}`,name:`${suits[suit].name}${rankName(i+1,suits[suit].court)}`,suit,number:i+1})))];
export const tarotDeck=()=>fullDeck.map(c=>({...c}));
export const tarotCardCount=78;
export function tarotCard(id:string){return fullDeck.find(c=>c.id===id);}
export const suitGlyph=(suit:TarotSuit)=>suit==='major'?'★':suits[suit as Exclude<TarotSuit,'major'>].glyph;
export const suitName=(suit:TarotSuit)=>suit==='major'?'大阿尔卡纳':suits[suit as Exclude<TarotSuit,'major'>].name;
/** Beijing-calendar day key, same Asia/Shanghai rule as journeyName's sv-SE format. */
export function divinationDay(date=new Date()):string{
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
/** Absolute epoch ms of the next existing day boundary (Asia/Shanghai, fixed +08:00).
 * Uses the same day key as the records, never the device's local midnight. */
export function divinationDeadline(now=Date.now()){
 const day=divinationDay(new Date(now));
 const start=Date.parse(day+'T00:00:00+08:00');
 if(!Number.isFinite(start))return now+86400000;
 // Shanghai has no DST; one fixed day is exact.
 return start+86400000>now?start+86400000:start+2*86400000;
}
function randomIndex(n:number){const b=new Uint32Array(1),limit=Math.floor(0x100000000/n)*n;do{crypto.getRandomValues(b);}while(b[0]>=limit);return b[0]%n;}
/** Three distinct cards, each independently upright/reversed, positions 基调/关系/行动. */
export function drawThreeCards(random:(n:number)=>number=randomIndex):DrawnCard[]{
 const deck=tarotCardCount,used=new Set<number>,out:DrawnCard[]=[];
 const pick=(n:number)=>{const k=random(n);if(!Number.isInteger(k)||k<0||k>=n)throw Error('随机来源不正确');return k;};
 for(let i=0;i<3;i++){
  // Bounded dedup: retry a few times, then fall back to drawing from the explicit
  // remaining pool — a degenerate random source can never spin forever.
  let k=-1;
  for(let attempt=0;attempt<16;attempt++){k=pick(deck);if(!used.has(k))break;}
  if(k<0||used.has(k)){const remaining=[];for(let j=0;j<deck;j++)if(!used.has(j))remaining.push(j);k=remaining[pick(remaining.length)];}
  used.add(k);const card=fullDeck[k];out.push({...card,reversed:pick(2)===1});}
 return out;
}
/** Fingerprint of the locked draw: any reading write must land on exactly these cards. */
export const cardsFingerprint=(cards:DrawnCard[])=>JSON.stringify(cards);
export const findDivination=(t:PersonalTerminal,day:string,actorId:string)=>(t.divinations||[]).find(d=>d.day===day&&d.actorId===actorId);
/** Only-if-missing draw for the given day+actor. Returns the winning (persisted) record;
 * the caller must re-read the terminal after commit instead of reusing its own draft. */
export function ensureDivination(t:PersonalTerminal,day:string,actorId:string,random:(n:number)=>number=randomIndex):TerminalDivination{
 const existing=findDivination(t,day,actorId);if(existing)return existing;
 // No per-record count cap: long-term archives must stay writable for years
 // (20 NPCs peeked daily add up fast). Storage protection is the archive-wide
 // real size limit enforced at backup/save time; nothing is silently deleted.
 const record:TerminalDivination={day,actorId,cards:drawThreeCards(random),reading:{status:'pending'},at:new Date().toISOString()};
 t.divinations=[...(t.divinations||[]),record];return record;
}
/** Total hard-size protection per record: each section is bounded at parse and validate time. */
export const divinationSectionMax=1500,divinationReactionMax=800,divinationDraftMax=1500;
/** Safe draft extraction from raw model output: readable prose or parsed section strings
 * only. A JSON-shaped blob that fails to parse is never stored as "the draft", and code
 * fences around a correction draft are stripped. */
export function divinationDraftText(raw:unknown):string{
 if(typeof raw!=='string')return '';let best='';
 const keep=(text:string)=>{const clean=text.trim();if(clean&&clean.length>best.length)best=clean;};
 for(const piece of raw.split('\n\n[纠正稿]\n')){
  const text=piece.trim();if(!text)continue;
  const stripped=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  if(stripped.startsWith('{')){try{const v=JSON.parse(stripped);if(v&&typeof v==='object')for(const value of Object.values(v))if(typeof value==='string')keep(value);}catch{/* unparseable payload is dropped */}continue;}
  keep(stripped);
 }return best.slice(0,divinationDraftMax);
}
