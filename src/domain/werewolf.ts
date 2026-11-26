import type {TerminalAnchor} from './terminalLedger';

export type WolfRole='wolf'|'villager'|'seer'|'witch';
export const wolfRoleNames:Record<WolfRole,string>={wolf:'狼人',villager:'村民',seer:'预言家',witch:'女巫'};
export interface WolfSeat {id:string;name:string}
export interface WolfOpinion {id:string;target:string;reason:string}
export type WolfAction=
 |{type:'council';opinions:WolfOpinion[];target?:string}
 |{type:'knife';target:string}
 |{type:'inspect';actor:string;target:string}
 |{type:'medicine';actor:string;save:boolean;poison:string|null}
 |{type:'dawn'}
 |{type:'speak';actor:string;text:string}
 |{type:'vote';actor:string;target:string|null}
 |{type:'tally'};
export interface WerewolfGame {version:1;id:string;at:string;storyDate:string;anchor:TerminalAnchor;seats:WolfSeat[];roles:WolfRole[];actions:WolfAction[]}
export interface WolfLine {speaker:string;text:string}
export interface WolfState {
 day:number;phase:'night'|'speech'|'lastwords'|'vote'|'complete';alive:string[];
 log:WolfLine[];night:{opinions?:WolfOpinion[];target?:string;inspected?:boolean;medicine?:{save:boolean;poison:string|null}};
 inspections:Record<string,{day:number;target:string;result:'wolf'|'good'}[]>;
 antidote:boolean;poison:boolean;order:string[];index:number;votes:Record<string,string|null>;
 pk:string[];winner?:'good'|'wolf';afterWords:'speech'|'night'|'complete';
}
export const wolfRules='六人暗牌局：2狼2村民1预言家1女巫，无警长。屠城：狼全灭好人胜，好人全灭狼人胜；同夜双方全灭好人胜。狼人可刀自己或队友。女巫整局一救一毒，同夜最多一瓶，只有首夜可自救，解药用完不再得知刀口。验人只得知好人/狼人。首夜死者和白天出局者有遗言，后续夜死无遗言。平票者发言后其他存活者投平票候选人，再平票或全弃票无人出局。不得自投，可弃票。不自动公开身份，发言允许诈身份。';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const fail=():never=>{throw Error('狼人杀记录或行动不符合规则，原记录保留。');};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function keys(v:unknown,required:string[],optional:string[]=[]){if(!obj(v)||required.some(k=>!(k in v))||Object.keys(v).some(k=>![...required,...optional].includes(k)))fail();}
const str=(v:unknown,max=2000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
const id=(v:unknown):v is string=>str(v,128)&&!['host','__proto__','constructor','prototype'].includes(v);
export const wolfRole=(g:WerewolfGame,who:string):WolfRole=>g.roles[g.seats.findIndex(s=>s.id===who)];
const roles:WolfRole[]=['wolf','wolf','villager','villager','seer','witch'];
export function createWerewolf(seats:WolfSeat[],anchor:TerminalAnchor,storyDate:string):WerewolfGame {
 if(seats.length!==6||seats[0]?.id!=='player'||new Set(seats.map(s=>s.id)).size!==6)fail();
 const shuffled=[...roles];
 for(let i=shuffled.length-1;i>0;i--){const range=i+1,limit=0x100000000-0x100000000%range;let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);const j=n%range;[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 const g:WerewolfGame={version:1,id:crypto.randomUUID(),at:new Date().toISOString(),storyDate:storyDate||'剧情当前时间',anchor:clone(anchor),seats:clone(seats),roles:shuffled,actions:[]};validateWerewolf(g);return g;
}
function initial(g:WerewolfGame):WolfState{return {day:1,phase:'night',alive:g.seats.map(s=>s.id),log:[{speaker:'host',text:'六人局开始。身份已私下发放，天黑请闭眼。'}],night:{},inspections:{},antidote:true,poison:true,order:[],index:0,votes:{},pk:[],afterWords:'speech'};}
function name(g:WerewolfGame,who:string){return g.seats.find(s=>s.id===who)?.name||who;}
const say=(s:WolfState,text:string)=>s.log.push({speaker:'host',text});
function night(s:WolfState){s.phase='night';s.day++;s.night={};s.pk=[];s.votes={};s.order=[];s.index=0;say(s,`第${s.day}夜，天黑请闭眼。`);}
function speech(s:WolfState){s.phase='speech';s.order=[...s.alive];s.index=0;s.pk=[];s.votes={};}
function winner(g:WerewolfGame,s:WolfState){if(!s.alive.some(w=>wolfRole(g,w)==='wolf'))return 'good';if(!s.alive.some(w=>wolfRole(g,w)!=='wolf'))return 'wolf';}
function finish(s:WolfState){s.phase='complete';s.order=[];say(s,`${s.winner==='good'?'好人':'狼人'}阵营获胜。本局结束，身份继续保密。`);}
function afterWords(s:WolfState){if(s.afterWords==='complete')finish(s);else if(s.afterWords==='night')night(s);else speech(s);}
export function wolfNightReady(g:WerewolfGame,s:WolfState){return !!s.night.target&&(!s.alive.some(w=>wolfRole(g,w)==='seer')||s.night.inspected)&&(!s.alive.some(w=>wolfRole(g,w)==='witch')||!!s.night.medicine);}
export function wolfVoteTargets(s:WolfState,actor:string){return (s.pk.length?s.pk:s.alive).filter(w=>w!==actor);}
function apply(g:WerewolfGame,s:WolfState,a:WolfAction){
 if(s.phase==='complete')fail();
 const alive=(w:string)=>id(w)&&s.alive.includes(w),has=(role:WolfRole,w:string)=>alive(w)&&wolfRole(g,w)===role;
 if(a.type==='council'){
  keys(a,['type','opinions'],['target']);const wolves=s.alive.filter(w=>wolfRole(g,w)==='wolf'&&w!=='player');
  if(s.phase!=='night'||s.night.opinions||!wolves.length||!Array.isArray(a.opinions)||a.opinions.length!==wolves.length)fail();
  if(new Set(a.opinions.map(o=>o.id)).size!==wolves.length)fail();
  for(const o of a.opinions){keys(o,['id','target','reason']);if(!wolves.includes(o.id)||!alive(o.target)||!str(o.reason,240))fail();}
  if(has('wolf','player')){if(a.target!==undefined)fail();}else if(!a.target||!alive(a.target))fail();
  s.night.opinions=clone(a.opinions);if(a.target)s.night.target=a.target;
 }else if(a.type==='knife'){
  keys(a,['type','target']);if(s.phase!=='night'||s.night.target||!has('wolf','player')||!alive(a.target)||s.alive.some(w=>w!=='player'&&wolfRole(g,w)==='wolf')&&!s.night.opinions)fail();s.night.target=a.target;
 }else if(a.type==='inspect'){
  keys(a,['type','actor','target']);if(s.phase!=='night'||s.night.inspected||!has('seer',a.actor)||!alive(a.target)||a.target===a.actor)fail();
  (s.inspections[a.actor]??=[]).push({day:s.day,target:a.target,result:wolfRole(g,a.target)==='wolf'?'wolf':'good'});s.night.inspected=true;
 }else if(a.type==='medicine'){
  keys(a,['type','actor','save','poison']);if(s.phase!=='night'||!s.night.target||s.night.medicine||!has('witch',a.actor)||typeof a.save!=='boolean'||a.poison!==null&&!alive(a.poison)||a.save&&!!a.poison)fail();
  if(a.save&&(!s.antidote||s.day!==1&&s.night.target===a.actor)||a.poison&&!s.poison)fail();
  s.night.medicine={save:a.save,poison:a.poison};if(a.save)s.antidote=false;if(a.poison)s.poison=false;
 }else if(a.type==='dawn'){
  keys(a,['type']);if(s.phase!=='night'||!wolfNightReady(g,s))fail();
  const deaths=s.alive.filter(w=>w===s.night.target&&!s.night.medicine?.save||w===s.night.medicine?.poison);
  s.alive=s.alive.filter(w=>!deaths.includes(w));say(s,`第${s.day}天天亮。${deaths.length?deaths.map(w=>name(g,w)).join('、')+'死亡。':'昨夜平安夜。'}`);
  s.winner=winner(g,s);s.afterWords=s.winner?'complete':'speech';
  if(s.day===1&&deaths.length){s.phase='lastwords';s.order=deaths;s.index=0;}else afterWords(s);
 }else if(a.type==='speak'){
  keys(a,['type','actor','text']);if(!['speech','lastwords'].includes(s.phase)||a.actor!==s.order[s.index]||!str(a.text,1600))fail();
  s.log.push({speaker:a.actor,text:a.text.trim()});s.index++;
  if(s.index===s.order.length){if(s.phase==='lastwords')afterWords(s);else{s.phase='vote';s.order=s.alive.filter(w=>!s.pk.includes(w));s.votes={};s.index=0;say(s,s.pk.length?'平票发言结束，其他存活玩家请投票。':'发言结束，请独立投票。');}}
 }else if(a.type==='vote'){
  keys(a,['type','actor','target']);if(s.phase!=='vote'||!s.order.includes(a.actor)||Object.hasOwn(s.votes,a.actor)||a.target!==null&&!wolfVoteTargets(s,a.actor).includes(a.target))fail();s.votes[a.actor]=a.target;
 }else if(a.type==='tally'){
  keys(a,['type']);if(s.phase!=='vote'||s.order.some(w=>!Object.hasOwn(s.votes,w)))fail();
  say(s,'投票结果：'+(s.order.map(w=>name(g,w)+' → '+(s.votes[w]?name(g,s.votes[w]!):'弃票')).join('；')||'无可投票玩家'));
  const counts=new Map<string,number>();for(const t of Object.values(s.votes))if(t)counts.set(t,(counts.get(t)||0)+1);
  const top=Math.max(0,...counts.values()),tied=[...counts].filter(([,v])=>v===top).map(([k])=>k);
  if(tied.length===1){const out=tied[0];s.alive=s.alive.filter(w=>w!==out);say(s,name(g,out)+'被投票出局。');s.winner=winner(g,s);s.afterWords=s.winner?'complete':'night';s.phase='lastwords';s.order=[out];s.index=0;}
  else if(tied.length>1&&!s.pk.length){s.pk=s.alive.filter(w=>tied.includes(w));s.phase='speech';s.order=[...s.pk];s.index=0;s.votes={};say(s,'平票：'+s.pk.map(w=>name(g,w)).join('、')+'依次补充发言。');}
  else{say(s,'本轮无人出局。');night(s);}
 }else fail();
}
export function replayWerewolf(g:WerewolfGame):WolfState {const s=initial(g);for(const a of g.actions)apply(g,s,a);return s;}
export function actWerewolf(g:WerewolfGame,actions:WolfAction[]):WerewolfGame {const next=clone(g),s=replayWerewolf(next);for(const a of actions){apply(next,s,a);next.actions.push(clone(a));}return next;}
export function validateWerewolf(g:WerewolfGame){
 keys(g,['version','id','at','storyDate','anchor','seats','roles','actions']);
 if(g.version!==1||!id(g.id)||!str(g.at,60)||!Number.isFinite(Date.parse(g.at))||!str(g.storyDate,200)||!Array.isArray(g.seats)||g.seats.length!==6||!Array.isArray(g.roles)||[...g.roles].sort().join()!==[...roles].sort().join()||!Array.isArray(g.actions)||g.actions.length>20000)fail();
 keys(g.anchor,['key','turnId','variantId','path']);if(!str(g.anchor.key,200)||typeof g.anchor.turnId!=='string'||typeof g.anchor.variantId!=='string'||!Array.isArray(g.anchor.path)||g.anchor.path.some(p=>!str(p,200)))fail();
 for(const p of g.seats){keys(p,['id','name']);if(!id(p.id)||!str(p.name,100))fail();}
 if(g.seats[0].id!=='player'||new Set(g.seats.map(p=>p.id)).size!==6)fail();for(const a of g.actions)if(!obj(a))fail();replayWerewolf(g);
}
export function validateWerewolfGames(v:WerewolfGame[]){if(!Array.isArray(v)||v.length>1000||new Set(v.map(g=>g?.id)).size!==v.length)fail();v.forEach(validateWerewolf);}
export interface WolfView {gameId:string;day:number;phase:WolfState['phase'];selfId:string;selfRole:WolfRole;players:(WolfSeat&{alive:boolean})[];publicLog:WolfLine[];wolfIds?:string[];inspections?:{day:number;target:string;result:'wolf'|'good'}[];medicine?:{antidote:boolean;poison:boolean};victim?:string;opinions?:WolfOpinion[];speaking:string|null;voteTargets:string[];winner?:'wolf'|'good'}
/** This is the only projection allowed in the UI and in model requests. No role table or action log. */
export function wolfView(g:WerewolfGame,who:string):WolfView {
 const s=replayWerewolf(g),role=wolfRole(g,who);if(!role)fail();
 return {gameId:g.id,day:s.day,phase:s.phase,selfId:who,selfRole:role,players:g.seats.map(p=>({...p,alive:s.alive.includes(p.id)})),publicLog:clone(s.log),speaking:['speech','lastwords'].includes(s.phase)?s.order[s.index]||null:null,voteTargets:s.phase==='vote'&&s.order.includes(who)&&!Object.hasOwn(s.votes,who)?wolfVoteTargets(s,who):[],...(s.winner&&s.phase==='complete'?{winner:s.winner}:{}),
 ...(role==='wolf'?{wolfIds:g.seats.filter(p=>wolfRole(g,p.id)==='wolf').map(p=>p.id),...(s.phase==='night'&&s.alive.includes(who)&&s.night.opinions?{opinions:clone(s.night.opinions)}:{})}:{}),
 ...(role==='seer'?{inspections:clone(s.inspections[who]||[])}:{}),
 ...(role==='witch'?{medicine:{antidote:s.antidote,poison:s.poison},...(s.phase==='night'&&s.alive.includes(who)&&s.antidote&&s.night.target?{victim:s.night.target}:{})}:{})};
}
export type WolfTask='werewolf-council'|'werewolf-inspect'|'werewolf-medicine'|'werewolf-speak'|'werewolf-vote';
export interface WolfRequest {task:WolfTask;actorIds:string[];view:WolfView;choices:string[];humanWolf:boolean}
export function wolfRequest(g:WerewolfGame,task:WolfTask,actor:string):WolfRequest {
 const s=replayWerewolf(g),v=wolfView(g,actor);let actorIds=[actor],choices:string[]=[];
 if(task==='werewolf-council'){actorIds=s.alive.filter(w=>wolfRole(g,w)==='wolf'&&w!=='player');if(s.phase!=='night'||s.night.opinions||!actorIds.includes(actor))fail();choices=[...s.alive];}
 else if(task==='werewolf-inspect'){if(s.phase!=='night'||s.night.inspected||wolfRole(g,actor)!=='seer'||!s.alive.includes(actor))fail();choices=s.alive.filter(w=>w!==actor);}
 else if(task==='werewolf-medicine'){if(s.phase!=='night'||!s.night.target||s.night.medicine||wolfRole(g,actor)!=='witch'||!s.alive.includes(actor))fail();choices=s.alive;}
 else if(task==='werewolf-speak'){if(!['speech','lastwords'].includes(s.phase)||s.order[s.index]!==actor)fail();}
 else if(task==='werewolf-vote'){if(s.phase!=='vote'||!s.order.includes(actor)||Object.hasOwn(s.votes,actor))fail();choices=wolfVoteTargets(s,actor);}
 else fail();
 // Finished-night wolf discussion stays private, but is not repeated in public speech requests.
 delete v.opinions;
 return {task,actorIds,view:v,choices,humanWolf:task==='werewolf-council'&&s.alive.includes('player')&&wolfRole(g,'player')==='wolf'};
}
export function wolfMemory(g:WerewolfGame,who:string){const v=wolfView(g,who);return `${g.storyDate}（现实时间${g.at}）与${g.seats.map(p=>p.name).join('、')}玩六人狼人杀；我的本局身份是${wolfRoleNames[v.selfRole]}。${v.wolfIds?'狼队友：'+v.players.filter(p=>v.wolfIds!.includes(p.id)&&p.id!==who).map(p=>p.name).join('、')+'。':''}${v.inspections?.length?'我的查验：'+v.inspections.map(i=>`第${i.day}夜${name(g,i.target)}为${i.result==='wolf'?'狼人':'好人'}`).join('；')+'。':''}${v.winner?(v.winner==='wolf'?'狼人':'好人')+'阵营获胜；'+((v.selfRole==='wolf')===(v.winner==='wolf')?'我获胜。':'我落败。'):'游戏进行中。'}身份和私密行动只能由本人记住，不向其他角色透露；公开发言只是说法，可能是诈身份。`;}

/** Validate the closed, per-actor wire format again at the server boundary. */
export function validateWolfRequest(r:WolfRequest){
 keys(r,['task','actorIds','view','choices','humanWolf']);
 const v=r.view;keys(v,['gameId','day','phase','selfId','selfRole','players','publicLog','speaking','voteTargets'],['wolfIds','inspections','medicine','victim','winner']);
 if(!['werewolf-council','werewolf-inspect','werewolf-medicine','werewolf-speak','werewolf-vote'].includes(r.task)||!Array.isArray(r.actorIds)||!r.actorIds.length||r.actorIds.length>2||r.actorIds.includes('player')||new Set(r.actorIds).size!==r.actorIds.length||typeof r.humanWolf!=='boolean')fail();
 if(!id(v.gameId)||!Number.isInteger(v.day)||v.day<1||!roles.includes(v.selfRole)||!['night','speech','lastwords','vote','complete'].includes(v.phase)||!id(v.selfId)||!Array.isArray(v.players)||v.players.length!==6)fail();
 for(const p of v.players){keys(p,['id','name','alive']);if(!id(p.id)||!str(p.name,100)||typeof p.alive!=='boolean')fail();}
 const all=v.players.map(p=>p.id),alive=v.players.filter(p=>p.alive).map(p=>p.id);
 if(new Set(all).size!==6||!all.includes('player')||!r.actorIds.includes(v.selfId)||r.actorIds.some(w=>!all.includes(w)))fail();
 if(!Array.isArray(v.publicLog)||v.publicLog.length>20000)fail();for(const l of v.publicLog){keys(l,['speaker','text']);if(l.speaker!=='host'&&!all.includes(l.speaker)||!str(l.text,2000))fail();}
 for(const xs of [r.choices,v.voteTargets])if(!Array.isArray(xs)||new Set(xs).size!==xs.length||xs.some(w=>!alive.includes(w)))fail();
 if(v.speaking!==null&&!all.includes(v.speaking)||v.winner!==undefined&&!['good','wolf'].includes(v.winner))fail();
 if(v.selfRole==='wolf'){
  if(!Array.isArray(v.wolfIds)||v.wolfIds.length!==2||new Set(v.wolfIds).size!==2||!v.wolfIds.includes(v.selfId)||v.wolfIds.some(w=>!all.includes(w))||v.inspections!==undefined||v.medicine!==undefined||v.victim!==undefined)fail();
 }else if(v.wolfIds!==undefined)fail();
 if(v.selfRole==='seer'){
  if(!Array.isArray(v.inspections)||v.inspections.length>v.day||v.medicine!==undefined||v.victim!==undefined)fail();
  for(const i of v.inspections!){keys(i,['day','target','result']);if(!Number.isInteger(i.day)||i.day<1||i.day>v.day||!all.includes(i.target)||i.target===v.selfId||!['wolf','good'].includes(i.result))fail();}
 }else if(v.inspections!==undefined)fail();
 if(v.selfRole==='witch'){
  keys(v.medicine,['antidote','poison']);if(typeof v.medicine?.antidote!=='boolean'||typeof v.medicine?.poison!=='boolean'||v.victim!==undefined&&(!alive.includes(v.victim)||!v.medicine.antidote||v.phase!=='night'))fail();
 }else if(v.medicine!==undefined||v.victim!==undefined)fail();
 if(r.task==='werewolf-council'){
  const expected=v.wolfIds?.filter(w=>alive.includes(w)&&w!=='player')||[];
  if(v.selfRole!=='wolf'||v.phase!=='night'||r.actorIds.length!==expected.length||expected.some(w=>!r.actorIds.includes(w))||r.humanWolf!==(alive.includes('player')&&!!v.wolfIds?.includes('player')))fail();
 }else if(r.actorIds.length!==1||r.humanWolf)fail();
 if(r.task==='werewolf-inspect'&&(v.selfRole!=='seer'||v.phase!=='night'||!alive.includes(v.selfId)||r.choices.includes(v.selfId)))fail();
 if(r.task==='werewolf-medicine'&&(v.selfRole!=='witch'||v.phase!=='night'||!alive.includes(v.selfId)))fail();
 if(r.task==='werewolf-speak'&&(!['speech','lastwords'].includes(v.phase)||v.speaking!==v.selfId||r.choices.length))fail();
 if(r.task==='werewolf-vote'&&(v.phase!=='vote'||!alive.includes(v.selfId)||r.choices.includes(v.selfId)||JSON.stringify(r.choices)!==JSON.stringify(v.voteTargets)))fail();
}
export function wolfActionFromResult(r:WolfRequest,value:unknown):WolfAction {
 validateWolfRequest(r);const a=r.actorIds[0];
 if(r.task==='werewolf-council'){
  keys(value,['opinions'],r.humanWolf?[]:['target']);const v=value as {opinions:WolfOpinion[];target?:string};
  if(!Array.isArray(v.opinions)||v.opinions.length!==r.actorIds.length||new Set(v.opinions.map(o=>o.id)).size!==r.actorIds.length)fail();
  for(const o of v.opinions){keys(o,['id','target','reason']);if(!r.actorIds.includes(o.id)||!r.choices.includes(o.target)||!str(o.reason,240))fail();}
  if(!r.humanWolf&&(!v.target||!r.choices.includes(v.target)))fail();return {type:'council',opinions:clone(v.opinions),...(!r.humanWolf?{target:v.target}:{})};
 }
 if(r.task==='werewolf-inspect'){keys(value,['target']);const v=value as {target:string};if(!r.choices.includes(v.target))fail();return {type:'inspect',actor:a,target:v.target};}
 if(r.task==='werewolf-medicine'){
  keys(value,['save','poison']);const v=value as {save:boolean;poison:string|null};if(typeof v.save!=='boolean'||v.poison!==null&&!r.choices.includes(v.poison)||v.save&&!!v.poison||v.save&&(!r.view.medicine?.antidote||!r.view.victim||r.view.day!==1&&r.view.victim===a)||v.poison&&!r.view.medicine?.poison)fail();return {type:'medicine',actor:a,...v};
 }
 if(r.task==='werewolf-speak'){keys(value,['text']);const v=value as {text:string};if(!str(v.text,1600))fail();return {type:'speak',actor:a,text:v.text};}
 keys(value,['target']);const v=value as {target:string|null};if(v.target!==null&&!r.choices.includes(v.target))fail();return {type:'vote',actor:a,target:v.target};
}
