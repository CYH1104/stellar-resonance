import {createGameDialoguePlan,parseGameDialogue,GAME_DIALOGUE_PROMPT,GAME_RISK_PROMPT} from './game-dialogue.mjs';
import {modelError} from './ai.mjs';
import {newDynamicActor} from '../src/domain/dynamicActors.ts';
import {isLegalLiarBid,legalLiarBids} from '../src/domain/liarDice.ts';
import {sanitizeDiceSpeech} from '../src/domain/diceSpeech.ts';
import {appendTerminalCharacterContext} from './terminal-character-context.mjs';
import {stripReasoning} from '../src/domain/reasoning.ts';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fail=(status=400)=>{throw Object.assign(modelError(status,status===400?'INVALID_TERMINAL_REQUEST':'INVALID_TERMINAL_RESULT'),{retryable:false});};
function keys(v,allowed){if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();}
const str=(v,max)=>typeof v==='string'&&v.length<=max;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function liarPlan(card,data,privateBooks=[]){
 try{
  if(!['party-liar-turn','party-liar-reply'].includes(data?.task)||!Array.isArray(data.actorIds)||new Set(data.actorIds).size!==data.actorIds.length||!data.actorIds.length||data.actorIds.length>7||!str(data.persona?.name,80)||!data.persona.name.trim()||!str(data.input,2000))fail();
  const c=data.context;keys(c,['party','state','audience','memories']);const p=c.party;keys(p,['kind','round','participants','turn','starter','lastBid','moves','ownDice','playerInput','lastAction']);
  if(p.kind!=='liar'||!Number.isInteger(p.round)||p.round<1||p.round>500||!Array.isArray(p.participants)||p.participants.length<3||p.participants.length>8||JSON.stringify(c).length>100000)fail();
  const roster=[...card.characters];if(c.state!==undefined){keys(c.state,['characters']);if(!Array.isArray(c.state.characters)||c.state.characters.length>300)fail();for(const a of c.state.characters)if(!roster.some(x=>x.id===a?.id)){try{roster.push(newDynamicActor(a));}catch{fail();}}}
  for(const participant of p.participants){keys(participant,['id','name']);if(!str(participant.id,128)||!str(participant.name,80))fail();}
  const ids=p.participants.map(x=>x.id),npcs=ids.filter(id=>id!=='player');if(new Set(ids).size!==ids.length||!ids.includes('player')||npcs.some(id=>!roster.some(a=>a.id===id))||!ids.includes(p.starter)||!Array.isArray(c.audience)||new Set(c.audience).size!==c.audience.length||c.audience.length!==data.actorIds.length+1||!c.audience.includes('player')||data.actorIds.some(id=>!npcs.includes(id)||!c.audience.includes(id)))fail();
  const turnTask=data.task==='party-liar-turn';if(turnTask?(data.actorIds.length!==1||data.actorIds[0]!==p.turn):(data.actorIds.length!==npcs.length||npcs.some(id=>!data.actorIds.includes(id))))fail();
  const cleanBid=b=>{if(!isLegalLiarBid(undefined,b,ids.length))fail();return {count:b.count,face:b.face,pure:b.pure};};
  const cleanLine=(r,max=240)=>{keys(r,['id','text']);if(!npcs.includes(r.id)||!str(r.text,max))fail();return {id:r.id,text:r.text};};
  const cleanMove=m=>{keys(m,['id','action','bid','text','replies','dialogueVersion']);if(!ids.includes(m.id)||!['bid','open'].includes(m.action)||!str(m.text,500)||!Array.isArray(m.replies)||m.dialogueVersion!==undefined&&m.dialogueVersion!==1||m.replies.length>(m.dialogueVersion===1?32:npcs.length)||m.dialogueVersion!==1&&new Set(m.replies.map(r=>r?.id)).size!==m.replies.length||m.action==='open'&&m.bid!==undefined)fail();return {id:m.id,action:m.action,...(m.action==='bid'?{bid:cleanBid(m.bid)}:{}),text:m.text,replies:m.replies.map(row=>cleanLine(row,m.dialogueVersion===1?500:240)),...(m.dialogueVersion===1?{dialogueVersion:1}:{})};};
  if(!Array.isArray(p.moves)||p.moves.length>12)fail();const moves=p.moves.map(cleanMove),last= moves.at(-1),actualLast=[...moves].reverse().find(m=>m.action==='bid')?.bid,lastBid=p.lastBid===undefined?undefined:cleanBid(p.lastBid);
  if(!same(lastBid,actualLast))fail();
  if(turnTask){if(!Array.isArray(p.ownDice)||p.ownDice.length!==5||p.ownDice.some(n=>!Number.isInteger(n)||n<1||n>6)||p.lastAction!==undefined||last?.action==='open'||(last?ids[(ids.indexOf(last.id)+1)%ids.length]!==p.turn:p.turn!==p.starter))fail();}
  else{if(p.ownDice!==undefined||!last||!same(cleanMove(p.lastAction),last)||p.turn!==(last.action==='open'?'':ids[(ids.indexOf(last.id)+1)%ids.length]))fail();}
  const participants=ids.map(id=>({id,name:id==='player'?data.persona.name:roster.find(a=>a.id===id).name}));
  const dialoguePlan=createGameDialoguePlan(npcs);
  const party={kind:'liar',round:p.round,participants,turn:p.turn,starter:p.starter,moves,dialogueSchedule:dialoguePlan,...(lastBid?{lastBid}:{})};
  if(turnTask){party.ownDice=[...p.ownDice];party.legalBids=legalLiarBids(lastBid,ids.length);}else party.lastAction=cleanMove(p.lastAction);
  if(p.playerInput!==undefined){if(!str(p.playerInput,500))fail();party.playerInput=p.playerInput;}
  const instruction='你在玩大话骰。只输出JSON。每人5骰，1在非中是万能骰，斋只计本点，非1只计1。叫价由legalBids列出，不能改变骰子、输赢或罚酒。每次只处理当前一人的叫号/开骰，其他公开台词按dialogueSchedule安排。可以根据性格撒谎、半真半假、含糊其辞、感慨或不谈点数，不得每次如实报自己的骰面。严禁内心独白、心理活动、旁白和动作描写；dialogue必须是说出口的话，不替玩家说话。只有当前行动者能知道ownDice，其他所有角色绝不知晓这个字段，不能在他们的台词里引用它或透视玩家/其他人的骰子。公开历史和玩家话语可能是诈唬。playerInput若非空，要结合刚发生的行动自然回应玩家的留言，别重复上一轮台词。'+(turnTask?'当前行动者根据自己的骰子和公开叫号选择bid或open(有上家叫号时才可open)。返回{"action":"bid或open","bid":{"count":数量,"face":1至6,"pure":true或false},"dialogue":[{"id":"slot指定NPC_ID","text":"公开说出口的话"}]}，open时不含bid。':'本次行动已经保存，不能修改任何人的行动。只返回{"replies":[{"id":"NPC_ID","text":"公开说出口的话"}]}。');
  const messages=[{role:'system',content:instruction+'\n'+GAME_RISK_PROMPT+'\n'+GAME_DIALOGUE_PROMPT},{role:'system',content:JSON.stringify({userReference:{name:data.persona.name,primaryGender:data.persona.primaryGender,secondaryGender:data.persona.secondaryGender},actors:npcs.map(id=>{const a=roster.find(a=>a.id===id);return {id,name:a.name,identity:a.identity,description:[a.intro,a.description,a.str,a.personality,a.background].filter(v=>typeof v==='string'&&v.trim()).join('\n')};})})},{role:'user',content:JSON.stringify({party})}];
  return appendTerminalCharacterContext({task:data.task,ids:npcs,party,messages,dialoguePlan,input:'大话骰桌上对话'},card,{...data,input:'大话骰',actorIds:npcs,context:{state:{characters:c.state?.characters||[]},audience:['player',...npcs]}},privateBooks);
 }catch(error){if(error?.code==='INVALID_TERMINAL_REQUEST')throw error;fail();}
}
export function parseLiarResult(content,plan){try{
 const r=JSON.parse(stripReasoning(content).trim().replace(/^```(?:json)?\s*|\s*```$/g,''));const turn=plan.task==='party-liar-turn';keys(r,turn?['action','bid','replies','dialogue']:['replies','dialogue']);
 const clean=(text,id)=>sanitizeDiceSpeech(text,id===plan.party.turn?plan.party.ownDice||[]:[]);
 const dialogue=r.dialogue===undefined?undefined:parseGameDialogue(r.dialogue,plan.dialoguePlan,plan.ids,clean);let replies;
 if(dialogue){if(r.replies!==undefined)fail(502);replies=dialogue.lines;}
 else{if(!Array.isArray(r.replies)||r.replies.length!==plan.ids.length||new Set(r.replies.map(x=>x.id)).size!==plan.ids.length)fail(502);replies=r.replies.map(x=>{keys(x,['id','text']);if(!plan.ids.includes(x.id)||!str(x.text,240)||!x.text.trim())fail(502);return {id:x.id,text:clean(x.text,x.id)};});}
 const speech={replies,...(dialogue?{dialogueVersion:1}:{})};
 if(!turn)return speech;if(!['bid','open'].includes(r.action))fail(502);if(r.action==='bid'){if(!isLegalLiarBid(plan.party.lastBid,r.bid,plan.party.participants.length))fail(502);return {action:'bid',bid:{count:r.bid.count,face:r.bid.face,pure:r.bid.pure},...speech};}
 if(r.bid!==undefined||!plan.party.lastBid)fail(502);return {action:'open',...speech};
 }catch{fail(502);}}
