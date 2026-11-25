import {classifyLandlord} from './landlordCards';
import type {LandlordRound} from './landlord';
export interface TableSoundEvent {key:string;sounds:string[]}
export interface TableSoundSnapshot {roundKey:string;events:TableSoundEvent[];waitingKey?:string}

/** Derived presentation only: never persisted and never supplied to the model. */
export function landlordSoundSnapshot(round:LandlordRound):TableSoundSnapshot {
 let lead:{id:string;cards:string[]}|undefined,passes=0;
 const events=round.moves.map((move,index)=>{
  let sounds:string[]=[];
  if(move.kind==='bid')sounds=['bid-'+move.score];
  else if(move.kind==='pass'){sounds=['pass'];if(++passes===2)lead=undefined;}
  else {
   const pattern=classifyLandlord(move.cards);
   if(pattern){
    let voice=pattern.kind==='single'||pattern.kind==='pair'?pattern.kind+'-'+pattern.main:pattern.kind;
    // A strong single/pair beating another player, never a fresh lead or a bomb.
    if(lead&&lead.id!==move.id&&['single','pair'].includes(pattern.kind)&&pattern.main>=14)voice='beat';
    sounds=['card-drop',voice];
   }
   lead={id:move.id,cards:move.cards};passes=0;
  }
  return {key:JSON.stringify([index,move.id,move.kind,move.kind==='play'?move.cards:move.kind==='bid'?move.score:'']),sounds};
 });
 const roundKey=JSON.stringify([round.number,round.participants,round.starter,round.initialHands]);
 return {roundKey,events,waitingKey:round.phase!=='complete'&&round.turn==='player'?roundKey+':'+events.length:undefined};
}

/** Only resolved engine events announce. Losing simultaneous calls stay silent. */
export function mahjongSoundEvents(log:Record<string,any>[]):TableSoundEvent[] {
 return log.flatMap((event,index)=>{
  if(event.dapai)return [{key:index+':discard:'+event.dapai.l+':'+event.dapai.p,sounds:['tile-drop',...(event.dapai.p.includes('*')?['riichi']:[])]}];
  if(event.fulou){
   const tiles=String(event.fulou.m).match(/\d/g)||[];
   const normalized=tiles.map(t=>t==='0'?'5':t);
   const voice=tiles.length===4?'kan':new Set(normalized).size===1?'pon':'chi';
   return [{key:index+':meld:'+event.fulou.l+':'+event.fulou.m,sounds:[voice]}];
  }
  if(event.gang)return [{key:index+':kan:'+event.gang.l+':'+event.gang.m,sounds:['kan']}];
  if(event.hule)return [{key:index+':win:'+event.hule.l,sounds:[event.hule.baojia===null?'tsumo':'ron']}];
  return [];
 });
}

export class TableSoundCursor {
 private round='';private keys:string[]=[];private observed=false;
 reset(){this.observed=false;this.keys=[];}
 observe(snapshot:TableSoundSnapshot){
  const keys=snapshot.events.map(e=>e.key);
  const continuous=this.observed&&this.round===snapshot.roundKey&&this.keys.length<=keys.length&&this.keys.every((k,i)=>keys[i]===k);
  const events=continuous?snapshot.events.slice(this.keys.length):[];
  this.observed=true;this.round=snapshot.roundKey;this.keys=keys;
  return {reset:!continuous,events};
 }
}

export class TableIdleSound {
 private key='';private since=0;private count=0;
 reset(){this.key='';this.count=0;}
 update(key:string|undefined,now:number,enabled:boolean,busy:boolean){
  if(!enabled||!key||busy){this.reset();return false;}
  if(this.key!==key){this.key=key;this.since=now;this.count=0;return false;}
  if(this.count<2&&now-this.since>=25000+this.count*45000){this.count++;return true;}
  return false;
 }
}
