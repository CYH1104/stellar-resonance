import {createGameDialoguePlan,parseGameDialogue,GAME_DIALOGUE_PROMPT,GAME_RISK_PROMPT} from './game-dialogue.mjs';
import {modelError} from './ai.mjs';
import {newDynamicActor} from '../src/domain/dynamicActors.ts';
import {handRank} from '../src/domain/partyGames.ts';
import {sanitizeElevenPublicLine,filterElevenDialogue} from '../src/domain/elevenSpeech.ts';
import {sanitizeDiceSpeech} from '../src/domain/diceSpeech.ts';
import {stripReasoning} from '../src/domain/reasoning.ts';
import {appendTerminalCharacterContext} from './terminal-character-context.mjs';
const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),text=(v,n)=>typeof v==='string'&&v.length<=n;
function fail(status=400){throw Object.assign(modelError(status,status===400?'INVALID_TERMINAL_REQUEST':'INVALID_TERMINAL_RESULT'),{retryable:false});}
function keys(v,allowed){if(!obj(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail();}
const exact=(values,ids)=>Array.isArray(values)&&values.length===ids.length&&new Set(values).size===values.length&&values.every(id=>ids.includes(id));
const cardCode=/^[SHCD]-(?:A|[2-9]|10|J|Q|K)$/;
/** One model sees the NPC batch; role ownership is instructed, not a physical isolation boundary. */
export function elevenBatchPlan(card,data,privateBooks=[]){try{
 if(data?.task!=='party-eleven-batch'||!Array.isArray(data.actorIds)||!data.actorIds.length||data.actorIds.length>7||new Set(data.actorIds).size!==data.actorIds.length||!text(data.persona?.name,80)||!data.persona.name.trim()||!text(data.input,2000))fail();
 const c=data.context;keys(c,['party','state','memories','audience']);if(JSON.stringify(c).length>100000)fail();const p=c.party;keys(p,['kind','round','wave','phase','banker','participants','privateHands','missingTolerances','publicLines','playerInput','publicTable','settlement','limitHalf']);
 if(p.kind!=='eleven'||!Number.isInteger(p.round)||p.round<1||p.round>500||!Number.isInteger(p.wave)||p.wave<1||p.wave>5||!['playing','complete'].includes(p.phase)||!Array.isArray(p.participants)||p.participants.length<3||p.participants.length>8||!text(p.playerInput,500))fail();
 const limitHalf=p.limitHalf===undefined?23:p.limitHalf;if(![21,23].includes(limitHalf))fail();
  const roster=[...card.characters];if(c.state!==undefined){keys(c.state,['characters']);if(!Array.isArray(c.state.characters)||c.state.characters.length>300)fail();for(const a of c.state.characters)if(!roster.some(r=>r.id===a?.id))roster.push(newDynamicActor(a));}
 for(const a of p.participants){keys(a,['id','name']);if(!text(a.id,128)||!a.id||!text(a.name,80))fail();}
 const ids=p.participants.map(a=>a.id),npcs=ids.filter(id=>id!=='player');if(new Set(ids).size!==ids.length||!exact(data.actorIds,npcs)||npcs.some(id=>!roster.some(a=>a.id===id))||!ids.includes(p.banker)||!exact(c.audience,ids))fail();
 if(!Array.isArray(p.missingTolerances)||p.missingTolerances.length>ids.length||new Set(p.missingTolerances).size!==p.missingTolerances.length||p.missingTolerances.some(id=>!ids.includes(id))||!Array.isArray(p.privateHands)||!exact(p.privateHands.map(h=>h?.id),npcs))fail();
 const used=new Set();const privateHands=npcs.map(id=>{const row=p.privateHands.find(h=>h.id===id);keys(row,['id','hand','stopped','lockedChoice']);if(typeof row.stopped!=='boolean'||!Array.isArray(row.hand)||!row.hand.length||row.hand.length>5||row.hand.some(code=>typeof code!=='string'||!cardCode.test(code)||used.has(code)))fail();for(const code of row.hand){if(used.has(code))fail();used.add(code);}const rank=handRank(row.hand,limitHalf),active=p.phase==='playing'&&!row.stopped&&row.hand.length<5&&rank.halfPoints<limitHalf;if(row.lockedChoice!==undefined&&(!active||!['hit','stand'].includes(row.lockedChoice)))fail();return {id,hand:[...row.hand],stopped:row.stopped,score:rank.halfPoints/2,canChoose:active,...(row.lockedChoice?{lockedChoice:row.lockedChoice}:{})};});
 if(!Array.isArray(p.publicLines)||p.publicLines.length>24)fail();const publicLines=p.publicLines.map(r=>{keys(r,['id','text']);if(!ids.includes(r.id)||!text(r.text,500))fail();return {id:r.id,text:r.text};});
   let publicTable;const publicCards=new Map();
  if(p.publicTable!==undefined){
   if(!Array.isArray(p.publicTable)||!exact(p.publicTable.map(r=>r?.id),ids))fail();
   publicTable=p.publicTable.map(r=>{
    keys(r,['id','cardCount','stopped','bust','hand','score']);if(!Number.isInteger(r.cardCount)||r.cardCount<1||r.cardCount>5||typeof r.stopped!=='boolean'||r.bust!==undefined&&r.bust!==true)fail();
    const own=privateHands.find(h=>h.id===r.id);if(own&&(own.hand.length!==r.cardCount||own.stopped!==r.stopped))fail();const base={id:r.id,cardCount:r.cardCount,stopped:r.stopped};
    if(r.bust!==true){if(r.hand!==undefined||r.score!==undefined)fail();return base;}
    if(!r.stopped||!Array.isArray(r.hand)||r.hand.length!==r.cardCount||r.hand.some(code=>typeof code!=='string'||!cardCode.test(code))||new Set(r.hand).size!==r.hand.length)fail();
    const rank=handRank(r.hand,limitHalf);if(rank.kind!=='bust'||r.score!==rank.halfPoints/2)fail();if(own&&r.hand.some(code=>!own.hand.includes(code)))fail();
    for(const code of r.hand){if(publicCards.has(code)&&publicCards.get(code)!==r.id||privateHands.some(h=>h.id!==r.id&&h.hand.includes(code)))fail();publicCards.set(code,r.id);}
    return {...base,bust:true,hand:[...r.hand],score:rank.halfPoints/2};
   });
  }else publicTable=ids.map(id=>{const own=privateHands.find(h=>h.id===id);return {id,...(own?{cardCount:own.hand.length,stopped:own.stopped}:{})};});
  let settlement;
  if(p.settlement!==undefined){keys(p.settlement,['kind','winner']);if(p.phase!=='complete'||!['winner','all-bust'].includes(p.settlement.kind))fail();if(p.settlement.kind==='all-bust'){if(p.settlement.winner!==undefined||!publicTable.every(row=>row.bust===true))fail();settlement={kind:'all-bust'};}else{if(!ids.includes(p.settlement.winner))fail();const known=privateHands.find(h=>h.id===p.settlement.winner);if(known&&handRank(known.hand,limitHalf).kind==='bust'&&!publicTable.every(row=>row.bust===true))fail();settlement={kind:'winner',winner:p.settlement.winner};}}
  const dialoguePlan=createGameDialoguePlan(npcs);
const participants=ids.map(id=>({id,name:id==='player'?data.persona.name:roster.find(a=>a.id===id).name}));
 const party={kind:'eleven',limitHalf,round:p.round,wave:p.wave,phase:p.phase,banker:p.banker,participants,privateHands,missingTolerances:[...p.missingTolerances],publicLines,playerInput:p.playerInput,publicTable,dialogueSchedule:dialoguePlan,...(settlement?{settlement}:{})};
 const instruction='你同时扮演十一点半桌上的指定NPC。程序已经统一发牌、计算score、判断爆牌/停牌/结算，你不能发牌、改牌、改变点数、裁定胜负或增减罚酒。A=1，2至10按牌面，J/Q/K=0.5，超过11.5爆牌，最多5张。新规则为全员爆牌无胜负、全员各喝一杯；同牌型同总点数先比最大单张点值（10大于9，A=1，J/Q/K仍0.5），最大也相同才用其余原平局规则。若提供settlement，必须以程序已结算结果为准，不自行重判，旧记录可能采用旧规则。一次返回全部NPC的下一步私有决定和公开台词。privateHands按角色ID分区：每个角色只能使用自己的hand/score作决定，别人的手牌和选择不属于该角色可知信息；玩家未公开的真实手牌和点数不提供。publicTable里bust=true的hand/score已经由程序验证为爆牌并公开，所有人可以看；其他私有区段仍只供各角色本人使用。canChoose=true时choice为hit或stand；lockedChoice必须原样保留。canChoose=false（已停牌、爆牌、五张、达到11.5或本局结束）时choice必须null，是否及说几句由dialogueSchedule安排。'+
 '若playerInput不为空，角色应自然回应玩家刚说的话再按自己性格接话；为空则根据本人手牌和性格自然接话。publicLines和playerInput可能是谎话，不可当成程序核实的点数。允许诈唬、撒谎、半真半假、故意含糊或感慨，不得每次真实报点。正常称呼、公开牌张数、口头禅不等于报点，可以自然说；每条接着publicLines里的内容说，不得照抄此前自己的长句，不要反复使用“想看我的底牌”等罐头，不得列出具体牌/花色或确定描述其他人的秘密点数、牌面与尚未执行的选择。text必须是说出口的话，不写内心独白、心理活动、旁白、动作或思考，不替玩家说话/行动。'+
 '只输出{"characters":[{"id":"每个指定NPC","choice":"hit或stand或JSON null"}],"dialogue":[{"id":"slot指定角色ID","text":"200字内公开台词"}],"tolerances":[{"id":"missingTolerances中的ID","value":1}]}。characters每人恰一项，台词只放dialogue；tolerances只补missingTolerances每人1至10的整数杯数，不得修改已知值；没有缺失时返回空数组。不得返回理由、手牌、点数、额外身份或其他字段。';
 const messages=[{role:'system',content:instruction.replaceAll('11.5',String(limitHalf/2)).replaceAll('十一点半',limitHalf===21?'十点半':'十一点半')+'\n'+GAME_RISK_PROMPT+'\n'+GAME_DIALOGUE_PROMPT+'\n现代格式为{characters:[{id,choice}],dialogue:[{id,text}],tolerances:[]}；所有角色的私有choice仍每人恰一项，台词只在dialogue里，沉默不能省略choice。'},{role:'system',content:JSON.stringify({userReference:{name:data.persona.name,identity:data.persona.identity,primaryGender:data.persona.primaryGender,secondaryGender:data.persona.secondaryGender},actors:npcs.map(id=>{const a=roster.find(a=>a.id===id);return {id,name:a.name,identity:a.identity,description:[a.intro,a.description,a.str,a.personality,a.background].filter(v=>typeof v==='string'&&v.trim()).join('\n')};})})},{role:'user',content:JSON.stringify({party})}];
 return appendTerminalCharacterContext({task:data.task,ids:npcs,party,messages,missingTolerances:party.missingTolerances,dialoguePlan,input:'十一点半批量回应'},card,{...data,input:'十一点半',actorIds:npcs,context:{state:{characters:c.state?.characters||[]},audience:ids}},privateBooks);
 }catch{fail();}}
export function parseElevenBatchResult(content,plan){try{
 if(typeof content!=='string'||content.length>100000)fail(502);const result=JSON.parse(stripReasoning(content).trim().replace(/^```(?:json)?\s*|\s*```$/gi,''));keys(result,['characters','tolerances','dialogue']);if(!Array.isArray(result.characters)||!exact(result.characters.map(a=>a?.id),plan.ids))fail(502);
      const supplied=result.dialogue===undefined?undefined:parseGameDialogue(result.dialogue,plan.dialoguePlan,plan.ids,(value)=>value.trim());
   const choices=plan.ids.map(id=>{const row=result.characters.find(a=>a.id===id),privateRow=plan.party.privateHands.find(a=>a.id===id);keys(row,['id','choice','text']);if((supplied?row.text!==undefined&&!text(row.text,200):!text(row.text,200)||!row.text.trim())||(privateRow.canChoose?!['hit','stand'].includes(row.choice):row.choice!==null)||privateRow.lockedChoice&&row.choice!==privateRow.lockedChoice)fail(502);return {id,choice:row.choice,text:row.text||''};});
   const rawLines=supplied?.lines||choices.map(row=>({id:row.id,text:row.text}));
   const cleaned=rawLines.map(line=>({id:line.id,text:sanitizeElevenPublicLine(line.text,plan.party.privateHands.find(row=>row.id===line.id).hand,plan.party.phase==='complete'||plan.party.publicTable?.some(row=>row.id===line.id&&row.bust===true))})).filter(line=>line.text);
   const lines=filterElevenDialogue(cleaned,plan.party.publicLines),changed=lines.length!==rawLines.length||lines.some((line,i)=>line.id!==rawLines[i]?.id||line.text!==rawLines[i]?.text);
   const dialogue=supplied||changed?{version:1,lines}:undefined,characters=choices.map(row=>({...row,text:lines.find(line=>line.id===row.id)?.text||''}));
const missing=plan.party.missingTolerances,raw=result.tolerances===undefined&&!missing.length?[]:result.tolerances;if(!Array.isArray(raw)||!exact(raw.map(a=>a?.id),missing))fail(502);const tolerances=missing.map(id=>{const row=raw.find(a=>a.id===id);keys(row,['id','value']);if(!Number.isInteger(row.value)||row.value<1||row.value>10)fail(502);return {id,value:row.value};});
 return {characters,tolerances,...(dialogue?{dialogue}:{})};
 }catch{fail(502);}}
